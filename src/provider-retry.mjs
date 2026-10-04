import { rateLimitRetryAt } from './collection-cycle.mjs';

const PROVIDER_HOST='api.fxtwitter.com';
const PROBE_LEASE_SECONDS=120;

export class ProviderCooldownError extends Error {
  constructor(nextDueAt) {
    super('rate_limited');
    this.name='ProviderCooldownError';
    this.status=429;
    this.code='provider_http_error';
    this.nextDueAt=Number(nextDueAt);
    this.retryAfter=null;
  }
}

function nowSeconds() { return Math.floor(Date.now()/1000); }

async function readState(DB) {
  return DB.prepare('SELECT * FROM provider_retry_state WHERE host=?').bind(PROVIDER_HOST).first();
}

async function acquireProbe(DB) {
  const state=await readState(DB);
  if(!state) throw new Error('provider_retry_state_missing');
  if(state.next_due_at===0) return null;
  const now=nowSeconds();
  if(state.next_due_at>now) throw new ProviderCooldownError(state.next_due_at);
  const token=crypto.randomUUID();
  const acquired=await DB.prepare(`UPDATE provider_retry_state SET lease_token=?,lease_until=?
    WHERE host=? AND next_due_at>0 AND next_due_at<=? AND lease_until<=?
    RETURNING lease_token`).bind(token,now+PROBE_LEASE_SECONDS,PROVIDER_HOST,now,now).first();
  if(acquired) return token;
  const current=await readState(DB);
  if(current.next_due_at===0) return null;
  throw new ProviderCooldownError(Math.max(current.next_due_at,current.lease_until));
}

async function recordRateLimit(DB,error) {
  const now=nowSeconds();
  const deadlines=[0,1,2].map(failures=>rateLimitRetryAt(now,failures,error.retryAfter));
  const state=await DB.prepare(`UPDATE provider_retry_state SET
    next_due_at=MAX(next_due_at,CASE WHEN rate_limit_failures=0 THEN ? WHEN rate_limit_failures=1 THEN ? ELSE ? END),
    rate_limit_failures=rate_limit_failures+1,lease_token=NULL,lease_until=0
    WHERE host=? RETURNING next_due_at`).bind(...deadlines,PROVIDER_HOST).first();
  return new ProviderCooldownError(state.next_due_at);
}

async function finishProbe(DB,token,networkFailure=false) {
  if(!token) return;
  if(networkFailure) {
    await DB.prepare(`UPDATE provider_retry_state SET next_due_at=MAX(next_due_at,?),lease_token=NULL,lease_until=0
      WHERE host=? AND lease_token=?`).bind(nowSeconds()+60,PROVIDER_HOST,token).run();
  } else {
    await DB.prepare(`UPDATE provider_retry_state SET next_due_at=0,rate_limit_failures=0,lease_token=NULL,lease_until=0
      WHERE host=? AND lease_token=?`).bind(PROVIDER_HOST,token).run();
  }
}

function isNetworkFailure(error) {
  if(Number(error?.status)>=100) return false;
  return ['AbortError','TimeoutError'].includes(error?.name)
    || /network|fetch failed|failed to fetch|time[ _-]?out|timed[ _-]?out|ECONN|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(`${error?.message??''} ${error?.code??''} ${error?.cause?.message??''} ${error?.cause?.code??''}`);
}

export async function withProviderRetry(DB,operation) {
  const token=await acquireProbe(DB);
  let result;
  try {
    result=await operation();
  } catch(error) {
    if(error?.status===429 || error?.message==='rate_limited') throw await recordRateLimit(DB,error);
    await finishProbe(DB,token,isNetworkFailure(error));
    throw error;
  }
  await finishProbe(DB,token);
  return result;
}
