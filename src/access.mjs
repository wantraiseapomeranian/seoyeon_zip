import { createRemoteJWKSet, jwtVerify } from 'jose';

function configured(env) {
  return Boolean(env.POLICY_AUD && env.OWNER_EMAIL && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN ?? ''));
}

function tokenFailure(error) {
  return typeof error?.code === 'string' && (
    error.code.startsWith('ERR_JWT_') ||
    error.code.startsWith('ERR_JWS_') ||
    error.code === 'ERR_JOSE_ALG_NOT_ALLOWED' ||
    error.code === 'ERR_JWKS_NO_MATCHING_KEY' ||
    error.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
  );
}

export async function verifyOwnerToken(token,env,keyResolver) {
  if (!configured(env)) return 503;
  if (!token) return 401;
  try {
    const {payload}=await jwtVerify(token,keyResolver,{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','email']});
    return typeof payload.email==='string'&&payload.email.toLowerCase()===env.OWNER_EMAIL.toLowerCase()?200:403;
  } catch(error) {
    return tokenFailure(error)?403:503;
  }
}

function cookieToken(request) {
  const matches=[];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const separator=part.indexOf('=');
    if (separator<0 || part.slice(0,separator).trim()!=='CF_Authorization') continue;
    matches.push(part.slice(separator+1).trim());
  }
  return matches.length===1 && matches[0]?matches[0]:null;
}

export async function authorize(request,env,keyResolver) {
  if (!configured(env)) return 503;
  const header=request.headers.get('cf-access-jwt-assertion');
  if (header!==null) return header?verifyOwnerToken(header,env,keyResolver ?? createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`))):401;
  const token=cookieToken(request);
  if (!token) return 401;
  return verifyOwnerToken(token,env,keyResolver ?? createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)));
}
