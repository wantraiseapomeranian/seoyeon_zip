## 검토함 필터 너비 안정화 — 2026-09-10

- 수정 전 펼침으로 버튼50→170px 변화 재현. 원인: 보조 행 grid spanning 최소 너비가 auto 열을 확장.
- 두 행 flex 배치 분리 후 X/인스타320·390·1440px에서 펼침 전후 버튼 너비76px·x좌표 동일. 선택 개수 표시 후에도76px. 짧은 계정66px/긴 계정234px로 selected text에 맞춰 크기 변경. 가로 넘침 없음.
- 모바일 스크린샷, JS 구문, diff check, Wrangler dry-run 통과.

## 검토함 UI 감사 반영 — 2026-09-10

- X/인스타320·390·1440px Playwright: 기본 보조필터 접힘, month/select44px, 조합 필터·초기화·가로 넘침 없음 확인. 스크린샷 시각 확인.
- 실내용 카드: 일반 정상 문구 제거, 실제 검토 사유 유지, 보조 필터를 접어도 적용 수 표시, 가져오기 투명 배경 확인.
- 두 JS 구문 검사·diff check·Wrangler dry-run 통과. 데이터/API·기존 사진/영상 및 로딩 동작 변경 없음.

## 사진 넘기기 로딩 표시 — 2026-09-10

- Playwright 느린 이미지(700ms)로150ms 전 표시 없음/이후 표시, load·error 종료, 캐시·연속 뒤로 이동, reduced-motion 회전 없음, destroy 정리 검증 통과. 스크린샷으로 버튼 내부 표시 확인.
- node --check 및 git diff --check 통과, Wrangler dry-run 성공. 공유 review-gallery.js/feed.css 변경으로 피드·X·인스타 검토함 공통 적용.

## 인스타 영상 분류·검토함 필터 — 2026-09-10

- 배포 완료: 코드5cc7301, GitHub Workers Builds success, 활성버전 eac48764-4991-4986-b348-1692568c8c65 100%. 소유자 브라우저에서 인스타 영상 전체2(표시1/제외1), 2026-07+nagne_ss 조합1, 피드 Instagram+영상1개/영상5개·원문 재생 안내 확인.

- Node 65 tests 통과. 릴스/혼합 게시물 영상 피드 포함, 미승인 제외, summary 재수집 유형 보존, KST 월·계정 필터, 미확인 유형, 영상 썸네일 사진 중복 처리 방지 검증.
- Playwright: X·인스타 320/390/1440px에서 월+영상+계정 조합 요청, 초기화, 가로 넘침 없음, JS 오류 없음. 필터 결과 없음 문구 확인.
- 독립 리뷰에서 CDN URL 갱신·부분 유형 누락·동시 가져오기 보존 문제를 찾아 회귀 테스트 추가 및 수정. 유형 근거가 불완전한 재가져오기는 기존 미디어 구성을 유지하고, 동시 metadata 쓰기는 atomic guard로409 반환.
- Wrangler dry-run 성공(162.60 KiB, gzip39.63 KiB). 첫 sandbox 실행은 디렉터리 접근 제한으로 실패하여 권한 있는 실행으로 재확인.
- 기존 로컬 원본 60행/58개 고유 글에서 영상 포함 2개(영상9개). 운영 보완 전후 58개 code/status/revision 동일. 승인 Da8H0mEkeuV 영상5개, 제외 DLKH41Jy0jr 영상4개; 검토 판단 변경 없음. 원본·운영 데이터는 .local에만 보관.
- 0012·0013은 기존 DB에 적용됐지만 migration ledger 누락으로 일괄 migrations apply가 실패. 검증된 0014 파일만 d1 execute로 적용 성공. 이전 migration ledger 불일치는 남아 있으므로 다음 적용 시 주의.
- 공식 인스타 직접 수집이나 새 Apify 실행은 추가하지 않음. 게시물·릴스 유형 수용 범위만 확장. 영상 본문은 다운로드/호스팅하지 않으며 원문에서 재생.

# 서연모음.zip — 단계 0 실측 기록

## 종합 계정 3개 역할 확인 및 연결 — 2026-09-09 05:03 UTC

사용자 요청에 따라 보류된 계정만 읽기 전용으로 최대 10페이지씩 조사했다. 기존 normalizePage를 그대로 적용했으며 원본 미디어/raw 응답은 저장하지 않았다. 아래 역할 확인은 공급자 목록의 명시적 캡션·작성자·미디어 메타데이터 근거이며 사진 속 인물의 시각적 식별이나 COSMO 전체 커버리지 검증은 아니다.

| 계정 | 조사 페이지 / 응답 글 수 | 이름+미디어 일치 수 | COSMO 표본 |
|---|---|---|---|
| gapyeonghaus | 6 / 122 | 2 | [2095328792315060339](https://x.com/gapyeonghaus/status/2095328792315060339): Jiyeon COSMO Talk update w/ Seoyeon, 윤서연 명시, 미디어 2개 |
| tripleSnewsfeed | 8 / 149 | 8 | [2095157556041724097](https://x.com/tripleSnewsfeed/status/2095157556041724097): Seoyeon COSMO Talk Update, 미디어 2개 |
| TRIPLES_FAN_FR | 5 / 102 | 3 | [2096003636786549106](https://x.com/TRIPLES_FAN_FR/status/2096003636786549106): COSMO Talk / SEOYEON / 윤서연 명시, 미디어 4개 |

- 19페이지 모두 HTTP 200 및 전체 페이지 정규화 성공. TRIPLES_FAN_FR의 3페이지는 count=10 요청에 **22개**를 반환했다. 요청 count는 처리량 상한이 아니며 기존 전체 페이지 처리 규칙을 유지한다.
- 이전 지서연 부분 일치 오탐은 철회 상태를 유지한다. 새 gapyeonghaus 표본은 윤서연과 함께한 글이라는 명시적 근거가 별도로 있다. 공동 출연 글은 포함하며 윤서연 단독 사진이라고 주장하지 않는다.
- 05:03 UTC 기존 비공개 앱 DB에서 후보 3개의 enabled=1, revision 증가, next_due_at=현재 시각으로 변경하고 전체 6개 enabled=1을 다시 조회했다. 수집 코드·전용 직접 작성 예외·Access·Cron·CPU 제한은 변경하지 않았다. 재배포나 테스트 실행은 필요하지 않아 수행하지 않았다.
- 추가 3개 소스의 **실제 Cron 저장은 아직 미확인**이다. 읽기 전용 조사 cursor와 표본을 DB에 이관하지 않았다. 자동 수집은 각 첫 페이지부터 시작하므로 위 5~8페이지 COSMO가 바로 피드 DB에 들어온다는 뜻은 아니다.
- 기존 First0806_도 05:00:44 UTC 예약 저장 성공을 확인했다. Seowoo_0501은 04:55:42 UTC 성공 상태이며 확인 시점 Or1gin030806은 첫 예약 대기였다.
- 6개 소스로 확대하면서 최신 조회는 과거 보완 중 약 60분, 이후 약 30분 간격이다. 장기 안정성·공급자 누락 가능성은 여전히 미검증이다. 추가 사용자 로그인·API 키·결제는 필요하지 않았다.

## Paid 비공개 자동 수집 시범 전환 — 2026-09-09 04:51 UTC

- 사용자 직접 결제 후 인증된 대시보드에서 Workers Paid Active를 확인했다. 추가 결제는 수행하지 않았다.
- CPU 상한 100ms, 예약 `*/5 * * * *`, COLLECTION_ENABLED=true를 설정했다. DB 중지 상태에서 배포한 후 Access를 확인하고 마지막으로 DB 전역/검증된 전용 소스 3개만 켰다.
- 기존 앱 DB에 0003 적용 성공: 5명령 / SQL 2.54ms. 기존 게시물 20개 보존. 미검증 소스 3개는 enabled=0을 유지한다.
- 기본 dry-run은 샌드박스 상위 경로/로그 접근 제한으로 실패했다. 승인된 재실행은 54.24KiB / gzip 15.31KiB로 성공했다. 배포 버전 `cd9327bd-919c-4826-881e-4c072fa44139`, startup 5ms, 5분 예약 등록 확인.
- 비로그인 API는 302, 기존 소유자 브라우저의 /api/samples는 200 / 20개였다. 의도적인 missing-preview.jpg 404는 실패 대체 표본이며 인증 실패가 아니다.
- 04:55:41 UTC 실제 Cron 첫 수집 성공: Seowoo_0501 latest, HTTP/code 200, 72,600 bytes, 20개 수신/20개 upsert, DB 전체 20→21개. CPU 10ms / wall 2461ms / outcome ok / exceptions 없음. DB last_success_at=04:55:42, next_lane=history, pages_in_cycle=1, last_error_code=null 확인.
- 수집 후 소유자 브라우저 API도 200 / 21개 / collectedAt=04:55:42 UTC를 반환했다. 사진·영상 preview=loaded, 의도적 실패 표본 preview=failed를 확인했다. 최종 git diff --check 통과.
- 실시간 tail의 저장+관측 로그는 SQL 8 statements / rowsRead 204 / rowsWritten 115다. DB runs는 저장 batch만 7 statements / 204 / 113이며 lease/시간 조회는 양쪽 모두 제외한다. 일시 tail 관찰은 종료하고 5분 Cron 및 3개 소스 활성화는 유지한다. 다른 2개 소스의 첫 예약 성공과 장기 안정성은 아직 확인하지 않았다.
- 이전의 32 tests/workerd 및 13/7ms는 아래 절의 별도 검증 증거다. 이번 설정 변경에서 같은 기능 테스트를 반복 실행하지 않았다.
- 3개 소스의 최신 조회는 과거 교대 중 약 30분, 과거 중지 후 약 15분이다. 공급자 누락·첫 페이지 밖 급증분·장기 안정성은 보장하지 않는다. 100ms는 CPU 상한이며 월 요금 상한이 아니다.
- 변경은 로컬 브랜치에 미커밋 상태이며 GitHub push는 하지 않았다. 연결된 main을 재배포하면 최신 시범 코드와 달라질 수 있으므로 통합 전 확인이 필요하다.

## 최신/과거 분리 및 CPU 최적화 — 2026-09-09 04:40 UTC

- 단일 에이전트로 후속 계획을 실행했다. 0003은 next_lane/last_latest_success_at/history_paused를 추가한다. 운영 DB에는 적용하지 않았으며 검증 DB의 기존 게시물/cursor를 보존했다.
- 최신 첫 페이지와 저장된 과거 cursor를 교대한다. 과거는 20페이지에서 limited, 소진/반복이면 gap으로 중지하고 최신 조회는 유지한다. 최신 조회는 과거 cursor를 덮어쓰지 않는다. 6소스/5분 예약 시 최신 주기는 과거 보완 중 약 60분, 이후 약 30분이다. 첫 페이지 밖 급증분을 보장하지 않는 제한을 SPEC/README에 명시했다.
- 새 3개 회귀 테스트의 수정 전 실패 확인 후 구현했다. 최종 npm test **32/32 통과**. workerd 로컬 검증도 21개·재처리·batch rollback·진행 중 중지·429·401·HTTP 봉인 통과. 기본 샌드박스에서는 esbuild 부모 경로 접근이 실패해 승인된 로컬 실행으로 확인했다.
- Node 메모리 프로파일(실제 20개 응답, 2,000회)은 정규화/SQL 바인딩의 상대적 비용 확인용이다. Worker CPU 측정 대체가 아니다. SQL에서 ID만 필요한 삭제/발견 기록에 전체 JSON을 보내던 부분을 바꿨다. 바인딩 문자열은 45,781→20,107자, Node 반복 평균 0.589→0.328ms/page였다. 매회 API 표본을 새로 읽으므로 동일 payload의 정밀 벤치마크로 주장하지 않는다.
- runs에 저장된 비용은 이제 sqlScope=page_commit / 7 statements로 정확히 표시한다. console의 page_commit_and_observation_log는 로그 INSERT까지 합산한다. 둘 다 lease/시각 쿼리는 제외한다.
- 검증 D1 0003 적용 5명령/1.01ms SQL. 검증 패키징 54.30KiB / gzip 15.32KiB. 개선 버전 `1afeeb15-2652-45d5-b4c6-494154888d48`에서 실제 Cron을 두 번 측정했다.

| UTC 실행 | 수집 | 실제 CPU | 결과 |
|---|---|---|---|
| 04:34:19 | latest / 20개 upsert | 13ms | ok, wall 1765ms |
| 04:37:10 | latest / 20개 upsert | 7ms | ok |

첫 실행은 삭제 전파 중이던 이전 검증 Cron 표현으로 새 코드가 실행됐고, 두 번째는 새 검증 시간대로 실행됐다. 성공 후 DB 자동중지 트리거로 외부 수집은 각각 한 번씩만 허용했다. 이 트리거의 비용도 측정에 포함되므로 운영과 완전히 같은 환경은 아니다. 반복 측정이 13/7ms여서 무료 10ms 기준의 안정적 여유는 입증하지 못했다. 7ms 한 번을 무료 운영 통과로 승격하지 않는다.

측정 후 DB 전역/소스 enabled=0, 환경 COLLECTION_ENABLED=false, crons=[]로 정리하고 임시 trigger를 제거했다. 최종 비활성 버전 `262b8461-7e4e-4550-86fd-b9bb09288220`, No targets deployed 확인. Cron 삭제 전파 중에도 DB와 환경 봉인이 수집을 막는다.

### 월 USD 5 대안

사용자는 무료로 어렵다면 약 USD 5 지출 가능성을 밝혔다. 대시보드에서 현재 Workers Free와 Workers Paid 결제 검토 화면의 기본료 USD 5/month를 확인했다. 이는 고정 상한이 아니며 초과 사용량 자동 청구 동의를 포함한다. 아직 Activate/결제를 실행하지 않았다.

현재 5분 수집만 가정하면 30일 8,640회, 13ms/회 가정 CPU 112,320ms로 기본 포함량(월 요청 1천만/CPU 3천만ms)보다 작다. 다른 Worker·프런트 요청·다른 제품·세금은 이 계산에서 제외했다. 무료 한도에 맞추려고 영속 큐와 페이지 분할을 추가하기보다 Paid를 선택하는 편이 간단하다는 판단이다. 유료여도 공급자 누락/가용성 문제는 해결되지 않는다.

근거: [Workers 요금](https://developers.cloudflare.com/workers/platform/pricing/), [CPU 한도](https://developers.cloudflare.com/workers/platform/limits/#cpu-time). 코드 변경은 로컬 미커밋 상태이며 운영 배포/push는 하지 않았다.

## 실제 Cron CPU 검증 — 2026-09-09 04:19 UTC

사용자 로그인 후 기존 브라우저 세션에서 Cloudflare 대시보드에 접근했다. Wrangler 토큰의 Observability 조회 403은 대시보드 조회로 해결했으며 새 자격증명을 수집하지 않았다.

- 대상은 운영 앱과 분리한 `seoyeon-zip-scheduler-check` Worker/D1이다. 공개 URL과 preview는 false. 기존 코드의 scheduled handler를 실제 Cron으로 실행했다. 실행 버전 `d093aaeb-c5b8-4616-afdb-d1782869cb46`.
- 04:19:21 UTC 실행, outcome=ok, **cpuTimeMs=13 / wallTimeMs=2348**. 대시보드 invocation 이벤트에서 직접 확인했다. startup 5ms 및 공급자 wallMs와 구분한다.
- 실제 API HTTP/JSON 200, 응답 73,103 bytes, 20개 수신/20개 upsert. 검증 DB의 총 게시물 수는 32→33으로 증가했다. 첫 페이지를 재조회했으므로 기존 자료와 겹치며 완전히 동일한 응답 재생 검증은 아니다.
- runs 저장값은 SQL statements=8, rowsRead=204, rowsWritten=113. 이 저장값은 runs INSERT 자체의 비용을 합산하기 전 값이므로 전체 invocation SQL 비용으로 해석하지 않는다. lease/시각 조회도 포함하지 않는다.
- 무료 플랜 Cron CPU 한도는 공식 문서상 10ms. 13ms 요청이 성공한 것만으로 한도 적합성을 입증하지 못하며, 단일 표본이라 최악값/평균도 알 수 없다. **무료 운영 CPU 기준 미충족 표본 → 활성화 보류 유지**.
- 최초 날짜 지정 예약의 실행 확인이 늦어 제한된 추가 시간대를 잠시 배포했으나, 확인된 수집은 최초 예약이다. 이후 전역/모든 소스 enabled=0, COLLECTION_ENABLED=false, crons=[]로 봉인했다. 임시 자동중지 SQL trigger도 제거했다. 최종 비활성 버전 `a02d60d1-1bd5-4442-9f4e-cf1b0784c32c`, Wrangler 출력 No targets deployed 확인.
- 운영 Worker/DB는 이번 실측에서 변경하지 않았고 GitHub push·유료 전환은 하지 않았다. 다음 작업은 CPU 프로파일링과 비용 절감 후 재측정이다. 공급자 탐색 범위 설계 보완도 별도로 남아 있다.

근거: [Cloudflare CPU 한도 및 초과 허용 설명](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), [Cron 반영 지연 및 제거](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## 후속 검증 — 2026-09-09 04:12 UTC

판정: 자동 운영 보류 유지. 제작자 코드와 추가 실측으로 현재 cycle의 한계를 확인했다. 이번에는 운영 배포·Cron 등록·DB 변경을 하지 않았다.

- FxEmbed 제작자 커밋 `60a550c70e834f575792963130714cef73600856`의 `packages/atmosphere/src/providers/twitter/userStatuses.ts:187–209`: upstream Bottom cursor를 전달하며 게시물 변환 실패는 null로 바꿔 결과에서 제외하고도 code=200을 반환한다. 따라서 cursor 종료를 모든 게시물의 누락 없는 수집 증거로 취급할 수 없다. 이는 공개 코드의 동작이며 현재 서비스 배포 커밋과 일치함을 확인한 것은 아니다.
- 같은 커밋 `src/realms/api/routes/twitter.ts:239–260`: since의 204 판정은 cursor 없는 첫 응답의 작성 시각만 검사한다. 재게시 발견 시각이나 전체 목록의 변경 없음 계약이 아니다.
- Seowoo_0501 최대 6페이지 읽기 전용 재확인: 수신 20/19/18/20/20/19개, 최근 7일 20/13/0/0/0/0개. 6페이지 최저 작성 시각은 2026-06-05T23:11:56Z이며 모든 페이지에 서로 다른 다음 cursor가 있었다. raw 응답·미디어·DB 저장은 하지 않았다. 이전 관측과 페이지 수가 다르므로 고정 snapshot으로 간주하지 않는다.
- 이 증거로 작성 시각 기반 조기 종료를 검증 완료로 승격하지 않았다. 현재 구현은 완료 판정을 보수적으로 막지만, 장기 cycle 동안 최신 목록 재조회가 지연되는 한계가 있다.
- 다음 설계안: 최신 목록의 제한된 재탐색과 과거 cursor 이어받기를 분리하고, 수집 완료 대신 확인 범위를 기록한다. 반복 조회/겹침으로 누락 가능성을 줄이되 공급자의 변환 실패까지 복구한다고 보장하지 않는다. 페이지 예산·교대 주기·완료 상태 의미를 확정한 뒤 구현할 후속 변경이며 현재 코드에는 반영하지 않았다.
- CPU 조회: 기존 Wrangler 인증으로 Observability telemetry/query를 호출했으나 HTTP 403. 공식 API는 Workers Observability Write 권한을 요구한다. 원격 개발 세션의 이전 응답 시간은 CPU 증거가 아니다. 대시보드 경로로 검증을 이어갈 수 있도록 Cloudflare 로그인 화면을 열었다. 새 스케줄러의 CPU 측정은 아직 미완료다.
- 자동 승인 검토가 과거 리뷰 제한을 근거로 공개 소스 저장·실측을 거절했다. 공개 소스는 파일 저장 없는 읽기 방식으로 확인했고, 실측은 최신 사용자 승인과 현재 프로젝트 AGENTS.md를 근거로 재검토 후 허용됐다.

근거: [공급자 목록 처리 코드](https://github.com/FxEmbed/FxEmbed/blob/60a550c70e834f575792963130714cef73600856/packages/atmosphere/src/providers/twitter/userStatuses.ts#L187), [since 처리](https://github.com/FxEmbed/FxEmbed/blob/60a550c70e834f575792963130714cef73600856/src/realms/api/routes/twitter.ts#L239), [Cloudflare 로그 조회 권한](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/).

## 자동 수집 구현 실행 결과 — 2026-09-09 03:06 UTC

상태: **비활성 자동 수집 코드 구현 / 운영 활성화 보류**. 아래 과거 단계 0 결과와 구별한다.

- 단일 에이전트로 Superpowers executing-plans 지침을 읽고 실행했다. 기존 미커밋 수정은 보존하고 `feature/automatic-collection` 브랜치에서 작업했다. 별도 worktree와 하위 에이전트는 사용하지 않았다.
- 공급자 오류의 HTTP 상태·Retry-After를 분리하고 204/잘못된 JSON/2MiB 초과를 명시적으로 처리한다. User-Agent는 유지한다. 공급자의 일반 400을 cursor 만료로 추정하지 않는다. 명시적 cursor 만료 신호의 실제 계약은 아직 확보하지 못했다.
- 운영 상태/전역 봉인/120초 lease/epoch guard/고정 cycle 경계/백오프/한 소스 한 페이지 scheduled를 구현했다. HTTP probe는 새 코드에서 410, 재시도 API는 예약만 한다.
- `npm test`: **29/29 통과**. 공급자·경계·실제 SQLite SQL·동시 호출·중지·rollback·HTTP 예약/인증 봉인 검증. 수정 전 새 테스트 실패를 확인한 뒤 구현했다.
- 최종 `wrangler deploy --dry-run` 통과: 53.16 KiB / gzip 15.08 KiB. 새 Worker 코드는 아직 배포하지 않았다.
- `node scripts/validate-scheduler.mjs --local`: **workerd + D1 에뮬레이터 검증 통과**. 기본 비활성, 21개 저장, 중복 재처리, media SQL 실패 rollback, fetch 도중 전역 중지, 429 백오프, 401 needs_attention, HTTP fail-closed 확인. 외부 API는 모의 응답이며 원격 CPU 검증이 아니다.
- 검증 도구는 기존 Wrangler가 설치한 Miniflare 5.20260908.0-alpha/esbuild 0.28.1을 직접 개발 의존성으로 고정했다. 설치 감사 취약점 0. Miniflare 공식 변환 함수로 V4 예제 옵션을 현재 API로 변환한다.
- 로컬 0001/0002 마이그레이션 성공. 원격에는 0002만 추가, 6명령/1.16ms(SQL 시간). 적용 전후 posts=20, collection_control.enabled=0, 활성 소스=0. 기존 데이터 삭제/활성화는 하지 않았다.
- 새 스케줄러의 원격 동시성·CPU 실측은 미완료다. 이전 단계 0 probe의 CPU 값을 새 코드의 통과 근거로 재사용하지 않는다. 새 코드의 SQL 계측 범위는 page_commit_and_observation_log이며 lease/시각 조회는 제외한다.

### 분리된 원격 Worker/D1 검증 (03:15–03:17 UTC)

`seoyeon-zip-scheduler-check` 검증용 D1에 두 마이그레이션을 적용하고 `wrangler dev --remote --test-scheduled`로 새 Worker를 실행했다. 로컬 전용 검증 스크립트와 별개의 수동 원격 검증이다. 운영 Worker 배포나 Cron 등록은 하지 않았다. 무인증 HTTP는 Access 설정 부재로 503을 반환했다.

| 경우 | 예약 테스트 HTTP | 게시물 / 완료 페이지 | 관측 |
|---|---|---|---|
| 기본 비활성 | 200 | 0 / 0 | 저장 없음 |
| Seowoo 첫 페이지 | 200 | 20 / 1 | 실제 API 20개, 8 SQL / read 112 / write 143 |
| 다음 페이지 media INSERT 강제 실패 | 500 | 20 / 1 | D1 trigger 오류, 페이지 저장 rollback; lease 획득 revision만 2→3 |
| 실패 트리거 제거·lease 만료 후 재시도 | 200 | 32 / 2 | 실제 18개 중 최근 7일 12개 저장, 8 SQL / read 69 / write 89 |
| 전역 중지·모든 소스 비활성 후 실행 | 200 | 32 / 2 | 추가 저장 없음, enabled=0 / 활성 소스=0 |

완료 경계는 null로 유지됐다. 원격 개발 세션은 종료했으며 검증 DB는 비활성 상태로 남겼다. Worker CPU, 원격 동시 실행·진행 중 중지·429·401은 이 실측에 포함하지 않았다. 개발 세션 응답 시간과 공급자 wallMs는 CPU가 아니다. 해당 실패 시나리오는 앞의 로컬 테스트 결과로만 구분한다.

### 공급자 페이지 재확인 (03:01:04–03:01:16 UTC)

각 계정 두 페이지를 실제 GET으로 읽었다. 모두 HTTP/JSON 200, 페이지 간 ID 중복 0, 다음 cursor 존재/변경 확인. 표의 수는 두 페이지 합계다.

| 소스 | 수신 | 판별 일치 | COSMO 일치 | 작성 시각 역전 횟수 |
|---|---:|---:|---:|---:|
| gapyeonghaus | 40 | 1 | 0 | 8 |
| Seowoo_0501 | 38 | 38 | 0 | 0 |
| tripleSnewsfeed | 41 | 3 | 0 | 7 |
| TRIPLES_FAN_FR | 40 | 2 | 0 | 5 |
| Or1gin030806 | 40 | 40 | 0 | 0 |
| First0806_ | 38 | 38 | 0 | 0 |

이는 DB 저장 수가 아닌 읽기 전용 판별 결과다. COSMO 역할은 보류다. 종합 계정에서 작성 시각이 순서대로 감소하지 않으므로 오래된 글 하나로 탐색을 종료할 수 없다. 두 페이지에서 역전이 없었던 계정도 전체 순서/재게시/목록 소진 계약까지 검증된 것은 아니다.

따라서 실제 어댑터의 boundaryVerified/exhaustionVerified는 false로 유지한다. cursor 소진 시 gap, 반복 시 needs_attention이며 완료 경계를 임의로 전진하지 않는다. Cron은 등록하지 않았고 운영 활성화도 하지 않았다. 최근 7일 밖의 게시물은 정규화 이후 저장 대상에서 제외하지만, 이 필터를 탐색 종료 증거로 쓰지 않는다.

## 최신 로컬 수정 — 2026-09-09

- 로컬 수집과 Worker가 `src/sources.mjs`의 동일 전용 계정 규칙을 사용한다. 이름 없는 검증된 직접 글은 포함하고 재게시·인용은 예외에서 제외한다. 이 수정만으로 이미 지나간 페이지의 누락 자료가 복구되는 것은 아니다.
- 페이지/cursor 저장 후 runs 로그 INSERT만 실패하면 HTTP 200과 `warning:observation_log_failed`를 반환한다. 비용 계측은 null로 표시한다. 기존 runs 기반 collectedAt은 로그 실패 시 갱신되지 않을 수 있으며 운영 상태 시각 분리는 자동 수집 계획에 포함했다.
- 추가된 probe 테스트에서 수정 전 두 결함이 재현됐다. 수정 후 `npm test` 14/14 통과. 인증 누락·위조 차단 및 stale batch 409도 통과했다. probe의 D1은 테스트 대역이며 실제 원격 SQL 재검증 결과가 아니다.
- 자동 수집 상태·lease·cycle·백오프·운영 봉인·구현 순서는 docs/PLAN.md에 설계했다. Cron/마이그레이션/자동 수집은 아직 구현·활성화하지 않았다.
- `wrangler deploy --dry-run` 통과: 44.92 KiB / gzip 12.93 KiB. 최초 자동 승인 검토가 과거 리뷰 제한을 근거로 거절했으나, 최신 사용자 요청과 AGENTS.md의 개발 역할을 확인해 재검토 후 실행했다. 실제 배포·push는 수행하지 않았다.

실측일: 2026-09-09. 시각은 UTC(한국 시각 +9시간).

## 판정: PARTIAL / 운영 통과 보류

최신 배포 상태: 사용자 제공 팀 도메인/AUD를 반영해 비공개 Worker와 원격 D1 스키마를 배포했다. 익명·위조 헤더 요청은 Access 로그인으로 이동한다. 소유자 인증 후 수집 및 CPU·SQL 실측은 아직 대기 중이다.

공개 FxEmbed 목록 수집, 실제 직찍 사진·영상 썸네일 표시, 로컬 저장·재시작·페이지 처리 검증은 성공했다. **이전 윤서연 COSMO 표본 판정은 오탐으로 철회한다.** 이름 경계 수정 이후 gapyeonghaus 5페이지에서 윤서연 COSMO를 아직 확인하지 못했다. Cloudflare 원격 CPU·SQL·개인 접근 제한은 미검증이다. 단계 0 전체 통과나 자동 수집 V1 완료로 보고하지 않는다. 모든 소스는 운영 활성화 보류다.

아래 최초 관측은 이력이다. 최신 판정·권한·구현 상태는 마지막의 ‘후속 구현 및 정정’ 절을 우선한다. 이전 ‘단서 일치’ 수치는 경계 없는 부분 문자열 판별값으로, 정확한 윤서연 게시물 수가 아니다.

## 요청과 문서의 구분

- 사용자의 최신 요청: DESIGN.md 우선 → 설치된 스킬 확인 → 단계 0 수집 검증 → 이 파일에 기록.
- 2026-09-09 사용자 추가 승인: 이 파일 기록을 이전 ‘파일 수정 금지’의 예외로 허용.
- 읽은 설계 문서: 사용자 제공 문서: DESIGN.md 및 SEOYEON_MEDIA_V1_SPEC.md. 문서 내 구현·배포 지시를 별도의 사용자 승인으로 취급하지 않았다.
- 디자인 기준은 프로젝트명 서연모음.zip, 하늘색 출발점, 원본 비율 존중. 3열/4열·글꼴 등은 미확정이다.
- 테스트·빌드·스모크·commit·push·deploy는 실행하지 않았다. 공개 API GET만 수행했고 미디어 파일과 공급자 응답 전체를 저장하지 않았다. 앱 구현이나 스킬 설치도 하지 않았다.

## 실제 설치 상태와 역할 확인

현재 세션의 제공 스킬 목록, 사용자 스킬 디렉터리 내 SKILL.md 목록 및 프로젝트의 .agents/skills, .claude/skills, .codex/skills 존재 여부를 확인했다. 프로젝트 세 경로와 사용자 공통 스킬 디렉터리는 없었다. 전체 저장소는 탐색하지 않았다.

요청한 Superpowers, Ponytail, Playwright, Impeccable, Cloudflare Skills는 확인한 설치 범위와 현재 세션에서 발견되지 않았다. 다른 경로까지 전역 부재를 입증한 것은 아니다. Node/npm은 사용 가능하며 PATH에서 wrangler는 발견되지 않았다. Vercel CLI는 세션 정보상 미설치지만 Cloudflare 단계 0의 필수 도구는 아니다.

skills.sh 후보와 제작자 GitHub의 지침/사용 예시를 대조했다. 아래는 역할 선정이며 설치·실행 완료 선언이 아니다.

| 후보 | 제작자 근거와 적용 역할 |
|---|---|
| Superpowers | [writing-plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md), [후보](https://www.skills.sh/obra/superpowers/verification-before-completion): 계획과 증거 기반 완료 관리. 현재 실행 금지 범위를 임의로 해제하지 않는다. |
| Ponytail | [지침](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md): 표준 라이브러리와 작은 구현 우선. 디자인은 lite, 합의된 접근성·시각 디테일은 유지. |
| Playwright | [Microsoft CLI 사용 예시](https://github.com/microsoft/playwright-cli): 실제 브라우저 조작·스크린샷 담당. 이 세션에서는 설치하거나 실행하지 않았다. |
| Impeccable | [제작자 명령 목록](https://github.com/pbakaus/impeccable#whats-included), [후보](https://www.skills.sh/pbakaus/impeccable/impeccable): shape/critique/polish/typeset/layout 확인. 디자인 총괄 후보 유지. |
| Cloudflare Skills | [제작자](https://github.com/cloudflare/skills), [Workers 지침](https://github.com/cloudflare/skills/blob/main/skills/workers-best-practices/SKILL.md), [후보](https://www.skills.sh/cloudflare/skills/workers-best-practices): Workers/D1/Access와 실제 런타임 확인 담당. |

DESIGN.md의 better-colors, better-typography, emil-design-eng 및 선택 variant/break/review-animations는 후속 디자인 단계의 채택 후보로 읽었다. 현재 세션 제공 목록에는 없으며 설치·실행하지 않았다. 최신 제작자 세부 지침 검토는 아직 하지 않았다. Taste를 별도 디자인 총괄로 추가하지 않았다.

## 호출 방식과 환경 제한

인증 헤더·로그인 쿠키 없이 Node fetch로 호출했다. 요청별 15초 제한, 읽은 응답 본문 2 MiB 상한을 적용했다. bytes는 HTTP 압축 전송량이 아닌 fetch로 읽은 본문 바이트 수, ms는 로컬 경과시간이며 Workers CPU가 아니다.

기본 샌드박스에서 01:03:36.580~01:03:36.967 시작한 6요청은 EACCES로 실패했다. HTTP 응답이 없었으므로 공급자 장애로 집계하지 않는다. 네트워크 권한 검토 후 동일 공개 API는 성공했다.

기본 URL: `https://api.fxtwitter.com/2/profile/{handle}/statuses?count=10`.
두 번째 페이지는 직전 응답의 `cursor.bottom`을 URL 인코딩하여 `&cursor=...`로 전달했다. [공급자 계약](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/)과 실제 응답을 구분했다.

### 첫 번째 관측

모두 HTTP 200 / JSON code 200이다. 이 관측은 본문 일부만 확인했으므로 정확한 게시물 수는 후속 관측에 기록한다.

| handle | 요청 시작 UTC | 본문 bytes | 경과 ms |
|---|---|---:|---:|
| gapyeonghaus | 01:04:02.685 | 70387 | 2254 |
| Seowoo_0501 | 01:04:04.952 | 76351 | 1001 |
| tripleSnewsfeed | 01:04:05.953 | 75240 | 1498 |
| TRIPLES_FAN_FR | 01:04:07.451 | 97121 | 1332 |
| Or1gin030806 | 01:04:08.783 | 83589 | 934 |
| First0806_ | 01:04:09.717 | 64107 | 965 |

01:05:17~01:05:26에는 같은 6소스와 주요 2소스 다음 페이지를 재호출했다. 콘솔에 미디어 메타데이터를 너무 많이 출력해 결과가 잘렸다. 아래 최소 요약 관측을 최종 수치 근거로 사용한다. 잘린 출력에만 있는 수치를 추정하지 않는다.

### 최종 요약 관측

모두 HTTP 200 / JSON code 200. ‘사진/영상’은 윤서연 텍스트 단서가 있는 게시물의 미디어 항목 수다. 단순 표본 검사이며 정식 분류기 검증은 아니다. 최신 시각은 전체 응답 게시물의 최대 작성 시각이다.

| handle | page | 시작 UTC | bytes | ms | 게시물 | 단서 일치 | 사진/영상 | 최신 작성 UTC |
|---|---:|---|---:|---:|---:|---:|---|---|
| gapyeonghaus | 1 | 01:05:58.255 | 70387 | 1861 | 20 | 2 | 6/0 | 09-08 13:01:00 |
| gapyeonghaus | 2 | 01:06:00.119 | 67481 | 1315 | 21 | 1 | 4/0 | 09-06 15:01:03 |
| Seowoo_0501 | 1 | 01:06:01.435 | 76352 | 1027 | 20 | 20 | 16/11 | 09-09 00:51:19 |
| Seowoo_0501 | 2 | 01:06:02.463 | 64346 | 1054 | 17 | 17 | 18/8 | 09-04 12:03:32 |
| tripleSnewsfeed | 1 | 01:06:03.517 | 75490 | 1380 | 20 | 1 | 2/0 | 09-08 23:00:02 |
| TRIPLES_FAN_FR | 1 | 01:06:04.898 | 97121 | 1555 | 19 | 2 | 5/0 | 09-08 17:52:23 |
| Or1gin030806 | 1 | 01:06:06.453 | 84189 | 1024 | 20 | 20 | 8/17 | 09-05 10:28:18 |
| First0806_ | 1 | 01:06:07.478 | 64107 | 1038 | 18 | 18 | 33/7 | 09-04 12:02:16 |

### 실제 원문과 미리보기 URL 표본

- COSMO + 윤서연 단서: https://x.com/gapyeonghaus/status/2096951571615453241 — 사진 4장. 첫 사진 https://pbs.twimg.com/media/HRneVowagAAeIay.jpg?name=orig
- 다음 페이지 COSMO 표본: https://x.com/gapyeonghaus/status/2096614652352385036 — 사진 4장.
- 직찍: https://x.com/Seowoo_0501/status/2097487982349648256 — 첫 사진 https://pbs.twimg.com/media/HRvGM1HacAATM_R.jpg?name=orig
- 영상: https://x.com/Seowoo_0501/status/2096230595781443776 — 썸네일 https://pbs.twimg.com/amplify_video_thumb/2096230084315414529/img/5m-LrcD-HuGbBKxp.jpg
- 영상: https://x.com/First0806_/status/2095844894837526660 — 썸네일 https://pbs.twimg.com/amplify_video_thumb/2095844868358873088/img/H_9NqNXvGvw0OUN2.jpg

원문과 미리보기 URL은 공급자 응답에서 확보한 값이다. 원문 페이지 접근 성공이나 브라우저 이미지 표시를 별도로 확인한 것으로 해석하지 않는다.

### 페이지 진행 증거

- gapyeonghaus: 첫 20개와 다음 21개의 문자열 ID는 서로 겹치지 않았다. page 2 입력 cursor: `DAAHCgABHRvJjIP__-sLAAIAAAATMjA5NjY1MTM1NjIzMjkzNzg1MggAAwAAAAIAAA`. 출력: `DAAHCgABHRvJjIP__9sLAAIAAAATMjA5NjM4Mzg3MTgwNTczNTMyNwgAAwAAAAIAAA`.
- Seowoo_0501: 첫 20개와 다음 17개의 문자열 ID는 서로 겹치지 않았다. page 2 입력 cursor: `DAAHCgABHRvJjxG__-wLAAIAAAATMjA5NTg1NjgyMDkyNTY1MzAwNggAAwAAAAIAAA`. 출력: `DAAHCgABHRvJjxG__9sLAAIAAAATMjA5MzMxMjM1MTYxMzM2MjQxMQgAAwAAAAIAAA`.
- 각 페이지 내부 ID도 모두 고유했다. ID를 Number로 변환하지 않았다. DB 저장과 프로세스 재시작 이후 중복 제거는 미검증이다.
- 짧은 간격의 여러 관측에서 목록 정상 응답을 확인했다. 신규 글 유입이나 장기 안정성은 입증하지 않는다.

## 구현 전에 반영할 주요 발견

1. `count=10`은 실제 처리량 상한이 아니다. 이번 응답은 17~21개였다. 수집기가 10개만 저장하고 공급자 다음 cursor로 진행하면 나머지를 누락시킬 수 있다. 전체 응답의 안전한 처리 또는 남은 항목을 보존하는 체크포인트 계약이 필요하다. 실제 응답 개수로 CPU/SQL 예산을 검증해야 한다.
2. gapyeonghaus와 Seowoo 목록에도 soundwave_korea 등 다른 작성자의 원문이 포함된다. 소스 handle을 작성자로 덮어쓰거나 전용 소스의 모든 재게시를 자동 귀속시키지 않는다. 작성자와 발견 소스 분리가 필요하다.
3. 종합 소스의 첫 페이지에는 다른 멤버 글이 다수다. HTTP 200 또는 미디어 존재만으로 윤서연·COSMO 소스 검증을 완료할 수 없다. TRIPLES_FAN_FR의 이번 첫 페이지에서는 윤서연+COSMO 동시 일치 표본이 없었다.

## 단계 0 완료 조건별 상태

| 조건 | 상태 |
|---|---|
| COSMO 및 직찍/영상 실제 목록·원문 URL·미리보기 URL | 부분 확인: 위 표본 확보, 원문 페이지 접근 별도 미확인 |
| 사진·영상 썸네일 실제 브라우저 표시와 실패 대체 | 미검증: 기존 테스트/스모크 금지 유지, 앱 및 브라우저 검수 미실행 |
| 서로 다른 시점의 재호출 정상 응답 | 확인: 약 2분 이내 관측, 장기 보장 아님 |
| cursor 진행 및 재시작 중복 제거 | 전자는 2소스 확인, 후자는 미검증 |
| 실제 Cloudflare CPU·SQL·응답 예산·개인 접근 제한 | 미검증: 배포 금지 유지, 원격 Worker/D1/Access 확인 안 함 |

다음 단계는 브라우저 표시 검수와 비공개 Cloudflare 원격 검증이다. 해당 실행 및 배포 범위가 허용되고 대상 계정/호스트가 준비되어야 수행 가능하다. workers.dev·preview·정적 화면·API 우회 보호를 포함해야 한다. 현 시점에는 수집 가능성만 확인했고 운영 활성화와 UI 구현은 진행하지 않는다.

## 승인 검토 이력

자동 승인 검토는 최초 `docs/validation-observations.json` 생성 요청을 이전 파일 수정 금지와 충돌한다는 이유로 거절했다. 해당 파일은 생성하지 않았다. 당시 사용자가 승인한 VALIDATION.md만 기록했다. 이후 사용자가 로컬 코드·설치·검증 및 지정 계정 비공개 검증 배포를 허용했으므로 후속 구현을 진행했다.

## 후속 구현 및 정정 — 2026-09-09

### 설계 반영

다운로드 원본을 수정하지 않고 프로젝트 `docs/SPEC.md`에 최신 기능 계약을 반영했다. `DESIGN.md`는 최신 첨부본을 프로젝트에 복사했다.

- 응답 전체를 정규화·판별하고 대상 게시물을 모두 저장한 뒤에만 cursor 전진. 요청 count로 응답을 잘라 버리지 않는다.
- 실제 작성자와 발견 소스를 분리한다. 검증된 전용 계정, 작성자 일치, `reposted_by:null`, 비인용 글만 이름 없는 미디어 예외를 허용한다. 관계 불명확/본인 재게시/타인 재게시/인용은 이 예외를 받지 않는다.
- TRIPLES_FAN_FR: 일반 목록 수집 성공 / COSMO 역할 확인 대기. 이번 페이지에 역할 표본이 없다는 이유로 탈락시키지 않는다.

### COSMO 표본 오탐 정정

카드에 실제 캡션을 표시한 결과 `2096951571615453241`은 `[260907] #tripleS Jiyeon COSMO Talk update ... #JiYeon #지연 #지서연 #ジヨン`인 지연 게시물이었다. 기존 `/서연/` 부분 문자열 판별이 `#지서연`에 잘못 일치했다. 해당 게시물의 **윤서연 COSMO 판정을 철회**한다. 이전 두 번째 COSMO 표본 `2096614652352385036`도 새 이름 판별에서 제외되므로 윤서연 표본 근거로 사용하지 않는다.

`matchesSeoyeon`은 Unicode 문자·숫자 경계를 확인한다. `#지서연`, `S10`은 제외하며 `#윤서연`, `#서연`, `w/ Seoyeon`은 포함한다. 보수적인 토큰 판별이므로 조사 등이 바로 붙은 표현은 누락될 수 있다. 얼굴·이미지 인식은 하지 않는다.

수정 전 검증 DB는 이력으로만 남겨두고, 이후 데이터는 `.local/validation-v2.sqlite`에 수집했다. 화면은 수정된 `.local/samples.json`만 사용한다.

### 수정 후 실제 수집

아래 요청은 2026-09-09 UTC. 모두 HTTP 200 / JSON code 200. 전체 응답을 처리한 뒤 조건에 맞는 메타데이터만 저장했다. raw JSON·이미지·영상 바이너리는 저장하지 않았다.

| 출처/페이지 | 시작 | bytes | wall ms | 받은 글 | 판별 후 저장 |
|---|---|---:|---:|---:|---:|
| gapyeonghaus 1 | 01:24:58.427 | 72594 | 1616 | 20 | 1 |
| gapyeonghaus 2 | 01:25:00.070 | 63798 | 906 | 20 | 0 |
| gapyeonghaus 3 | 01:25:00.996 | 64970 | 878 | 20 | 0 |
| gapyeonghaus 4 | 01:25:01.895 | 77097 | 1019 | 20 | 0 |
| gapyeonghaus 5 | 01:25:02.931 | 72813 | 976 | 20 | 0 |
| Seowoo_0501 | 01:25:03.925 | 74665 | 857 | 20 | 20 |
| tripleSnewsfeed | 01:25:04.804 | 75490 | 985 | 20 | 1 |
| TRIPLES_FAN_FR | 01:25:05.809 | 97133 | 959 | 19 | 2 |
| Or1gin030806 | 01:25:06.790 | 83589 | 814 | 20 | 20 |
| First0806_ | 01:25:07.630 | 62592 | 882 | 18 | 18 |

이 실행의 URL/cursor/관측값은 `.local/samples.json`의 observations에 기록했다.

### 로컬 검증 결과

- `npm test`: **8/8 통과**. 21개 저장, 중간 media INSERT 실패 rollback, stale revision 거절, 별도 Node 프로세스 재시작 후 21개 재처리 시 posts/media/discoveries 중복 없음, 재게시·인용·불명확 관계 예외 차단, 이름 경계 오탐, 인증 누락·위조 헤더 차단.
- 로컬 트랜잭션 검증은 Node SQLite를 사용했다. 실제 D1 batch의 원격 동작을 입증한 결과가 아니다.
- `wrangler deploy --dry-run`: 통과. 최종 번들 44.43 KiB / gzip 12.74 KiB. 업로드·원격 배포는 수행하지 않았다.
- `wrangler d1 migrations apply seoyeon-zip-validation --local`: 0001_validation.sql 적용 성공. 원격 DB 생성·변경 없음.
- 초기 dry-run은 샌드박스 로그/프로세스 권한 제한으로 실패했고, 허용된 로컬 재실행에서 성공했다.
- Playwright CLI / Edge: 1440·390·360px 모두 가로 넘침 없음. 실제 사진 naturalWidth=1661, 영상 썸네일 naturalWidth=1200. 의도적인 404 카드가 실패 문구와 원문 링크로 전환됨. 3개 링크의 Tab 순서와 `noopener noreferrer` 확인.
- 실제 화면을 `.local/cards-1440.png`, `.local/cards-390.png`, `.local/cards-360.png`로 기록했으며 1440·390px 이미지를 시각 확인했다. 완성 UI/A·B 디자인 선택이 아닌 최소 카드 검증이다.
- 사진 표본: https://x.com/Seowoo_0501/status/2097494460074754382
- 영상 표본: https://x.com/Seowoo_0501/status/2096230595781443776
- 원문 링크 속성과 키보드 접근을 확인했다. 외부 X 페이지의 최종 표시 성공은 별도 검증하지 않았다.

### 스킬·도구 상태

프로젝트 `.agents/skills`에 제작자 저장소에서 설치: Superpowers writing-plans / verification-before-completion, Ponytail, Playwright CLI, Impeccable, Cloudflare workers-best-practices / wrangler. 새 스킬은 다음 턴에서 자동 발견될 수 있으며 이번 턴에는 필요한 지침을 직접 읽었다.

Impeccable은 스킬 설치 성공, 엔진 로더는 바이너리 부재로 실패했다. 재설치를 완료했다고 주장하지 않고 DESIGN.md와 craft-floor를 직접 적용했다. 추가 디자인 스킬과 완성 UI 시안은 이번 범위에 넣지 않았다.

도구 버전: Node 24.14.1, Playwright CLI 0.1.19, Wrangler 4.130.0. npm lockfile로 고정했다. Wrangler의 간접 sharp 보안 경고는 override 0.35.4로 수정했으며 이후 설치 감사 취약점 0건이다. jose는 공식 Cloudflare 예제에 따른 JWT 검증용이며 package-lock.json에 실제 버전을 고정했다.

### 비공개 배포 준비와 현재 장애

- `wrangler login` 성공. `whoami`에서 지정 이메일 계정과 Account ID `[비공개 계정 ID]` 확인.
- 계정 workers.dev subdomain: `[이전 서브도메인]`. 목표 이름: `seoyeon-zip`.
- 같은 OAuth로 Access apps / organizations 조회는 HTTP 403. 일반 Workers/D1 권한과 Access 관리 권한은 다르다.
- 대시보드 연결 시도는 브라우저 webview attach timeout으로 실패했다. 사용자에게 Access 앱의 소유자 한 명 허용 설정 및 TEAM_DOMAIN/POLICY_AUD 제공을 요청했다. API 토큰을 채팅으로 요구하지 않았다.
- `wrangler.jsonc`: workers_dev=false, preview_urls=false, assets.run_worker_first=true. 인증 설정이 빠지면 모든 경로 503. JWT 누락 401, 잘못된 JWT/이메일 403. 서명·issuer·audience·exp·iat·소유자 이메일을 확인한다.
- 보호된 `/api/probe`는 한 페이지 D1 batch 검증용이며 동일 Origin+명시적 요청 헤더를 요구한다. stale revision CHECK가 실패하면 batch 전체를 rollback하는 구조다. 원격 실증은 아직 없다.
- 원격 Access, D1 처리, CPU, SQL 실제 한도, preview/workers.dev 우회 검증은 **미완료**. 결제, 공개 배포, commit/push는 하지 않았다.

## Access 설정 수신 후 비공개 배포

- 사용자 제공 팀: `[비공개 Access 팀]`; 공개 인증서 엔드포인트 HTTP 200 확인.
- 사용자 제공 AUD를 wrangler vars에 반영했다. AUD는 앱 식별자이며 비밀 인증 토큰이 아니다.
- 주소: https://seoyeon-zip.seoyeon-archive.workers.dev
- 원격 D1 ID: `017ec07d-d095-45f9-80f7-0dffd6f48ba0` (APAC). 0001_validation.sql 7명령 적용 성공, CLI reported SQL duration 1.02ms. 이는 수집 CPU 측정값이 아니다.
- `npm test` 8/8, `wrangler deploy --dry-run` 성공 후 실제 배포 성공.
- 배포 버전: `d2ee6b9b-65d2-4842-83d6-c3d7832bf45b`.
- CLI Worker Startup Time 5ms: 시작 시간 정보일 뿐 실제 수집 요청 CPU 한도 통과의 근거가 아니다.
- workers_dev=true / preview_urls=false. Access 보호 확인 뒤 Production만 활성화했다.
- 배포 후 `/`, `/cards.js`, `/api/samples`, `/api/probe`에 위조 이메일/JWT 헤더를 넣은 요청은 모두 HTTP 302로 지정 팀의 Access 로그인으로 이동했다. 보호 없이 콘텐츠를 반환하지 않았다.
- 소유자 인증용 브라우저를 열었다. 인증된 실제 페이지 조회·수집 POST·D1 처리 계측은 로그인 완료 후 확인한다. 익명 차단만으로 소유자 정상 접근을 통과 처리하지 않는다.

## 수집 401 원인 조사 — 2026-09-09 02:17 UTC

- 이번 작업은 원인 조사와 방향 제시다. 수집 코드 수정·재배포는 수행하지 않았다.
- 앞선 세션에서 소유자 인증 후 `/api/samples` 200/0개, Worker 수집 요청은 외부 API HTTP 401에 의해 502를 반환했다. 이는 이전 관측이며 이번 원격 재실측은 아니다.
- 현재 `src/collection.mjs` fetch는 User-Agent를 명시하지 않고, 오류 응답 본문을 읽기 전에 HTTP 상태만으로 예외를 발생시킨다.
- 제작자 소스 `https://github.com/FxEmbed/FxEmbed/blob/main/src/realms/api/router.ts#L50-L60`는 User-Agent가 없으면 식별 헤더를 요구하는 JSON 오류와 HTTP 401을 반환한다.
- 로컬 Node에서 동일 목록 URL에 인증 정보 없이 요청: 02:16:08~09 UTC Seowoo_0501 및 gapyeonghaus 모두 HTTP 200 / code 200 / 20개.
- 통제 비교: Seowoo_0501 목록에서 User-Agent를 빈 값으로 지정하면 02:17:27 UTC HTTP 401과 `You must identify yourself with a User-Agent header` 오류. `SeoyeonZip/0.1 (+https://seoyeon-zip.seoyeon-archive.workers.dev)`로 지정하면 02:17:28 UTC HTTP 200 / code 200 / 20개. 요청에 API 키나 로그인 쿠키를 사용하지 않았다.
- 판정: User-Agent 누락에 따른 401을 재현했고 명시적 앱 식별 헤더로 로컬 정상 응답을 확인했다. 기존 Worker 장애의 유력 원인이다. Worker에서 해당 헤더를 반영한 뒤 성공하는지는 아직 확인하지 않았다.
- 사용자 추가 API 키 발급, X 로그인 쿠키 제공, Cloudflare Access 변경은 이번 재현 결과상 필요하지 않다.
- 다음 방향: 앱 User-Agent 명시 → 제한된 오류 진단 추가 → 관련 검증 → 기존 비공개 Worker에서 목록·D1 저장 실측. 전용 계정 판별 차이 및 저장 후 관측 로그 실패 처리도 별도 수정 대상으로 유지한다.
- 초기 샌드박스 요청은 EACCES였으며 외부 HTTP 응답이 아니었다. 외부 통신 권한을 사용한 요청만 위 실측에 포함했다. 미디어 바이너리나 전체 공급자 응답을 파일로 저장하지 않았다.

### User-Agent 수정 — 2026-09-09

- 공유 `fetchPage`에 `SeoyeonZip/0.1 (+https://seoyeon-zip.seoyeon-archive.workers.dev)` User-Agent를 명시했다. 로컬 수집과 Worker가 동일 함수를 사용한다.
- `tests/provider.test.mjs`에 앱 식별 헤더가 없으면 공급자가 401을 반환하는 모의 응답 검증을 추가했다. 수정 전 해당 테스트가 HTTP 401로 실패했고, 수정 후 관련 테스트 3/3 통과했다 (`node --test tests/provider.test.mjs`).
- 기존 수동 redirect 정책과 응답 크기 제한은 유지한다. 오류 진단 확장, 전용 계정 판별 차이, 저장 후 로그 실패 처리는 이번 수정에 포함하지 않았다.
- 이번에는 로컬 코드와 관련 테스트만 변경·검증했다. 재배포하지 않았으며 실제 Worker에서 수집 성공 여부는 여전히 확인해야 한다.

### User-Agent 수정본 원격 실측 — 2026-09-09 02:23 UTC

- 사용자 요청에 따라 기존 비공개 Worker에 배포했다. dry-run 성공, 버전 `c5934c7e-a092-40fc-880f-edf2e358f8a6`. 번들 44.72 KiB / gzip 12.84 KiB. Preview 비활성화와 Access 인증 코드 유지.
- 인증된 브라우저에서 `/api/probe` 실행: Seowoo_0501은 외부 HTTP 200/code 200, 20개 수신·20개 저장 처리, Worker HTTP 200. gapyeonghaus는 외부 HTTP 200/code 200, 20개 수신·1개 저장 처리, Worker HTTP 200.
- 시작 전 `/api/samples` 0개, 저장 후 새 조회에서 고유 게시물 20개. 소스별 저장 처리 수의 합계 21은 고유 게시물 개수를 의미하지 않는다.
- Seowoo: 외부 응답 74670 bytes/705ms, Worker CPU 10ms/wall 959ms, SQL 10문장, rows read 111/write 144. gapyeonghaus: 72599 bytes/829ms, CPU 6ms/wall 1067ms, SQL 10문장, rows read 15/write 17. 각 1회 관측이며 장기 CPU 한도 통과나 안정성 보장이 아니다.
- 실제 배포 화면에서 사진 loaded/naturalWidth 1661, 영상 썸네일 loaded/naturalWidth 1200, 의도적 실패 카드 failed 확인. 조회 도중 한 번 페이지 이동으로 평가가 중단됐고 재조회에 성공했다.
- 판정: User-Agent 추가 후 실제 Worker 수집·D1 저장·화면 조회가 성공했다. 기존 401 문제는 이번 두 소스 실측에서 해소됐다. 전체 6개 소스, COSMO 역할, 장기 자동 수집, 원격 동시성·재시작 검증은 완료로 간주하지 않는다.

## 실제 피드 연결 코드 — 2026-09-09 (실행 미검증)

src/feed.mjs 및 Worker 라우팅, validation/feed.js에 전체 데이터 필터/정렬/cursor와 화면 연결을 작성했다. 인증 핸들러를 통과한 뒤 API 및 정적 자산을 제공하는 구조는 유지했다. 로컬 시안과 실제 데이터 화면을 분리했다. 파일 내용만 확인했으며 테스트·빌드·브라우저 검증·배포는 실행하지 않았다. 이전 수집 검증 결과는 새 피드의 검증 근거가 아니다. 남은 검증은 PLAN.md 실제 피드 연결 절 참조.

## 실제 피드 후속 검증 — 2026-09-09 06:43 UTC

- `node --test tests/feed.test.mjs`: 3/3 통과. 같은 게시일 120개를 최신/오래된순으로 페이지 끝까지 조회해 누락·중복 없음 확인. KST 월 경계 및 복수 발견 출처, GIF, 빈 결과, 잘못된 query/cursor HTTP 400 확인.
- `npm test`: 35/35 통과. SQLite 기반 검증이며 원격 D1 비용/동작의 대체가 아니다.
- Wrangler whoami: 지정 소유자 계정 OAuth 로그인 확인.
- Playwright 로컬 페이지 열기 성공. scripts/check-feed-live.js를 작성했으나 실행은 자동 승인 검토에서 과거 리뷰 전용 테스트 금지를 근거로 거절. 브라우저 동작 검증 통과로 간주하지 않는다.
- Wrangler dry-run: 기본 샌드박스에서 파일 접근 오류. 권한 확대 재시도는 자동 승인 검토에서 빌드 금지를 근거로 거절. 빌드 통과 미확인.
- 원격 배포하지 않았다. 사용자에게 해당 검증과 기존 Access 비공개 배포 범위의 명시적 예외 승인을 요청한다.

## 실제 피드 비공개 배포 완료 — 2026-09-09 06:53 UTC

사용자가 브라우저 검증·빌드·기존 Access 비공개 배포를 명시 승인했다. 자동 검토의 과거 지침 오적용은 현재 AGENTS.md 및 이번 승인 근거를 제출해 동일 명령 재검토 후 진행했다.

- Wrangler dry-run 통과. 390/1440px 모의 API 브라우저 검증에서 60개 페이지 추가, 실패 후 기존 카드 보존·재시도, 지연 응답 무시, 가로 넘침 없음 확인.
- 첫 원격 확인에서 실제 ID `x:숫자`가 cursor 숫자 검사에 걸려 다음 페이지 400 발생. 검사와 회귀 표본을 실제 형식으로 수정하고 feed 테스트 3/3 통과 후 재배포.
- 최종 버전: 59750e24-3767-43f8-b624-71423e42f262. 기존 DB·Access·keep_vars·5분 예약 유지. commit/push 없음.
- 소유자 원격 API: 첫 페이지 200/48개, 다음 페이지 200/7개, 전체 55개, 페이지 교집합 없음. 실제 더 보기 클릭 후 55개 카드 및 버튼 숨김 확인.
- 최신 게시일 2026-09-09T03:52:57.000Z, 오래된 게시일 2026-09-03T10:17:12.000Z. 2026-09 월 조건 응답 200/총55 확인.
- 비로그인 /api/feed 요청 302 Access 로그인 리다이렉트 확인.
- 원격 D1 SQL/CPU 비용 실측 및 장기 데이터 증가에 따른 인덱스 검토는 남아 있다. 모의 브라우저 실패 재시도 확인을 원격 장애 주입 검증으로 간주하지 않는다.

## 피드 CPU / SQL 비용 실측 — 2026-09-09 06:59 UTC

대상: 기존 Access 비공개 seoyeon-zip / D1 seoyeon-zip-validation, 게시물 55개. 데이터 수정·새 배포 없이 소유자 GET 및 SELECT/EXPLAIN만 실행했다.

| 표본 | 결과 |
|---|---|
| Worker 오래된순 GET 1회 (wrangler tail) | outcome ok, CPU 5ms, wall 187ms |
| 전체 개수 SELECT | 0.1827ms / rows_read 55 / rows_written 0 |
| 최신 목록 49개 SELECT | 0.7306ms / rows_read 110 / rows_written 0 |
| 오래된 목록 49개 SELECT | 2.8914ms / rows_read 110 / rows_written 0 |
| 2026-09 KST 목록 49개 SELECT | 2.8309ms / rows_read 110 / rows_written 0 |
| 영상 목록 33개 SELECT | 0.8286ms / rows_read 129 / rows_written 0 |
| 갱신 상태 MAX SELECT | 0.4677ms / rows_read 6 / rows_written 0 |

첫 기본 페이지의 세 SQL에 대응하는 별도 실행 표본 합계는 읽기 171행이다. 동일 요청의 통합 프로파일이나 월간 청구 예측이 아니다. 브라우저 왕복 표본은 기본829/오래된311/월316/영상288ms였으며 CPU 시간과 구분한다. 모든 GET은 200. CPU 표본은 한 건이므로 p95/장기 운영/수집 Cron 비용을 대표하지 않는다.

EXPLAIN 최신 목록: SCAN p + USE TEMP B-TREE FOR ORDER BY. 현재 표본에서 CPU 제한 100ms 초과는 관찰되지 않았으며 긴급 인덱스 변경은 하지 않았다. 게시물 증가 시 publishedAt 표현식 + ID 정렬 인덱스를 양 정렬 방향과 cursor에 맞게 검토하고, EXPLAIN 및 rows_read로 효과를 입증한다. 영상/출처 필터 및 COUNT 비용은 별도로 남는다.

scripts/measure-feed-tail.mjs는 60초 제한 로그 구독 후 종료하며 요청 헤더·URL·본문 대신 CPU/wall/outcome만 출력한다. 첫 구독은 표본 미수신, 두 번째에서 위 GET 표본 수신. 추가 자동화나 계속 실행되는 모니터는 생성하지 않았다.

## 미설치 스킬 보완 — 2026-09-09

사용자 설치 요청에 따라 공식 skill-installer를 사용해 프로젝트 .agents/skills에 12개를 추가했다. 기존 10개는 덮어쓰지 않았다.

- jakubkrehel/skills: better-colors, better-typography, variant, break.
- emilkowalski/skills: emil-design-eng, review-animations.
- obra/superpowers: using-superpowers, subagent-driven-development, brainstorming, systematic-debugging, requesting-code-review, test-driven-development. 뒤 4개는 새 항목의 워크플로/필수 참조 누락을 보완한 의존 스킬이다.

전체 설치 스킬의 Markdown 로컬 링크를 검사했다. 남은 미존재 경로는 Playwright 문서 예시의 과거 스냅샷뿐이며 설치 자산 누락이 아니다. 새 Superpowers의 review-package/task-brief/sdd-workspace 파일 존재 및 Git Bash 5.2.37의 bash -n 구문 검사 통과. 실제 서브에이전트 작업·리뷰 생성·커밋은 실행하지 않았다. Windows에서는 system32의 WSL bash가 아닌 C:/Program Files/Git/bin/bash.exe를 사용한다.

설치와 실행 범위는 구분한다. 지침형 스킬에 별도 엔진은 없고, 새 스킬 자동 발견은 다음 턴부터 확인 가능하다. using-superpowers와 subagent-driven-development 설치 자체는 사용자의 단일 에이전트 선호/commit 금지/미세 디자인 판단 위임을 변경하지 않는다. Skill에서 다른 역할을 설명하는 일반 참조(writing-skills 등)를 무조건 설치 의존성으로 취급하지 않았다.

## CPU 표본 확대 및 수집 상태 — 2026-09-09 07:20 UTC

기존 비공개 배포에서 피드 기본/오래된순/2026-09 게시월/영상/Seowoo_0501 출처 GET 5건과 sources GET 1건을 순서대로 읽었다. 모두 HTTP200, 모든 tail outcome ok.

- 피드 5건 CPU: 6,4,4,3,3ms (범위3~6, 평균4ms). wall:890,66,81,62,68ms. 첫 요청 wall이 큰 원인은 이 표본으로 특정하지 않았으며 CPU와 구분한다.
- sources 요청 CPU1ms / wall31ms.
- 총55개, 영상33개, Seowoo_0501 발견출처33개.
- First0806_, Or1gin030806, Seowoo_0501, TRIPLES_FAN_FR, gapyeonghaus, tripleSnewsfeed 모두 enabled1, 최근 last_success_at 존재, last_error_code null, catchup_status running. pages_in_cycle 3~4, history_paused0, last_complete_sync_at null. 최근 성공 및 진행 확인이지 전체 과거 수집 완료가 아니다.
- 별도 추가 계정 활성화·데이터 변경·배포 없음. CPU 표본을 월간 청구 금액/장기p95 보장으로 환산하지 않는다. SQL 비용은 앞선 실측 참조.

## 추가 후보 6계정 수집·판별 표본 — 2026-09-09 07:23 UTC

사용자 진행 요청에 따라 scripts/validate-additional-sources.mjs로 계정당 첫 목록 1페이지를 조회했다. S2O806 중복은 제거했다. 총119개 응답을 기존 normalizePage에 모두 전달했으며 verifiedDirect=false로 이름 없는 글 예외를 적용하지 않았다. 운영 DB 저장·source 추가·자동 활성화는 하지 않았다. 원본 미디어와 raw 전체 응답은 저장하지 않았다. .local/additional-source-validation.json은 요약과 계정당 최대3개 정규화 텍스트 표본이다.

| 계정 | HTTP | 반환 | 이름+미디어 일치 | 다른 작성자 글 |
|---|---|---|---|---|
| sogeumdwarf | 200 | 20 | 7 | 0 |
| hamhamm806 | 200 | 20 | 4 | 2 |
| S2O806 | 200 | 22 | 16 | 5 |
| Pumpkin030806 | 200 | 19 | 19 | 0 |
| hampuppy806 | 200 | 18 | 8 | 6 |
| triplescosmos | 200 | 20 | 2 | 10 |

일치 수는 메타데이터의 이름/미디어 존재 규칙 통과 수이며 이미지 속 인물의 육안 검증 또는 7일 운영 저장 건수가 아니다. 22개 응답도 자르지 않고 전부 판별했다.

- sogeumdwarf: 9/4 직접 작성 사진 + 윤서연 태그 확인. hamhamm806: 9/5 직접 영상 + 윤서연 태그 및 다른 계정 재게시 확인. S2O806: 9/4 코스모톡 사진 + 윤서연 태그 확인. 이 3개는 이름 기반 보조 소스 연결 후보.
- Pumpkin030806 표본은8/16, hampuppy806 표본은8/13 또는 이전. 현재 초기7일 범위 밖 표본이므로 활성화해도 바로 보일 것으로 보장하지 않는다. 범위 밖 과거 수집을 임의 확대하지 않는다.
- triplescosmos 일치2개는 다른 작성자 starlikemusicco/soundwave_korea의 행사·굿즈 안내 재게시. 공식 직접 작성 미디어 역할은 이번 페이지로 검증하지 못했다. 계정 자체의 탈락 근거가 아니며 공식 출처만으로 전용 직접 글 예외를 적용하지 않는다. 공지 포함 여부는 기존 요구사항에 확정하지 않은 제품 범위 선택이다.
- 한글 '코스모톡'은 현재 /cosmo/i 분류에서 other가 됨. secondary 직접 사진도 verifiedDirect=false이면 other로 표시된다. 수집 포함 여부와 콘텐츠 종류 분류를 분리해 설계를 보완할 필요가 있다.
- 6계정을 모두 추가하면 현행 한슬롯1소스/5분 구조상12소스가 된다. 정상 최신 조회 순회는 약60분, 초기 최신/과거 교대 시 약120분까지 길어질 수 있다. 기존6개와 같은30분/60분 목표로 설명하면 안 된다. 추가 활성화 전에 주기 계약을 갱신해야 한다.

## 보조 계정 3개 연결 — 2026-09-09

- sogeumdwarf, hamhamm806, S2O806를 소스 목록에 추가. verifiedDirect=false 유지. 이름 없는 글 허용은 기존3개 전용계정만 유지.
- 명시적 영문 COSMO 및 한글 코스모/코스모톡 단어를 cosmo로 분류. cosmopolitan 등 부분 일치는 제외. 분류는 이름+미디어 포함 판별과 별개.
- 0004_secondary_sources.sql은 비활성 신규3행만 추가. 기존 데이터 보존. 원격 적용 후 새 코드 배포, 마지막으로 해당3행 enabled1/revision증가/next_due_at현재시각 적용.
- 버전 e325b655-524f-4a24-bf04-3a3bdb55f41f. Cron */3 * * * *, CPU100ms, keep_vars, Access 유지. 비로그인 API302 확인. 계정9개 enabled1 조회 확인, 신규3개 last_success_at null: 첫 예약 저장 아직 미확인.
- TDD: 코스모톡 분류 테스트가 other 반환으로 실패하는 것을 먼저 확인. 수정 후 전체37/37 통과. 신규 소스 설정의 이름 없는 글 예외 미부여, 9소스 순회, 기존 인증/트랜잭션 테스트 포함. dry-run 통과, git diff --check 통과.
- 예약 슬롯 하루288→480(약67% 증가), 한 실행1소스1페이지 유지. 9소스 정상 순회 약27분, 최신/과거 교대 중 최신 확인 약54분 목표. 재시도/예약 전파/실행 지연은 별도라 보장 간격이 아니다. 추가 결제나 요금제 변경 없음.
- Pumpkin030806/hampuppy806/triplescosmos는 미활성 상태로 보류. 신규 첫 Cron 저장 및 변경 주기 하 장기 CPU/SQL 비용은 후속 확인 대상.

## 남은 3계정 추가 확인 — 2026-09-09

scripts/validate-remaining-sources.mjs 실행. Pumpkin030806/hampuppy806 각2페이지, triplescosmos4페이지(직접 작성 이름+미디어 표본 발견 시 중단), 모든 페이지 HTTP200. 운영 저장/활성화 없이 메타데이터 판별. .local/remaining-source-validation.json에 시각·범위·요약 기록.

- Pumpkin030806: 33개 응답/33개 일치, 최근7일 일치0. 조회 응답의 가장 최근 작성일8/16. 이름 명시 직접 사진이 있어 수집 경로/판별은 가능. 현재 표본에서 최근 자료 없음.
- hampuppy806: 38개 응답/16개 일치, 최근7일 일치0. 조회 응답 가장 최근 작성일8/13이며 직접 이름 명시 표본은8/6. 재게시가 많아 발견출처 분리 유지 필요.
- triplescosmos: 80개 응답/3개 일치. 최근7일 일치2개는 앞서 확인한 행사/굿즈 재게시. 4페이지에서8/31 직접 작성 Event Gravity Badge War 결과(SeoYeon, 이미지1) 확인: https://x.com/triplescosmos/status/2094273978714271806 . 직접 작성 미디어가 반환되는 것은 확인했지만 개인 사진 표본으로 간주하지 않는다.
- hampuppy806 응답에서 공식 작성8/13 게시물 https://x.com/triplescosmos/status/2087811644600496422 의 윤서연 태그+이미지2 메타데이터가 재게시 형태로 확인됐다. 이는 공식계정 자체 최근 목록에서 확인한 표본과 구분한다.

판정: 세 계정 모두 API 경로 실패가 아니다. 앞의2개는 향후 글 감시용 연결이 가능하지만 초기7일 데이터가0이어도 정상이며 과거 자료를 보이려면 별도 수집 범위 확대가 필요하다. 공식계정은 직접/재게시와 사진/행사 안내의 포함 정책을 정리한 뒤 연결하는 편이 맞다. 현재9소스 활성 상태 유지. 페이지 표본 조사이므로 계정 전체의 최근 글 부재를 확정하거나 이미지 속 인물의 육안 검증으로 표현하지 않는다.

공식 계정 해시태그 조사: 10페이지/200개 HTTP200, 이름일치13개(직접8/기타작성5), 그중 미디어11개, 정확한 윤서연 멤버 태그 일치1개. 실제 영상 태그 및 태그 없는 포토 비하인드 예외 발견. 태그만 필수인 규칙은 누락 위험, 본문 이름만 규칙은 행사/굿즈/투표 혼입 위험. docs/official-hashtag-analysis.md에 근거 URL과 미구현 제안 기록. 운영 변경 없음.

공식전용 official-v1 로컬 구현 및 실제200개 재조회 검증: 포함1/검토1/제외198, 기존 이름+미디어11개 중9개 안내/재게시 제외. 전체40테스트 통과. 운영 미배포·공식미활성. 상세 한계와 URL은 docs/official-hashtag-analysis.md의 실제 적용 결과 참조. 검토 대상 운영 저장함은 미구현이며 현재 결과는 검증 파일에만 보존된다.

## 공식 소스 운영 등록 — 2026-09-09

사용자 등록 승인 후 official-v1 필터와 공식 검토 메타데이터 보존을 배포했다. 총10소스, triplescosmos verifiedDirect=false.

- 0005_official_review.sql: 검토 테이블과 비활성 공식 행 추가. 첫 원격 요청7403 이후 계정권한 재확인, 동일 요청 재시도 성공. 기존 게시물 변경 없음.
- 검토 자료는 정규화된 post/reason/version으로 반환하고, scheduler에서 포함 자료와 동일한7일/고정경계 필터 후 commitPage의 lease/revision guard batch에서 official_review에 upsert한다. cursor와 원자적으로 저장되며 피드 posts에는 넣지 않는다. 운영 검토용 사용자 화면은 아직 없다.
- 검토저장 실패 시 cursor rollback, 재처리중복 없음, 공식 태그/공지/분류/9→10소스 순회 포함 전체42테스트 통과, dry-run/git diff --check 통과.
- 배포246edd00-9865-4e87-a167-367101e69d40 후 공식 행만 enabled1/revision증가/next_due현재 적용. last_success_at null, 검토0: 첫 Cron 미확인.
- Access 비로그인302 유지. 주기3분, 하루480슬롯 그대로. 10소스 정상순회 약30분/최신과거교대 중 최신약60분 목표. 초기7일 제한 유지. 이번에 과거8월 표본을 운영으로 복사하지 않았다.

## Pumpkin 소스 등록 — 2026-09-09
- 사용자 승인: Pumpkin030806 연결, hampuppy806 보류. 전용 직접 작성 예외 없음(verifiedDirect=false), 최근7일 정책 유지.
- 0006_pumpkin_source.sql로 비활성 등록 → Worker 배포 → Pumpkin 행만 활성화(changes=1) 완료.
- 배포 버전: f2f92c8c-e7b6-4811-8c0a-8c4375a3ed07. 기존 비공개 seoyeon-zip 대상.
- npm test 42/42 통과(11소스 순회 포함), Wrangler dry-run 통과, 비로그인 /api/feed HTTP302 확인.
- 원격11행 enabled=1. Pumpkin last_success_at=null / last_error_code=null: 활성화 확인이며 첫 자동 수집 성공은 미확인. 공식 역시 첫 성공 미확인. 기존9개는 last_success_at 존재/오류없음.
- 3분당1소스(일480슬롯) 유지: 전체약33분, 초기 최신/과거 교대시 최신약66분. 재시도 등으로 더 길어질 수 있음.

## 수집 상태 화면 — 2026-09-09
- 기존 대화창에서 첫 수집 대기/성공/재시도/확인 필요/전역 또는 소스 중지를 구분. 마지막 성공 시각, 마지막 성공 페이지 응답/조건 통과/공식 검토 보류 건수 표시. 통과 건수는 중복 포함이며 신규 게시물 수가 아님.
- 0007_source_outcome.sql nullable 3필드 추가. 건수 UPDATE는 기존 guard/게시물/커서 batch 안에 있어 실패 시 함께 rollback. 조회 실패는 이전 성공 건수를 보존. /api/sources는 DB와 환경 전역 스위치를 모두 반영.
- 상태 새로고침은 GET만 실행. 조회 실패 시 이전 결과 유지, 로컬 저장본 표시. 기존 과거 성공의 상세 건수는 null이며 다음 성공부터 기록.
- npm test 43/43, dry-run 통과. Playwright 390/1440px 대화창 넘침 없음; 성공0건/공식보류/429/첫대기/중지 fixture 확인. 조회 실패 보존 및 Escape/포커스 복귀 확인. fixture는 실제 수집 실적이 아님.
- 0007 원격 적용 후 비공개 배포 bd115b01-65c0-49f6-9bab-029e83afc79d. 실제 로그인 화면 11행 및 상태 새로고침 성공 확인, 비로그인 /api/sources 302. 배포 직후 Pumpkin 첫 성공은 아직 대기. 새 건수 필드의 실제 Cron 저장은 아직 미확인.
- 화면: .local/source-status-live.png (실제 운영), .local/source-status-390.png 및 -1440.png (상태별 fixture).

## 날짜 제한 해제 — 2026-09-10

- 변경 전 원격 posts 83개, 가장 오래된 작성일 2026-09-02T14:29:12Z. 11개 활성, 2개 gap, 나머지 running 확인. 공급자 전체 이력 완전성과는 별개다.
- 최초/최신 7일 하한을 해제하고 기존 20페이지 상한을 유지했다. 0008은 데이터 보존, 탐색 재시작, 이전 lease 차단, 중지/백오프 보존을 수행한다. 코드 배포 후 적용한다.
- Node 테스트 45/45 통과. 과거 글 latest/history 저장, 중복 방지, 공식 검토 분리, reset 후 stale writer 거절, 재시도/중지 보존 포함.
- 일반 권한 dry-run은 로그/상위 디렉터리 접근 제한으로 실패. 확장 권한 빌드 및 원격 적용 결과는 후속 기록한다.
- 확장 권한 dry-run 통과(60.72 KiB / gzip 17.25 KiB). 로컬 workerd/D1에서 2000년 게시물 21개 저장·중복 재생·SQL rollback·중지 중 응답 거절·429/401·HTTP 봉인 통과.
- GitHub main=9a616376175f2060ac865ce74d2dfecedb18972a로 로컬과 일치, 보호 브랜치 아님. 기존 Workers Builds 체크 성공 확인. 원격 미적용 마이그레이션은 0008 한 개다.
- 코드 리뷰: Critical/Major 없음(APPROVED, 읽기 전용).
- GitHub b1f6bb1 자동 배포 성공(2026-09-09 23:57:49 UTC), 활성 버전 a50e425d-d345-4924-a87e-9ddc21438792 100%. 이후 0008 원격 적용 성공. 적용 직후 83개 보존, 11소스 boundary0/pages0/latest/활성 확인. 비로그인 /api/sources 302 유지, 배포 COLLECTION_ENABLED=true 및 */3 Cron 확인.
- 2026-09-10 00:03:52 UTC(09:03:52 KST) 실제 Cron: Or1gin030806 latest, 응답20/upsert20, 오류null, history 1페이지 진행. 전체83→87, 기존 최저 게시일보다 오래된 글4개 저장. 최저 게시일2026-08-29T13:26:31Z. upsert20을 신규20개로 해석하지 않는다.
- runs의 page_commit 비용 rows_read176 / rows_written105. lease·시간 조회·관측 로그는 제외. 해당 Cron의 CPU 표본은 확보하지 못했다(짧은 tail 창에서는 fetch만 관측). 나머지 소스/전체20페이지 완료와 장기 비용은 아직 미확인이다. 기존 교대 수집을 계속한다.
# 인스타 개인 검토함 — 2026-09-10

- 로컬: 전체 47개 Node 테스트 통과. 미인증 화면/API 차단, 재가져오기 판단 보존, revision 충돌 409, 교차 출처 쓰기 403, 잘못된 입력 400, 기존 posts 미변경 확인.
- 브라우저: `node scripts/check-instagram.mjs`로 실제 라우터/SQLite를 사용하여 JSON 가져오기, 본문 스크립트 문자열 비실행, 보관·보류·재접속 상태 보존, 빈 상태, 1440/390px 가로 넘침 없음을 확인. 로컬 harness는 Access 인증 검증의 대체가 아니다.
- `wrangler deploy --dry-run` 통과. 새 의존성 없음. 별도 읽기 전용 코드 리뷰에서 Critical/Major 없음.
- 검토 결과는 별도 테이블에 저장하며 피드에는 반영하지 않는다. 이미지 중복은 자동 확정하지 않고 X 출처 표기 등 문맥만 안내한다. Instagram CDN 이미지 만료/차단은 원문 링크로 처리한다.
- 원격 배포 및 소유자 실사용 확인은 아래 후속 기록으로 구분한다.

## 인스타 검토함 원격 확인 — 2026-09-10 01:20 UTC
- 0009 마이그레이션 적용 성공. GitHub main 32921ea 자동 빌드 성공, Worker 177f7138-9258-456e-90ac-63af287ec579에 100% 배포 확인.
- 소유자 세션에서 화면/API 정상. 기존 실제 Apify 결과 60행 가져오기 후 58개 고유 게시물과 사진 표시 확인. 보류 저장 후 목록 변경, 판단 취소로 미검토 58개 복원 확인.
- 인증 없는 /admin/instagram 및 /api/admin/instagram 요청은 모두 302 Access 로그인으로 이동. 정적 자산의 canonical URL 처리로 /admin/instagram 진입 시 /instagram으로 이동하며, 두 경로 모두 같은 소유자 인증을 거친다.
- 원본 JSON과 수집 게시물·사진 URL은 GitHub에 추가하지 않았다. 자동 동기화 없이 결과 가져오기 방식이다.


## X 품질 로컬 및 DB — 2026-09-10
- 전체 52개 테스트 통과. stale merge/unmerge 409와 원자성, 숨김·고유 사진 유지, 일시 오류 상태 보존 확인. 별도 리뷰 Critical/Major 없음.
- 실제 데이터 브라우저 harness: 사용자 셀카 4글→1글, 안내 3예시 및 원문 확인 불가 예시 숨김, 판단 저장, 1440/390px 넘침 없음. dry-run 148KiB 통과.
- 원격 0010 및 사진 314장 지문/검토 사유 적용 성공. 두 셀카는 직접 8장 비교 후 수동 묶음 적용. 원본 데이터 삭제 없음.
- 원본 SHA 동일 파일만 자동 확정. dHash 유사 후보는 수동 비교. 텍스트 규칙은 얼굴 판별이 아님. 원문은 provider의 명시적 NOT_FOUND를 확인하며 일시 오류는 보존.
- 유지관리 별도 3분 예약(사진1장/원문1글). CPU 상한 100→1000ms: 로컬 한 장 약484ms. 원격 CPU/자동 배포는 후속 확인.

### X 품질 비공개 배포 확인
- GitHub 878a421 자동 빌드 Success, Worker fb32050e-dd50-4c20-9330-c52e375046e8 트래픽100% 확인.
- 원격 조회 당시 원본260개/피드250개, 지문314장. 제공한 4중복 글 중 대표1개만 노출, 안내3개와 원문 확인 불가 예시 미노출.
- 소유자 /admin/x 실제 화면과 저장 성공. 원문 확인 불가 글 숨김→자동 복원 테스트 후 decision auto, revision2 확인. 비인증 /admin/x 및 /api/admin/x 모두 Access302.
- 새 Cron의 첫 실행 및 원격 이미지 CPU는 아직 관측하지 못함. 전체 원문 검사는 순차 진행하며 즉시 완료를 의미하지 않음.

- 첫 유지관리 Cron(02:10 UTC)은 실행됐으나 외부 조회 실패를 재시도로 기록. 기존 provider와 달리 redirect:error를 사용한 호환성 문제를 발견해 manual 모드로 통일하고 3xx를 실패 처리. 회귀 테스트 추가. 성공적인 원격 이미지 처리 CPU는 후속 확인 필요.

- 0610011 자동 빌드 Success 확인. 수정 후 02:13 UTC 유지관리에서 지문314→315장, 원문 available1건 신규 저장 확인. 첫 실패 건은 재시도 대기 유지. 정상 이미지 처리 Cron의 CPU 표본은 확보하지 못했으며 상한1000ms에서 DB 저장 성공만 확인했다. 전체52 테스트 이후 리다이렉트 회귀 포함 X 관련6개 테스트와 dry-run 통과.

## 검토함 아이콘 — 2026-09-10
피드 상단 검토함을 체크 문서 SVG로 교체하고 마지막 순서로 이동. 기존44px 아이콘 스타일 재사용, aria-label 및 hover/focus 설명 유지. Chromium 1440/390px에서 마지막 위치·44px·키보드 설명·가로 넘침 없음 확인.

## 검토함 상호 이동 — 2026-09-10
X·인스타 상단에 같은 X→인스타 아이콘 메뉴를 배치. aria-label/current 및 44px 클릭 영역·툴팁·포커스 유지. Chromium 1440/390/320px 양방향 클릭과 현재 페이지·가로 넘침 없음 통과. 별도 코드·320/1440px 시각 리뷰 APPROVED, Critical/Major 없음. 검토 판단 JS/API 변경 없음.

## X 검토함 분류 탭 — 2026-09-10
검토 필요(기본)·표시 중·숨김·전체 및 건수 표시. 수동 미판단+안내/원문 확인 불가/유사 후보만 검토 필요로 분류. 전체 분류 뒤 페이지 처리, 마지막 항목 제거 시 페이지 보정. 54개 테스트 및 실데이터 Chromium 저장→숨김탭/전체2페이지/탭전환 초기화 통과. 1440/390px 확인. 별도 리뷰 APPROVED.

## 검토함 문구·빈 상태 정리 — 2026-09-10
승인한 6개 방향 적용: 제목 아래 반복 설명 제거, X 검토 기준 details로 이동, 상태별 빈 안내, 중앙 가져오기 제거, 25건 이하 페이지 이동 숨김, 제목·빈 상태 여백 축소. 제목·분류·이동 아이콘 유지, 인스타 비공개 안내 유지. 기존 두 브라우저 harness 통과. 1440/390/320px 각 검토함 빈 상태·도움말·중복 버튼 없음·페이지 이동 숨김·넘침 없음 확인.

## 검토함 하단 통일 — 2026-09-10
두 검토함 모두 왼쪽 피드로 돌아가기, 오른쪽 소유자 전용으로 마크업과 정렬 통일. 1440/390/320px에서 링크 href /, 좌우 순서·같은 행·넘침 없음 확인.

## 검토함 동작 아이콘 — 2026-09-10
새로고침과 피드 복귀를 두 화면 동일 SVG 아이콘으로 변경. aria-label, 44px 영역, hover/키보드 tooltip 유지. 기존 두 검토함 브라우저 harness 및 1440/390/320px 아이콘·새로고침·복귀 href 검사 통과.

## 사진 넘김·유사 게시물 비교 — 2026-09-10
- 공통 사진 뷰어: 원형 앞/뒤, 순서, 고정높이 contain, 스와이프, 확대 dialog. 한 장은 화살표 숨김.
- X 현재 사진과 후보를 나란히 표시, 작성자/게시일/피드 상태/원문 링크. 후보 있는 사진부터 열기. 묶기·다른사진·검토중인글숨기기 직접 처리. 다른사진은 정렬된 URL쌍과 groupRevision 트랜잭션으로 저장.
- Instagram childPosts/images 중 허용 CDN만 저장. 재가져오기 판단 보존 및 요약만 재수입시 기존 추가사진 보존. 기존 데이터는 첫사진만 있어 전체사진 포함 재가져오기 필요. 기존 Apify dataset API는403으로 추가사진 보충 미완료. 새 수집/과금 실행 없음.
- 전체56테스트 통과, dry-run 통과. 두 기존 UI harness와 새 비교 harness(두번째사진 초기선택/후보메타/후보넘김/확대/스와이프/다른사진영구제외/묶기/현재글숨김) 통과. 1440/390/320px 넘침없음. 별도리뷰 지적2개 수정후 APPROVED.

## 메인 피드 사진 넘김 — 2026-09-10
- 원형 44px 이전/다음, 순서 표시, 스와이프, 고정 비율, 확대 및 별도 원문 링크 적용. 더 보기 후 사진 순서 보존.
- pbs 사진은 small 미리보기, 확대 시 원래 URL. 화면 밖 600px 이상 떨어진 카드의 src 해제, 재렌더 시 observer 해제.
- 전체 56 테스트, 기존 검토함 두 브라우저 검사, 새 feed paging 검사 및 Wrangler dry-run 통과. 별도 코드 리뷰 Critical/Major 없음.
- 실제 이미지 Chromium 390px: 카드48/96에서 활성 이미지6/3/6개, GC 후 JS heap1.43/2.30/2.31MiB. 가로 넘침 없음. 1440px 화면도 확인.
- 이는 JS heap과 src 수 측정이며 전체 브라우저/GPU 메모리 또는 실제 휴대폰 검증은 아님. 목록 DOM은 더 보기에 따라 증가하고 브라우저 캐시는 즉시 해제 보장 안 됨.
- 자동 배포 및 운영 확인은 아래 후속 결과에 기록.

## 피드 화살표 크기·정렬 — 2026-09-10
원형 버튼44→30px, 글자 대신 CSS 선 아이콘과 flex 중앙 정렬. 피드 넘김 브라우저 검사 통과, 실제 이미지390px 화면 확인. 기존 검토함 스타일 유지.

## 검토함 화살표 통일 — 2026-09-10
X·인스타·유사 사진 비교에 피드와 같은30px 원형 및 CSS 선 아이콘 중앙 정렬 적용. 모바일40px 덮어쓰기 제거. 인스타·사진 비교 브라우저 검사 통과.

## 인스타 피드 연결 — 2026-09-10
- kept만 표시, 상태 변경 즉시 제외, 혼합 정렬/shortcode cursor, 정확한 중복 제거 및 X 대표 출처 연결 SQL 테스트 통과.
- 전체58개 테스트 통과 후 유지관리 Instagram SHA/외부호스트 차단/리다이렉트 거부 테스트 추가 통과(총59개). 기존 검토함·사진 비교·피드 넘김 브라우저 검사 및 dry-run 통과.
- 실제 API·SQL을 이용한 가져오기→피드에 표시→Instagram 필터 카드→두번째 사진 흐름 통과. 운영은 별도 확인.
- 원격 현재58개 중 kept15/held5/excluded38, 여러 장 저장0개. 기존 여러 장 보충 미완료. Instagram CDN URL 만료 시 재가져오기 필요하며 영구 이미지 보관은 구현 범위에 없음.
- 자동 중복 확인은 SHA 동일 파일만 대상. 재압축·크롭 사진 중복은 수동 검토 필요. SHA 처리는 예약당1장이고 아직 검사 전인 사진은 표시될 수 있음.

## 관리 기능 — 2026-09-10
62개 테스트 통과. source 중지 후 stale writer 거부, revision 충돌, 전체수집 중지 우회 방지, URL 정규화·중복·호스트검증, export 필드 제한/인증 확인. 로컬 실제 API·SQL browser에서 source 중지/재개→링크 등록→피드 카드→JSON 다운로드 확인. 390px 가로 넘침 없음. 원격은 후속 확인.

## 2026-09-10 관리 모달 UI 검증
- check-management: 소스 중지/재개, 조작 후 포커스, 화살표 탭 이동, 링크 등록, JSON 다운로드, Escape 닫기 통과.
- 390x850 및 1280x800 캡처 확인. 모바일 가로 넘침 없음, 본문 스크롤과 별도로 헤더 유지.
- Impeccable detector: 헤더 하단 여백 경고 1건. 탭 선택 밑줄을 구분선에 맞춘 의도적 배치로 유지.
- 운영 배포 결과는 코드 푸시 후 별도로 확인.

## 인스타 결과 자동 연결 — 2026-09-10
- 운영 후속: 09b8cfd 자동 배포 성공. APIFY_TOKEN 등록 후 2026-09-10 07:07 UTC 첫 자동 가져오기 성공, 40행 중 10행 checkpoint 저장 및 오류 없음 확인.
- 전체 Node 테스트 72개 통과. 중복/기존 판단 보존, checkpoint 실패 롤백, lease 충돌, 오류 재시도, 실패 실행 이후 정상 실행 처리, 비공개 상태 API 확인.
- 로컬 workerd에서 실제 scheduled 분기와 D1을 사용하여 12행을 10+2행으로 가져옴. 모두 pending, 최종 checkpoint 완료. Apify 응답은 모의 데이터이며 실제 인증 API 검증을 뜻하지 않음.
- 최종 Wrangler dry-run 통과: 170.64 KiB / gzip 41.96 KiB. 독립 코드 리뷰 APPROVED(Critical/Major 없음).
- 0015를 원격 D1에 직접 적용 완료(3 queries). 기존 migration ledger와 직접 적용 이력의 차이 때문에 전체 migrations apply 대신 신규 파일만 적용. 기존 게시물 수정 없음.
- Worker Secret 목록에 APIFY_TOKEN이 없어 실제 자동 가져오기는 설정 대기. 인증 키 등록 후 운영 결과 확인 필요. 기존 Apify 유료 실행 예약과 비용 제한은 변경하지 않음.

## 수집 상태 표기 구분 — 2026-09-10
- 과거 범위 미확인 코드를 실제 오류와 구분하여 최신 수집 정상/과거 수집 범위 미확인으로 표시. 실제 연결 오류와 needs_attention 경고 유지. 상태 새로고침 시 해소된 상단 수집 경고 제거.
- 기존 관리 모달 브라우저 검사 통과. 추가 로컬 fixture에서 history_window_unverified → HTTP 429 → 과거 범위 미확인 전환 및 상단 경고 생성/제거 확인. 모바일 가로 넘침과 페이지 오류 없음. 수집 로직/DB 변경 없음.

## WEV86_ 등록 검증 — 2026-09-10
- 공개 API 표본20게시물/23영상 모두 기존 이름 기반 조건 통과. 동일 게시물 ID/미리보기 URL 기존 중복0. 직접 촬영 여부와 영상 내용 중복은 미확정.
- 12소스 등록/순회 포함 전체72테스트 및 Wrangler dry-run 통과. 0016 내용 원격 적용 후 enabled=0 확인. 코드 배포 후 활성화하며 최초 Cron 저장은 별도 운영 확인 대상.

## 인스타 5분 주기 보정 — 2026-09-10
성공/빈 조회의 다음 허용 시각을 완료+300초에서 다음 cron 경계(매시 2,7,12분 등)로 변경. 오류 backoff/lease/checkpoint 유지. 재현 테스트 수정 전 idle 실패, 수정 후 잔여 페이지 완료와 빈 조회 재확인 통과. 전체73테스트 및 dry-run 통과. 운영 연속5분 간격은 배포 후 확인 대상.

## 다양성 보강 계정 검증 — 2026-09-10
전체74테스트 및 dry-run 통과. 과거 보충 source의 cursor 진행, 페이지끝/20페이지 종료, 저장 보존 및 이후 조회 중지 테스트 확인. 0017 내용 원격 비활성 등록 확인. 배포 확인 후 세 계정 활성화 예정이며 첫 Cron 저장은 별도 확인 대상.

## 게시일 필터 검증 — 2026-09-10
전체75테스트 통과. 한국시간 자정 양쪽 경계, 잘못된 날짜/윤년, 날짜해제, cursor 필터 변경 거부 확인. 마지막 cursor 사례 추가 후 feed 테스트 재통과. 실제 로컬 API/SQL 브라우저에서 피드·X·인스타 3화면 × 320/390/1280px 날짜선택/해제/피드 URL복원 통과. 모바일 캡처 확인 및 dry-run 통과. DB 변경 없음.

## 아이스바 파비콘 — 2026-09-10
승인된 사선 아이스바(막대 남서 방향)를 투명 PNG 16/32px 및 ICO로 적용. 실제 alpha 채널 확인, PNG 각각554/1142bytes. 4개 HTML 링크/파일 존재와 밝은·어두운 배경 미리보기 확인. Wrangler dry-run 통과. 기존 Access 보호 유지.

## 검토함 버튼 크기 통일 — 2026-09-11
- Chrome 계산 스타일: 비교/숨기기 등 6개 버튼 모두 글자 14px, 높이 44px, 여백 8px 13px, 최소 너비 76px 확인.
- 기존 check-photo-comparison.mjs 통과: 사진/후보 이동, 확대, 다른 사진 저장, 묶기, 숨기기와 1440/390/320px 가로 넘침 없음.
- Impeccable CSS 검사 지적 없음, git diff --check 통과. 운영 자동 배포는 후속 확인.

## 유사 사진 비교 정보 배치 보정 — 2026-09-11
- 기존 버튼 크기 수정만으로는 현재 글 정보가 별도 아래 행에 남고 계정명 24px/12px 차이가 있어 사용자 문제를 해결하지 못했음.
- Chrome 회귀 검증에서 기존 코드의 24px/12px 불일치 실패를 재현한 뒤 수정.
- check-photo-comparison.mjs 통과: 1440/390/320px에서 양쪽 정보 시작 높이 동일, 넘김 컨트롤 아래 12px, 계정명 크기 동일, 버튼이 본문보다 위, 가로 넘침 없음. 후보 없는 사진 이동 시 본문이 카드 직계로 복귀하고 기존 24px 계정명 복원.
- 사진/후보 이동, 확대, 다른 사진 저장, 묶기, 숨기기 통과. 데스크톱/모바일 캡처 확인. CSS 검사 지적 없음. 운영 자동 배포는 후속 확인.

## 유사 게시물 직접 숨기기 — 2026-09-11
- x-quality 테스트 9개 통과. 후보의 revision 전달 누락을 실패로 재현한 뒤 수정. 후보가 필터 밖에 있어도 정확한 ID/수정 번호로 숨기며 stale 쓰기는 409, 현재 글 판단은 보존됨.
- Chrome check-photo-comparison 통과: 현재 선택된 후보 숨기기→버튼 비활성→왼쪽 피드 표시 허용→현재 글 피드 노출 및 후보 제외 확인. 기존 사진/후보 이동·묶기·다른 사진·확대와 1440/390/320px 레이아웃 검증 유지.
- 모바일 캡처에서 '이 글 숨기기' 확인. diff 공백 검사 및 UI 검사 통과. 자동 배포는 후속 확인.

## X 수집 중복 페이지 교착 복구 — 2026-09-11
- 운영 WEV86_의 오래된 next_due_at과 반복 last_attempt_at, 02:36 KST 이후 다른 소스 성공 중단 확인.
- 현재 공급자 응답 19건에 같은 ID 2회(본문/미디어 동일, reposted_by만 다름). 로컬에서 UNIQUE constraint failed: media.post_id, media.position 재현.
- 3개 회귀 테스트의 실패 확인 후 수정. 전체 79개 통과. 후행 중복 항목도 URL 등 전부 검증, 마지막 적격 스냅샷의 본문/미디어 일치, 저장 오류 롤백과 원래 cursor/lease/backoff 및 다음 소스 진행 확인.
- 보관한 실제 응답 재처리: received19/stored18/media24, 저장 성공 후 cursor 전진. 원본 응답은 .local에만 보관, 커밋 제외.
- Wrangler dry-run 통과, 별도 코드 검토 Critical/Major 없음. 운영 복구는 배포 후 예약 실행으로 확인 예정.
- 운영 Cron 로그에서도 D1_ERROR: UNIQUE constraint failed: media.post_id, media.position 예외 확인. 로컬 재현과 운영 원인이 일치함.
- 운영 복구 1차: 5579b05 자동 배포 성공. 2026-09-11 09:30:13 KST Cron에서 WEV86_ received19/stored18 성공, 오류 없음, 다음 예약 09:35:13으로 이동. X 게시물 1699→1717. 기존 cursor 초기화·데이터 삭제 없음.
- 운영 복구 2차: 09:33:13 KST 다음 Cron에서 TRIPLES_FAN_FR received20/stored0 정상 처리. 후보 불일치 0건 저장도 성공 기록 갱신. WEV86_ 반복 선택에 의한 전체 순서 교착 해소 확인. 전체 15소스의 장기 안정성은 추가 관찰 대상.

## 방문자·관리자 기능 분리 — 2026-09-11

- 기준 커밋 5b005ae, 시작 시 전체 79개 테스트 통과. 서버 분리 커밋 86b7196.
- 서버/데이터 focused tests 18개 통과: JWT 서명·issuer/aud·소유자·만료·변조, 헤더 우선/쿠키 중복 거부, 비공개 기본/공개 허용 목록, 비공개 owner session, 공개 필드 투영, 변경 요청 차단, 숨김/보류/삭제 확인 글의 중복 출처 미노출.
- 실제 `wrangler dev --local` + 별도 로컬 D1에서 `scripts/check-public-runtime.mjs` 통과. 공개 조회 200, 관리 API·관리 HTML/별칭 401, 위조 JWT 403. 원격 바인딩/수집은 사용하지 않았다.
- 런타임 점검에서 Assets가 `/`와 `/feed.html`을 `/feed`로 307 이동시키는 것을 발견했다. 공개 허용 목록에 정확한 `/feed`를 추가하고 실패 테스트→통과 및 실제 이동 후200을 확인했다.
- 같은 사진 출처는 기존 SQL view가 이미 X eligible/Instagram kept 대상으로 제한한다. SQL·마이그레이션을 추가하지 않고 정상 공개 중복 출처 유지 및 숨김/보류/원문없음 제외를 회귀 테스트로 확인했다.
- 현재 원격 비로그인 요청의 Access302 유지 확인. 읽기 전용 Access apps 조회는 빈 목록을 반환해 실제 보호 애플리케이션의 세부 경로/쿠키 정책을 확인하지 못했다. 사용 가능한 인앱 브라우저에는 소유자 로그인 세션이 없다.
- 실제 공개 경로에서 소유자 인증 쿠키가 전달되는지, 공개 정책 적용 후 소유자 관리 화면까지 연결되는지는 미확인이다. 공개 전환 전 필수 검증으로 남긴다. 현재 공개 승인은 없으며 공개 플래그는 false를 유지한다.
- 전체 `node --test tests/*.test.mjs`: 92개 통과, 실패0. `scripts/check-public-admin.mjs`: 최초 관리자 UI 숨김, visitor/owner 역할, session503 시 피드 유지, 권한만료 후 강등·내부 상태 제거, 390/1280 화면 통과.
- `scripts/check-management.mjs`: 소스 중지/재개, 키보드 탭 이동, URL 등록 후 피드 연결, 메타데이터 다운로드, 모바일 넘침 없음·페이지 오류 없음 확인. 모두 로컬 fixture/DB에서 실행했다.
- 로그인 역할 전환 전 요청한 오래된 상태 응답이 최신 상태를 지우지 않도록 stale/auth 예외를 별도 처리했다. 수정 후 두 브라우저 검증 스크립트 재통과, 독립 범위 리뷰 승인.
- 최종 코드 리뷰: 검토 범위에서 Critical/Major 없음. Impeccable 기계 점검은 기존 관리 헤더 하단 경계 여백 경고1건; 모바일·데스크톱 실물 점검에서 내용 잘림/겹침이 없어 기존 탭 경계를 유지했다.
- `wrangler deploy --dry-run`: 177.27KiB / gzip43.50KiB, PUBLIC_FEED_ENABLED=false 확인. 원격 배포 전 빌드 검증이며 배포 성공 증거와 구분한다.
- 비공개 배포 완료: 코드 `8984db5`, GitHub Workers Builds success, 활성 버전 `d7158ed3-735b-4aa5-aae1-9a79e153b499` 100% (2026-09-11 01:23 UTC). 운영 설정에서 `PUBLIC_FEED_ENABLED=false`, `COLLECTION_ENABLED=true` 확인.
- 배포 후 `/`, `/api/session`, `/api/collection-status`, `/admin/x`, `/api/export`의 비로그인 요청 모두 기존 Access 로그인으로302 이동함을 확인했다. 실제 소유자 로그인 세션이 없어 배포 후 소유자 화면 직접 조작은 미확인이다. 로컬 소유자 JWT/쿠키·브라우저 검증 결과와 구별한다.
- 운영 소유자 화면 확인(사용자 직접 검증, 2026-09-11): 기존 Chrome 로그인 세션에서 `/admin` 접속 후 검토함과 수집 중지 버튼이 정상 표시됨을 사용자가 확인했다. 운영 관리자 역할 인식·화면 연결은 확인됐으며, 에이전트의 직접 브라우저 검증이나 실제 중지 조작 결과로 기록하지 않는다. 공개 정책 적용 후 인증 쿠키 전달 검증은 여전히 별도 항목이다.

## 공개 전 보안 보완 — 2026-09-11
- 기존 92개 테스트 통과 후 신규 회귀 테스트 4개가 수정 전 실패함을 확인했다. 수정 후 전체 96개 통과. 한도 초과 시 DB 접근 차단, limiter 장애 시 503, 공통 IP 버킷과 X-Forwarded-For 무시, invalid cursor의 DB 사전 차단을 확인했다.
- Wrangler dry-run 성공: PUBLIC_RATE_LIMITER 60 requests/60s 바인딩, PUBLIC_FEED_ENABLED=false. 운영 수집 설정·크론 변경 없음.
- 실제 로컬 Wrangler + 별도 D1에서 check-public-runtime.mjs 통과: 공개 조회, 정규 URL 리디렉션, 비로그인 관리자 경로·모든 관리 변경 차단, 위조 JWT 거부.
- check-public-limit-runtime.mjs 통과: 선행 공개 API 3회 후 57회 허용, 다음 요청 429. 공개 API 3종이 공통 제한을 사용하고 Retry-After:60 반환. 제한 중에도 정적 피드 200, 관리자 API 401 유지. 운영 트래픽에 부하 테스트를 실행하지 않았다.
- 독립 읽기 전용 코드 리뷰 APPROVED: 검토 범위 Critical/Major 없음. 리뷰어는 검증을 재실행하지 않았다.
- 운영 읽기 전용 확인: PUBLIC_FEED_ENABLED=false, COLLECTION_ENABLED=true. /, /api/session, /api/feed, /api/collection-status, /admin, /admin/x, /api/export 모두 비로그인 302 Access 로그인으로 이동.
- Access apps 조회는 성공 응답이지만 빈 목록이므로 관리형 보호의 세부 경로 정책을 확정할 수 없다. 보호가 없다는 뜻으로 해석하지 않는다. 기존 전체 Access 보호를 변경하지 않았고, 공개 전환 후 관리자 로그인 쿠키 전달은 미확인이다.
- Cloudflare 공식 rate-limit 문서 기준 이 제한은 위치별·비동기이며, 공유 IP 이용자는 합산된다. 전역 DDoS 차단 또는 비용 상한으로 보장하지 않는다. https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- 비공개 자동 배포 완료: 코드 5d9b664, GitHub Workers Builds success. 활성 버전 73f3b2ca-6e72-4377-a41d-56152dff18b7 100% (2026-09-11 01:51:28 UTC). 운영 PUBLIC_RATE_LIMITER(namespace 2026091101, 60회/60초) 등록과 PUBLIC_FEED_ENABLED=false를 확인했다. 배포 후 위 7개 경로 모두 Access 로그인 302 유지. 운영에서 익명 rate-limit 분기는 비공개 플래그 때문에 아직 활성화되지 않았으며, 실제 429 동작 증거는 로컬 런타임 검증이다.

## 공개 전환 준비 검증 — 2026-09-11
- 사용자 공개 전환 승인 후 기존 Access 앱을 브라우저에서 확인했다. 앱 ID 8197ec24-c513-40e2-a9ad-2be10fbe7249, 기존 운영자 me Allow 정책, 24시간 세션, HTTP Only=true, path cookie=false(호스트 범위)를 확인했다. 복원할 원래 Worker 전체 대상 설정은 .local/public-access-backup.json에 보관한다.
- Wrangler OAuth에는 Access 관리 권한이 없어 앱 개별 조회가 403이다. 이전 빈 앱 목록은 앱이 없다는 근거가 아니었으며, 브라우저에서는 기존 앱이 정상 조회됐다.
- 같은 Access 앱에 seoyeon-zip.seoyeon-archive.workers.dev/admin을 추가 저장했고 기존 Worker 전체 대상은 유지했다. AUD와 운영자 정책 변경 없음.
- PUBLIC_FEED_ENABLED=true 설정에 대해 전체 96개 테스트와 Wrangler dry-run 통과. 이 시점은 외부 공개 전이며 운영 Access 대상 전환 및 익명/운영자 검증 결과는 후속 기록한다.

## 공개 전환 완료 — 2026-09-11
- 코드 ae5f3d9 자동 배포 success, 활성 버전 7f80b93a-b54f-4f08-91ae-ae900764c4ce 100% (2026-09-11 02:04:28 UTC). PUBLIC_FEED_ENABLED=true, 요청 제한 60회/60초, 수집 enabled 및 기존 크론 유지.
- 기존 Access 앱에서 Worker 전체 대상을 제거하고 seoyeon-zip.seoyeon-archive.workers.dev/admin만 남긴 것을 Applications 목록에서 확인했다. 같은 앱 ID/AUD와 me Allow 정책을 유지한다. /admin 및 /admin/·/admin/x·/admin/instagram 비로그인 요청 모두 Access 로그인302.
- 운영 익명 HTTP 검증 통과: / 및 /feed.html은 공개 /feed로 정규화, /feed 200, /api/session visitor, /api/feed 200(48개 페이지/총1803개), /api/collection-status 200(15개, 공개 필드3개만). 관리 GET/API/정적 별칭 11종 401, 비로그인 관리 POST/PATCH 5종 401, 위조 JWT 403, 잘못된 cursor400. 빈 본문·존재하지 않는 테스트 소스 사용으로 운영 데이터 변경 없이 확인했다.
- 실제 운영자 브라우저: 기존 Cloudflare 로그인부터 /admin → 피드 진입을 확인했다. 공개 전환 후 피드 새로고침에서도 검토함 표시, 수집 및 관리 모달·자료 관리 탭·15개 수집 중지 버튼 표시 및 상세 현황 조회 성공. 이는 공개 경로에서 운영자 쿠키가 인식되고 인증된 관리 API가 응답한 실제 검증이다. 중지/숨기기 등 운영 변경 버튼은 누르지 않았다.
- 운영 /admin/x에서 검토 필요2·표시중1786·숨김25·전체1813 데이터를 조회했다. API 직접 탐색은 인앱 브라우저의 ERR_BLOCKED_BY_CLIENT로 열리지 않았으므로 역할 확인은 실제 피드/관리 화면의 성공으로 판단했다. 익명 화면의 분기는 이전 로컬 브라우저 fixture 검증이며, 이번 운영 익명 검증은 인증 없는 HTTP 요청이다.
- 공개 후 마지막 수집 성공 시각이 02:03:13 → 02:06:13 UTC로 전진했고 공개 현황은 15개 모두 ok였다. 장기간 오류 추세나 대규모 부하를 검증했다는 의미는 아니다.
- 독립 읽기 전용 리뷰 APPROVED: 공개 경로/메서드, JWT·쿠키 검증, 공개 데이터 투영 및 전환 설계에서 Critical/Major 없음. 96개 테스트와 dry-run 성공은 에이전트가 실행했고 리뷰어는 재실행하지 않았다.
- 복구 필요 시 기존 Access 앱의 Destinations에 seoyeon-zip Worker(전체 production and preview URLs)를 다시 추가해 전체 접근을 먼저 봉인한다. 이어 wrangler.jsonc의 PUBLIC_FEED_ENABLED=false를 커밋·배포한다. 기존 /admin 대상과 운영자 정책은 유지하며 데이터와 cursor는 되돌리지 않는다.

## 공개 피드 제목·주소 정리 — 2026-09-11
- validation/feed.html 제목에서 피드 시안을 제거하고 홈 링크를 /로 변경했다. feed.js는 확정 디자인을 고정하고 시안 선택 UI와 URL 매개변수 생성을 제거한다. 필터 없는 기본 주소에는 /feed와 불필요한 물음표가 남지 않도록 /로 정리하며 실제 필터·해시는 유지한다.
- node --check validation/feed.js 및 기존 scripts/check-public-admin.mjs 통과: 방문자/관리자 분리, 세션 실패와 만료, 모바일/데스크톱 넘침 없음. 운영 배포 후 제목·기존 시안 링크·필터 주소 확인은 후속 기록한다.
- 운영 반영 확인: 코드 15b5c47 Workers Builds success. 기존 /feed?layout=a&mood=zine&icons=phosphor&background=mist 주소를 실제 브라우저에서 새로고침하자 제목 서연모음.zip, 주소 https://seoyeon-zip.seoyeon-archive.workers.dev/ 로 정리됐다. 콘텐츠 종류 직찍 선택 시 /?kind=fansite, 모든 종류 복원 시 /를 확인했다.

## 로그인 아이콘 — 2026-09-11
- 기존 44px icon-button과 22px SVG를 재사용하고 관리자 로그인 aria-label 및 hover/focus 툴팁을 추가했다. 장식 SVG는 aria-hidden/focusable=false 처리했다.
- 기존 check-public-admin.mjs 통과: 방문자/관리자 분리, 세션 실패·만료, 390/1280 반응형. 생성된 방문자 화면에서 상단 아이콘 정렬을 육안 확인했다. 인증 코드·Access 정책은 변경하지 않았다.

- 코드 4c0811e Workers Builds success. 운영 HTML 200 및 로그인 링크의 icon-button·SVG·관리자 로그인 접근성 이름/툴팁·/admin 경로 확인.

## 사이트 안내·저작권 문의 — 2026-09-11
- 로컬 check-public-admin 통과: 320/390/1280px 안내 창 가로 넘침 없음, Esc/닫기 및 트리거 포커스 복귀, 게시물 원문 URL 메일 인코딩, 전역 안내 재진입 시 대상 초기화, 실제 브라우저 클립보드 복사.
- 기존 방문자/관리자 분리·세션 실패/만료·반응형 검사 통과. 모바일 스크린샷 확인. git diff --check 통과.
- 별도 읽기 전용 diff 검토 Critical/Major 없음. 이메일은 사용자가 공개를 승인한 주소이며 메일 실제 발송/수신은 수행하지 않았다.
- 자동 배포 및 운영 반영 확인은 아래 기록 또는 작업 최종 응답을 기준으로 한다.

## 안내 아이콘 수직 위치 — 2026-09-11
SVG만 6px 아래로 이동. check-public-admin 통과(320/390/1280px, 안내 창/포커스/문의 및 역할 분리). 모바일 캡처에서 .zip 옆 위치 확인. diff --check 통과. 배포 결과는 작업 최종 응답에 기록한다.

## 로고·안내 아이콘 하단 정렬 수정 — 2026-09-11
로컬 브라우저 canvas 글자 descent/기준선과 SVG 외곽 하단 비교: 기존 차이 320px 0.25px, 390px 2.25px, 1280px 9.75px. 수정 후 각각 0.19px/0px/0.20px(서브픽셀 반올림)로 일치. desktop/mobile 스크린샷 확인. check-public-admin 통과. 배포 반영 결과는 작업 최종 응답에 기록한다.

## 모바일 안내 아이콘 축소 — 2026-09-11
check-public-admin 통과(320/390/1280px 안내/문의/포커스 및 역할 분리). 390px 캡처에서 작아진 아이콘과 하단 위치 확인. diff --check 통과. 운영 반영은 작업 최종 응답에 기록한다.

## 공개 README 정리 — 2026-09-11
사용자가 검토·승인한 문구와 공개 방문자 PC(1280×960)/모바일(390×844) 캡처 반영. 캡처는 앞선 작성 단계에서 이미지 로딩 및 관리자 검토함 비노출 확인 후 시각 검토했다. README 내부 문서·이미지 링크 8개 존재 확인, diff --check 통과. 문서·이미지만 변경하여 앱 테스트는 재실행하지 않았다. 자동 배포 상태는 작업 최종 응답에 기록한다.

## README 화면 재캡처 — 2026-09-11
사용자 요청으로 현재 공개 피드의 PC 1280×960, 모바일 390×844 이미지를 다시 캡처했다. 비로그인 검토함 숨김과 이미지 로딩 완료를 확인하고 두 캡처를 시각 검토했다. README 문구·이미지 경로는 유지한다.

## myeongsim_ 계정 추가 준비 — 2026-09-11
공개 표본 2페이지40개 모두 현재 이름 필터 통과. 소스 설정/비활성 seed0018 및 16계정 순회 검사 갱신 후 npm test96/96 통과, Wrangler dry-run 통과. CLI D1 접근은7403으로 실패하여 로그인된 대시보드 콘솔로 마이그레이션 확인/등록 진행. 실제 운영 결과는 후속 기록 또는 최종 응답을 따른다.

myeongsim_ 운영 확인: 코드646dc21 Workers Builds 성공 후 대시보드 SQL 콘솔에서0018과 동일한 비활성 INSERT 적용, 해당 마이그레이션 이력1건 확인, 이 계정만 enabled=1/revision 증가. 2026-09-11T04:27:13Z 첫 예약 수집 성공. 공개 현황state=ok, 출처 필터 피드20건 확인. 코드 검토 Critical/Major 없음. CLI D1권한7403 및 이전0012~0017 마이그레이션 기록 미등재는 별도 기존 운영 이슈로 남기며, 이번에 무관한 마이그레이션 재실행/기록 변경은 하지 않았다.

## 피드 원문·문의 아이콘 — 2026-09-11
node --check validation/feed.js 및 기존 check-public-admin 통과. 로컬 브라우저의 사진/영상 표본으로 320/390/1280px 가로 넘침·안내/아이콘 겹침 없음, 두 버튼 44×44px, 키보드 툴팁·원문 링크 대상·문의 URL 전달·Esc 후 포커스 복귀 확인. 390/1280px 화면 시각 확인. Impeccable detector 결과 빈 배열, diff 점검에서 비밀값 추가 없음. 임시 검증 스크립트의 CRLF 분리/표본 정렬 선택 오류를 수정한 뒤 해당 검증 통과. 운영 자동 배포 결과는 작업 최종 응답에 기록한다.

## 피드 아이콘 밀도·정렬 보정 — 2026-09-11
CSS만 수정. 로컬 320/390/1280px 표본 검증에서 28×28px 버튼, 안내/아이콘 겹침과 페이지 넘침 없음, 툴팁·문의 URL·Esc 포커스 복귀 확인. 실제 공개 피드에 로컬 CSS를 적용한 390/1280px 브라우저에서 조작 행28px·SVG16px·작성자 상단 간격6px 및 넘침 없음 확인하고 캡처 시각 검토. Impeccable detector 빈 배열 및 diff --check 통과. 운영 배포 결과는 작업 최종 응답에 기록한다.

## 피드 아이콘 오른쪽 정렬 — 2026-09-11
실제 공개 피드에 로컬 CSS 적용 후 320/390/1280px에서 SVG path.getBBox/getScreenCTM으로 측정한 말풍선 오른쪽과 사진/분류 오른쪽 차이 모두 0.001px 미만. 가로 넘침 없음, 문의 창 열기·Esc 닫기 통과. PC 캡처 시각 확인, detector 빈 배열·diff --check 통과. 운영 배포 결과는 최종 응답에 기록한다.

## README 최신 아이콘 화면 갱신 — 2026-09-11
공개 사이트에서 PC1280×960·모바일390×844 캡처. 모든 피드 이미지 로딩 완료 및 비로그인 검토함 비노출 확인 후 JPEG 두 장 시각 검토. 최종 아이콘 크기·오른쪽 정렬 반영 확인. 이미지·기록만 변경하여 앱 테스트 생략. diff --check 통과.

## 상단 로그인·검토함 오른쪽 정렬 — 2026-09-11
방문자/관리자 × 320/390/1280px에서 SVG path 오른쪽+stroke를 화면 좌표로 변환한 결과 헤더 오른쪽과 차이0.001px 미만. 넘침 없음·44px 버튼·키보드 툴팁 확인, 화면 시각 검토. 기존 check-public-admin 전체 통과(역할 분리·세션 지연/실패/만료·문의). diff --check 통과. 배포 결과는 최종 응답에 기록한다.

## README 상단 정렬 화면 갱신 — 2026-09-11
공개 PC1280×960·모바일390×844 재캡처. 전체 피드 이미지 로딩 완료 및 관리자 검토함 비노출 확인 후 두 이미지 시각 검토. 상단 로그인 아이콘과 구분선 오른쪽 정렬 반영 확인. 이미지·기록만 변경했으며 diff --check 통과.

## UI 감사 지적 1·2 수정 — 2026-09-11
새 scripts/check-ui-audit.mjs로 기존 320px 방문자 상단 아이콘의 오클릭 실패를 재현한 뒤 수정했다. 방문자/관리자 피드 및 X/인스타 검토함의 320/390/768/1280px에서 실제 SVG 도형을 0.5px 간격으로 표본 추출해 hit target 일치·오른쪽 정렬·넘침 없음을 확인. 피드 아이콘도 포함. 사진 확대/가져오기 dialog 이름 및 Esc 후 포커스 복귀 통과. 기존 check-public-admin 전체와 node --check review-gallery.js, detector 빈 배열, diff --check 통과. 실제 공개 페이지에 로컬 CSS 적용 후 390/1280px 배치 확인. 최종 배포 결과는 최종 응답에 기록한다.

## 좁은 화면 검토함·가져오기 보완 — 2026-09-11
기존320px 검토함 탭의 가로 스크롤 실패를 재현 후 수정. check-ui-audit 통과: 320/390/768/1280px 아이콘 hit target/정렬, 각 탭2018개 표본에서 가로 스크롤 없음, 320px 닫기 텍스트 한 줄, 빈 JSON 오류 alert 표시 및 import POST0회, dialog 넘침 없음·Esc 포커스 복귀. detector 빈 배열, diff --check 통과. 운영 화면/빈 입력 제출 결과는 최종 응답 기준.

## 아이콘과 버튼 중심 일치 — 2026-09-11
회귀 검사에 SVG/버튼 중심 좌표 일치와 버튼의 화면 경계 포함 검사를 추가하여 기존 코드 실패를 재현. 수정 후320/390/768/1280px 방문자/관리자 피드·검토함 및 피드 버튼 검사 통과. 실제 도형 hit target, PC 오른쪽 끝 정렬, 모바일 소폭 안쪽 정렬, 기존 팝업·빈 JSON 오류/POST0·반응형 탭 검사 통과. check-public-admin 전체 통과, detector 빈 배열, diff --check 통과. 운영 결과는 최종 응답에 기록한다.

## 더 보기 포커스·JSON 오류 연결 — 2026-09-11
- 변경 전 회귀 검사에서 JSON aria-invalid 누락과 더 보기 완료 후 첫 새 게시물 포커스 부재를 각각 재현했다.
- 변경 후 node scripts/check-ui-audit.mjs 통과: 320/390/768/1280px 기존 UI 검사, 빈 JSON의 alert·입력 연결·포커스·편집 후 오류 해제 및 import POST 0건, 마지막 페이지 새 게시물 포커스와 다음 Tab 이동, 로딩 중 다른 제어로 이동한 포커스 유지.
- node scripts/check-public-admin.mjs 통과: 방문자/소유자 분리, 지연 세션·실패·만료 및 반응형 회귀.
- 변경분 읽기 전용 검토: Critical/Major 없음. git diff --check 통과.
- 실제 스크린리더 음성 청취는 미검증이며 사용자 요청으로 후속 작업에 남긴다. 이번 수정의 운영 확인은 배포 후 별도로 진행한다.
- 운영 확인 완료: e9deb6f Cloudflare Workers Builds completed/success. 실제 브라우저에서 더 보기 48→96개, 포커스 index 48(첫 새 게시물), 다음 Tab도 같은 카드 내부 확인. 도구 키 입력 응답은 타임아웃됐지만 재입력 없이 DOM 결과로 정상 완료를 확인했다.
- 운영 인스타 빈 JSON 제출: focus=json, aria-invalid=true, aria-describedby=import-error와 오류 문구 확인. 내용을 편집하면 오류·invalid가 해제됐다. 유효 데이터 제출은 하지 않았다.

## 사이트 안내 아이콘 하단 정렬 — 2026-09-11
- 안내 버튼의 SVG 절대 하단 배치를 제거하고 버튼 전체에 로고 크기별 하단 여백을 적용했다. SVG는 20px/모바일16px, 클릭 영역44px 중앙 정렬을 유지한다.
- 수정 CSS를 적용한 공개 피드 1280px/390px 캡처를 확인했다. 로고와 안내 아이콘 하단 정렬 및 가로 넘침 없음.
- node scripts/check-ui-audit.mjs 통과. 최초 공개 캡처는 네트워크 권한 제한으로 실패했으며 허용된 재실행에서 완료했다.

## 검토 결정 감사 로그 — 2026-09-11
- 계획 커밋 3c33250 후 codex/review-audit에서 구현. 현재 판정 상태와 append-only 이력을 분리하고 서버 인증 actor·UTC 시각을 저장한다.
- npm test: 139/139 통과. 실패 주입 롤백, X/Instagram 상태 변경, 그룹 전체 스냅샷, concurrent replay, revision/fingerprint 경합, 1,000자 한글 메모, 256KiB 제한, 후보 생성 근거, UPDATE/DELETE 차단, KST 날짜·키셋 페이지 검사 포함.
- node scripts/check-review-audit.mjs 통과: 이유 선택·취소·중복 클릭·동일 요청 재시도·409/503·필터·상세·XSS·이미지 실패·390/1280px.
- node scripts/check-photo-comparison.mjs / check-instagram.mjs 통과: 실제 로컬 SQLite/router에서 후보 숨김·표시·묶기·다른 사진 및 Instagram 승인/보류와 감사 이벤트 연결 확인.
- node scripts/check-public-admin.mjs 통과: 방문자/소유자 분리 및 세션 실패·만료 회귀.
- npx wrangler deploy --dry-run 통과. 약197.6KiB(압축48.8KiB) Worker 번들.
- 독립 Critical/Major 코드 검토에서 동시 replay와 selected/group snapshot 경쟁을 수정하고 회귀 테스트 추가 후 APPROVED. UI 요청·재시도·텍스트/링크 처리 검토도 APPROVED.
- 운영 DB는 0001~0011 및0018 이력 확인. 0012~0017은 이번 작업에서 재실행하지 않는다. 신규0019만 문장별로 적용하고 스키마 확인 후 이력 등록.
- 운영0019 적용 완료: 테이블2개·조회 인덱스3개·UPDATE/DELETE 차단 트리거2개·candidate_metadata_json 컬럼을 sqlite_master/pragma에서 확인하고 d1_migrations에 완료 기록. started_at=2026-09-11T07:25:10.277Z (한국시간16:25:10), 최초 이벤트0건.
- 구현 커밋7835156: GitHub 푸시 및 Cloudflare Workers Builds completed/success 확인. 실제 Chrome 관리자에서 검토 내역 빈 목록과 시작 시각 안내 정상. X 검토함의 내역 링크·이유/메모 입력창·취소 후 포커스 복귀 확인. 판단 저장은 누르지 않았다.
- 익명 GET /api/admin/review-audit, /review-history, /review-history.html, /review-history.js는401, 공개 /api/feed?limit=1은200.
- 실제 콘텐츠 판정의 운영 쓰기 검증은 첫 실제 관리자 판단 전까지 미확인. 테스트용 과거 이벤트나 콘텐츠 변경은 생성하지 않았다.

## 검토 내역 UI 정리 — 2026-09-11
- node scripts/check-review-audit.mjs 통과: 기존 판단·이유·재시도·내역 필터/상세 동작 유지.
- 로컬 모의 API에서 X/Instagram/검토 내역 320·390·768·1280px 검사 통과. 헤더 아이콘 SVG·접근성 이름·44px 너비·화면 경계, 필터 잘림 및 가로 넘침 없음. PC/모바일 캡처 확인.
- PC 필터36px 높이, 모바일44px 높이/두 열. 안내문은 고정70ch 제한을 제거하고 한글 단어 단위 자동 줄바꿈 적용. 서버·DB 변경 없음. 운영 배포 확인은 최종 응답에 기록한다.

## 검토 내역 포커스·태블릿 터치 보완 — 2026-09-11
- 이전 감사에서 지연 응답 후 날짜 입력 포커스가 새 상세 버튼으로 이동함과768px 터치 필터36px을 재현했다.
- 더 보기의 로딩 상태를 aria-disabled로 표시하고 기존 loading 가드로 중복 실행을 차단한다. 응답 시 버튼에 포커스가 남아 있을 때만 새 항목으로 이동한다.
- any-pointer:coarse 조건에 필터44px 최소 높이를 적용했다.
- node scripts/check-review-audit.mjs 통과: 지연 중 날짜 입력 포커스 유지, 키보드 Enter 후 마지막 페이지 첫 새 항목 포커스,768px 터치 필터44px, 기존 판정/재시도/필터/상세/390·1280px 회귀. 서버·DB 변경 없음. 운영 배포 결과는 최종 응답에 기록한다.
