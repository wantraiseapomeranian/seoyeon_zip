# 로컬 검증 명령

프로젝트 루트에서 실행한다. Node.js 24.14.1 이상과 `npm ci`로 설치한 의존성이 필요하다. UI 검사는 설치된 Google Chrome을 사용한다(`channel: 'chrome'`). 별도 개발 서버나 운영 인증 정보는 필요하지 않다.

| 명령 | 실행 범위 | 한계 |
| --- | --- | --- |
| `npm test` | 기존 `tests/*.test.mjs` 전체 | Node 테스트이며 Cloudflare 런타임·브라우저 검사를 대신하지 않는다. |
| `npm run check:runtime` | 운영 일별 기록·알림의 workerd/D1 검사, 피드 SQL batch·페이지·오류 응답 검사 | 임시 로컬 D1과 표본을 사용하며 실제 운영 데이터·예약 실행 결과를 확인하지 않는다. |
| `npm run check:ui` | 여섯 화면 테마, 사진 지연·오류·재시도, X/Instagram/YouTube 판정 후 초점, YouTube 200% 글자 확대 | 로컬 Chrome과 모의 응답을 사용한다. 전체 접근성 검사나 실제 iPhone Safari·Samsung Internet·VoiceOver 검증은 아니다. |

각 명령은 독립 실행한다. runtime/UI 내부 검사는 순서대로 실행하며 한 검사가 실패하면 뒤의 검사를 실행하지 않고 실패로 종료한다. 이 명령을 추가한 것만으로 자동 배포 전 검증이 설정되는 것은 아니다.

Windows의 runtime 검사에는 OS가 로컬 `workerd.exe` 실행을 허용해야 한다. `spawn UNKNOWN`이 발생하면 Windows CodeIntegrity 로그의 차단 여부를 확인한다. 2026-09-22에는 서명 정책의 실행 차단이 확인됐으며 해당 검사는 실패·미검증으로 기록했다. 이 경우 OS가 허용하는 실행 환경을 확보한 뒤 다시 검사해야 한다.

## 포함된 검사와 결과

- runtime: `check-operations-runtime.mjs --local`, `validate-feed-batch.mjs --local`. 두 검사 모두 외부 요청을 차단하고 임시 D1을 생성·정리한다. 결과는 터미널에 출력한다.
- UI: `check-theme.mjs`, `check-photo-loading.mjs`, `check-ui-audit-fixes.mjs`, `check-ui-audit-fixes.mjs text`. 테마·초점 검사는 임의 포트의 로컬 서버를 직접 시작·종료하고 사진 검사는 서버 없이 실행한다.
- UI 캡처는 `.local/theme/`와 `.local/ui-fixes/`에 저장되며 다음 실행에서 같은 파일을 덮어쓸 수 있다. 사진 오류 검사는 터미널 결과만 남긴다. `.local` 결과물을 Git에 추가하지 않는다.
- 테마 검사의 axe 검증은 기본 명령에 포함하지 않는다. 필요한 경우 `node scripts/check-theme.mjs --axe <로컬-axe-파일>`로 별도 실행한다.

## 변경에 따라 추가할 기존 검사

모든 검사 파일을 일괄 실행하지 않는다. 추가 검사는 변경 범위와 아래 실행 조건을 확인해 선택한다.

- `node scripts/check-youtube.mjs`: 등록·판정·감사 내역을 로컬 API/메모리 DB로 확인한다. 고정 포트 4198을 사용하므로 같은 포트의 `check-operations-tabs.mjs`와 동시에 실행하지 않는다. 일부 요청은 실제 `fetch`로 전달할 수 있어 외부 요청 차단을 보장하는 runtime 프로필과 구분한다.
- `check-public-runtime.mjs`, `check-public-limit-runtime.mjs`: 별도로 시작한 로컬 Worker가 필요하다. 후자는 요청 제한 상태를 소진하므로 같은 서버에서 다른 검사와 함께 실행할 때 상태 영향을 고려한다.
- `check-x-quality.mjs`: `.local/x-quality-posts.json`과 `.local/x-quality-backfill.sql` 입력이 필요해 기본 프로필에 포함하지 않는다.
- `check-dark-controls.mjs`와 `check-dark-controls.mjs --iphone`: 날짜 입력 변경 시 선택한다. Chrome의 UA 에뮬레이션이며 실제 모바일 엔진 검증을 대신하지 않는다.

검증 결과와 남은 미확인 사항은 `docs/VALIDATION.md`에 기록한다. 로컬 통과, GitHub 푸시, Cloudflare 배포 성공, 운영 확인은 각각 구분한다.
