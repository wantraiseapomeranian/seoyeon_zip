# 서연모음.zip — 단계 0 실측 기록

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
