# 릴리스 검증 명령

프로젝트 루트에서 Node.js 24.14.1 이상과 `npm ci`로 설치한 잠금 파일 의존성을 사용한다. 브라우저 검사는 Google Chrome(`channel: 'chrome'`)이 필요하다. Linux에서 준비할 때는 `npx --no-install playwright install --with-deps chrome`을 실행한다.

| 명령 | 실행 범위 | 한계 |
| --- | --- | --- |
| `npm run check:release` | Node 전체 테스트 → 로컬 runtime 2개 → 기본 UI 6개 → 핵심 피드 4개 → 사진 확대창 → 운영 탭 | 로컬 표본과 모의 응답으로 검사한다. 운영 DB·공급자·실기기 결과를 확인하지 않는다. |
| `npm test` | `tests/*.test.mjs` 전체 | Node 검사. 신규 fixture guard 회귀도 Chrome을 사용한다. |
| `npm run check:runtime` | workerd/D1 운영 기록·알림, 피드 SQL batch·페이지·오류 응답 | 임시 D1을 사용한다. 실제 예약 실행은 확인하지 않는다. |
| `npm run check:ui` | 테마·강제 다크·터치 스크롤·사진 오류·검토 후 초점·200% 글자 확대 | Chrome 기반. iPhone Safari·Samsung Internet·VoiceOver 검증은 별도다. |

`check:release`는 실패한 검사 이름과 자식 종료 코드를 출력하고 즉시 종료한다. 시작 실패·신호 종료·180초 초과도 실패다. 이후 검사는 실행하지 않으며 통과로 표시하지 않는다. 검사 서버는 자식 프로세스 안에서만 동작하고 각 스크립트의 `finally`에서 정리한다. 시간 초과 또는 중단 시 실행기는 프로세스 트리를 종료한다. Linux에서는 프로세스 그룹을 종료하고 Windows에서는 `taskkill /T /F`를 사용한다.

실행기에는 다음 목록이 명시돼 있다.

1. `node --test tests/*.test.mjs`에 해당하는 정렬된 파일 목록. 쉘 glob에 의존하지 않는다.
2. `check-operations-runtime.mjs --local`, `validate-feed-batch.mjs --local`.
3. `check-theme.mjs`, `check-forced-dark.mjs`, `check-photo-touch-scroll.mjs`, `check-photo-loading.mjs`, `check-ui-audit-fixes.mjs`, `check-ui-audit-fixes.mjs text`.
4. `check-feed-filters.mjs`, `check-feed-paging.mjs`, `check-feed-preload.mjs`, `check-feed-photo-ratio.mjs`.
5. `check-photo-viewer.mjs`, `check-operations-tabs.mjs`.

운영 탭 검사는 고정 포트 4198을 사용하므로 목록을 병렬로 실행하지 않는다. UI 캡처는 `.local/`에 남으며 커밋하거나 공개 CI artifact로 올리지 않는다. 테마 axe 검사는 기본 목록에 포함하지 않는다. 필요 시 로컬 파일을 사용해 `node scripts/check-theme.mjs --axe <로컬-axe-파일>`을 별도 실행한다.

## 외부 요청과 비밀값 경계

릴리스 실행기만 `check-release-fixtures.mjs`를 preload한다. Node `fetch`는 loopback 주소만 허용한다. Chrome은 서비스 워커를 차단하고 loopback 및 각 검사에 명시된 fixture route만 허용한다. 모의 응답으로 처리되지 않은 외부 요청은 실제 전송 전에 중단하고 해당 검사를 실패로 종료한다. 로컬 응답도 redirect를 따라가기 전에 확인하고 redirect는 실패로 처리한다. 기존 독립 검사 명령에는 preload를 자동 적용하지 않는다.

runtime 검사의 Miniflare `outboundService`도 외부 요청을 거부한다. 운영 DB·운영 인증 정보·유료 공급자 호출은 사용하지 않는다. 실행기는 OS·Chrome에 필요한 환경 변수만 자식에 전달하고 공급자 토큰·키·`NODE_OPTIONS`는 전달하지 않는다. 이 guard는 기존 검사 경로의 `fetch`와 Playwright 요청을 제한하는 장치이며 범용 OS 네트워크 샌드박스는 아니다.

## GitHub 검사와 배포 연결

`.github/workflows/verify.yml`은 `main` 대상 PR, `main` push, 수동 실행에서 Linux의 `Release checks` job을 실행한다. Node는 24.14.1로 고정하고 `npm ci` 및 Chrome 설치 후 같은 릴리스 명령을 사용한다. workflow에는 운영 secrets와 Cloudflare 배포 명령을 넣지 않는다.

2026-10-02 읽기 전용 조회 결과: 기존 Actions workflow는 0개, `main.protected=false`, 필수 status check 목록은 비어 있고 repository ruleset은 `[]`였다. 당시 조회 계정은 저장소 읽기 권한만 갖고 있었다. 기준 `452a46351ed8a5ad34e81a36b74fe1de36b3ef19`에는 `Workers Builds: seoyeon-zip` 성공 check가 있다. GitHub check 응답에는 Workers Builds의 브랜치 트리거·빌드 명령이 없으므로 이 설정은 별도로 확인해야 한다.

배포 전 차단을 완성하려면 다음 실제 증거가 필요하다.

1. PR에서 `Release checks`의 실제 이름·SHA·결과를 확인한다.
2. 저장소 관리자 권한으로 그 check를 `main` 필수 검사에 연결하고 직접 push 우회 경로를 차단한다. 기존 Workers Builds 연동은 유지한다.
3. 일회성 PR 브랜치에서 테스트 하나를 의도적으로 실패시켜 필수 검사가 실패하고 병합이 차단되는지 확인한다. 실패 fixture는 `main`에 병합하지 않는다.
4. 성공 커밋으로 되돌린 뒤 필수 검사 통과와 병합 허용을 확인한다. 병합된 SHA의 Workers Builds·실제 배포 결과를 각각 확인한다.

`main` push와 나란히 실행되는 Actions만으로는 Workers Builds 시작을 막지 못한다. 직접 push가 계속 허용된다면 Workers Builds의 배포 전 빌드 명령에 Linux/Chrome 의존성을 갖춘 `npm run check:release`를 연결하는 등 별도 차단을 검증해야 한다. 원격 보호 설정·빌드 명령 변경·실패 차단 증거는 로컬 파일 생성만으로 완료 처리하지 않는다.

### 실제 적용 — 2026-10-02

저장소 소유자의 기존 Git 자격 증명으로 권한을 확인한 뒤 `main`에 PR 필수·`Release checks` 필수(app 15368)·strict 최신 기준·관리자 적용을 설정했다. 강제 push/삭제는 허용하지 않는다. 별도 승인 리뷰 수는 0이며, 독립 코드 검토와 자동 검사를 수행하는 현재 작업 흐름을 유지한다.

[실패 증거 PR #1](https://github.com/wantraiseapomeranian/seoyeon_zip/pull/1)의 `9d844aa`는 의도적 Node 실패 1건으로 후속 runtime/UI를 실행하지 않고 종료했다. GitHub `mergeStateStatus=BLOCKED`를 확인한 뒤 병합 없이 닫았다. 실패 파일은 main에 넣지 않는다. Cloudflare는 이 브랜치의 미리보기 버전만 만들었고 활성 운영 버전 `3e08028b-908b-4149-968d-68d8c7c7702f`는 유지됐다.

Workers Builds 설정 API는 현재 OAuth 권한으로 403이어서 실제 빌드 명령·모든 branch 설정은 읽지 못했다. 설정을 추정해 수정하지 않았다. PR 빌드와 활성 운영 배포를 API로 구분했고 기존 연동을 유지한다. 구현 PR #2의 `259315f`는 Linux 전체 검사가 성공해 `CLEAN` 상태로 정상 병합됐다. 병합 `df30fc6`의 main 검사와 Workers Builds가 성공했고 활성 버전 `55863e4e`를 확인했다. 정확한 결과는 [VALIDATION](VALIDATION.md)을 따른다.

Windows의 `workerd.exe`는 OS 서명 정책 때문에 `spawn UNKNOWN`으로 차단된 이력이 있다. 이 경우 runtime 실패·미확인으로 기록하고 Linux CI 결과를 확인한다. 브라우저 UA 에뮬레이션을 실제 모바일 검증으로 기록하지 않는다.

## 변경에 따라 추가할 기존 검사

- `check-review-filters.mjs`: X·Instagram 검토 필터·페이지·계정·초기화·너비. 로컬 Chrome/모의 응답.
- `check-youtube.mjs`: 로컬 API/메모리 DB. 포트 4198을 사용하며 일부 요청이 실제 `fetch`로 나갈 수 있으므로 릴리스 목록에 넣지 않았다.
- `check-public-runtime.mjs`, `check-public-limit-runtime.mjs`: 별도 로컬 Worker 필요. 후자는 요청 제한 상태를 소진한다.
- `check-x-quality.mjs`: `.local/x-quality-posts.json`, `.local/x-quality-backfill.sql` 입력 필요.
- `check-dark-controls.mjs`와 `--iphone`: 날짜 입력 변경 검사. 실제 모바일 엔진을 대신하지 않는다.

검사 커밋·환경·명령·결과·한계는 `docs/VALIDATION.md`에 기록한다. 로컬 통과, GitHub push, 필수 검사 차단, Cloudflare 배포 성공과 운영 확인은 각각 구분한다.
