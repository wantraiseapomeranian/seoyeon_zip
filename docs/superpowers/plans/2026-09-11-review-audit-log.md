# 검토 결정 감사 로그 및 검토 내역 구현 계획

> **For agentic workers:** 구현 승인 이후 `executing-plans` 스킬로 아래 작업을 순서대로 실행한다. 사용자가 계획서 커밋과 구현 착수를 승인했다 (2026-09-11).

**Goal:** 모든 수동 콘텐츠 검토 결정의 변경 전후와 근거를 덮어쓰지 않고 기록하고, 관리자 검토함에서 조회한다.

**Architecture:** 현재 상태 테이블은 유지한다. 상태 변경·버전 검사·감사 이벤트 INSERT를 하나의 D1 batch로 처리한다. 조회 API와 공통 검토 내역 화면을 추가한다.

**Tech Stack:** 기존 Cloudflare Workers/D1/Access, HTML/CSS/JavaScript, Node Test Runner/Playwright. 새 외부 서비스·런타임 의존성 없음.

**Spec:** 이 문서의 ‘요구사항과 저장 계약’이 이번 기능의 설계 기준이다. 사용자와 합의한 현재 상태/append-only 로그 분리, 인증된 검토자, 선택식 이유, 임의 과거 복원 금지를 구체화한다.

**상태:** 구현·마이그레이션·자동 배포 및 운영 읽기 검증 완료. 실제 운영 판정 쓰기는 첫 자연스러운 관리자 결정 전까지 미확인.

## 1. 현재 확인한 구조

- `src/x-review.mjs`: X 결정은 `x_quality.decision`과 revision을 갱신한다. 사진 묶기는 `confirmed_hash`, 다른 사진 판정은 `x_photo_differences`를 변경한다. 그룹 작업에는 전역 groupRevision 검사가 있다.
- `src/instagram-review.mjs`: 현재 status/revision/마지막 reviewed_at을 저장한다. 변경 이력은 없다.
- `src/access.mjs`: Access JWT를 검증하고 소유자 이메일과 일치하는지 확인하지만 현재 반환값은 HTTP 상태 코드다.
- `src/x-maintenance.mjs`: 파일 SHA-256 및 X 사진 dHash를 계산한다. 유사 후보 기준은 64비트 거리 ≤4, 종횡비 차이 <0.02다. near_url만 저장하며 당시 기준·버전 전체를 저장하지 않는다.
- X `pending`은 현재 decision='auto'인 게시물의 문구/원문 상태/유사 후보를 바탕으로 계산된다. DB decision 자체가 아니다.
- 사진 묶기는 선택한 두 사진뿐 아니라 기존 그룹 전체에 영향을 줄 수 있다. 파일 해시가 같은 사진은 묶음 해제 이후에도 자동 중복 판정이 유지될 수 있다.
- 실제 배포에서 D1 CLI 권한 오류와 이전 마이그레이션 이력 미등재를 관찰했다. 전체 미적용 파일 일괄 실행은 안전하지 않다.

## 2. 요구사항과 저장 계약

### 포함 범위

| 대상 | 기록할 동작 |
|---|---|
| X 게시물 | 표시 허용, 숨김, 자동 기준으로 복귀 |
| Instagram 게시물 | 승인, 제외, 보류, 검토 대기로 복귀 |
| X 사진 비교 | 같은 사진으로 묶기, 다른 사진 판정, 묶음 해제 |
| 비교 후보의 숨김 | 실제 숨기는 후보 게시물의 이벤트로 기록 |

수집 켜기/끄기, 자동 수집, 자동 원문 확인, 자동 중복 생략은 이번 수동 검토 로그의 대상이 아니다. ‘모든 관리자 판정’은 위 콘텐츠 판정 범위를 뜻한다.

### 이번에 만들지 않는 것

- 결정 되돌리기 버튼, 통계 대시보드, 자동 임계값 조정, AI 판정.
- 과거 이벤트 복원, 이미지 원본 보관, 외부 감사 서비스, DB 관리자까지 막는 법적 수준의 불변 저장소.
- 과거 사진이 삭제돼도 영원히 미리보기를 보장하는 기능.

### 이벤트의 의미

- 이벤트는 성공한 상태 변경을 뜻한다. 실패/충돌/단순 조회는 성공 이벤트로 남기지 않는다.
- 같은 상태를 다시 선택하는 요청은 `changed:false`로 반환하며 감사 행을 추가하지 않는다. 사진 묶음/비중복도 실제 변경 여부를 검사한다.
- `previous_state`와 `new_state`에는 실제 DB 상태를 저장한다. 화면의 ‘검토 필요’는 별도 `displayState`/`reviewReasons` 스냅샷으로 기록한다.
- 검토 시각은 서버 UTC로 기록하고 화면은 한국시간으로 표시한다.
- 검토자 identity는 서버의 검증된 인증 컨텍스트에서만 받는다. 클라이언트의 reviewedBy/email/time/hash/distance 값은 신뢰하지 않는다.
- 도입 이후의 수동 결정만 기록한다. 시작 시각을 DB에 한 번 기록해 화면에 표시한다.

## 3. DB 설계

실행 시 다음 미사용 번호를 확인한다. 현재 기준 신규 파일은 `migrations/0019_review_audit.sql`이다.

```sql
CREATE TABLE review_audit_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO review_audit_control(id) VALUES(1);

CREATE TABLE review_audit_log (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('X','INSTAGRAM')),
  target_type TEXT NOT NULL CHECK(target_type IN ('POST','IMAGE_PAIR','IMAGE_GROUP')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'SHOW','HIDE','RESET_AUTO','KEEP','EXCLUDE','HOLD','RESET_PENDING',
    'MARK_SAME_IMAGE','MARK_DIFFERENT_IMAGE','UNMERGE')),
  previous_state TEXT NOT NULL CHECK(json_valid(previous_state)),
  new_state TEXT NOT NULL CHECK(json_valid(new_state)),
  reason_code TEXT NOT NULL,
  note TEXT CHECK(note IS NULL OR length(note)<=1000),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json))
);
CREATE INDEX review_audit_time ON review_audit_log(reviewed_at DESC,id DESC);
CREATE INDEX review_audit_target ON review_audit_log(target_type,target_id,reviewed_at DESC,id DESC);
CREATE INDEX review_audit_platform_action ON review_audit_log(platform,action,reviewed_at DESC,id DESC);
CREATE TRIGGER review_audit_no_update BEFORE UPDATE ON review_audit_log
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER review_audit_no_delete BEFORE DELETE ON review_audit_log
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;

ALTER TABLE x_fingerprints ADD COLUMN candidate_metadata_json TEXT;
```

게시물 삭제와 연동해 감사 기록이 사라지지 않도록 cascade FK를 만들지 않는다. 이벤트에는 당시 원문 주소와 작성자, 사진 위치를 함께 보관한다. 사진 바이너리는 보관하지 않는다.

`reason_code`는 서버의 허용 목록과 동작별 조합으로 검증한다. 허용값:

```text
NOT_SEOYEON, PRODUCT_IMAGE, EVENT_NOTICE, ADVERTISEMENT,
DUPLICATE_IMAGE, DISTINCT_IMAGE, FALSE_POSITIVE, SEOYEON_CONFIRMED,
SOURCE_DELETED, RETURN_TO_AUTO, NEEDS_REVIEW, GROUP_CORRECTION, OTHER
```

`DISTINCT_IMAGE`를 추가해 ‘다른 사진’이 반드시 시스템 오류라는 의미가 되지 않게 한다. `OTHER`에도 메모를 강제하지 않는다. 비교 동작은 같은 사진/다른 사진에 맞는 기본 이유를 미리 선택한다. 표시·숨김 등은 이유 선택창을 사용한다.

### ID와 재전송

- POST target_id: 기존 `x:<postId>` 또는 `ig:<code>`.
- IMAGE_PAIR target_id: 정렬한 두 사진 URL의 JSON 배열에 대한 SHA-256. URL 자체와 게시물/사진 위치는 metadata에 보존한다.
- IMAGE_GROUP target_id: 해제 대상 사진 URL의 SHA-256. 변경 전후 그룹 구성원은 상태 스냅샷에 저장한다.
- request_id는 UI가 한 제출에 한 번 UUID로 만들고 네트워크 재시도 때 유지한다.
- 서버 request_fingerprint는 검증한 대상·동작·이유·메모·예상 revision을 정규화한 JSON의 SHA-256이다.
- 같은 request_id/내용/검토자는 기존 성공 이벤트를 반환한다. 같은 ID의 다른 내용 또는 다른 검토자는 409다.
- 동시 재전송의 UNIQUE 충돌은 트랜잭션 롤백 후 기존 이벤트를 확인해 동일 요청일 때만 성공 재응답한다.
- 실제 변경 없는 요청은 로그를 남기지 않는다. 이벤트가 없는 재전송도 revision/상태 검사로 재변경하지 않는다.

## 4. 인증과 원자성

현재 단일 운영자 체계를 유지한다. `authorizeOwnerContext(request,env)`를 추가해 `{status:200,actor:{id}}` 또는 `{status}`를 반환한다. 기존 JWT 검증·이메일 일치 검사 이후에만 canonical owner identity를 생성한다. 호환용 authorize는 status만 반환하도록 유지해 기존 경계 테스트를 보존한다.

Worker → `handleApi(request,env,context)` → 검토 핸들러로 actor를 명시적으로 전달한다. 검토 쓰기는 actor가 없으면 거부한다. 일반 API나 공개 세션 응답에 이메일을 추가하지 않는다. 테스트에서 직접 핸들러를 호출하는 경로도 명시적 인증 컨텍스트를 주도록 수정한다.

```text
인증 및 Origin/헤더 검사
 → 입력 검증
 → 동일 request_id 성공 기록 확인
 → 현재 상태 및 스냅샷 준비
 → D1.batch([
     revision/스냅샷 일치 guard,
     상태 변경,
     audit INSERT,
     guard 정리
   ])
 → 성공 결과 {saved:true,changed:true,auditId}
```

D1에서 별도 BEGIN 호출로 요청 간 트랜잭션을 유지하지 않는다. 현재 상태를 batch 밖에서 읽었으면 batch 안에서 일치를 다시 검증한다.

- 게시물: 대상 존재와 revision 확인. 최초 x_quality 생성도 같은 batch에 넣어 실패 시 부분 변경을 남기지 않는다.
- 사진: 기존 groupRevision guard 유지. 영향을 받는 그룹 구성원과 hash/confirmed_hash 및 판정 근거가 준비 시점과 같은지도 검사한다. 유지보수의 동시 hash 갱신을 groupRevision만으로 보호한다고 가정하지 않는다.
- group 변경 전후 상태는 전체 영향 집합을 기준으로 작성한다. 대상 게시물과 사진 위치의 다대다 연결도 기록한다.
- snapshot 관련 쿼리는 바인딩하고, JSON 배열은 정렬해 비교·서명을 안정적으로 만든다.
- 로그 저장 실패는 상태도 롤백한다. 상태/로그 검증 실패는 409, 잘못된 입력은 400, 대상 없음은 404, DB 장애는 503으로 매핑한다. 내부 SQL과 인증 값은 응답에 넣지 않는다.
- 이미지 그룹이 너무 커서 이벤트 JSON이 256KiB를 초과하면 작업 전에 413으로 거부한다. 잘린 감사 기록으로 성공시키지 않는다.

## 5. 사진 후보 근거

`src/x-maintenance.mjs`에서 새 near_url을 계산할 때 candidate_metadata_json에 함께 기록한다.

```json
{
  "schemaVersion": 1,
  "origin": "candidate_generation",
  "generatedAt": "서버 UTC ISO 시각",
  "leftImageUrl": "후보 비교 시 사진 URL",
  "rightImageUrl": "후보 비교 시 사진 URL",
  "algorithm": "dhash",
  "algorithmVersion": "dhash-luma-9x8-v1",
  "hashBits": 64,
  "sampleWidth": 9,
  "sampleHeight": 8,
  "distance": 3,
  "threshold": 4,
  "aspectRatioTolerance": 0.02,
  "leftAspectRatio": 0.75,
  "rightAspectRatio": 0.752,
  "leftDhash": "0000000000000000",
  "rightDhash": "0000000000000007"
}
```

위 JSON은 형식 설명용 예시다. 실제 저장에는 서버에서 구한 시각·URL·측정값만 사용한다.

- 비교 당시 두 파일의 SHA-256도 함께 저장한다. 유지보수로 near_url을 갱신하면 대응하는 근거도 함께 갱신한다.
- 감사 이벤트는 해당 스냅샷을 복사하고 humanDecision을 덧붙인다. 클라이언트가 제출한 수치를 사용하지 않는다.
- 기존 후보에는 생성 당시 스냅샷이 없다. candidateEvidence=null, evidenceStatus='legacy_unavailable'로 표시한다. 현재 hash로 계산한 거리 정보를 별도로 보여주더라도 origin='review_time'으로 구분하고 과거 threshold를 추측하지 않는다.
- 파일 완전 일치/기존 수동 묶음/유사도 후보를 evidenceKind로 구분한다. dHash 통계에 전부 섞지 않는다.
- 검토자가 순차적으로 같은 쌍을 재판정한 이력은 모두 보존한다. 향후 통계는 이벤트 수와 고유 사진 쌍 수를 구분해야 한다.
- 최초 단계에는 통계 UI를 만들지 않는다. 후보로 선택돼 검토된 표본만으로 recall을 주장하지 않는다.

## 6. 조회 API와 화면

새 관리자 경로:

```text
GET /api/admin/review-audit?platform=X&action=HIDE&from=2026-09-01&to=2026-09-30&cursor=...
GET /api/admin/review-audit/:id
GET /admin/review-history
```

- 기존 비공개 경로 처리와 Access를 그대로 적용한다. 정적 review-history.html/js/css 직접 경로도 공개 허용 목록에 넣지 않는다.
- 목록은 최신순 25건, `(reviewed_at,id)` 기반 keyset cursor, limit 고정. 날짜는 한국시간 날짜 범위이며 서버에서 UTC 경계로 변환한다. 기본 필터는 전체 기간.
- 플랫폼 X/INSTAGRAM 및 action 허용 목록 검사, 존재하지 않는 날짜/잘못된 cursor는 DB 조회 전 400. cursor는 활성 필터와 결합한다.
- 응답: `{items,nextCursor,startedAt}`. 총건수 COUNT는 기본 실행하지 않는다.
- 상세: 실제 변경 전후, 이유·메모·검토 시각·검토자, 대상 원문, 비교한 사진, 판정 근거, 영향받은 그룹 구성원.
- 이미지 주소가 만료되면 ‘현재 이미지를 불러올 수 없어요’와 원문 링크를 보여준다. 과거 원본 보존을 암시하지 않는다.
- 메모/계정/외부 콘텐츠는 textContent로 렌더링한다. 링크는 허용된 X/Instagram HTTPS 원문 URL만 사용한다.
- X/Instagram 검토함에 동일한 ‘검토 내역’ 진입 링크를 둔다. 기존 목록 필터 버튼인 척하지 않고 별도 관리자 페이지로 연결한다. 모바일은 카드 목록, 넓은 화면은 읽기 쉬운 행 목록으로 구성한다.
- 상단: 플랫폼/결정/기간 필터. 안내: ‘검토 내역은 {startedAt의 한국 날짜·시각} 이후 이력 기록 기능을 통해 저장된 변경부터 표시됩니다.’
- 이유 선택창은 모든 수동 판정이 같은 컴포넌트를 사용한다. 취소하면 요청하지 않는다. 제출 중 중복 클릭 차단, 실패 시 입력 유지, 409는 새로고침 안내.
- 되돌리기 버튼은 이번 버전에 없다. 수정할 때는 원래 검토 화면에서 새 결정을 내려 새 이벤트를 남긴다.

## 7. 작업 순서 및 파일별 검증

### 작업 1 — 인증 컨텍스트와 감사 저장 기반

Files: `src/access.mjs`, `src/worker.mjs`, 신규 `src/review-audit.mjs`, `migrations/0019_review_audit.sql`, `tests/helpers/d1.mjs`, `tests/access.test.mjs`, 신규 `tests/review-audit.test.mjs`.

Interfaces: `authorizeOwnerContext(request,env)`, `auditRequest(input,actor)` → 정규화 요청/서명, `findAuditReplay(DB,request)` → 기존 이벤트 또는 null, `auditInsert(DB,event)` → batch에 넣을 prepared statement.

- [x] 인증된 actor 전달, 클라이언트 사칭 거부, 감사 테이블 UPDATE/DELETE 차단 테스트를 먼저 작성한다.
- [x] `node --test tests/access.test.mjs tests/review-audit.test.mjs`로 새 기능 부재에 따른 실패를 확인한다.
- [x] 스키마 및 위 인터페이스 구현. 요청 이유·메모·UUID 및 JSON 크기 제한을 검증한다.
- [x] 동일 ID 동일 요청은 동일 이벤트, 다른 요청은409인 사례를 통과시킨다.
- [x] 비공개 API 기존 인증 테스트를 유지하고 파일 단위 diff 검토 후 커밋한다. 배포는 마지막 단계까지 하지 않는다.

### 작업 2 — X/Instagram 게시물 결정의 원자적 기록

Files: `src/x-review.mjs`, `src/instagram-review.mjs`, `src/worker.mjs`, `tests/x-quality.test.mjs`, `tests/instagram-review.test.mjs`, `tests/review-audit.test.mjs`.

Interfaces: 기존 요청 필드에 `{requestId,reasonCode,note?}` 추가, 서버 인자로 actor context 전달. 반환 `{saved:true,changed:boolean,auditId?:string}`.

- [x] X 최초 결정/숨김→표시→숨김3건, Instagram4상태 전환, 비교 후보 숨김의 실제 target_id를 검사한다.
- [x] 감사 INSERT 실패를 유발했을 때 상태와 revision이 그대로인 테스트를 작성한다.
- [x] 경쟁 요청은 한 개만 성공하며 실패한 요청은 로그0건인지 검증한다.
- [x] 변경 없는 결정은 로그0건, 인증 시각/사용자는 서버 값인지 확인한다.
- [x] 상태 변경과 감사 저장을 동일 guarded batch에 넣고 관련 테스트를 통과시킨다.

테스트의 핵심 assertion 형태:

```js
const before = snapshotState(sqlite, target);
// 테스트 DB에서 감사 INSERT를 ABORT하는 트리거를 설치한 뒤 정상 요청을 전송한다.
assert.equal(response.status, 503);
assert.deepEqual(snapshotState(sqlite, target), before);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM review_audit_log').get().n, 0);
```

`snapshotState`는 테스트 헬퍼로 대상의 전체 state/revision을 읽도록 해당 테스트 파일 안에서 정의한다.

### 작업 3 — 사진 판정과 후보 근거 기록

Files: `src/x-maintenance.mjs`, `src/x-review.mjs`, `tests/x-quality.test.mjs`, `tests/review-audit.test.mjs`.

- [x] 두 기존 그룹을 합치는 사례에서 전체 구성원의 전후 상태가 로그에 있는지 검증한다.
- [x] ‘다른 사진’ 중복 클릭, 묶음 해제, hash와 groupRevision 동시 변경 충돌을 검사한다.
- [x] 신규 후보 생성 근거와 legacy 후보의 unknown 처리가 서로 구분되는지 검증한다.
- [x] 기존 파일 동일성 비교와 dHash ≤4/종횡비 <0.02 판정은 바꾸지 않고 근거 저장만 추가한다.
- [x] 로그 실패 시 confirmed_hash·differences·groupRevision까지 모두 롤백되는지 확인한다.

### 작업 4 — 관리자 기록 조회 API

Files: 신규 `src/review-audit-api.mjs`, `src/worker.mjs`, `tests/access.test.mjs`, 신규 `tests/review-audit-api.test.mjs`.

Interface: `handleReviewAudit(request,env,context)` → 목록/상세 Response. 쓰기 route는 만들지 않는다.

- [x] 익명401/위조403/소유자200, 다른 정적 alias 접근 차단을 검사한다.
- [x] 같은 시각의 여러 이벤트도 페이지 이동 시 중복/누락이 없는지 검사한다.
- [x] 한국시간 날짜 경계, 플랫폼·결정 조합, 잘못된 cursor400, 없는 ID404를 검사한다.
- [x] 목록 응답은 요약만, 상세만 metadata 전체를 반환하도록 구현한다.

### 작업 5 — 이유 입력과 검토 내역 화면

Files: `validation/x-review.html`, `validation/x-review.js`, `validation/instagram.html`, `validation/instagram.js`, 신규 `validation/review-decision.js`, `validation/review-history.html`, `validation/review-history.js`, `validation/review-history.css`, 신규 `scripts/check-review-audit.mjs`.

- [x] 기존 HTML/CSS 패턴을 확인하고 공통 이유 선택창·각 검토함의 기록 링크를 추가한다.
- [x] 비교 동작은 기본 이유 선택, 다른 결정은 적절한 선택 목록과 optional note를 제공한다.
- [x] 브라우저 모의 API로 성공/취소/중복클릭/네트워크 재시도/409/503 흐름을 확인한다.
- [x] 목록 필터·더 보기·상세·Esc/포커스 복귀·이미지 실패 대체·긴 메모/XSS 문자열을 검사한다.
- [x] 390px/1280px에서 읽기 쉬움과 가로 넘침을 확인한다. 확인용 이벤트를 운영 DB에 임의 생성하지 않는다.

## 8. 배포 계약

- [x] 사용자 구현 승인 후 시작. 시작 시 git 상태·원격·다른 작업 수정 확인.
- [x] 전체 `npm test`, `node scripts/check-review-audit.mjs`, 기존 관련 검토 UI 스모크, `npx wrangler deploy --dry-run`, diff/비밀값 점검.
- [x] 운영 스키마와 d1_migrations를 읽기 전용으로 비교. 기존0012~0017 미등재를 이번 기능과 섞어 일괄 재실행하지 않는다.
- [x] 실제 다음 번호의 신규 마이그레이션만 적용한다. 컬럼/테이블/트리거/인덱스를 확인한 후 완료 이력을 기록한다. D1 콘솔이 첫 SQL만 처리할 수 있으므로 문장별 성공 확인이 필요하다.
- [x] 스키마는 구버전 코드와 호환되게 먼저 배포한다. 그 후 서버와 UI를 함께 자동 배포하고 GitHub 커밋과 Workers Builds 결과를 확인한다.
- [x] 구 UI 요청이 reason/requestId 없이 들어오면400 `review_client_outdated`와 새로고침 안내를 반환한다. 로그 없는 상태 변경으로 우회하지 않는다.
- [x] 익명 감사 경로 차단, 관리자 빈 내역/기록 시작 안내, 최신 UI 조회를 운영 확인한다.
- [x] 실제 콘텐츠 판정을 테스트용으로 바꾸지 않는다. 첫 실제 관리자 결정으로 상태·로그·재조회 연결을 확인하고, 아직 없으면 해당 쓰기 검증은 미확인으로 기록한다.
- [x] 기능 장애 시 콘텐츠 검토 쓰기를 차단하고 수정 배포한다. 감사 기록을 삭제하거나 로그를 남기지 않는 구버전으로 검토 쓰기를 재개하지 않는다. 수집·공개 열람을 불필요하게 중지하지 않는다.
- [x] `docs/VALIDATION.md`에 실제 시작 시각·마이그레이션·배포 버전·통과/미확인을 기록한다.

## 9. 완료 판단 기준

1. 범위 내 모든 성공한 상태 변경에 인증된 actor의 전후 이벤트가 정확히 한 건 존재한다.
2. 판정 실패/로그 실패/경쟁 요청에서 부분 변경이 발생하지 않는다.
3. 기존 로그는 앱의 변경·삭제 API와 일반 SQL UPDATE/DELETE로 수정되지 않는다.
4. 관리자가 날짜·플랫폼·결정으로 기록을 찾고 비교한 사진과 근거를 확인할 수 있다.
5. 실제 DB 상태와 화면 계산 상태를 혼동하지 않는다.
6. 새 후보의 생성 당시 근거를 보존하고 과거 미확인 정보를 사실처럼 채우지 않는다.
7. 비로그인 사용자는 기록·메모·검토자 identity에 접근할 수 없다.

## 10. 사용자 검토 요약

이번 제안은 ‘현재 상태 유지 + 판정 이력 별도 축적 + 관리자 검토 내역’이다. 이유 선택 단계가 추가되지만 메모는 선택이다. 내역은 새 기능을 통한 결정부터 남으며 과거 결정·사진 원본은 복원하지 않는다. 통계와 되돌리기는 제외한다. 사용자 승인에 따라 구현한다.

## 실행 기록 — 2026-09-11

- 계획 커밋: `3c33250`. `codex/review-audit` 작업 공간에서 구현.
- 공통 원자적 변경 로직을 `src/review-mutations.mjs`에 분리했다. 기존 공개 API 허용 목록은 유지한다.
- 원래 계획의 작업별 커밋 대신, 서버와 UI의 요청 계약을 함께 배포할 수 있도록 구현을 하나의 기능 커밋으로 묶는다.
- 독립 코드 검토에서 지적한 동시 요청 replay 경로와 사진 최초 조회/저장 스냅샷 사이 경쟁을 수정하고 회귀 검사를 추가했다.
- 후보 근거 없는 기존 사진은 `legacy_unavailable`로 기록한다. 새 후보만 생성 당시 근거를 저장한다.
- 실제 콘텐츠를 검증 목적으로 변경하지 않는다. 운영 쓰기 연결은 첫 실제 관리자 판단까지 미확인으로 남긴다.

- 운영0019 적용 및 스키마 검증 완료. started_at=2026-09-11T07:25:10.277Z (한국시간16:25:10).
- 구현7835156의 Workers Builds completed/success 확인. 관리자 빈 내역/시작 안내와 X 이유 입력창/취소 확인. 익명 내역·HTML/JS401, 공개 피드200.
