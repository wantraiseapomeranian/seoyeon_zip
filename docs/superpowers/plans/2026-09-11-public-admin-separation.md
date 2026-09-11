# 방문자·관리자 기능 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 방문자에게 피드와 읽기 전용 수집 현황을 제공하고 모든 관리 조작을 소유자에게 제한한다.

**Architecture:** 기존 Worker에 명시적인 공개 경로 허용 목록과 서버 권한 검사를 둔다. 공개 수집 현황 API를 관리 API와 분리하고, 서버가 확인한 역할에 따라 같은 피드 화면의 관리 기능을 표시한다. 공개 플래그는 기본적으로 끈 채 검증한다.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers/Access/D1, jose, node:test, 기존 Playwright 검증 스크립트.

**Spec:** [방문자·관리자 기능 분리 설계](../specs/2026-09-11-public-admin-separation-design.md)

## Global Constraints

- 기존 X 3분 수집 주기와 다른 Cron 예약을 유지한다.
- 데이터 삭제·cursor 초기화·수집 조건 변경을 하지 않는다.
- 기존 Cloudflare Access 소유자 인증을 유지한다.
- 공개 전환은 별도 사용자 승인 후 수행한다.
- 공개용 응답은 필드 허용 목록으로 구성하고 내부 객체를 그대로 반환하지 않는다.
- 관리자 권한은 매 요청 서버에서 확인하며 프런트엔드 표시 상태를 신뢰하지 않는다.

## 현재 근거와 파일 구성

현재 `src/worker.mjs`는 모든 요청에 `authorize()`를 먼저 적용한다. `validation/feed.js`는 `/api/sources` 조회 후 항상 중지/켜기 버튼을 만든다. `validation/feed.html`에는 검토함 링크와 자료 관리 탭이 기본 포함돼 있다. `src/feed.mjs`는 저장된 data 전체를 반환하고 같은 사진 출처를 별도로 조회한다. 따라서 UI 숨김만으로 공개 준비를 완료할 수 없다.

| 파일 | 작업 |
|---|---|
| `src/access.mjs` (신규) | 기존 JWT 검증 추출, 헤더/쿠키 인증, 세션 판별 |
| `src/worker.mjs` | 공개 경로·메서드 허용 목록, 관리 권한, `/admin`, 새 조회 API |
| `src/public-data.mjs` (신규) | 수집 현황 및 피드의 공개 필드 변환 |
| `src/feed.mjs` | 기존 공개 대상 필터 확인; 변경 없이 회귀 검증 |
| `validation/feed.html`, `feed.js`, `feed.css` | 기본 방문자 화면과 인증된 관리자 화면 |
| `tests/access.test.mjs`, `tests/public-data.test.mjs` (신규), `tests/feed.test.mjs` | 접근 제어·응답 정보·피드 회귀 검증 |
| `scripts/check-public-admin.mjs` (신규), `scripts/check-management.mjs` | 역할별 브라우저 검증 및 기존 fixture 조정 |
| `wrangler.jsonc`, `docs/SPEC.md`, `docs/PLAN.md`, `docs/VALIDATION.md` | 기본 비공개 플래그, 정책과 실제 검증 기록 |

## Task 1: 서버 권한과 공개 경로 분리

**Interfaces:** `authorize(request, env): Promise<200|401|403|503>`를 유지한다. `src/access.mjs`에서 구현하고 Worker에서 재노출해 기존 import를 유지한다. 테스트용 JWT 검증 함수 `verifyOwnerToken(token, env, keyResolver)`는 jose key resolver를 받으며 운영은 원격 JWKS만 사용한다. 요청/쿼리/env에서 임의 JWKS 주소를 받아서는 안 된다.

- [x] `tests/access.test.mjs`에 기존 비공개 기본값, 공개 플래그의 정확한 문자열 비교, 경로·메서드 행렬 테스트를 추가한다. ASSETS/DB spy로 차단 요청이 실제 조회나 변경에 도달하지 않는지도 확인한다.

```js
for (const path of ['/api/export', '/api/sources', '/api/samples',
  '/admin/x', '/admin/instagram', '/instagram.html', '/instagram',
  '/x-review.html', '/x-review', '/index.html', '/cards.js']) {
  const response = await worker.fetch(new Request(`https://example.test${path}`), {
    PUBLIC_FEED_ENABLED: 'true', TEAM_DOMAIN: 'https://test.cloudflareaccess.com',
    POLICY_AUD: 'aud', OWNER_EMAIL: 'owner@example.test'
  });
  assert.equal(response.status, 401, path);
}
```

- [x] `node --test tests/access.test.mjs`를 실행해 새 `/api/session` 공개 계약 등 미구현 테스트의 실패를 확인한다.
- [x] 기존 authorize를 추출하고 쿠키를 읽는 서버 경로를 추가한다. JWT 헤더가 존재하면 그 값만 검증하고, 헤더가 없을 때만 단일 `CF_Authorization` 쿠키를 검증한다. 중복 인증 쿠키와 빈/잘못된 토큰은 거부한다. 기존 RS256·필수 exp/iat/email·issuer/audience·OWNER_EMAIL 검사를 유지한다.
- [x] Worker에 아래 허용 목록을 적용한다. 공개 API의 HEAD는 이번에 지원하지 않고 GET만 허용한다. 미등록 경로를 ASSETS로 익명 전달하지 않는다. 플래그가 꺼져 있으면 기존 전체 인증을 유지한다.

```js
const publicAssets = new Set(['/', '/feed', '/feed.html', '/feed.css', '/feed.js',
  '/review-gallery.js', '/favicon.ico', '/favicon-16.png', '/favicon-32.png']);
const publicApis = new Set(['/api/feed', '/api/collection-status', '/api/session']);
const publicRequest = env.PUBLIC_FEED_ENABLED === 'true' && (
  (['GET', 'HEAD'].includes(request.method) && publicAssets.has(url.pathname)) ||
  (request.method === 'GET' && publicApis.has(url.pathname))
);
```

- [x] `/api/session`은 검증 성공 시 owner, 토큰 없음/무효 시 visitor를 반환한다. 인증 설정 누락/검증 인프라 장애는 관리자 권한을 주지 않고 503으로 처리한다. `/admin`과 `/admin/`은 인증 후 `/`로 고정 리다이렉트한다. 역할 응답과 개인화 자산에 `private, no-store`를 유지한다.
- [x] jose의 `generateKeyPair`, `SignJWT`로 로컬 서명 토큰을 만들어 정상 소유자, 다른 이메일, 다른 aud/issuer, 만료, 변조를 검사한다. Worker 경로 테스트도 키 조회를 테스트 범위에서 대체하여 정상 토큰이 실제 관리 경로에 도달하는지 검증한다. 단순 내부 `handleApi()` 직접 호출만으로 인증 통과를 주장하지 않는다.
- [x] 위 테스트 재실행 후 `wrangler.jsonc`에 `PUBLIC_FEED_ENABLED: "false"`를 명시하고 관련 파일만 커밋한다. 기존 Origin·관리 액션 헤더 검사는 제거하지 않는다.

## Task 2: 공개 수집 현황과 피드 데이터 최소화

**Interfaces:** `publicSource(source): {source,state,lastSuccessAt}` 및 `publicPost(post): object`를 `src/public-data.mjs`에 둔다. `GET /api/collection-status` 응답은 `{sources:[...]}`다. 관리자 `/api/sources` 계약은 유지한다.

- [x] `tests/public-data.test.mjs`에 필드 허용 목록과 상태 우선순위 테스트를 작성한다.

```js
assert.deepEqual(publicSource({source:'WEV86_', enabled:0,
  collection_enabled:true, last_success_at:0, revision:91,
  last_error_code:'storage_error', cursor:'private'}), {
  source:'WEV86_', state:'paused', lastSuccessAt:'1970-01-01T00:00:00.000Z'
});
```

- [x] `node --test tests/public-data.test.mjs`로 미구현 실패를 확인한다.
- [x] 기존 `listSources()`의 결과에 env/DB 전체 수집 허용 여부를 반영한 뒤 `publicSource()`로 투영한다. paused → 실제 오류 attention → 성공 기록 없음 waiting → ok 순서로 판정한다. 기존 화면의 정상 과거 종료 코드 분류를 공통 변환에 옮겨 의미를 유지한다. 실제 오류 문자열은 반환하지 않는다.
- [x] 피드 반환용 복사를 명시적으로 구성한다. 중첩 media와 duplicateSources도 화이트리스트를 사용한다.

```js
export function publicPost(p) {
  return {
    id:p.id, publishedAt:p.publishedAt, canonicalUrl:p.canonicalUrl,
    authorHandle:p.authorHandle, observedViaSource:p.observedViaSource,
    platform:p.platform, contentKind:p.contentKind, caption:p.caption,
    manual:p.manual, dateEstimated:p.dateEstimated,
    media:(p.media ?? []).map(m => ({kind:m.kind, previewUrl:m.previewUrl,
      width:m.width, height:m.height})),
    duplicateSources:(p.duplicateSources ?? []).map(s => ({url:s.url, author:s.author}))
  };
}
```

- [x] Worker의 `/api/feed` 응답에서 posts만 투영하고 total/collectedAt/nextCursor는 유지한다. 피드 페이지 cursor는 공개 페이지네이션 계약이며 비공개 수집 cursor와 구분한다.
- [x] `tests/feed.test.mjs`에 숨김/보류 글이 같은 사진 출처로 연결되지 않는 회귀 사례를 추가한다. 기존 `x_photo_rows`/`instagram_photo_rows`의 eligible/kept 조건이 이미 동일한 공개 판단을 적용함을 확인했으므로 SQL 변경 없이 회귀 검증한다. 사진 중복 제거로 대표에서 제외된 정상 공개 글의 출처 링크는 유지한다.
- [x] `node --test tests/public-data.test.mjs tests/feed.test.mjs tests/access.test.mjs`를 실행한다. 직렬화 결과에 revision/error/cursor 등 수집 내부 값이나 검토 사유가 없는지 검증하고 관련 파일을 커밋한다.

## Task 3: 방문자 화면과 관리자 화면 분기

**Interfaces:** UI 역할은 `visitor|owner`. 최초 역할은 visitor이며 `/api/session`의 서버 응답이 owner일 때만 관리자 DOM을 생성/표시한다. 방문자는 `/api/collection-status`, 관리자는 `/api/sources`를 조회한다.

- [x] `scripts/check-public-admin.mjs`에 Playwright 역할별 fixture를 추가한다. 관리자 판정 응답을 지연시켜 최초 노출도 확인한다.

```js
await page.route('**/api/session', route => route.fulfill({
  json:{role:'visitor'}
}));
await page.goto(baseUrl);
await page.locator('#open-status').click();
assert.equal(await page.locator('#status-title').textContent(), '수집 현황');
assert.equal(await page.getByRole('button', {name:/수집 (중지|켜기)/}).count(), 0);
assert.equal(await page.locator('#tools-tab').isVisible(), false);
```

- [x] 위 스크립트를 기존 로컬 미리보기 대상으로 실행해 미구현 상태를 확인한다.
- [x] `feed.html`의 검토함 링크·자료 관리 탭/패널을 기본 hidden으로 설정한다. CSS가 hidden을 덮어쓰지 않게 한다. 로그인 링크 `/admin`을 추가한다. 관리자 확인 전에는 수집 변경 버튼을 생성하지 않는다.
- [x] `feed.js`에서 아래 형태로 서버 역할에 따라 조회를 선택한다. 기존 `loadLive()`의 무조건 `/api/sources` 호출도 교체해 방문자 초기 로딩에서 관리 API를 요청하지 않게 한다.

```js
let role = 'visitor';
const sourceEndpoint = () => role === 'owner'
  ? '/api/sources' : '/api/collection-status';
```

- [x] 방문자 수집 현황은 계정·상태·성공 시각만 그린다. 관리자는 기존 상세/중지/재시도 동작을 유지한다. 방문자에게 빈 탭바와 관리자용 중지 안내 문구가 남지 않게 하고 collection-panel의 탭 관련 ARIA도 일반 영역으로 전환한다.
- [x] 관리 요청 401/403 시 역할을 visitor로 낮추고 관리자 DOM/내부 상세 데이터를 제거한 뒤 공개 현황을 다시 조회한다. 수집 설정을 자동 재전송하지 않고 로그인 안내를 표시한다. 세션 조회 실패 시 공개 피드는 유지하며 관리자 제어는 숨긴다.
- [x] 390px와 1280px에서 visitor/owner/로그인 만료/조회 실패를 검사한다. `scripts/check-management.mjs`는 owner 세션 fixture를 추가해 기존 관리 동작 검증을 유지한다. 두 스크립트 통과 후 관련 UI 및 검증 파일을 커밋한다.

## Task 4: 통합 검증과 비공개 배포

- [x] `npm test`와 Task 3의 역할별 브라우저 검증을 실행한다. 공개 플래그 true인 로컬 Worker에서 익명 GET 허용, 변경 요청 차단, 위조 헤더/만료 JWT 거부, 정상 관리자 조작을 확인한다. 실제 운영 수집 중지나 등록을 검증용으로 실행하지 않는다.
- [ ] 현재 Access 애플리케이션의 host/path/audience 및 쿠키 전달 범위를 읽기 전용으로 확인한다. `/admin` 로그인 후 공개 경로 요청에 검증 가능한 쿠키가 전달되는지 별도 비공개 검증 환경에서 확인한다. 확인되지 않으면 공개 준비 완료로 기록하지 않는다.
- [x] `docs/SPEC.md`에 공개 플래그가 켜진 경우의 확장 정책을 추가하고, PLAN/VALIDATION에 실제 결과와 미확인 사항을 적는다. 기존 전체 비공개 기본 정책을 무조건 삭제하지 않는다.
- [x] 변경 diff와 비밀값/원본 자료 포함 여부를 점검하고 지정 파일만 커밋·푸시한다. 기존 비공개 Access 보호와 `PUBLIC_FEED_ENABLED=false`를 유지한 자동 배포의 커밋 일치/성공 결과를 확인한다.
- [ ] 원격 비로그인 요청은 계속 Access 보호를 받고, 로그인한 소유자의 피드·관리 기능이 유지되는지 확인한다. 로컬 공개 모드 검증과 실제 공개 운영 검증을 구별해서 기록한다.

## Task 5: 공개 전환 — 별도 사용자 요청 이후

- [ ] Task 1~4의 차단/성공 사례와 쿠키 전달 확인 결과를 사용자에게 보여준다. 기존 요청은 계획 수립이며 이 체크리스트 자체가 공개 전환 승인인 것은 아니다.
- [ ] 공개 승인을 받은 뒤 현재 Access 설정의 복원 가능한 사본을 확보한다. 정확한 공개 경로/메서드와 관리자 보호 경로를 적용할 수 있는지 확인한다. `/api/*` 전체 우회 규칙은 사용하지 않는다.
- [ ] 서버 공개 플래그를 먼저 활성화해 배포 완료를 확인하되 전체 Access 보호는 유지한다. 이어 승인된 공개 경로만 외부 접근을 허용한다. `/admin` 인증과 Worker의 나머지 경로 기본 차단을 유지한다.
- [ ] 실제 익명 브라우저에서 피드/현황 조회와 모든 관리 경로 차단을 확인한다. 별도 소유자 브라우저에서 로그인·관리 버튼·조회 동작을 확인한다. 공개 후 Cron 성공과 오류 추세를 확인하고 결과를 기록한다.
- [ ] 권한 노출 또는 관리자 로그인 실패 시 전체 Access 보호를 먼저 복원하고 공개 플래그를 false로 되돌린다. 데이터나 수집 cursor를 되돌리지 않는다.

## 자체 점검

- 사용자 요구의 수집 상태 공개, 중지 버튼 숨김, 자료 관리/검토함 보호는 Task 1~3에 대응한다.
- 공개 전환과 수집 주기 유지는 전역 제약 및 Task 4~5에 반영했다.
- 역할 이름, 상태 필드, API 경로를 전체 작업에서 동일하게 사용한다.
- Task 1~3 구현과 로컬 검증을 완료했다. 전체 테스트 92개, 역할별 브라우저/관리 흐름 및 실제 Workers 로컬 런타임 검증을 통과했다. 운영 배포/미확인 사항은 docs/VALIDATION.md에 기록한다.

실행 결과: Task 1~3 및 Task 4의 로컬 검증/비공개 자동 배포 완료(코드8984db5). 전체92개 테스트와 브라우저 검증 통과. Task 4의 운영 관리자 역할·화면 연결은 사용자가 Chrome에서 검토함·수집 중지 버튼 표시로 확인했다. 공개 정책 적용 후 쿠키 전달 검증은 미확인으로 유지한다. Task 5 공개 전환은 미실행이다.
