# 자동 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 비공개 Worker에 한 번에 한 소스·한 페이지를 처리하는 재시작 가능한 자동 수집기를 추가한다.

**Architecture:** 공개 HTTP 요청은 Access 인증 후 조회/예약만 수행한다. scheduled handler는 D1의 실행 허용 상태와 lease를 확인한 뒤 공통 수집 함수를 호출하며, 게시물 저장과 체크포인트를 하나의 D1 batch로 커밋한다. 운영 상태는 기존 단계 0 상태와 분리하고, 최초 Cron 활성화는 원격 검증 이후 별도 변경으로 남긴다.

**Tech Stack:** Node >=24.14.1, JavaScript ES modules, node:test, Workers/nodejs_compat, Wrangler 4.130.0, D1 prepared statements. 새 운영 의존성은 추가하지 않는다.

**Spec:** `docs/SPEC.md` §6–9, §12–14; `docs/PLAN.md`; 디자인 변경 시 `DESIGN.md` 우선.

## 실행 상태 — 2026-09-09

- [x] Task 1: 구조화 오류·204·크기 제한·판별 증거 출력 구현, 공급자 테스트 통과.
- [x] Task 2: 운영 상태/lease/전역 중지 SQL 구현. 로컬·원격 마이그레이션 적용, 원격은 비활성.
- [x] Task 3: cycle/백오프 구현과 경계 테스트 통과. 실제 공급자 종료 계약은 미검증이므로 완료 판정 증거를 기본 false로 유지.
- [x] Task 4: 동일 batch의 lease guard/저장/상태 갱신, SQL 실패 rollback, 로그 실패 분리 구현.
- [x] Task 5: scheduled·HTTP 예약/조회·probe 폐기 구현. 29개 로컬 테스트 및 workerd 검증 통과.
- [ ] Task 6: 원격 마이그레이션/기존 데이터 보존과 6소스 각 두 페이지 확인 완료. 분리한 원격 개발 Worker/D1의 실제 저장·SQL 실패 rollback·재시도·중지 후 저장 없음 확인. CPU/동시성 검증과 공급자 종료 계약은 남아 있으며 Cron 활성화 보류.

실행상 조정: 시작 전 별도 worktree 대신 기존 변경을 보존한 기능 브랜치를 사용했다. Miniflare/esbuild는 기존 설치 버전을 개발 의존성으로 명시했다. cycle 경계는 acquire SQL에서 고정해 첫 fetch 중 프로세스가 종료돼도 다음 실행이 경계를 바꾸지 못하도록 강화했다. `validate-scheduler.mjs`는 --local 전용이며 원격 검증을 수행했다고 주장하지 않는다.

아래 세부 체크박스는 원래 작업 지침이다. 완료 상태는 위 작업별 기록과 docs/VALIDATION.md의 실제 결과를 기준으로 한다. 일반 400을 만료로 판정하지 않으므로 공급자의 명시적 만료 신호 지원은 계약 확인 후 연결한다.

## Global Constraints

- Cron 제안 `*/5 * * * *`(UTC), 한 실행에 소스 하나·페이지 하나. 6개 소스의 약 30분 갱신은 목표이며 SLA가 아니다.
- 최초 최근 7일, 완료 경계에서 24시간 겹침. 전체 과거 백필·실시간 알림 제외.
- 공급자 count=10은 응답 상한이 아니다. 전체 페이지 처리가 성공하기 전 cursor를 전진시키지 않는다.
- 작성자/발견 소스 분리. 이름 없는 미디어 예외는 검증된 전용 계정의 직접 작성 비인용 글만 허용한다.
- 미디어 바이너리·raw 응답·로그인 쿠키를 보관하지 않는다. 계정 이메일/Access 값은 공개 저장소에 기록하지 않는다.
- collection/role 검증 상태를 분리한다. 검증되지 않은 소스는 기본 비활성화한다. COSMO 오탐 철회는 유지한다.
- Access, preview_urls:false, run_worker_first:true, keep_vars:true 유지. scheduled 실행은 Access JWT로 보호되지 않으므로 별도 DB 봉인이 필수다.
- 실패 시 기존 게시물을 삭제하거나 완료 경계를 전진하지 않는다. 유료 전환·플랫폼 이전은 이 계획에 포함하지 않는다.
- 각 작업은 실패 테스트 → 최소 구현 → 관련 테스트 → 차이 검토 순서. 커밋 단계는 사용자의 Git 작업 승인 범위에서 수행하며 push는 자동 배포를 유발하므로 활성화와 분리한다.
- 아래 코드는 구현할 계약과 핵심 알고리즘이다. 체크박스는 아직 실행되지 않은 작업이다. 현재 요청은 계획 작성이다.

## 현재 기준과 파일 책임

로컬에 두 수정이 이미 존재한다: `src/sources.mjs`의 공통 전용 계정 규칙, `probePage`의 커밋 후 로그 실패 경고. 이전 실행에서 14개 테스트가 통과했지만 이 문서 작성 중 재실행한 것은 아니다. 수정 파일을 초기화하거나 덮어쓰지 않는다.

| 파일 | 책임 |
|---|---|
| `src/collection.mjs` | 공급자 요청, 정규화, 구조화 오류·탐색 증거 |
| `src/sources.mjs` | 기존 6개 계정과 판별 규칙 |
| `migrations/0002_collection_state.sql` | 운영 전역 설정 및 소스별 상태 |
| `src/collection-state.mjs` | lease 획득/중지/실패 갱신/페이지 커밋 SQL |
| `src/collection-cycle.mjs` | 다음 cycle 상태와 백오프를 계산하는 순수 함수 |
| `src/scheduler.mjs` | `runDueSource(env)` 한 번의 수집 조정 |
| `src/worker.mjs` | 인증된 조회/재시도 예약, scheduled 진입점 |
| `tests/collection-state.test.mjs` | 실제 SQLite SQL 제약/트랜잭션 테스트 |
| `tests/collection-cycle.test.mjs` | 경계·cursor·백오프 테스트 |
| `tests/scheduler.test.mjs` | 호출 수·운영 봉인·장애 흐름 테스트 |

운영 시각은 Unix 초 정수, 공급자 관측 출력은 기존 ISO 시각을 유지한다. DB 시각 `unixepoch()`을 기준으로 lease를 계산한다. public API에서 계정/lease 토큰을 반환하지 않는다.

## Task 1: 공급자 오류와 종료 증거 계약

**Files:** Modify `src/collection.mjs`; Test `tests/provider.test.mjs`; Document `docs/VALIDATION.md`.

**Interfaces:** 기존 `fetchPage(handle,cursor=null)` 유지. 성공 결과에 `kind:'page'` 추가. 204는 `{kind:'not-modified',observation}`. 실패는 `ProviderError`이며 `status`, `code`, `retryAfter`만 가진다. `normalizePage`에 `traversal:{exhausted,boundaryVerified}` 추가; 초기 boundaryVerified=false.

- [ ] 실패 테스트를 추가한다.

```js
test('rate limit retains Retry-After without logging the response body', async t => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response('', {status:429, headers:{'Retry-After':'120'}}));
  await assert.rejects(fetchPage('Seowoo_0501'), error =>
    error.status === 429 && error.retryAfter === '120');
});
```

- [ ] `node --test tests/provider.test.mjs` 실행: 새 조건 실패를 확인한다.
- [ ] 기존 15초·2MiB·User-Agent·manual redirect를 유지하고 HTTP 실패에 다음 오류를 사용한다. 제한 없이 오류 본문을 읽지 않는다.

```js
export class ProviderError extends Error {
  constructor(status, code, retryAfter = null) {
    super(code);
    Object.assign(this, {status, code, retryAfter});
  }
}
// HTTP !ok일 때: throw new ProviderError(response.status,
//   'provider_http_error', response.headers.get('retry-after'));
```

- [ ] `probePage`/로컬 collect에서 kind=not-modified를 명시적으로 처리한다. 현재 요청은 since를 보내지 않으므로 예기치 않은 204는 checkpoint 유지 후 needs_attention 후보다. 자동 완료로 처리하지 않는다.
- [ ] JSON code 불일치·잘못된 JSON·2MiB 초과를 각각 고정된 code로 분류한다. 일반 400은 cursor 만료로 간주하지 않는다.
- [ ] 같은 테스트 파일에 204, HTML 401, JSON code 실패, 2MiB 초과 사례를 추가하고 통과 확인. `git add src/collection.mjs tests/provider.test.mjs` 후 관련 호출자 변경까지 검토해 커밋한다.

## Task 2: 운영 상태와 원자적 lease

**Files:** Create `migrations/0002_collection_state.sql`, `src/collection-state.mjs`, `tests/collection-state.test.mjs`.

**Interfaces:** `acquireDueSource(DB, token)` → lease 또는 null; `stopCollection(DB)` → 전역 중지. lease는 상태 행 전체와 `control_revision`을 포함한다. 토큰은 호출자가 `crypto.randomUUID()`로 만든다.

- [ ] `node:sqlite`의 메모리 DB에 0001과 새 마이그레이션 SQL을 적용하는 테스트를 먼저 작성한다. SQL 실행 헬퍼는 `tests/collection-state.test.mjs` 안에 둔다. 원격 D1과 동일하다고 주장하지 않는다.
- [ ] 다음 스키마를 작성한다. 기존 source_state 데이터는 복사하지 않는다.

```sql
CREATE TABLE collection_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO collection_control(id) VALUES(1);
CREATE TABLE collection_state (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  next_due_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until INTEGER,
  last_attempt_at INTEGER, last_success_at INTEGER, last_complete_sync_at INTEGER,
  committed_boundary_at INTEGER, cycle_started_at INTEGER, cycle_boundary_at INTEGER,
  next_cursor TEXT, pages_in_cycle INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  cursor_resets INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  catchup_status TEXT NOT NULL DEFAULT 'idle'
);
CREATE INDEX collection_due ON collection_state(enabled,next_due_at,last_attempt_at);
INSERT INTO collection_state(source) VALUES
 ('gapyeonghaus'),('Seowoo_0501'),('tripleSnewsfeed'),
 ('TRIPLES_FAN_FR'),('Or1gin030806'),('First0806_');
```

- [ ] `node --test tests/collection-state.test.mjs`를 실행해 새 lease 테스트가 실패하는지 확인한다.
- [ ] 후보 선택과 lease 획득을 하나의 SQL로 구현한다:

```sql
UPDATE collection_state
SET lease_token=?, lease_until=unixepoch()+120,
    last_attempt_at=unixepoch(), revision=revision+1
WHERE source=(
  SELECT source FROM collection_state
  WHERE enabled=1 AND next_due_at<=unixepoch()
    AND catchup_status NOT IN ('needs_attention','gap')
    AND (lease_until IS NULL OR lease_until<=unixepoch())
  ORDER BY next_due_at,COALESCE(last_attempt_at,0),source LIMIT 1
)
AND EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1)
RETURNING *, (SELECT revision FROM collection_control WHERE id=1) AS control_revision;
```

- [ ] `stopCollection`은 `UPDATE collection_control SET enabled=0,revision=revision+1 WHERE id=1`을 실행한다. 재활성화도 revision을 증가시킨다. 단순 환경변수 변경만으로 실행 중 worker를 중지했다고 간주하지 않는다.
- [ ] 검증 코드를 작성한다: SQL로 전역/소스 활성화 후 첫 acquire 결과가 존재하고, 두 번째 acquire는 null이어야 한다. lease_until을 과거로 바꾼 뒤 새 토큰으로 획득하면 revision이 증가해야 한다.

```js
assert.ok(firstLease);
assert.equal(secondLease, null);
assert.notEqual(replacementLease.lease_token, firstLease.lease_token);
assert.ok(replacementLease.revision > firstLease.revision);
```

- [ ] 마이그레이션은 Wrangler migration 이력으로 한 번만 적용한다. 기존 posts/media/discoveries 건수가 유지되는지 검사한다. 관련 테스트 통과 후 세 파일을 커밋한다.

## Task 3: cycle과 재시도 순수 함수

**Files:** Create `src/collection-cycle.mjs`, `tests/collection-cycle.test.mjs`; Modify `src/collection.mjs`의 traversal 출력.

**Interfaces:** `startCycle(state,now)` → 상태 복사; `advanceCycle(state,page,now)` → 다음 상태; `retryAt(now,failures,retryAfter)` → Unix 초. page는 `{nextCursor,traversal:{exhausted,boundaryVerified}}`를 가진다.

- [ ] 아래 테스트를 추가하고 `node --test tests/collection-cycle.test.mjs`에서 실패를 확인한다.

```js
test('partial pages never advance the committed boundary', () => {
  const state=startCycle({committed_boundary_at:100000,pages_in_cycle:0},200000);
  const next=advanceCycle(state,{nextCursor:'page-2',traversal:{exhausted:false,boundaryVerified:false}},200010);
  assert.equal(next.committed_boundary_at,100000);
  assert.equal(next.next_cursor,'page-2');
  assert.equal(next.cycle_boundary_at,13600);
});
test('numeric Retry-After overrides the fallback', () => {
  assert.equal(retryAt(1000,0,'120'),1120);
});
```

- [ ] 초기 경계와 백오프를 다음과 같이 구현한다:

```js
export function startCycle(state,now) {
  if(state.cycle_started_at != null) return {...state};
  return {...state,cycle_started_at:now,
    cycle_boundary_at:state.committed_boundary_at == null
      ? now-7*86400 : state.committed_boundary_at-86400,
    next_cursor:null,pages_in_cycle:0,cursor_resets:0};
}
export function retryAt(now,failures,retryAfter) {
  const text=retryAfter?.trim();
  if(text && /^\d+$/.test(text)) {
    const seconds=Number(text);
    if(Number.isSafeInteger(seconds) && Number.isSafeInteger(now+seconds)) return now+seconds;
  }
  const date=text ? Date.parse(text)/1000 : NaN;
  if(Number.isFinite(date) && date>now) return Math.ceil(date);
  return now+Math.min(1800*2**Math.min(failures,4),21600);
}
```

- [ ] `advanceCycle`은 페이지 성공 때 last_success_at=now, failures=0, pages_in_cycle 증가. 진행 시 next_due_at=now+300, cursor 유지; 20페이지부터 catchup_status='catchup'. 완료 시 committed_boundary_at=cycle_started_at, last_complete_sync_at=now, cycle/cursor 초기화, next_due_at=now+1800.
- [ ] 종료 근거는 `boundaryVerified` 또는 `exhausted`다. 다만 exhausted가 공급자 제한/오류로 인한 조기 종료일 수 있으면 `gap`으로 표시하고 완료 경계는 유지한다. 실제 응답으로 전체 목록 종료의 의미를 검증하기 전에는 exhausted를 완료 근거로 활성화하지 않는다.
- [ ] 오래된 고정 글/다른 작성자의 재게시/매칭 0개는 종료 조건이 아니다. traversal 판정은 정규화 후 저장 대상이 아니라 공급자 전체 목록을 사용한다. 공급자 정렬 계약을 확인하지 못하면 boundaryVerified=false 유지, 운영 활성화 보류.
- [ ] 같은 cursor가 즉시 반복되면 needs_attention, 명시적으로 만료된 cursor는 동일 고정 경계로 재시작하며 한 cycle에서 2회까지 허용한다. 3회째는 needs_attention. 429/timeout은 이 카운터를 증가시키지 않는다.
- [ ] 최초 7일, 완료 시각, 20페이지, cursor 반복/만료, Retry-After 날짜/잘못된 값/과거 날짜 테스트를 추가하고 통과 후 커밋한다.

## Task 4: 페이지 저장·중지·실패 상태를 같은 소유권으로 보호

**Files:** Modify `src/collection-state.mjs`, `src/worker.mjs`; Test `tests/collection-state.test.mjs`, `tests/probe.test.mjs`.

**Interfaces:** `commitPage(DB,lease,page,nextState)` → batch 메타데이터; `recordFailure(DB,lease,{code,nextDueAt,status})` → 적용 여부. 입력 lease의 토큰/revision/control_revision은 획득 시 값 그대로 사용한다.

- [ ] 실패 테스트: acquire A → lease 만료 → acquire B → A의 commit은 거절되고 posts/cursor가 불변이어야 한다. 전역 중지→재개 후 A의 커밋도 거절해야 한다.
- [ ] 기존 commit_guard 테이블의 CHECK를 활용한다. 다음 guard 뒤에 기존 bulk posts/media/discoveries SQL, 운영 상태 갱신, guard 삭제를 같은 DB.batch에 넣는다.

```sql
INSERT INTO commit_guard(token,ok)
SELECT ?, CASE WHEN EXISTS(
  SELECT 1 FROM collection_state s JOIN collection_control c ON c.id=1
  WHERE s.source=? AND s.enabled=1 AND s.lease_token=?
    AND s.revision=? AND s.lease_until>unixepoch()
    AND c.enabled=1 AND c.revision=?
) THEN 1 ELSE 0 END;
```

- [ ] 상태 갱신은 lease 해제, revision 증가, nextState의 cycle 필드, last_success_at을 함께 저장한다. failure 갱신도 동일 guard를 쓰며 완료 경계를 변경하지 않는다. 오래된 실패가 새 실행의 성공을 덮어쓰지 못하도록 한다.
- [ ] media 교체 SQL 실패 시 posts/media/discoveries/운영 상태가 모두 rollback되는 테스트를 실제 SQLite 트랜잭션으로 작성한다. 21개 응답 전체 저장, 같은 ID 재처리, 소스별 discoveries 분리도 확인한다.
- [ ] 관측 runs INSERT는 커밋 이후 best effort로 유지한다. 실패하면 warning만 반환하고 예약을 변경하지 않는다. API의 last_success_at/last_complete_sync_at은 운영 상태를 읽는다.
- [ ] `node --test tests/collection-state.test.mjs tests/probe.test.mjs` 통과 후 커밋. 실제 D1 batch 동작은 Task 6에서 별도 확인한다.

## Task 5: scheduled 조정과 HTTP writer 통합

**Files:** Create `src/scheduler.mjs`, `tests/scheduler.test.mjs`; Modify `src/worker.mjs`, `scripts/probe-remote.js`, `README.md`.

**Interfaces:** `runDueSource(env)` → `{status:'disabled'|'idle'|'stored'|'retry'|'needs_attention'|'stale'}`. `COLLECTION_ENABLED`는 문자열 `'true'`만 허용한다. DB control.enabled는 추가 조건이다.

- [ ] 운영 봉인 테스트를 먼저 작성한다.

```js
test('disabled scheduler performs no database or provider requests', async t => {
  t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected network');});
  const result=await runDueSource({COLLECTION_ENABLED:'false',DB:{}});
  assert.equal(result.status,'disabled');
});
```

- [ ] 조정 순서: 환경 봉인 → acquireDueSource → 소스 설정 조회 → startCycle → fetchPage 한 번 → normalizePage → advanceCycle → commitPage → 로그. 최상단 봉인은 다음과 같다.

```js
if(env.COLLECTION_ENABLED !== 'true') return {status:'disabled'};
const lease=await acquireDueSource(env.DB,crypto.randomUUID());
if(!lease) return {status:'idle'};
```

- [ ] 오류 분기: 401/403/스키마/크기 초과는 needs_attention; 429/timeout/5xx는 retryAt 계산 후 recordFailure; guard 충돌은 stale. DB 자체 장애는 상위로 throw해 플랫폼 실패로 관측하고 lease 만료로 복구한다. 한 실행에서 같은 요청을 즉시 재시도하지 않는다.
- [ ] Worker에 다음 진입점을 추가한다. 아직 wrangler에 cron을 추가하지 않는다.

```js
async scheduled(controller,env,ctx) {
  await runDueSource(env);
}
```

- [ ] 기존 `/api/probe`는 자동 운영 코드 배포 시 HTTP 410으로 비활성화한다. 인증된 `POST /api/sources/:handle/retry`는 allowlist, 동일 Origin, 명시적 헤더를 검사하고 enabled 소스의 next_due_at만 DB 시각으로 조정해 202를 반환한다. lease/revision/cycle을 초기화하지 않는다. disabled 소스는 409, 모르는 소스는 404, 잘못된 Origin은 403. needs_attention 해제는 검토 후 관리 작업으로 한다.
- [ ] `GET /api/sources`는 소스별 enabled/last_success_at/last_complete_sync_at/catchup_status/last_error_code만 반환한다. 토큰·개인 설정은 제외한다. 인증 함수를 모든 HTTP 경로 앞에 유지한다.
- [ ] provider 호출 1회 상한, 두 scheduled 경합, disabled 소스, stale 실패, HTTP 재시도가 fetch를 실행하지 않음, 6소스 교대 테스트를 작성해 `npm test` 통과 후 커밋한다.

## Task 6: 비공개 검증 후 활성화 분리

**Files:** Modify `docs/VALIDATION.md`, `README.md`, `wrangler.jsonc`; Create `scripts/validate-scheduler.mjs`(로컬/원격 모드 명시 필수, 자격증명 출력 금지).

- [ ] `npm test`, `npx wrangler deploy --dry-run`을 실행하고 실제 출력/제한을 기록한다.
- [ ] 새로운 상태 마이그레이션을 먼저 로컬 적용한다: `npx wrangler d1 migrations apply seoyeon-zip-validation --local`. 기존 데이터 보존 확인 후 같은 명령의 `--remote`로 승인된 비공개 DB에 적용한다. 기본 enabled=0을 확인한다.
- [ ] `scripts/validate-scheduler.mjs`는 프로젝트의 Worker 런타임 테스트 방식으로 scheduled를 호출하고, 전역 중지/소스 중지/lease 교체를 두 실행 사이에 삽입한다. 원격 검증은 운영 DB와 혼동하지 않도록 별도 검증 소스 상태 또는 동일 스키마의 임시 검증 DB를 사용하며, 실제 게시물 삭제를 하지 않는다.
- [ ] 결과 표: 정상, 미디어 다수, 중복, 21개, 중간 실패, 오래된 lease, 중지 후 응답, 429, 공급자 401, 로그 실패의 HTTP/상태/CPU/SQL/게시물 수/경계 전후를 기록한다. 실제 관측하지 못한 행은 미검증으로 명시한다.
- [ ] 공급자 전체 목록의 고정 글·재게시 순서·cursor 소진 의미를 최소 2개 페이지로 확인한다. 이를 근거로 Task 3 traversal의 boundaryVerified/exhausted 계약을 구현·테스트한다. 근거를 확보하지 못하면 이 계획은 구현 가능한 비활성 상태에서 멈추고 자동 운영을 시작하지 않는다.
- [ ] 6개 소스별 collection 검증과 role 검증을 별도 기록한다. 최근 7일 바깥만 미포함인지, 이름 없는 직접 글 복구 범위가 맞는지 확인한다. COSMO 역할을 사진 존재만으로 통과시키지 않는다.
- [ ] 기존 Access 소유자 접근 및 익명 차단 확인. 무료 CPU/SQL 적합성 확인 전 활성화 금지. 프런트/API 전체 V1 완료 선언 금지.
- [ ] 마지막 별도 활성화 변경에서만 다음 설정 추가. 검증 통과한 소스만 enabled=1, 전역 DB enabled=1/revision 증가, 배포 환경 COLLECTION_ENABLED='true'. 자동 빌드 결과까지 확인한다.

```json
"triggers": { "crons": ["*/5 * * * *"] }
```

- [ ] 중지 절차를 실제로 확인: DB control.enabled=0과 revision 증가 → 진행 중 커밋 거절 → 다음 scheduled 외부 호출 0. Cron 제거는 추가 조치이며 전파 지연 동안의 유일한 봉인으로 사용하지 않는다.

## Spec coverage / 자체 검토

| 요구 | 작업 |
|---|---|
| 전체 페이지 저장·실패 시 경계 유지 | 1, 3, 4 |
| lease·공정성·중지·재시작 | 2, 4, 5 |
| 7일 초기 범위·24시간 겹침·catchup | 3, 6 |
| 429·204·401·스키마 오류 | 1, 3, 5 |
| 작성자/소스 분리·전용 계정 예외 | 기존 수정 유지, 4, 6 |
| 실제 CPU/SQL·Access·운영 봉인 | 5, 6 |

의도적 제외: 최종 피드 UI/필터, 인스타 수동 입력, 내보내기, 삭제 재검증, 전체 정규화 DB 모델 전환. 자동 수집에 필요한 상태 테이블만 추가하고 기존 JSON posts 저장은 유지한다. 후속 V1 작업으로 별도 계획한다.

실행 인계: 하위 에이전트별 작업/검토 또는 현재 세션에서 순차 실행 중 선택한다. 해당 Superpowers 실행 스킬이 현재 설치되어 있는지 먼저 확인하고, 없는 경우 제작자 스킬을 설치·확인한 뒤 시작한다. 문서 작성 자체는 실행 방식 선택을 기다릴 필요 없이 완료한다.

공식 근거: [Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [FxEmbed 목록 API](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/). 조회 근거와 실측 결과는 구별한다.
