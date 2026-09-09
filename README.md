# 서연모음.zip

비공개 사진 아카이브 검증용 구현입니다. 예약 수집 코드와 상태 관리는 구현했지만, 제공자 탐색 종료 조건과 원격 실행 예산 검증이 남아 Cron은 아직 활성화하지 않았습니다. 최종 UI는 아닙니다.

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
- 원격 D1에 0001/0002 마이그레이션을 적용했습니다. 기존 게시물 20개는 보존했고 운영 전역/소스 상태는 모두 비활성입니다.
- 이 브랜치의 `/api/probe`는 410입니다. `POST /api/sources/:handle/retry`는 소유자 인증, 동일 Origin, `x-validation-action: collect` 헤더를 요구하며 활성 소스의 다음 실행 시각만 앞당깁니다. 외부 수집을 직접 실행하지 않습니다. 중지/확인 필요 상태는 409입니다.
- `GET /api/sources`는 소스별 마지막 페이지 저장/전체 범위 완료 시각과 장애 상태를 반환합니다. 페이지 저장만으로 전체 범위 완료를 표시하지 않습니다.
- scheduled는 `COLLECTION_ENABLED=true`, D1 `collection_control.enabled=1`, 해당 소스 enabled=1이 모두 충족돼야 실행합니다. 현재 환경 봉인과 Cron 미등록 상태를 유지합니다.
- D1 batch guard는 lease 토큰·만료·revision·전역 중지 revision을 함께 확인합니다. 중지 후 재개해도 오래된 실행은 커밋할 수 없습니다.
- 로그 wallMs는 CPU 시간이 아닙니다. rowsRead/rowsWritten의 `sqlScope`는 페이지 저장 batch와 로그 INSERT만 포함하며 lease/시각 조회는 제외합니다. 로그 실패 시 비용은 null이며 저장 성공과 별개 경고를 기록합니다.

## 예약 수집 검증과 중지

```sh
npm test
node scripts/validate-scheduler.mjs --local
node scripts/inspect-provider.mjs
npx wrangler deploy --dry-run
```

`validate-scheduler`는 임시 로컬 workerd/D1에서 scheduled를 호출하고 외부 응답을 모의 처리합니다. 원격 DB나 실제 제공자에는 연결하지 않습니다. `inspect-provider`는 6개 공개 계정에서 두 페이지씩 실제 메타데이터만 읽으며 DB에 저장하지 않습니다. 각 검증의 목적은 다릅니다.

운영을 중지할 때는 아래 명령으로 DB 전역 봉인과 revision을 먼저 변경합니다. 실행 중인 응답의 커밋도 차단됩니다. Cron 제거만으로 즉시 중지됐다고 간주하지 않습니다.

```sh
npx wrangler d1 execute seoyeon-zip-validation --remote --command "UPDATE collection_control SET enabled=0,revision=revision+1 WHERE id=1"
```

활성화는 [실행 계획](docs/superpowers/plans/2026-09-09-automatic-collection.md)의 원격/공급자 검증을 통과한 뒤 별도 변경으로 진행합니다. 검증용 cursor를 운영 완료 경계로 이관하지 않습니다. 최초 7일 범위 재탐색으로 해당 범위의 누락을 복구합니다.

설계 기준: DESIGN.md, docs/SPEC.md. 실행 결과와 오탐 정정: docs/VALIDATION.md.
