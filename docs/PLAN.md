# 단계 0 로컬 검증 계획

- [x] SPEC.md에 전체 응답 저장 후 cursor 전진, 직접 작성 글만 전용 계정 예외, 수집/역할 상태 분리를 반영한다.
- [x] 필요한 제작자 스킬과 Playwright/Wrangler 도구를 프로젝트 범위에 설치한다. Impeccable은 엔진이 없어 문서 직접 적용.
- [x] 공개 API에서 최소 메타데이터를 수집한다. 원본 미디어와 raw 응답은 저장하지 않는다.
- [x] 페이지 전체 정규화 이후 트랜잭션 저장. 중간 실패는 페이지와 cursor 모두 rollback한다.
- [x] 21개 응답, 중간 실패, 오래된 cursor, DB 재오픈 및 별도 프로세스 재시작 중복 제거를 검증한다.
- [x] 전용 계정 직접 글/재게시/인용의 이름 없는 미디어 규칙을 검증한다.
- [x] 최소 카드에서 실제 사진·영상 썸네일과 이미지 실패 시 원문 링크를 모바일/데스크톱에서 확인한다.
- [ ] 지정 계정과 소유자 이메일 확인 후 비공개 Cloudflare Worker/D1/Access 검증을 진행한다.

로컬 저장 검증은 node:sqlite를 사용한다. 이는 D1 원격 CPU/SQL/Access 통과의 대체가 아니다. 검증용 정적 카드는 완성 UI 또는 최종 디자인 시안이 아니다. GitHub 버전 관리는 사용자 승인 후 도입했다.

## 자동 수집 구현 계획 — 2026-09-09

실행 결과: 핵심 코드와 로컬 검증 완료(29 tests + workerd/D1), 원격 상태 마이그레이션 적용/기존 20개 보존/전역·소스 비활성. 분리한 원격 개발 Worker/D1에서 실제 32개 저장, SQL 실패 rollback, 재시도, 중지 후 저장 없음까지 확인했다. 원격 CPU·동시성 실측과 공급자 탐색 종료 계약이 남아 Cron 활성화는 보류했다. 아래 내용은 설계 당시 요약이며 상세 실행 상태는 연결 문서와 VALIDATION.md를 따른다.

Superpowers 실행용 상세 계획: [2026-09-09-automatic-collection.md](superpowers/plans/2026-09-09-automatic-collection.md). 아래는 요약 설계이며, DB 중지 revision과 단계별 인터페이스·테스트·활성화 절차는 상세 계획을 따른다.

목표: 기존 수동 수집의 판별·응답 문제를 수정하고, 예약 수집의 구현 계약을 확정한다. 이번 범위에서 Cron 활성화나 스키마 마이그레이션은 하지 않는다.
기술: 기존 JavaScript 모듈, Workers, D1, Node test runner. 요구사항: docs/SPEC.md §6–7. 디자인는 DESIGN.md 우선.

### 현재 수정 범위

- `src/sources.mjs`: 로컬/Worker 공통 소스와 전용 직접 작성 규칙. 전용 계정 판별 허용은 자동 실행 승인과 별개다.
- `src/worker.mjs`, `scripts/collect.mjs`: 공통 설정 사용. 페이지 커밋 이후 관측 로그 실패는 HTTP 200과 `warning:observation_log_failed`로 알린다. 실패한 로그 SQL의 비용은 확정할 수 없어 rowsRead/rowsWritten을 null로 반환한다. 기존 runs 기반 수집 시각은 이 경우 오래된 값일 수 있다.
- `tests/probe.test.mjs`: 이름 없는 직접 글 포함/재게시·인용 제외, 커밋 후 로그 실패, stale batch 409를 검증한다. DB 대역 테스트이므로 원격 D1 원자성 검증을 대체하지 않는다.

### 실행 모델과 운영 봉인

- Cron 제안: UTC 기준 `*/5 * * * *`. 한 실행은 due 소스 하나, 공급자 페이지 하나만 처리한다. 6개 정상 소스의 목표 조회 간격은 약 30분이나, 초기 수집·재시도 때문에 길어질 수 있다. 1일 기본 호출 슬롯은 288개다.
- UI 새로고침은 DB 조회만 한다. 수동 재시도는 next_due_at 조정만 하고, 자동 운영 시작 후 기존 `/api/probe`의 직접 저장 경로는 비활성화한다. 모든 writer는 동일 lease/커밋 함수로 통합한다.
- `COLLECTION_ENABLED`가 명시적으로 true이고 소스 enabled도 true일 때만 외부 호출한다. 기본값은 모두 false. HTTP Access 설정은 유지하지만 scheduled 실행에는 JWT가 없으므로 Access를 예약 실행의 차단 장치로 간주하지 않는다.
- 실행 중 전역/소스 중지 전환도 커밋 전에 확인한다. 중지와 함께 revision을 변경해 오래된 writer가 커밋할 수 없게 한다. 중지 시 이미 저장된 게시물은 보존한다.

### 상태와 최초 전환

- 새 `migrations/0002_collection_state.sql`: 기존 posts/media/discoveries는 유지. 운영 상태는 별도 테이블로 만들어 검증용 cursor를 완료 경계로 재사용하지 않는다.
- 상태 필드: source, enabled, revision, next_due_at, lease_token, lease_until, last_attempt_at, last_success_at, last_complete_sync_at, committed_boundary_at, cycle_started_at, cycle_boundary_at, next_cursor, pages_in_cycle, failures, last_error_code, catchup_status.
- 최초 활성화는 서버 시각 기준 최근 7일을 고정 하한으로 설정. 기존 게시물은 ID upsert로 중복 제거한다. 이미 누락된 이름 없는 직접 작성 글도 해당 범위 재탐색으로 복구하며 더 오래된 글의 복구는 보장하지 않는다.

### 새 글과 이어받기

1. cycle이 없으면 첫 페이지부터 시작한다. 완료된 경계에서 24시간 겹침을 뺀 값을 cycle_boundary_at으로 고정한다. cycle_started_at은 이번 사이클 시작 시각으로 고정한다.
2. 진행 중이면 저장된 next_cursor로 이어받는다. page 수/요청 count로 결과를 잘라내지 않는다. 받은 모든 글을 정규화·판별하고 해당 페이지 저장과 상태 전진을 하나의 batch에 넣는다.
3. 판별 탈락 글을 포함한 공급자 원래 목록을 보고 탐색 진행을 판단한다. 한 개의 고정 글/오래된 글, 대상 글 0개, 이미 저장된 ID 한 개만으로 종료하지 않는다.
4. 공급자의 재게시 시각·정렬·고정 글 특성은 아직 충분히 검증되지 않았다. 이 계약이 검증되기 전에는 작성 시각만으로 경계 도달을 판정하지 않는다. cursor 소진 또는 검증된 경계 도달 조건이 있어야 complete로 처리한다. 공급자가 범위를 주지 않으면 gap/needs_attention을 기록한다.
5. 완료할 때만 committed_boundary_at을 cycle_started_at으로 전진하고 cursor/cycle을 비운다. 다음 정상 due는 30분 후다. 각 페이지 저장 시각과 전체 탐색 완료 시각은 별도로 보여준다.
6. 20페이지 이후에도 경계 미도달이면 catchup을 표시하고 완료 경계는 유지한다. 다음 슬롯에 계속하되 다른 소스와 교대한다. 새 cycle을 무한히 덮어쓰지 않는다. 따라잡기 중 새 글 조회 지연을 상태로 드러낸다.
7. cursor 만료가 명시된 응답이면 동일 cycle 경계를 유지한 채 첫 페이지로 재시작하고 ID로 중복 제거한다. 반복 만료/동일 cursor 반복은 제한 횟수 후 needs_attention. 임의의 400을 만료로 추정하지 않는다.

### 동시성·실패 계약

- due 소스는 next_due_at, last_attempt_at, source 순으로 선택한다. 조건부 UPDATE … RETURNING으로 lease를 원자적으로 획득한다. 조회 후 무조건 UPDATE하는 방식은 금지한다.
- lease 제안값 120초, 외부 요청 타임아웃 15초. DB 시각을 사용한다. fetch를 DB 트랜잭션 안에서 대기하지 않는다.
- 페이지 batch 시작 guard는 source enabled, lease_token, 미만료 lease, expected revision을 모두 확인한다. posts/media/discoveries, 다음 상태와 lease 해제를 동일 batch에 넣는다. 실패/백오프 상태 갱신도 같은 소유권 조건이 필요하다. 늦게 끝난 이전 실행은 새 실행 상태를 변경하지 못한다.
- 프로세스 종료 시 lease 만료 후 같은 미완료 페이지를 재시도한다. telemetry 실패는 커밋을 되돌리거나 재시도를 예약하지 않는다. last_success_at은 운영 상태 batch에 저장해 runs 로그와 분리한다.
- 429는 Retry-After(초/HTTP 날짜)를 파싱해 우선 적용. 없거나 잘못되면 30분→1시간→2시간→최대 6시간 백오프. 타임아웃/5xx도 동일. 성공 시 failures 초기화.
- 401/403, 스키마 변경은 needs_attention으로 중단한다. 204는 공급자의 since 계약과 현재 cycle에 맞을 때만 변경 없음으로 처리하며 진행 중 cursor를 지우지 않는다. 2MiB 초과 등 안전 제한 실패는 checkpoint 유지 후 needs_attention으로 표시한다.

### 구현 순서와 검증 기준

1. 상태/lease (`migrations/0002_collection_state.sql`, `src/scheduler.mjs`, `tests/scheduler.test.mjs`): 동시 획득, 만료 후 새 소유자, 늦은 응답, 중지 중 커밋 거절 테스트를 먼저 만든 뒤 구현. 기존 검증 DB 마이그레이션과 재실행 안전성 확인.
2. cycle/저장 (`src/worker.mjs`, `src/collection.mjs`, `src/scheduler.mjs`, `tests/scheduler.test.mjs`): 21개 응답, 전부 판별 탈락한 페이지, 페이지 중간 실패, 재시작, 오래된 고정 글, cursor 반복/만료, 20페이지 catchup, 로그 실패를 검증. 실제 D1 batch rollback도 비공개 환경에서 확인.
3. 오류 상태/예약 진입점 (`src/worker.mjs`, `src/collection.mjs`, `tests/scheduler.test.mjs`): 구조화된 provider 오류와 Retry-After를 반환하도록 확장. scheduled는 `runDueSource(env)`를 기다리고, 기본 비활성/6소스 공정성/한 페이지 상한 테스트. public 수집 우회 URL을 추가하지 않는다.
4. 로컬 테스트 `npm test`, `npx wrangler deploy --dry-run` 후 비공개 수동 운영 검증. 정상·미디어 다수·중복·재시도 CPU/SQL을 실측하고 한도 적합성을 판단한다. 무료 한도 미충족 시 자동 활성화를 보류하며 유료 전환하지 않는다.
5. 6소스의 역할 검증 상태를 각각 기록한다. 목록 성공과 COSMO 역할 성공을 분리한다. 검증을 통과한 소스만 enabled로 변경하고 마지막으로 `wrangler.jsonc` Cron을 추가한다. GitHub push가 배포를 유발하므로 구현 커밋과 활성화 변경을 분리한다.

공식 근거: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/). 위 주기·lease·백오프는 프로젝트 설계값이며 플랫폼 보장값이 아니다.
