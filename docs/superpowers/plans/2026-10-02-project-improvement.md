# 서연모음.zip 종합 보완 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. 사용자가 병렬 작업을 선택하면 `subagent-driven-development`를 적용한다. 각 작업의 체크박스는 실제 결과를 확인한 뒤 완료한다.

**Goal:** 수집·이미지 갱신의 문제를 빠르게 발견하고, 피드 조회 비용과 운영 개입을 줄이며, 변경·복구를 반복 가능하게 만든다.

**Architecture:** 기존 HTML/CSS/JavaScript, 단일 Worker와 D1 구조를 유지한다. 기존 운영 상태·알림·검증 경로를 확장하고, 성능 변경은 같은 결과를 내는지 비교한 뒤 적용한다. 기능별 작업은 별도 커밋과 검증 단위로 진행한다.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers/D1/Access, Node Test Runner, Playwright, GitHub 연동 Workers Builds. 현재 Node 요구사항은 `>=24.14.1`이다.

**Spec:** `docs/SPEC.md`, `DESIGN.md`, `AGENTS.md` 및 이 문서의 범위·완료 조건. 초기 설계와 후속 결정이 충돌하면 최신 사용자 지시와 후속 승인 기록을 우선한다.

작성일: 2026-10-02 KST. 기준: 원격 `main`의 `452a46351ed8a5ad34e81a36b74fe1de36b3ef19`.

**상태: 기능 구현·검증·운영 배포 완료 / 후속 관찰 진행.** `df30fc6`의 필수 검사·정상 병합·자동 배포·공개200/관리자401을 확인했다. 작업 6의 Chrome 200% 글자 결함도 수정·검증했다. 7일과 정상 갱신 두 주기, 실제 기기 검증은 미완료다. Builds 설정 API403과 SQL 세부 분리의 측정 한계는 기록에 남겼다. 실제 결과는 [VALIDATION](../../VALIDATION.md), 현재 상태는 [STATUS](../../STATUS.md)를 따른다.

## 1. 평가 근거와 이번 범위

| 구분 | 확인 내용 | 대응 |
|---|---|---|
| 코드에서 확인 | 통합 운영 집계·알림은 Instagram 동기화를 읽지만 별도 이미지 주소 갱신 상태를 읽지 않는다. | 작업 1 |
| 운영 기록에서 확인 | 10/1 피드 주 조회 단회 비교: 367→651ms, 읽은 행 142,558→195,783. 전체 작성 계정 목록 제공으로 비용 증가. | 작업 2에서 재측정 후 개선 |
| 과거 성능 기록 | 9/22 LCP 중앙값 데스크톱 4.244초, 모바일 4.612초. 현재 배포 수치 또는 실제 사용자 p75가 아니다. | 작업 2에서 동일 조건의 최신 기준선 확보 |
| 구현·기록에서 확인 | 검증 명령이 분리돼 있고 Windows workerd 실행 차단 기록이 있다. 원격 필수 검사·배포 차단 설정은 미확인. | 작업 3에서 설정 확인 후 보완 |
| 기록만으로 판단 불가 | DB 복원 가능 범위와 실제 복원 훈련 결과를 확인하지 못했다. 백업 부재로 단정하지 않는다. | 작업 4 |
| 후속 관찰 필요 | X의 반복 404 이후 자동 복구, YouTube 예약 영상 이후 자동 수집, Instagram 3일 후 재갱신의 장기 증거가 부족하다. | 작업 5 |
| 후속 확인 필요 | 확대창 모서리 보완 이후 실제 iPhone 확인, VoiceOver·멀티터치 등은 일부 미확인. | 작업 6 |
| 유지보수 부담 | 초기 제안과 현재 구현이 문서에 함께 남아 있고, 일부 SQL·상태 전이가 복잡하다. | 작업 7 및 각 변경의 제한된 정리 |

### 이미 완료된 작업

다음은 재구현하지 않고 필요한 회귀만 확인한다.

- X 404 자동 재시도와 기존 중단 상태의 재획득.
- YouTube 일일 검색 50회·태평양 날짜 경계 대기·예약 영상 보류·응답 오류 12시간 대기.
- Instagram 미리보기 주소 갱신·동일 사진 표시 주소 매핑·요청하지 않은 정상 응답 행 분리.
- 플랫폼/작성 계정 필터, 피드 추가 페이지의 기존 카드 유지, 첫 사진 비율 고정, 모바일 확대창.
- 관리자 인증, 판정 revision, 감사 기록, 공개 API 요청 제한.

Instagram 복구 기록은 기존 실패 46장 중 45장 복구, 전체 118장 중 117장 응답 정상이다. 남은 1장은 현재 원문에서 찾지 못한 사진이다. 다른 사진으로 대체하거나 삭제하는 작업은 포함하지 않는다.

## 2. 공통 제약

- 원본 미디어 파일·공급자 raw 응답·인증 상태·토큰을 저장소에 커밋하지 않는다.
- 기존 공개 열람 범위와 관리자 Access/JWT 보호를 유지한다. 공개 범위 확대, 결제 변경, 운영 데이터 삭제는 포함하지 않는다.
- 사용자 판정·revision·감사 기록·사진 순서·확정 중복 판정을 보존한다.
- 수집 응답 전체의 처리가 끝나고 저장이 성공한 뒤에만 cursor를 전진한다.
- 상태 조회는 읽기 전용이다. 화면 새로고침으로 유료 실행·수집 재시작을 유발하지 않는다.
- 최신 `main`에서 구현한다. 계획 작성 당시 작업 폴더는 이전 브랜치이며 `docs/PLAN.md`, `docs/VALIDATION.md`, `.impeccable/`에 기존 변경이 있다. 임의 덮어쓰기·일괄 추가를 하지 않는다.
- 변경에 필요한 파일만 정리한다. 프레임워크 전환, 전체 재작성, 기능과 무관한 모듈 분리는 포함하지 않는다.
- 실제 검증 결과는 `docs/VALIDATION.md`에 커밋·환경·명령·결과·한계와 함께 기록한다. 과거 성공을 최신 커밋의 성공으로 옮겨 적지 않는다.

## 3. 순서와 산출물

| 순서 | 우선순위 | 작업 | 선행 조건 | 완료 산출물 |
|---|---|---|---|---|
| 0 | 필수 | 구현 기준과 기존 변경 분리 | 구현 시작 | 기준 SHA·변경 범위 기록 |
| 1 | 높음 | Instagram 이미지 갱신 감시 연결 | 0 | 관리자 상태·알림·회귀 검사 |
| 2 | 높음 | 피드 성능 측정과 조회 개선 | 0 | 전후 측정·동등성 검사·개선 코드 |
| 3 | 높음 | 필수 검사와 배포 연결 | 0 | 재현 가능한 검사와 실제 차단 증거 |
| 4 | 높음 | DB 복원 절차 확인·훈련 | 0 | 복구 절차·격리 복원 결과 |
| 5 | 중간 | 자동 복구·비용 장기 관찰 | 1 배포 이후 | 7일 이상 운영 관찰 결과 |
| 6 | 중간 | 실기기·접근성 확인 | 1·2 화면 변경 이후 | 기기별 결과·재현 결함 수정 |
| 7 | 중간 | 현재 상태 문서와 작업 구조 정리 | 각 작업과 함께 | 최신 상태 요약·운영 문서 |

권장 진행은 0→1→2→3→4→6이며, 5는 1 배포 후 실제 시간이 지나며 증거를 모은다. 7은 각 단계에 함께 반영한다. 한 작업의 운영 관찰이 끝나지 않아도 독립적인 다음 작업은 진행할 수 있다.

## 작업 0. 구현 기준 고정

**대상:** Git 브랜치·작업 폴더, `docs/PLAN.md`, `docs/VALIDATION.md`.

- [x] 원격 `main` SHA와 해당 배포 상태를 확인한다. 이 계획 이후 변경이 있으면 완료 항목과 대상 파일을 먼저 대조한다.
- [x] 기존 작업 폴더의 미커밋 변경을 보존하고 최신 코드에서 작업할 폴더를 정한다. 새 worktree가 필요하면 기존 사용 가능한 worktree를 먼저 확인한다.
- [x] 작업별 변경 파일과 검증 명령을 확정한다. 아래 신규 경로는 제안 경로이며 같은 역할의 파일이 이미 생겼다면 기존 파일을 사용한다.

**완료:** 다른 작업의 변경이 섞이지 않은 상태에서 작업 1을 시작할 수 있다. 계획 문서 때문에 기존 코드 브랜치를 `main`에 덮어쓰지 않는다.

## 작업 1. Instagram 이미지 갱신을 운영 상태와 알림에 연결

**수정:** `src/operations.mjs`, `src/operations-alerts.mjs`, `validation/operations.html`, `validation/operations.js`, 필요 시 `validation/operations.css`.

**신규:** `src/instagram-refresh-operations.mjs`, `tests/instagram-refresh-operations.test.mjs`.

**기존 검사:** `tests/operations.test.mjs`, `tests/operations-alerts.test.mjs`, `tests/operations-alerts-integration.test.mjs`, `tests/operations-access.test.mjs`, `scripts/check-operations-tabs.mjs`.

### 상태 계약

기존 `instagram` 동기화 상태는 유지하고 관리자 운영 API에 `instagramRefresh`를 추가한다. `readInstagramRefreshOperations(env, now)`가 반환할 계약은 다음과 같다. 시간은 epoch seconds를 입력받아 ISO 문자열 또는 null로 반환한다.

```ts
// JavaScript 구현이 따를 응답 타입. TypeScript 전환을 요구하지 않는다.
// readInstagramRefreshOperations(env, now) -> Promise<InstagramRefreshState>
type InstagramRefreshState = {
  status: 'disabled' | 'unconfigured' | 'waiting' | 'running' |
          'healthy' | 'retry' | 'attention' | 'delayed' | 'budget_wait' | 'unavailable',
  refreshedAt: string | null, nextDueAt: string | null, error: string | null,
  startsToday: number, dailyStartLimit: 2,
  failedPosts: number, overduePosts: number
};
```

| 상태 조건 | 표현·알림 규칙 |
|---|---|
| 갱신 또는 Apify 동기화 플래그 비활성 | disabled. 기존 문제는 stopped로 종료하며 recovered로 표시하지 않음 |
| 토큰 미설정 | unconfigured. 토큰 내용은 출력하지 않음 |
| `error` 또는 lease가 만료된 `starting` | attention. 시작 결과 불확실은 운영자 확인 필요 |
| 유효 lease의 `starting`/`waiting`, 실행 결과 대기 | running. 이미 실패한 게시물 수는 함께 표시 |
| 당일 시작 2회 소진·다음 UTC 날짜까지 예정 대기 | budget_wait. 대기 자체는 장애가 아님. 게시물 실패를 숨기지 않음 |
| 게시물별 실패 또는 작업 실패가 남음 | retry. 정상 동기화와 구분 |
| 실행할 작업의 기한이 15분 이상 지남 | delayed. 성공 후 3일 대기·빈 큐 1시간 대기는 지연에서 제외 |
| 첫 성공 전 정상 대기 | waiting. 성공 이력을 만들어내지 않음 |
| 성공 이력이 있고 미해결 실패·지연 없음 | healthy |
| 상태 조회 실패 | unavailable. 다른 플랫폼 상태는 표시하고 정상·복구로 간주하지 않음 |

게시물 실패/지연 집계는 현재 자동 갱신 대상인 공개 사진 게시물에 한정한다. 과거에 제외한 게시물의 오류로 경고가 계속 남지 않게 한다. UTC 날짜가 바뀌면 이전 `budget_day`의 시작 횟수를 오늘 사용량으로 표시하지 않는다.

- [x] 실제 D1 어댑터로 상태별 SQL fixture를 만들고 통합 응답에 `instagramRefresh`가 없어서 실패하는 회귀를 먼저 확인한다.
- [x] 새 집계 모듈을 작성하고 `readOperationsState()`에서 호출한다. 집계 실패를 `unavailable`로 분리한다. 공급자 API 호출과 쓰기 SQL은 사용하지 않는다.
- [x] 알림 키 `instagram-refresh`, 이름 `Instagram 이미지 갱신`을 추가한다. 기존 문제 15분 지속·정상 5분 지속 규칙을 재사용한다. `unavailable`은 정상 복구로 처리하지 않으며 지속되면 상태 확인 실패로 알린다.
- [x] 운영 수집 탭에서 동기화와 이미지 갱신을 구분하고 마지막 성공·실패 건수·다음 예정·오늘 시작 횟수를 표시한다. 알림 링크를 해당 영역으로 연결한다. run ID·서명 URL·raw 오류는 화면에 노출하지 않는다.
- [x] 정상 동기화 + 갱신 차단, 부분 실패, 예산 대기 + 미해결 실패, 성공 후 복구, 비활성, 조회 실패, 재발을 확인한다.

대표 회귀 골격은 기존 SQL 어댑터로 실행한다.

```js
const d = testDatabase();
d.sqlite.exec("UPDATE instagram_media_refresh SET state='error',last_error='start_uncertain' WHERE id=1");
const state = await readOperationsState({
  DB: d.DB, APIFY_SYNC_ENABLED: 'true', APIFY_TASK_ID: 'task123',
  APIFY_TOKEN: 'fixture-token', INSTAGRAM_MEDIA_REFRESH_ENABLED: 'true'
}, {details: false});
assert.equal(state.instagramRefresh.status, 'attention');
```

검사 명령: `node --test tests/instagram-refresh-operations.test.mjs tests/operations.test.mjs tests/operations-alerts.test.mjs tests/operations-alerts-integration.test.mjs tests/operations-access.test.mjs` 및 `node scripts/check-operations-tabs.mjs`.

**완료:** 갱신 실패가 동기화 성공에 가려지지 않고, 알림 중복 발생·거짓 복구·조회 중 쓰기가 없다. 비로그인 관리자 API 차단과 기존 운영 탭을 유지한다.

## 작업 2. 피드 조회·초기 표시 성능 개선

**수정 후보:** `src/feed.mjs`, `validation/feed.js`, `validation/feed.html`, `src/worker.mjs`의 preload 부분.

**신규:** `scripts/measure-feed-performance.mjs`, `docs/PERFORMANCE.md`.

**기존 검사:** `tests/feed.test.mjs`, `tests/feed-filters.test.mjs`, `tests/youtube-feed.test.mjs`, `tests/instagram-preview-urls.test.mjs`, `scripts/check-feed-filters.mjs`, `scripts/check-feed-paging.mjs`, `scripts/check-feed-preload.mjs`, `scripts/check-feed-photo-ratio.mjs`, `scripts/check-photo-loading.mjs`.

### 측정 계약

측정 결과는 `.local/feed-performance/`에 두고 커밋하지 않는다. 공유 보고서는 URL 서명·원본 데이터 없이 다음 필드만 사용한다.

```js
{commit, scenario, sampleCount, cacheMode, viewport,
 apiMs, sqlMs, rowsRead, responseBytes, lcpMs, cls, failedRequests}
```

값을 얻지 못하면 null과 이유를 기록한다. Node SQLite 어댑터의 `rows_read: 0`을 운영 읽기 비용으로 사용하지 않는다.

- [x] 같은 커밋·같은 데이터 기준으로 사진 기본, X/Instagram 플랫폼, 작성 계정, 날짜+종류, YouTube 형식+분류, 두 번째 페이지를 측정한다. 시나리오별 5회, 첫 호출과 후속 호출을 구분하고 중앙값·범위를 기록한다.
- [x] 390×844, 1280×900에서 첫 화면 API 시간·이미지 대기·LCP·CLS를 확인한다. 네트워크 설정과 캐시 조건을 함께 기록한다. 소표본을 실제 사용자 p75/p95로 표현하지 않는다.
- [ ] 작성 계정 집계·전체 건수·페이지 목록·중복 출처·이미지 별칭 조회의 비용을 분리한다. 공개 API 응답에 진단 SQL·내부 값을 추가하지 않는다.
- [x] 다음 두 후보를 비교한다: A는 현재 API를 유지하면서 같은 요청 내 중복 계산과 SQL 실행 계획 개선, B는 후속 페이지에서 불필요한 계정 목록 재계산을 생략하는 명시적 요청 계약 추가. A를 우선하며 B는 API 기본 응답·플랫폼 전환·계정 선택 복원을 유지할 수 있을 때 적용한다.
- [x] 변경 전후 게시물 ID·순서·총건수·다음 cursor·계정 목록·판정 반영을 비교하는 회귀를 먼저 작성한다. 같은 결과를 낸 후보만 성능 비교에 남긴다.
- [x] SQL·인덱스 개선으로 효과가 부족할 때만 별도 집계·캐시 설계를 검토한다. 캐시를 도입하려면 숨김 판정 즉시 반영과 무효화 경로부터 확정한다. 이번 계획은 영구 캐시 도입을 전제하지 않는다.
- [ ] 초기 이미지 병목이 확인되면 기존 preload·priority·중복 요청 여부를 개선한다. 원본 품질·사진 순서·날짜별 배치·다른 탭을 보존한다.
- [x] 동일 조건으로 재측정한다. 결과 동등성, 읽은 행 감소 또는 반복 측정에서 확인되는 SQL 시간 개선, 다른 대표 조건의 회귀 여부를 보고한다. 효과 없는 후보는 적용하지 않는다.

검사 명령: `node --test tests/feed.test.mjs tests/feed-filters.test.mjs tests/youtube-feed.test.mjs tests/instagram-preview-urls.test.mjs`, 이후 변경 경로에 해당하는 위 브라우저 검사.

**완료:** 전후 측정 근거가 있고 결과·공개 판정이 동일하다. 2.5초 LCP는 장기 목표로 기록하며 이번 작업의 보장값으로 약속하지 않는다. 외부 CDN과 내부 API 시간을 구분한다.

작업 2 확인 범위: 초기 브라우저는 fixture 이미지 조건이며, 후속 실제 공개 Worker/CDN 전후 측정도 화면별5회 수행했다. 관찰 창·캐시·외부 조건의 한계는 PERFORMANCE에 구분했다. authors/count/page는 하나의 SQL로 실행돼 부분별 실행 시간을 분리하지 않았다. 원격 Instagram 이미지 별칭 비용도 미측정으로 남긴다. 검증되지 않은 이미지 최적화는 추가하지 않았다.

## 작업 3. 필수 검사와 배포 절차 연결

**수정:** `package.json`, `docs/CHECKS.md`.

**신규 후보:** `.github/workflows/verify.yml`, `scripts/check-release.mjs`.

- [ ] GitHub Actions, 브랜치 보호, Workers Builds의 현재 트리거·검사 명령·대상 브랜치를 읽는다. 이미 있는 검사를 재사용한다. 현재 설정을 확인하기 전에 검사 부재로 단정하지 않는다.
- [x] Node 버전을 프로젝트 하한 이상으로 고정하고 `npm ci`로 잠금 파일을 사용한다. workerd가 실행 가능한 Linux 환경을 준비하고 브라우저 검사의 `channel: 'chrome'`에 맞는 Chrome 설치를 확인한다.
- [x] `check-release.mjs`는 Node 테스트→로컬 runtime→기본 UI→핵심 피드/확대창/운영 탭 검사를 순서대로 실행한다. 자식 프로세스 실패·시작 실패를 즉시 비정상 종료로 전파하고 건너뛴 검사를 통과로 표시하지 않는다.
- [x] 검증에는 운영 비밀값·운영 DB·유료 공급자 호출을 사용하지 않는다. 실제 외부 fetch로 빠질 수 있는 기존 검사는 fixture로 차단한 뒤 포함한다. UI 서버는 검사가 끝나거나 실패해도 종료한다.
- [x] 먼저 PR에서 검증을 실행한다. 검사 이름이 실제 생성되는 것을 확인한 뒤 기존 보호 절차에 필수 검사로 연결한다. main push 뒤 병렬로 실행되는 검사만 추가하고 배포 전 차단이 완성됐다고 보고하지 않는다.
- [x] 기존 연동 배포를 유지하면서 필수 검사 통과 커밋만 main에 들어가도록 한다. 직접 push 경로가 허용돼 있다면 실제 배포 전 검사 수단을 포함해 정책을 정한다. 보호 규칙을 우회하지 않는다.
- [x] 일회성 검증 브랜치에서 의도적으로 실패시킨 검사로 병합·배포 차단을 확인하고, 성공 커밋에서 해제되는 것을 확인한다. 실패 fixture를 main에 넣지 않는다.

제안되는 명령 연결은 다음과 같다. 실행기 안에는 위 검사 목록을 명시한다.

```json
{"scripts":{"check:release":"node scripts/check-release.mjs"}}
```

**완료:** 특정 SHA에 대한 필수 검사 결과와 실패 차단 증거가 있다. npm test 성공, runtime 성공, UI 성공, Workers Builds 성공을 각각 확인할 수 있다. 유료 CI·요금제 변경이 필요하면 적용하지 않고 조건을 보고한다.

## 작업 4. DB 복원 절차 확인과 격리 훈련

**신규:** `docs/RECOVERY.md`. **수정:** `docs/MIGRATIONS.md`, `docs/VALIDATION.md`.

- [x] 현재 D1의 복원 기능·보존 기간·사용 권한과 기존 export 보관 여부를 읽기 전용으로 확인한다. 실행 시점의 공식 문서와 실제 설정을 대조하고 현재 가능한 복원 범위를 기록한다.
- [x] 복구 단위를 게시물·미디어 메타데이터, 판정·revision, 감사 기록, fingerprint·차이 판정, 표시 주소 매핑, 수집 상태, 마이그레이션 이력으로 나눈다. 원본 이미지 파일은 복원 대상에 포함되지 않음을 명시한다.
- [x] 복원 사본은 격리된 로컬 DB를 우선한다. 원격 격리 DB가 꼭 필요하면 비용·대상을 먼저 확정한다. 백업·export는 Git 밖의 제한된 위치에 저장하고 공개 CI artifact로 올리지 않는다.
- [x] 사본에는 공급자 비밀값·운영 도메인·Cron을 연결하지 않는다. 수집 플래그와 작업 시작을 비활성으로 둔 뒤 데이터를 읽는다. 사본의 과거 `starting` 상태가 유료 작업 재시작으로 이어지지 않게 한다.
- [x] 기준 시점과 복원본의 주요 테이블 행 수, 판정/revision, 감사 이벤트, 사진 순서, 스키마·마이그레이션 이력을 비교한다. 원본 서명 URL이나 개인정보를 비교 결과에 출력하지 않는다.
- [x] 실제 소요 시간과 복원 기준 시점 차이를 기록해 복구 시간·데이터 손실 범위를 제시한다. 운영 DB에는 덮어쓰기·복원·삭제를 실행하지 않는다.
- [x] 코드 롤백과 DB 복원을 구분해 문서화한다. 신규 컬럼/뷰가 적용된 뒤 이전 코드가 동작하는지 확인하고, 호환되지 않으면 대응 코드 또는 forward fix 절차를 적는다.

**완료:** 재현 가능한 복원 절차와 격리 사본의 비교 결과가 있다. 서비스 장애 시 누가 무엇을 확인하고 어떤 순서로 복구할지 문서만으로 알 수 있다. 실제 운영 DB 복원은 별도 사용자 요청 시 수행한다.

## 작업 5. 자동 복구·이미지 유지·비용의 장기 관찰

**신규:** `docs/OPERATIONS-OBSERVATION.md`. **수정 후보:** `src/operations-history.mjs`, `validation/operations.js`, 새 마이그레이션은 저장할 지표가 확정될 때만 추가한다.

**인터페이스:** 작업 1의 `instagramRefresh`와 기존 X/YouTube 운영 상태, 기존 알림·일별 기록을 사용한다. 기존 `query_version='x-review-v1'`에 피드 측정값을 섞지 않는다.

- [x] 관찰 시작 시각·배포 SHA와 종료 예정일을 기록한다. 최소 7일과 Instagram의 서로 다른 정상 3일 갱신 주기 2회를 모두 충족할 때까지 관찰한다.
- [ ] X는 오류 종류·마지막 성공 이후 경과·재시도→복구·수동 개입 횟수를 기록한다. 반복 404가 자연 발생하지 않으면 해당 운영 분기를 미관찰로 남기고 운영 장애를 인위적으로 만들지 않는다.
- [ ] YouTube는 예산 초기화 후 검색 성공, cursor/pages 전진 또는 정상 완료, 예약 영상의 재조회와 공개 가능 전환을 확인한다. 후보 저장과 사용자 공개 판정을 분리한다.
- [ ] Instagram은 새 게시물 동기화와 이미지 갱신을 별도로 기록한다. 갱신 대상·성공·부분 실패·차단·다음 예정·시작 횟수와 제한된 공개 이미지 표본의 응답 상태를 확인한다. 파일 다운로드 없이 상태만 확인하고 원문 삭제/만료/일시 실패를 구분한다.
- [ ] 비용은 Worker/D1 사용량, Apify 기존 수집과 주소 갱신, YouTube 검색/상세 호출을 나눠 기록한다. 설정된 상한과 실제 청구·사용량을 구분한다. 주소 갱신의 하루 2회×실행당 0.05 USD는 해당 작업의 설정 상한이며 프로젝트 총비용이 아니다.
- [ ] 알림이 실제 조치를 요구하는지, 예산 대기를 장애로 오인하지 않는지 확인한다. 반복 실패가 예산을 소모하면 신규 호출 증가보다 원인·대상별 재시도 간격을 먼저 검토한다.
- [ ] 기존 기록으로 계산할 수 없는 지표만 추가 저장한다. 개인정보·서명 URL 없이 집계하고, 측정 실패는 null/실패로 보존한다.

**완료:** 관찰 기간·성공/실패·예산·수동 개입·미관찰 분기가 보고돼 있다. 관찰 시작만으로 안정화 완료를 표시하지 않는다. 이번 계획 작성으로 반복 자동화나 알림 전송을 생성하지 않는다.

## 작업 6. 실기기·접근성의 남은 확인

**수정 후보:** `validation/review-gallery.js`, `validation/feed.css`, `validation/theme.js`, 관련 화면 HTML. **기존 검사:** `scripts/check-photo-viewer.mjs`, `scripts/check-photo-touch-scroll.mjs`, `scripts/check-photo-loading.mjs`, `scripts/check-feed-filters.mjs`, `scripts/check-theme.mjs`.

| 환경 | 확인할 흐름 | 통과 조건 |
|---|---|---|
| 실제 iPhone Safari 세로/가로 | 피드→확대→이전/다음→닫기 | 하단 모서리 잘림·불필요한 내부 스크롤 없음, 마지막 사진·목록 위치 유지 |
| 실제 Samsung Internet | 기기/사이트 테마와 강제 다크 설정별 표시 | 선택 저장·도움말 정확성 확인. 브라우저 설정 강제를 앱이 해제한다고 안내하지 않음 |
| VoiceOver 및 데스크톱 키보드 | 탭·필터·확대·실패 재시도 | 이름/선택 상태 전달, 초점 접근·복귀, 키보드로 닫기 가능 |
| 200% 글자 확대·좁은 화면 | 필터·판정·운영 상태 | 주요 동작 잘림·겹침 없음 |
| 느린/실패 이미지 | 15초 대기·재시도·다음 사진 | 오류 안내, 원문 이동, 늦은 응답이 현재 사진을 덮어쓰지 않음 |

- [ ] 기기·OS·브라우저 버전과 배포 SHA를 기록한다. 실제 기기 접근이 없으면 사용자 확인 항목으로 남기고 Chrome UA 에뮬레이션을 대체 증거로 쓰지 않는다.
- [ ] 위 핵심 흐름을 한 차례 확인하고 재현된 결함만 묶어 수정한다. 사진 중심 배치·날짜별 여백·색상 방향을 유지한다.
- [x] 재현 결함은 가능한 범위에서 기존 브라우저 회귀에 추가한다. 수정 후 해당 흐름과 영향받는 화면만 확인한다.
- [x] 네이티브 확대를 불필요하게 차단하지 않는지 확인한다. 사용자 정의 핀치·두 번 탭 확대 기능의 신규 구현은 이번 범위에 포함하지 않는다.

**완료:** 각 환경은 통과/실패/미확인으로 표시된다. 기기 접근이 없는 항목을 완료로 체크하지 않는다. 접근성 인증을 받았다고 표현하지 않는다.

## 작업 7. 현재 상태 문서와 유지보수 기준 정리

**신규:** `docs/STATUS.md`. **수정:** `README.md`, `docs/PLAN.md`, `docs/SPEC.md`, `DESIGN.md`, `docs/CHECKS.md`, `docs/VALIDATION.md`의 안내·연결 부분.

- [x] STATUS에 현재 구조, 공개/관리자 경계, 플랫폼별 수집 방식, 코드의 예산 상한, 최신 배포 SHA, 남은 검증을 짧게 정리한다. 초기 React/비공개/무료 운영 제안과 현재 실제 상태를 구분한다.
- [x] PLAN 상단에서 현재 진행 중인 계획을 찾을 수 있게 하고 완료 이력은 보존한다. SPEC/DESIGN의 과거 결정에는 최신 결정으로 이동하는 안내를 둔다.
- [x] VALIDATION에 실행한 검사의 커밋·환경·명령·결과·운영 확인·미확인을 같은 형식으로 남긴다. 전체 테스트 수를 최신 커밋의 통과 수로 추정하지 않는다.
- [x] 작업 1~6에서 변경한 복잡한 함수에 한해 상태 판정·조회·렌더링 책임을 분리한다. SQL 동등성·트랜잭션·오류 매핑을 먼저 보호하고, 재작성 자체를 목표로 하지 않는다.
- [x] README에 현재 필터·YouTube·운영 문서 경로를 맞춘다. 오래된 화면 캡처는 촬영일을 유지하고 실제 화면을 확보하기 전 최신 캡처로 표시하지 않는다.

**완료:** 다음 작업자가 STATUS→PLAN→개별 계획→검증 기록 순서로 현재 상태를 파악할 수 있다. 복구 절차·검사 명령·남은 관찰 항목이 연결된다.

## 4. 작업별 배포와 중단 기준

각 구현 작업은 다음 순서로 완료한다.

1. 재현/필요 회귀 → 최소 변경 → 관련 테스트·브라우저 확인.
2. 개인정보·비밀값·변경 diff 검토 → 해당 작업 파일만 커밋.
3. 기존 GitHub 보호·PR 절차에 따라 push → 동일 SHA의 Workers Builds 결과 확인.
4. DB 변경이 있으면 적용 전 호환성·복원 근거를 확인하고 필요한 마이그레이션을 먼저 적용. 운영 이력을 함께 확인.
5. 배포 후 공개 피드·관리자 차단·변경 기능을 확인하고 VALIDATION/PLAN을 갱신.

다음이면 해당 작업의 배포를 멈추고 원인을 해결한다: 판정/순서/총건수의 의도하지 않은 변화, 인증 경계 변화, 실제 쓰기 발생한 읽기 검사, 예산 상한 초과, 필수 검사 실패. 장기 관찰 대기는 별도 미완료 항목으로 남긴다.

## 5. 최종 완료 체크리스트

- [x] 이미지 갱신 차단·부분 실패·복구가 관리자 운영 화면과 알림에 반영된다.
- [x] 피드 결과 동등성과 성능 전후 기록을 확인했다.
- [x] 필수 검사의 실패 차단과 성공 SHA의 배포를 확인했다.
- [x] 운영 DB를 변경하지 않은 격리 복원 훈련과 복구 문서를 확보했다.
- [ ] 최소 7일 및 이미지 갱신 두 주기의 관찰 결과를 기록했다.
- [ ] 실제 기기에서 확인한 결과와 미확인을 구분하고 재현 결함을 처리했다.
- [x] 현재 상태·설계·계획·검증·복구 문서가 연결돼 있다.

모든 항목을 계획에 넣었다는 사실은 구현 승인·실행 성공·장기 안정성 확인을 뜻하지 않는다. 각 작업의 실제 결과로 체크박스를 갱신한다.
