# 윤서연 미디어 피드 V1 — 구현 인계 설계서

작성일: 2026-09-09
상태: 구현을 위한 제안 기준안. 사용자가 확정한 요구와 설계자의 기본값을 구분한다. 실제 구현·배포·수집 성공 검증은 아직 수행하지 않았다.

## 1. 목적과 범위

tripleS 윤서연 사진과 영상이 올라오는 여러 출처를 하나의 개인용 피드에서 확인한다. 사진/영상 미리보기와 출처를 보여주고 누르면 원문 게시물로 이동한다.

### 사용자 요구로 확정된 것

- 개인 1인 사용, 무료 운영 우선.
- COSMO 콘텐츠를 재게시하는 팬계정과 직찍·직캠 계정을 포함.
- 이미지·영상 원본 파일은 우리 저장소에 저장하지 않는다.
- 불필요하게 화면과 수집기를 별도 서버로 분리하지 않는다.
- 구상과 인계는 Work에서, 실제 코딩과 실행은 Codex 앱에서 한다.
- 아래 기존 후보군을 활용한다. 계정 탐색부터 다시 시작하지 않는다.

### 이 설계의 기본값 — 사용자 승인 사실이 아닌 구현 제안

- Cloudflare Workers Static Assets + API + Cron, D1 메타데이터 저장을 기본 배포안으로 선택.
- React + Vite + TypeScript, Tailwind CSS. 서버는 작은 TypeScript 모듈과 Workers fetch/scheduled 핸들러. SSR과 별도 Python 서버는 도입하지 않는다.
- 약 30분 갱신, 초기 최대 7일 수집. 실시간 알림과 전체 과거 백필은 제외.
- 개인 접근 제한, 모바일 우선 갤러리, 영상은 썸네일에서 원문으로 이동.
- 보관할 게시물 메타데이터는 우선 기간 제한 없음. 소스 응답 전체와 미디어 바이너리는 보관하지 않는다.

설계를 마쳤다는 것은 무료 수집의 가용성이 입증됐다는 뜻이 아니다. 아래 단계 0의 실행 검증이 운영 출시 조건이다.

## 2. V1 기능과 제외 기능

| V1에 포함 | 후속 버전으로 미룸 |
|---|---|
| 최신순 사진·영상 피드 | 앱 안에서 영상 재생, 원본 다운로드 |
| 사진/영상, COSMO/직찍/기타, 출처 필터 | 얼굴 인식·LLM 분류 |
| 한 글의 여러 사진 개수와 첫 미리보기 | 다른 계정의 동일 사진 자동 병합 |
| 원문 링크, 출처 계정, 게시 시각 | 전체 과거 데이터 백필 |
| 정기 수집, 출처 활성/중지, 오류 상태 | 인스타 자동 수집, COSMO 직접 접근 |
| 마지막 갱신, 미리보기 실패 대체 카드 | 해시태그 자동 탐색·새 계정 자동 등록 |
| 설정에서 본문·원문 메타데이터 JSON 내보내기 | 즐겨찾기·읽음 동기화·알림·다중 사용자 |

인스타도 원래 목표에 포함되지만 V1 자동 연결 범위에는 넣지 않는다. 특정 인스타 URL을 수동 등록하고 원문 링크 카드로 보여주는 기능은 작은 보조 기능으로 포함한다. 자동 미리보기를 보장하지 않으며 이것으로 인스타 자동 수집이 완료됐다고 표시하지 않는다.

## 3. 출처 목록과 신뢰 상태

기존 대화의 최신 활동 날짜·팔로워 수는 확정 사실로 가져오지 않는다. 일부 증거 링크가 다른 사람의 재게시 타임라인이므로 직접 게시물 확인이 필요하다. 역할은 기존 조사에 따른 가설이다.

| 플랫폼 | handle | 의도한 역할 | 기본 상태 |
|---|---|---|---|
| X | gapyeonghaus | COSMO 등 tripleS 종합 미러 | 검증 후 활성 후보 |
| X | tripleSnewsfeed | 종합 업데이트·누락 보완 | 검증 후 활성 후보 |
| X | TRIPLES_FAN_FR | 종합 팬베이스·COSMO 보완 | 검증 후 활성 후보 |
| X | Seowoo_0501 | 윤서연 직찍·영상 | 검증 후 활성 후보 |
| X | Or1gin030806 | 윤서연 직찍·영상 | 검증 후 활성 후보 |
| X | First0806_ | 윤서연 직찍·영상 | 검증 후 활성 후보 |
| X | triplescosmos | 공식 게시물 | 후보, 초기 비활성 |
| X | sogeumdwarf, hamhamm806, S2O806, Pumpkin030806, hampuppy806 | 추가 팬계정 | 후보, 초기 비활성 |
| Instagram | triples_house, chelsea_dinos_sss, ptzzz_4eva | 인스타 보강 | 자동 수집 비활성 |
| Archive | rachive.page | 과거 미디어 참고 | 비활성, 최신 범위 미검증 |

S2O806은 기존 목록의 중복을 제거했다. source priority는 조회 순서/운영 참고값이며 콘텐츠 동일성을 판단하는 값으로 쓰지 않는다. 계정을 추가할 때는 config 파일과 seed 동기화로 관리한다. V1 설정 UI는 기존 소스 활성/중지만 지원한다.

## 4. 아키텍처 결정

하나의 git 저장소와 하나의 Worker 배포에 정적 화면, /api 경로, 예약 실행 핸들러를 둔다. D1은 Worker binding으로 연결하는 관리형 저장소다. DB 서버 프로세스나 Railway 서비스는 운영하지 않는다.

브라우저 → 동일 앱의 /api/feed → D1에서 게시물 목록 조회.
예약 핸들러 → 외부 수집 제공자 → 정규화/필터링 → D1 갱신.
브라우저 → 출처 CDN의 미리보기 URL. 클릭 → 플랫폼 원문.

화면 조회가 직접 수집을 실행하지 않게 한다. 갱신 버튼은 저장된 최신 목록을 다시 읽는 버튼이다. 수집 재시도는 설정 화면에서 소스별 요청으로 분리한다.

### 이 기본안을 선택하는 이유

- 정적 화면과 API를 함께 배포할 수 있고, 작은 예약 작업과 저장소를 같은 플랫폼에서 운영할 수 있다.
- 원본 미디어 저장·변환·중계가 없으므로 R2/Blob이나 미디어 서버가 필요하지 않다.
- 필터·페이지 조회·수집 체크포인트에는 JSON 전체 덮어쓰기보다 D1이 다루기 쉽다.
- 개인 피드는 SEO/SSR 필요성이 낮으므로 Next.js 런타임/어댑터를 기본으로 넣지 않는다.

이는 설계 판단이다. 무료 범위 적합성은 실측한다. Cloudflare 무료 CPU 한도를 통과하지 못하면 1회 처리량을 먼저 줄이고 다시 확인한다. 그래도 불가하면 배포 결정만 보류하고 측정 결과를 제시한다. 유료 전환, 서비스 분리, 다른 플랫폼으로의 자동 전환은 하지 않는다. 수집 제공자가 접근 불가한 경우 호스팅 변경으로 해결된다고 가정하지 않는다.

## 5. 수집 제공자 계약

기본 실험 대상은 FxEmbed API다. 현재 문서상 계정 게시물 목록, 미디어 목록, 본문·원문 URL·사진·영상 썸네일 필드와 cursor 페이지 넘김이 있다. 이 환경에서 대상 API 응답을 확보하지 못했으므로 아래 경로는 문서 기반이며 성공한 엔드포인트로 표현하면 안 된다.

- 기본: GET https://api.fxtwitter.com/2/profile/{handle}/statuses?count=10
- 미디어 목록: /2/profile/{handle}/media — 단계 0에서 실제 정렬과 범위 확인 후 대안으로 선택 가능.
- RSS: https://fxtwitter.com/{handle}/feed.xml — 같은 제공자이므로 독립적인 장애 백업으로 세지 않는다.
- X 공식 API는 유료이므로 V1에 기본 연결하지 않는다.
- 로그인 쿠키, 비공개 엔드포인트 우회, CAPTCHA 회피를 수집 기본 요건으로 삼지 않는다.

어댑터는 fetchPage(source, cursor?)와 선택적 fetchPost(url)를 제공한다. HTTP 상태와 JSON 내부 code를 모두 검사한다. 결과는 posts, nextCursor, fetchedAt, providerStatus로 정규화한다. 제공자 raw JSON 필드를 프런트에 직접 전달하지 않는다.

정규화 게시물 필드: platform, platformPostId(문자열), canonicalUrl, authorHandle, publishedAt(UTC), caption, media[], observedViaSourceId. 미디어: position, kind(image/video/gif), previewUrl(nullable), width/height(nullable). null 미리보기라도 원문 링크가 있으면 게시물을 살릴 수 있다.

플랫폼 ID는 JavaScript Number로 변환하지 않는다. HTTP 타임아웃 기본 15초, 응답 크기 상한 기본 2MB. 초과 시 에러로 기록하고 count를 줄이는 검증을 한다. 자동 즉시 반복 요청은 하지 않는다.

## 6. 수집 주기와 누락 처리

Cron 하나를 5분마다 실행하고, 한 실행에서 due 상태의 소스 하나·페이지 하나만 처리한다. 기본 6개 소스의 정상 상태에서는 각 소스가 약 30분마다 조회된다. 1일 기본 수집 실행은 288회다. 소스가 추가되거나 장애/따라잡기 작업이 생기면 갱신 간격이 길어질 수 있으며 30분을 SLA로 약속하지 않는다.

2026-09-09 후속 구현: 소스별 최신 첫 페이지와 과거 cursor 이어받기를 번갈아 처리한다. 과거 보완 중 최신 조회는 약 60분, 보완 중지 후 약 30분이다. 처음 저장한 최신 페이지의 cursor로 과거 탐색을 시작하고 이후 최신 조회는 그 cursor를 덮어쓰지 않는다. 최신 조회는 조회 시각 기준 최근 7일을 판별한다. 첫 페이지를 넘어서는 급증분은 누락될 수 있어 전체 범위 완전성을 보장하지 않는다.

### 한 페이지 처리

1. due 소스에서 공정하게 하나를 고른다. 만료 시간과 소유 토큰을 가진 DB lease를 원자적으로 획득한다. 이미 임대 중이면 건너뛴다.
2. nextLane이 latest이면 첫 페이지를 읽고, history이면 저장한 과거 cursor를 이어 읽는다.
3. 형식 검증 → 원본/재게시 구분 → 윤서연 판별 → 메타데이터 upsert.
4. 이번 페이지의 저장이 모두 성공한 후에만 다음 cursor 또는 완료 체크포인트를 기록한다.
5. lease 소유권이 유지된 실행만 진행 상태를 바꾼다. 늦게 끝난 이전 실행이 새 상태를 덮어쓰지 않게 한다.

요청 count는 10으로 시작하되 실제 응답은 21개 이상일 수 있다. count를 처리량 상한으로 신뢰하지 않는다. 응답 전체의 정규화·판별·저장이 끝나기 전에는 다음 provider cursor로 전진하지 않는다. 일부만 처리한 경우 남은 항목을 재처리 가능하게 보존하고 현재 페이지를 유지한다. 전체 응답 기준 CPU/SQL 실측으로 안전한 처리량을 결정한다. 1회 실행의 SQL 수·매개변수 수도 함께 측정한다. 한 번에 모든 게시물과 미디어를 개별 INSERT하는 구현은 피한다. D1 batch도 내부 SQL 개수 한도를 없애주지 않는다.

### 체크포인트 계약

- lastAttemptAt: 호출 시도 시각.
- lastSuccessAt: 유효한 페이지 응답과 해당 페이지 저장 성공 시각.
- lastLatestSuccessAt: 최신 첫 페이지 저장 성공 시각. 최신 확인 상태에 사용하며 전체 범위 완료로 표현하지 않는다.
- lastCompleteSyncAt: 검증된 계약으로 이전 수집 경계까지 탐색을 마친 시각. 현재 공급자 어댑터는 완료를 입증하지 못하므로 이 값을 전진하지 않는다.
- committedBoundaryAt: 완료된 이전 cycle의 경계.
- cycleBoundaryAt / cycleNewestAt / nextCursor: 현재 탐색 cycle의 고정 경계와 진행 상태.
- 최초 cycle은 최대 7일 전을 하한으로 삼는다. 모든 과거 글을 보장하지 않는다.

페이지 상한에 닿았다고 경계를 최신으로 올리면 안 된다. cursor를 저장하고 다음 실행에서 계속한다. 고정 글, 정렬 불확실성, 재게시 때문에 페이지 첫 글 하나가 오래됐다는 이유로 탐색을 종료하지 않는다. 제공자 정렬/페이지 특성을 단계 0에서 확인하고, 이전 경계와 24시간 겹침 구간까지 탐색한다. cursor 만료는 첫 페이지 재시작+ID 중복 제거로 복구한다.

과거 탐색 20페이지에 도달하면 limited 상태와 historyPaused를 기록하고 과거 작업을 멈춘다. cursor는 보존하며 최신 첫 페이지 조회는 계속한다. API가 과거 범위를 더 주지 않거나 cursor가 반복되면 gap으로 과거 작업만 중지한다. 401/403·스키마 오류의 needs_attention과 429 백오프는 최신/과거 모두에 적용한다. 이 범위 제한은 완료 판정이 아니다.

### 실패

- 204: 공급자 계약과 로컬 상태에 맞을 때만 변경 없음으로 처리. 활성 cycle의 cursor를 삭제하는 근거로 쓰지 않는다.
- 429: Retry-After 우선. 없으면 백오프.
- 타임아웃/5xx: 다음 시도를 30분 → 1시간 → 2시간 → 최대 6시간으로 늦춘다.
- 인증 요구/응답 스키마 변경: needs_attention, 반복 호출을 멈추고 원인을 노출한다.
- 빈 결과만으로 계정 삭제/중단을 확정하지 않는다.
- 어떤 실패든 기존 정상 게시물을 지우거나 완료 경계를 전진시키지 않는다.

## 7. 윤서연 판별과 분류

기본은 명시적인 텍스트 판별이다. AI 모델을 호출하지 않는다.

- NFKC 정규화와 영문 소문자화 후 윤서연, seoyeon, seo yeon을 확인한다.
- 서연, ソヨン은 tripleS 출처로 검증된 소스 안에서 보조 단서로 허용한다.
- S1 단독 문자열 포함 검사는 사용하지 않는다. S10~S19 등 오탐 가능성이 있다.
- 다른 멤버 글에 w/ Seoyeon 등이 있으면 포함한다.
- 전용 계정은 실제 표본 확인 후 memberScope=seoyeon으로 지정할 수 있다. 이름 없는 미디어 허용은 검증된 전용 계정이 직접 작성한 비인용 글에만 적용한다. 실제 authorHandle과 발견 소스 handle이 일치해야 하며 재게시·인용은 별도 텍스트 판별한다. 관계가 불명확하면 전용 계정 예외를 적용하지 않는다. 판별 근거를 matchReason으로 남긴다.
- 종합 계정은 이름 단서 없는 게시물을 자동 포함하지 않는다. 이 경우 얼굴로만 등장하는 사진은 누락될 수 있다.
- 인용 원문의 텍스트 단서를 검사할 수 있으나, 인용 미디어를 현재 작성자의 미디어로 귀속시키지 않는다.

contentKind는 cosmo/fansite/official/other. 명시적인 COSMO 표기를 우선하며 fansite 소스의 일반 촬영 글, 공식 소스의 글 순으로 분류한다. COSMO 문구 없는 사진을 셀카라는 이유로 COSMO로 분류하지 않는다. 분류 근거와 규칙 버전을 보관한다.

같은 플랫폼의 동일 게시물 ID만 합친다. 재게시 응답이 원본 ID와 작성자를 제공하면 원본 게시물로 저장하고 발견 출처를 별도 연결한다. 인용 글은 별도 게시물이다. 서로 다른 계정이 같은 COSMO 사진을 올리면 V1에는 각각 남긴다. 날짜·이름만으로 묶지 않는다.

## 8. 최소 데이터 모델

SQL migrations와 prepared statement를 사용한다. 기본 V1에서는 ORM을 필수로 두지 않는다.

| 테이블 | 핵심 필드·제약 |
|---|---|
| sources | id, platform, handle, provider, profile_url, member_scope, source_kind, enabled, verification_status; UNIQUE(platform, handle 정규화값) |
| source_state | source_id PK/FK, 위 체크포인트, next_due_at, failures, last_error_code, lease_token, lease_until, catchup_status |
| posts | id TEXT PK, platform, platform_post_id TEXT, canonical_url, author_handle, published_at, caption, content_kind, has_image, has_video, match_reason, rule_version, availability, discovered_at, updated_at; UNIQUE(platform, platform_post_id) |
| media | post_id FK, position, kind, preview_url nullable, width, height; PK(post_id, position) |
| post_sources | post_id FK, source_id FK, first_seen_at; PK(post_id, source_id) |
| collection_runs | id, source_id, started_at, finished_at, status, received_count, matched_count, inserted_count, error_code, response_bytes, wall_ms, rows_read, rows_written |

posts.id는 예: x:플랫폼ID. 수동 인스타 링크는 검증한 shortcode에서 instagram:shortcode로 만든다. 수동 입력에는 실재 게시 시각을 모르면 null로 두고 addedAt으로 정렬하며 미확인 시각임을 표시한다.

정렬용 effective_at=published_at 또는 discovered_at을 일관되게 정의한다. 인덱스: posts(effective_at DESC, id DESC), 필요 필터 조합(content_kind, effective_at, id), post_sources(source_id, post_id), source_state(next_due_at). has_video는 video/gif 포함으로 정의한다. caption 전체 검색은 V1 제외.

한 게시물의 메타데이터/미디어 교체는 트랜잭션 가능한 D1 batch로 묶는다. 페이지 전체 처리 실패 후 재시도해도 중복되지 않아야 한다. 마지막 상태 전진은 전체 페이지 저장 성공 이후 수행한다. 게시물 저장과 상태 전진 사이 중단은 중복 재처리로 복구한다.

collection_runs 상세는 30일 보관. 미디어 URL은 미리보기용 참조값일 뿐 영구 이용 보장 값이 아니다. DB 크기 300MB부터 설정 화면에 정리 필요를 표시한다. 오래된 게시물을 자동 삭제하지 않는다.

## 9. API와 화면 계약

| API | 역할 |
|---|---|
| GET /api/feed?kind=all&media=all&source=all&cursor=...&limit=24 | 최신순 게시물, nextCursor, 수집 상태 요약 |
| GET /api/sources | 계정 목록·검증 상태·완료 갱신 시각·오류 |
| PATCH /api/sources/:id | 활성/중지 |
| POST /api/sources/:id/retry | next_due_at을 앞당기는 요청. 실제 수집은 Cron이 수행 |
| POST /api/manual-posts | 허용 플랫폼의 원문 URL 수동 추가. 외부 fetch 없이 링크 카드 저장 가능 |
| GET /api/export | 정규화된 게시물 메타데이터 JSON 내보내기, 운영 자격 증명 제외 |

cursor는 effective_at과 id의 쌍으로 구성한다. 필터 변경 때 초기화한다. 입력 enum과 limit(최대 48)을 검증한다. 페이지 조회 도중 새 글이 들어와도 기존 cursor 이하를 읽으므로 다음 페이지 중복을 피한다. 사진+영상 글은 두 필터에서 모두 보일 수 있다.

### 메인 피드

- 가제: 서연 모아보기. 가제는 확정 브랜드가 아니다.
- 흰색/연한 회색 배경, 보라색 포인트, 장식보다 미디어 비중을 높인다.
- 상단: 제목, 마지막 완료 갱신, 목록 새로고침, 설정.
- 모바일 2열, 넓은 화면 3~4열. 이미지 비율을 보존하고 object-fit:contain으로 과도한 얼굴/워터마크 잘림을 피한다.
- 카드: 첫 미리보기, 사진 개수 또는 영상 배지, COSMO/직찍 등 종류, 작성자, 게시 시각, 본문 2줄.
- 카드를 누르면 원문 새 탭. 새 탭 링크의 opener 접근을 막는다.
- 하단 더 보기 버튼으로 24개씩 추가. 필터는 URL 쿼리로 유지한다.
- 로딩, 첫 수집 대기, 필터 결과 없음, 기존 데이터+일부 출처 실패를 각각 다르게 표시한다.
- 키보드 탐색, 포커스 표시, 이미지 대체 텍스트, 작은 화면 터치 영역을 포함한다.

### 미리보기

- 외부 HTTPS 이미지 lazy load, 알려진 크기/비율로 레이아웃 이동 감소.
- V1은 자체 이미지 프록시·리사이즈·영상 중계를 하지 않는다.
- 실패하면 중립 카드와 원문 보기 버튼을 표시한다. 브라우저 onerror만으로 서버 게시물을 삭제하지 않는다.
- 임베드 스크립트는 V1 필수 아님. 특히 모든 카드에 X/Instagram 위젯을 로드하지 않는다.
- 제공자가 삭제/비공개를 명시하면 해당 게시물을 unavailable로 표시하고 미디어 표시를 중단한다. 타임아웃과 삭제를 구분한다. 전량 매일 재검증은 하지 않는다.

### 설정

소스별 활성 상태, lastCompleteSyncAt, 마지막 오류, 따라잡기 상태, 재시도 요청, 수동 링크 추가, 메타데이터 내보내기만 둔다. 자동 추가 추천이나 복잡한 대시보드는 만들지 않는다.

## 10. 접근 제한과 배포

개인용 기본값으로 화면과 API 전체를 접근 제한한다. Cloudflare Access로 소유자 이메일만 허용하는 구성을 우선 검토하고 단계 0 배포 검증에서 사용 도메인/플랜 적용 가능 여부를 확인한다. 도메인 구매나 유료 인증 서비스는 기본 조건이 아니다. 사용할 무료 호스트에서 접근 제한을 구성하지 못하면 비공개 로컬 검증 상태로 두고 배포 장애를 보고한다. 임의로 공개 배포하지 않는다.

정적 파일뿐 아니라 /api, workers.dev, preview 주소 등 우회 경로도 보호되는지 확인한다. 앱에 사용자가 입력한 인증 헤더만 신뢰하는 구현을 넣지 않는다. 상태 변경은 동일 출처 요청과 CSRF 방어를 적용한다. 공급자 본문은 plain text로 렌더링한다.

원문 URL은 허용 플랫폼 호스트와 게시물 경로만 인정한다. 서버가 임의 URL을 fetch하는 API는 만들지 않는다. 소스 핸들도 지정 형식으로 검증한다. API 키가 필요해지면 환경 secret으로 관리하고 git/브라우저/내보내기에 포함하지 않는다.

## 11. 무료 한도와 실행 예산

2026-09-09 공식 문서 기준:

- Workers Free: HTTP/Cron 실행당 CPU 10ms, 요청 100,000/일. 네트워크 대기는 CPU에 포함되지 않는다.
- D1 Free: DB 하나 최대 500MB, 계정 전체 5GB. Worker 실행당 쿼리 50개, SQL bound parameter 100개/쿼리.
- D1 무료 일일 읽기 500만 행, 쓰기 10만 행. 인덱스 쓰기도 비용에 포함된다.

출처: [Workers 제한](https://developers.cloudflare.com/workers/platform/limits/), [D1 제한](https://developers.cloudflare.com/d1/platform/limits/), [D1 요금](https://developers.cloudflare.com/d1/platform/pricing/).

위 한도는 계정 내 기존 프로젝트 사용량과 합산될 수 있다. 무료라는 이유로 충분하다고 단정하지 않는다. 기본 288회/일과 1페이지 10개라는 작은 작업 단위로 시작한다. SQL 개수는 40개 이하를 설계 목표로 두며 bound parameter 제한도 넘기지 않는다. 읽기/쓰기는 meta 실제 값으로 합산한다.

CPU는 원격 Workers 메트릭으로 확인한다. 로컬 벽시계나 fetch 대기시간으로 CPU 적합성을 판단하지 않는다. 정상·미디어 다수·중복·따라잡기·오류 경로를 포함해 검증한다. 실행 중 강제 종료로 오류 기록이 남지 않아도 lease 만료 후 복구돼야 한다.

## 12. Codex 앱 구현 순서와 완료 기준

### 단계 0 — 수집과 런타임 검증

본 UI보다 작은 검증 스크립트/Worker부터 만든다. gapyeonghaus와 Seowoo_0501을 먼저 확인하고 나머지 4개로 확장한다.

필수 기록: 호출 시각, URL(비밀 제외), HTTP/JSON code, 응답 크기, 게시물 수, 최신 게시 시각, 직접 원문 링크 표본, 사진/영상 미리보기 유무, cursor 진행, 요청 경과시간. 미디어 파일을 저장하지 않는다.

성공 조건:

1. COSMO 후보 최소 1개와 직찍/영상 후보 최소 1개에서 실제 목록·원문·미리보기 확보.
2. 사진과 영상 썸네일 각각 실제 브라우저 표시 확인. 실패 시 링크 대체 확인.
3. 서로 다른 시점의 재호출에서 정상 응답 확인. 새 글이 없다는 이유로 실패로 판정하지 않는다.
4. 다중 페이지를 제공하는 표본에서 cursor가 다른 글로 진행하고, 재시작 시 ID 중복 제거 가능.
5. Cloudflare 실제 실행에서 CPU/SQL/응답 크기 예산 검증과 개인 접근 제한 확인.

전체 6개가 모두 성공할 필요는 없지만 통과하지 못한 소스는 비활성/문제 상태로 남긴다. 실제 글이 확인된 소스만 정상으로 표시한다. 문서에 API가 있다는 이유만으로 통과시키지 않는다.

실패 시 결과를 증거와 함께 제시한다. 같은 공급자의 RSS를 독립 백업처럼 포장하지 않는다. 무료 자동 수집이 전혀 확보되지 않으면 자동 수집 V1 출시는 불가하다고 명시한다. 합의 없이 수동 북마크 앱으로 목표를 바꾸거나 유료 API를 결제하지 않는다.

### 단계 1 — 데이터와 수집

migrations, 소스 seed, provider adapter, 규칙, 저장, lease/cursor/백오프, 로그를 구현한다. 실제 표본은 필요한 최소 정규화 fixture로 만들고 미디어 바이너리는 저장하지 않는다.

필수 회귀 확인: 동일 글 재처리 중복 없음, 다른 계정 같은 날짜 글은 별도 유지, 이름 없는 전용 소스 정책, S10 오탐 없음, 다중 미디어 순서 유지, 페이지 실패 시 경계 유지, lease 만료 후 이전 실행 상태 덮어쓰기 방지, 429 백오프.

### 단계 2 — 화면과 API

피드/필터/페이지 조회, 상태 표시, 원문 이동, 수동 링크 카드, 설정을 붙인다. 로컬 개발에서는 명시적으로 fixture 모드를 사용할 수 있지만 운영에서 모의 게시물을 실제 수집 결과처럼 보이지 않게 한다.

### 단계 3 — 비공개 운영 확인

실제 24시간 수집으로 성공률, 수집 범위, CPU 초과, 읽기/쓰기, 새 게시물 반영을 기록한다. 새 게시물이 없다면 신규 글 반영은 미검증이라고 남긴다. 갱신된 척하는 timestamp를 만들지 않는다.

V1 완료: 검증 소스에서 실제 미디어 피드를 볼 수 있고, 원문 이동·필터·페이지 이동이 동작하며, 외부 실패에도 기존 목록이 유지되고, 접근 제한과 무료 실행 조건을 확인했다. 24시간 결과는 초기 관찰이지 장기 가용성 보장이 아니다.

## 13. 구현 저장소의 권장 구성

- src/client/: 화면, 컴포넌트, 피드 상태.
- src/worker/: HTTP와 scheduled 진입점.
- src/collectors/: FxEmbed adapter와 제공자 계약.
- src/domain/: 정규화, 윤서연 판별, 분류, 중복 규칙.
- src/db/: D1 쿼리와 저장 계약.
- migrations/: 순차 SQL.
- config/sources.ts: 검증 대상과 기본 분류 설정.
- scripts/: 단계 0 검증 도구.
- tests/: 데이터 손실/오탐/재시도 위험을 검증하는 테스트.
- docs/SPEC.md: 이 문서, docs/VALIDATION.md: 실측 결과.

실제 버전은 구현 시작일의 호환되는 안정 버전을 고정한다. 이 문서는 구현된 코드나 설치 완료 사실을 나타내지 않는다.

## 14. Codex 앱에 전달할 첫 지시문

> 첨부한 SEOYEON_MEDIA_V1_SPEC.md를 구현 기준으로 읽어줘. 실제 구현은 이 저장소에서 진행한다. 먼저 단계 0의 수집/원격 런타임 검증부터 수행하고 결과를 docs/VALIDATION.md에 기록해줘. 검증을 통과하면 데이터 수집, API, 갤러리, 설정 순으로 진행해줘. 한 앱 구조와 무료 운영, 원본 미디어 미저장 조건을 유지해줘. FxEmbed는 문서만 확인된 후보이므로 실제 성공을 가정하지 말고, 제공자 실패와 실행 환경 제한을 구분해줘. 유료 서비스나 로그인 쿠키가 필요해지면 자동 도입하지 말고 구체적인 장애와 대안을 보고해줘. 모의 데이터로 자동 수집 완료를 선언하지 마. 검증되지 않은 소스는 명시적으로 비활성 상태로 유지해줘.

## 15. 참고 자료와 사실의 범위

- [FxEmbed 게시물 목록](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/): 경로·필드·cursor 문서 확인. 대상 6계정 실제 응답 성공은 미확인.
- [FxEmbed 미디어 목록](https://docs.fxembed.com/api/twitter/operations/2profilehandlemedia/): 대안 경로 문서.
- [FxEmbed RSS](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/): 같은 제공자의 피드 기능.
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/): 화면과 Worker 코드의 통합 배포 근거.
- [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/): 배치 실행과 실패 시 rollback 계약.
- [X 공식 API 요금](https://docs.x.com/x-api/getting-started/pricing): 유료 수집 대안. 현재 V1 기본 경로 아님.

COSMO Talk 출시일, 전체 과거 데이터 범위, 미러 계정의 완전한 커버리지는 이 설계의 전제로 사용하지 않는다.


## 16. 2026-09-09 실측 반영

목록 수집 검증과 역할 검증을 분리한다. 첫 페이지에 역할 표본이 없다는 이유만으로 소스를 탈락시키지 않는다. 2026-09-09 후속 조사에서 gapyeonghaus 6페이지, tripleSnewsfeed 8페이지, TRIPLES_FAN_FR 5페이지에서 윤서연+COSMO 명시 미디어 표본을 확인해 종합 계정 3개를 시범 활성화했다. 이는 캡션 기반 역할 확인이며 전체 커버리지 보장이 아니다. 실제 작성자와 발견 소스는 독립적으로 저장하며 종합 계정에 전용 직접 작성 예외를 주지 않는다. 상세 근거와 실제 예약 성공 여부는 docs/VALIDATION.md를 따른다.

이름 판별은 Unicode 문자·숫자 경계를 적용한다. 특히 `#지서연`은 지연 표기이며 `서연` 부분 문자열만으로 윤서연으로 분류하지 않는다. 2096951571615453241의 기존 윤서연 COSMO 표본 판정은 철회한다.

### 2026-09-09 보조 소스 활성화 및 주기 갱신

기존6소스에 sogeumdwarf/hamhamm806/S2O806를 추가한다. 신규3개는 verifiedDirect=false이며 이름 없는 미디어 예외가 없다. COSMO 분류 표기는 영문 COSMO/한글 코스모/코스모톡을 포함한다. 재게시의 실제 작성자/발견출처 분리와 초기7일 범위는 유지한다.
예약은 */3 * * * *로 변경: 한슬롯1소스1페이지, 최대480슬롯/일. 정상9소스 한순회 약27분, 초기 최신/과거 교대시 최신확인 약54분을 목표로 하며 지연과 재시도를 포함한 보장 주기는 아니다. 과거5분/6소스 주기 문구보다 이 갱신을 우선한다.

### 공식 소스 전용 규칙 (2026-09-09 운영 등록)

triplescosmos 발견소스의 직접 작성+미디어+정확한 멤버태그 글만 official로 자동포함한다. 공지·재게시·인용·불명확 관계는 제외한다. 이름과 포토 비하인드 제목은 별도검토로 보존한다. COSMO 앱 문구는 공식 글을 cosmo로 바꾸지 않는다. 검토데이터도 초기7일 및 동일 저장경계를 적용하며, 페이지/cursor와 함께 원자적 저장한다. 검토 UI는 후속 범위다.
현재10소스/3분1소스, 한순회약30분/초기교대 최신약60분으로 이전9소스 주기 설명을 갱신한다.
