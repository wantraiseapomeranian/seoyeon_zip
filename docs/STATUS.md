# 현재 프로젝트 상태

기준일: 2026-10-02. 구현 기준 `452a46351ed8a5ad34e81a36b74fe1de36b3ef19`. 종합 개선의 배포 결과는 [VALIDATION](VALIDATION.md)의 최신 항목을 따른다.

## 실제 구조와 경계

- HTML/CSS/JavaScript 피드와 관리자 화면, 단일 Cloudflare Worker, D1. 초기 React 제안은 현재 구조가 아니다.
- 공개 피드는 비로그인 읽기를 허용한다. 관리자 화면은 Access, 관리자 API는 owner JWT 검증을 사용한다. 공개 API allowlist와 요청 제한을 유지한다.
- 사진/영상은 플랫폼·종류·실제 작성 계정·날짜로 탐색한다. YouTube는 별도 탭에서 형식·분류 필터를 제공한다. 사진 확대창은 순서·초점·스크롤 복귀를 지원한다.
- X는 cursor/checkpoint 수집과 404 재시도, Instagram은 Apify 동기화와 기존 이미지 주소 갱신, YouTube는 검색·상세 조회와 예약 영상 보류를 사용한다. 공급자 응답 전체의 저장 성공 후에만 cursor를 전진한다.
- 주소 갱신은 18개/실행, UTC 하루 2회, 실행당 0.05 USD 상한이다. YouTube 검색은 태평양 날짜 기준 하루 50회다. 무료 운영 또는 프로젝트 총비용을 보장하는 수치가 아니다.
- 원본 미디어 파일은 저장하지 않는다. 원문에서 사라진 사진은 DB 백업만으로 복원할 수 없다.

## 종합 개선

[실행 계획](superpowers/plans/2026-10-02-project-improvement.md)에서 구현·검증·후속 관찰을 관리한다.

- Instagram 이미지 갱신의 독립 상태·알림·운영 화면 추가.
- Instagram/YouTube 피드에서 불필요한 X 중복 출처 조회 생략. [전후 성능 기록](PERFORMANCE.md).
- 필수 테스트/runtime/UI 실행기 및 PR 검사. [검사와 정책](CHECKS.md).
- 실제 export의 격리 복원과 행·schema 검증. [복구 절차](RECOVERY.md).

## 남은 확인

- 배포 후 7일과 Instagram 정상 갱신 두 주기: [운영 관찰](OPERATIONS-OBSERVATION.md).
- 실제 iPhone Safari 모서리·세로/가로, Samsung Internet 강제 다크, VoiceOver. Chrome viewport·터치·키보드 검사를 실제 기기 결과로 대체하지 않는다.
- 원문에서도 없는 Instagram 사진 1장, 실제 반복 404 이후 자동 복구, 실제 청구·장기 비용.

현재 상태 → [작업 이력](PLAN.md) → [실행 계획](superpowers/plans/2026-10-02-project-improvement.md) → [검증 기록](VALIDATION.md) 순서로 확인한다. 과거 기록의 테스트 수·배포 성공은 현재 변경의 검증을 대신하지 않는다.
