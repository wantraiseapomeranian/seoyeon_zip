# 피드 성능 측정과 조회 개선

## 실제 공개 피드 기준선 — 2026-10-02 04:43 UTC

활성 Worker `3e08028b`(main `452a463`), Windows Chrome 154.0.8037.58에서 실제 Worker/CDN을 읽었다. 화면별 새 브라우저 문맥 5회, 기본 CPU/네트워크, 로그인 없음, gallery 준비 후 3초 관찰이다. 브라우저 시작·DNS·서버 캐시 상태는 완전히 고정하지 않았고 다른 로컬 작업의 부하도 있었다. 원본 응답·이미지·CDN URL은 저장하지 않았다.

| 화면 | API 중앙값(범위) | 관찰 LCP 중앙값(범위) | CLS | 요청/HTTP/페이지 오류 |
|---|---:|---:|---:|---:|
| 390×844 | 1,036.1ms(956.8–1,184.2) | 3,960ms(3,196–7,420) | 0 | 0 |
| 1280×900 | 881.0ms(749.9–1,191.4) | 4,592ms(3,504–7,524) | 0 | 0 |

이미지 Resource Timing의 `img` 항목 중앙값은 각각 1,582.4ms/2,520ms였다. 일부 표본에 해당 initiator 항목이 없어 null로 남겼다. 관찰 창 이후 이미지가 바뀌면 LCP가 더 늦어질 수 있다. 이 소표본은 실제 사용자 p75가 아니며 2.5초 목표 달성을 확인하지 못했다. 배포 후 같은 조건으로 추가 비교한다.

## SQL 개선 실험

2026-10-02, 기준 커밋 `452a46351ed8a5ad34e81a36b74fe1de36b3ef19`과 작업 브랜치의 변경 A를 비교했다. 배포된 Worker의 HTTP 지연이나 실제 사용자 p75/p95를 측정한 기록은 아니다. 배포 SHA와 운영 확인은 `VALIDATION.md`를 따른다.

## 적용한 변경

Instagram·YouTube·직접 등록 게시물만 있는 페이지에서 결과에 쓰이지 않는 X 사진 중복 출처 SQL을 생략한다. 혼합 페이지에서는 X 원본 게시물 ID만 같은 SQL에 전달한다. 기존 `authors`, 게시물, 순서, 전체 건수, cursor, 사진 주소와 판정 규칙을 유지하며 영구 캐시는 추가하지 않았다.

같은 운영 복원본에서 사진 기본, X, Instagram, 작성 계정, 날짜+종류, YouTube 형식+분류, 두 번째 페이지를 각각 5회 비교했다. 변경 전후 전체 응답 JSON의 SHA-256이 7개 조건에서 모두 같았다. 원문·서명 주소·계정 목록은 측정 보고서에 저장하지 않았다.

## 측정 조건과 비용

Windows, Node 24.14.1. 운영 D1에서 부모 작업이 확보·검증한 `.local/recovery/restored-verified.sqlite`를 읽기 전용으로 열었다. 한 SQLite 연결에서 기준/변경 호출 순서를 번갈아 실행했다. 첫 시나리오 호출과 후속 호출을 표본별로 구분하며, 시나리오 선택용 초기 조회 뒤의 첫 호출이므로 콜드 캐시 측정은 아니다. 원격 D1은 기존 인증으로 SELECT만 실행했다.

아래는 원격 D1 메타데이터의 SQL 실행 시간과 읽은 행이다. 각 조건·버전별 5회이며 읽은 행은 5회 모두 같은 값이었다. 네트워크 시간은 제외된다. 필드 의미는 [D1 반환 객체](https://developers.cloudflare.com/d1/worker-api/return-object/)와 [Wrangler D1 execute](https://developers.cloudflare.com/d1/wrangler-commands/#execute)를 확인했다.

| 조건 | 읽은 행 기준 → 변경 | SQL 중앙값 기준 → 변경 | SQL 범위 기준 / 변경 |
|---|---:|---:|---:|
| Instagram, 이미지 별칭 제외한 부분 합계 | 194,390 → 127,279 | 355.49 → 295.18ms | 327.31–436.25 / 241.90–338.32ms |
| YouTube 형식+분류, 전체 SQL 합계 | 191,658 → 124,532 | 347.60 → 223.95ms | 277.71–392.60 / 214.44–249.67ms |

삭제된 X 중복 조회 자체가 Instagram에서 67,111행·SQL 중앙값 83.14ms, YouTube에서 67,126행·85.11ms를 사용했다. 원격 주 조회와 상태 조회의 읽은 행은 변경 전후 같았다. Instagram 별칭 키에는 긴 서명 주소가 있어 원격 CLI 재실행에서 해당 조회를 제외했다. 따라서 전체 비용의 `rowsRead`와 `sqlMs`는 null이며, 위 부분 합계는 `observedRowsRead`와 `observedSqlMs`로 구분한다. 원격 SELECT 도중 데이터가 달라질 가능성은 남는다.

최종 반복 측정 스크립트로 YouTube 변경 버전을 다시 5회 조회한 결과도 매회 124,532행이었다. SQL 중앙값은 254.34ms, 범위는 221.19–289.12ms였다. 시간의 변동과 행 수의 감소를 구분한다.

조회별 분리는 `countPageAuthors`, `collectionState`, `imageAliases`, `duplicateSources`로 기록한다. 전체 건수·페이지·작성 계정은 같은 SQL과 materialized CTE를 공유하므로 각자의 정확한 비용은 분리 측정하지 못했다. 이 셋을 독립적으로 재실행한 값을 실제 요청 비용처럼 합산하지 않는다. 해당 세부 분리 값은 미확인이다.

## 로컬 전후 비교

실제 운영 스키마와 복원 데이터에서 실행한 전체 SQL 시간이다. 응답 크기는 Worker와 같은 `publicPost` 정리 후의 JSON으로 재측정했으며, 두 버전의 공개 응답 해시도 7개 조건에서 모두 같았다. 로컬 측정 동안 다른 검증 작업과 CPU를 공유했다. 표본이 적고 같은 Windows 환경에서 시간 범위가 겹쳤다. X가 포함된 조건에서는 주 조회 SQL이 같으므로 중앙값 차이를 개선·회귀로 단정하지 않는다. 로컬 SQLite는 D1의 `rows_read`를 제공하지 않아 모두 null로 기록한다.

| 조건 | SQL 중앙값 기준 → 변경 | SQL 범위 기준 / 변경 | 공개 API 응답 크기, 두 버전 동일 |
|---|---:|---:|---:|
| 사진 기본 | 2,026.72 → 1,612.35ms | 1,599.15–2,362.05 / 1,405.27–1,859.38ms | 74,001 bytes |
| X | 1,438.70 → 935.19ms | 934.27–1,550.60 / 923.37–1,545.49ms | 33,417 bytes |
| Instagram | 1,164.69 → 801.25ms | 974.94–2,058.12 / 619.86–979.98ms | 94,931 bytes |
| 작성 계정 | 2,015.52 → 2,180.55ms | 1,694.33–3,565.96 / 1,632.74–2,590.09ms | 7,558 bytes |
| 날짜+종류 | 3,024.32 → 2,824.97ms | 1,972.86–4,146.65 / 2,343.41–3,660.40ms | 8,801 bytes |
| YouTube 형식+분류 | 2,532.69 → 1,939.88ms | 1,805.46–3,156.59 / 892.97–2,232.03ms | 30,104 bytes |
| 두 번째 페이지 | 1,372.37 → 1,601.66ms | 1,275.14–4,112.97 / 1,103.06–2,988.11ms | 43,838 bytes |

후속 페이지에서 작성 계정 목록을 생략하는 후보 B는 로컬 실험으로만 비교했다. 실험 당시 같은 두 번째 페이지의 `readFeed` 반환 JSON은 49,712 → 42,876 bytes로 6,836 bytes 줄었다. 전체 SQL 중앙값은 796.89 → 810.07ms, 범위는 610.67–1,520.97 / 587.10–1,397.77ms였다. SQL 개선을 확인하지 못해 B는 적용하지 않았다. API 기본 응답과 작성 계정 복원 계약을 유지했다.

## 브라우저 측정의 범위

Chrome headless, 새 브라우저 context, service worker 차단, HTTP `no-store`, 네트워크/CPU 기본 설정에서 화면별 5회 측정했다. 외부 이미지는 실제 CDN에 연결하지 않고 120ms 뒤 600×800 SVG fixture를 반환했다. 따라서 이미지 대기는 설정한 fixture와 로컬 브라우저 비용이며 실제 사진 다운로드·디코딩 시간을 나타내지 않는다.

| 화면 | 첫 피드 API 중앙값 | 관측 LCP 중앙값·범위 | CLS 중앙값 | 이미지 요청 대기 중앙값 | 실패 요청 |
|---|---:|---:|---:|---:|---:|
| 390×844 | 3,368.7ms | 400ms, 356–780ms | 0.01047 | 191.5ms | 5회 모두 0 |
| 1280×900 | 1,601.1ms | 264ms, 224–552ms | 0.00496 | 158.2ms | 5회 모두 0 |

이 브라우저 표의 fixture API는 측정 당시 `readFeed` 반환 JSON을 사용했다. 최종 스크립트는 Worker와 같은 공개 정리를 적용한다. 관측 LCP는 초기 화면의 후보이며 첫 사진이 표시된 시간과 같다고 해석하지 않는다. 향후 스크립트는 LCP 후보 태그도 기록한다. 실제 CDN·배포 Worker·실기기 결과는 미확인이다. 이미지 병목을 입증하지 못했으므로 preload와 사진 품질·순서를 바꾸지 않았다. LCP 2.5초는 장기 목표다.

## 반복 측정

운영 사본의 준비·검증은 `RECOVERY.md`를 따른다. 결과는 Git에서 제외되는 `.local/feed-performance/`에 저장한다. 합성 fixture는 외부 연결 없이 측정 스크립트 자체를 확인하는 용도다.

```powershell
node scripts/measure-feed-performance.mjs --fixture --label fixture
node scripts/measure-feed-performance.mjs --database .local/recovery/restored-verified.sqlite --label snapshot --browser
```

전후 비교 모듈은 동일한 `readFeed` export를 제공해야 한다. 기준 모듈을 만들 때 상대 import 위치를 맞춘다.

```powershell
New-Item -ItemType Directory -Force .local/feed-performance | Out-Null
$baselineFeed = (git show 452a463:src/feed.mjs) -join "`n"
$baselineFeed.Replace("'./published-day.mjs'", "'../../src/published-day.mjs'").Replace("'./instagram-preview-urls.mjs'", "'../../src/instagram-preview-urls.mjs'") | Set-Content .local/feed-performance/baseline-feed.mjs
node scripts/measure-feed-performance.mjs --database .local/recovery/restored-verified.sqlite --compare-module .local/feed-performance/baseline-feed.mjs --label paired
```

원격 D1의 읽기 비용은 한 조건을 지정해 별도로 측정한다. 기존 Wrangler 인증과 설정된 `seoyeon-zip-validation`을 사용하며 공급자를 호출하거나 데이터를 쓰지 않는다. Wrangler 원문 결과는 출력하거나 저장하지 않고 숫자 메타데이터만 남긴다.

```powershell
node scripts/measure-feed-performance.mjs --database .local/recovery/restored-verified.sqlite --scenario youtube --remote-cost --label remote-youtube
node scripts/measure-feed-performance.mjs --database .local/recovery/restored-verified.sqlite --compare-module .local/feed-performance/baseline-feed.mjs --scenario platformInstagram --remote-cost --label remote-instagram
```

`apiMs`는 로컬에서 `readFeed`와 공개 JSON 직렬화 완료 시간, 브라우저에서 Resource Timing의 피드 요청 시간이다. 원격 SQL 재실행에서는 Worker HTTP 시간을 알 수 없어 null이다. 측정 불가 항목은 null과 이유를 함께 남긴다. 결과에는 표본·합계·중앙값·범위·응답 해시와 코드 해시만 포함하며 응답 원문, SQL, 서명 주소는 저장하지 않는다.

## 검증

관련 Node 테스트 24개 통과. `check-feed-filters`의 320/390/768/1280 화면, `check-feed-paging`의 390/1280·최신순/오래된순, `check-feed-preload`의 기본/플랫폼/작성 계정/영상/정렬/날짜 조건을 확인했다. preload 검사의 예전 UI `source=instagram` 사례를 현재 지원하는 `platform=instagram` 사례로 고쳤고 작성 계정 사례를 추가했다. 기본 페이지 한 번의 사전 조회와 필터 전달, 새로고침 시 새 조회를 확인했다. 상세 실행·전체 검사·배포 확인은 `VALIDATION.md`에 기록한다.
