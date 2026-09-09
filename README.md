# 서연모음.zip

단계 0 검증용 구현입니다. 운영 피드·최종 UI·정기 수집기는 아직 아닙니다.

## 로컬 실행

Node 24.14.1 이상에서 실행합니다.

```sh
npm ci
npm test
npm run collect
npm run dev
```

화면은 http://127.0.0.1:4173 에서만 열립니다. 수집 결과는 `.local/validation-v2.sqlite`, 최소 정규화 표본은 `.local/samples.json`에 저장됩니다. 미디어 파일과 제공자 raw 응답은 저장하지 않습니다. `collect`는 검증용으로 첫 페이지부터 다시 읽으며, 운영 Cron이나 이어받기 명령이 아닙니다.

```sh
npx playwright-cli -s=seoyeon open http://127.0.0.1:4173 --browser=msedge
npx playwright-cli -s=seoyeon run-code --filename=scripts/check-cards.js
```

실제 사진/영상 썸네일과 의도적인 이미지 실패를 확인합니다. 스크린샷은 `.local/cards-{width}.png`에 기록됩니다.

## 비공개 Cloudflare 검증 준비

대상: 지정 계정의 `seoyeon-zip`. 비공개 검증 배포 주소는 https://seoyeon-zip.seoyeon-archive.workers.dev 입니다. 두 소스에서 실제 수집·D1 저장·썸네일 표시를 확인했습니다. 장기 운영 검증은 진행 중입니다.

### 공개 저장소와 배포 설정

- 소유자 이메일, Access 팀 도메인과 AUD는 저장소에 포함하지 않습니다. 기존 Worker의 Cloudflare 설정에서 `OWNER_EMAIL`, `TEAM_DOMAIN`, `POLICY_AUD`를 관리합니다.
- `keep_vars:true`로 기존 환경변수를 유지합니다. 새 Worker는 이 값들과 Access 정책을 먼저 설정해야 하며, 인증 설정이 없으면 모든 요청을 503으로 차단합니다.
- D1 ID는 인증 자격증명이 아닌 리소스 연결 식별자입니다. 다른 계정에 배포할 때는 자신의 D1 ID로 변경합니다. 배포 계정은 Cloudflare 빌드 환경 또는 로컬 Wrangler 인증으로 선택합니다.
- Cloudflare 연결 저장소의 배포 브랜치는 `main`, 루트는 저장소 루트, 배포 명령은 `npx wrangler deploy`를 사용합니다. 별도 프런트엔드 build 스크립트는 없습니다.
- `.local`, `.wrangler`, 브라우저 세션 기록, `.env*`, `.dev.vars*`와 설치된 의존성은 Git에서 제외합니다. 비밀값은 파일을 추가하거나 커밋 메시지에 적지 않습니다.

- 사용자 제공 TEAM_DOMAIN/POLICY_AUD를 설정했습니다. 허용 이메일은 지정한 소유자 한 명입니다.
- 현재 Wrangler OAuth에는 Access API 권한이 없어 앱 조회가 403입니다. Dashboard에서 설정하거나 별도 제한된 관리 권한이 필요합니다.
- Worker는 JWT 서명·issuer·audience·만료·소유자 이메일을 확인합니다. 단순 이메일 헤더는 신뢰하지 않습니다.
- Access 로그인 리다이렉트를 확인한 뒤 `workers_dev:true`로 배포했습니다. `preview_urls:false`, 정적 자산 `run_worker_first:true`를 유지합니다.
- 원격 D1 `seoyeon-zip-validation` 생성과 0001 마이그레이션 적용을 완료했습니다.
- `/api/probe?source=Seowoo_0501`은 인증된 동일 출처 POST와 `x-validation-action: collect` 헤더가 필요합니다. 한 요청은 한 페이지 전체를 판별·저장합니다. 운영 소스 활성화 기능은 아닙니다.
- D1 batch는 stale revision CHECK guard로 전체 저장과 cursor를 원자적으로 반영합니다. D1 원격 동작, CPU·SQL 한도 및 인증 우회 검증은 아직 완료되지 않았습니다.
- 로그의 wallMs는 네트워크 포함 경과시간입니다. CPU 시간으로 사용하지 않습니다. 응답과 콘솔의 rowsRead/rowsWritten은 사전 상태 조회, 저장 batch, 로그 INSERT를 합산합니다. runs 테이블 안의 관측값은 해당 로그 INSERT 자체의 비용을 알기 전 값입니다.

설계 기준: DESIGN.md, docs/SPEC.md. 실행 결과와 오탐 정정: docs/VALIDATION.md.
