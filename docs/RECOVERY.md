# DB 복구 절차와 격리 훈련

최종 확인: 2026-10-02. 운영 대상은 `wrangler.jsonc`의 `seoyeon-zip-validation`이다. 실제 운영 DB 복원·덮어쓰기는 별도 사용자 요청 후 진행한다.

## 복구할 수 있는 범위

D1에는 게시물·미디어 메타데이터, 판정/revision, 감사 이벤트, fingerprint/사진 차이 판정, 표시 주소 매핑, 수집 상태, 마이그레이션 이력이 있다. 원본 이미지 파일은 저장하지 않으므로 DB 복원으로 삭제된 원본 사진을 되살릴 수 없다. 만료된 CDN 주소는 복원 뒤에도 갱신이 필요하다.

[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)은 현재 Free 7일/Paid 30일 이력을 제공한다. 10/2 실제 계정에서 9/24 00:00 UTC의 bookmark 조회가 성공했다. 이는 8일 전 시점 조회 권한의 증거이며, 실제 복원 성공이나 청구 요금제 확인을 대신하지 않는다. 현재 계정 청구 정보와 전체 30일 가용성은 확인하지 않았다. 기존 외부 백업 보관 정책도 확인되지 않았다.

## 안전한 사전 훈련

1. 현재 코드 SHA, D1 ID, `d1 info`, 최신 migration 이력과 Time Travel bookmark를 읽는다. 비밀값과 bookmark 원문은 공개 보고서에 넣지 않는다.
2. [공식 export 절차](https://developers.cloudflare.com/d1/best-practices/import-export-data/)로 `.local/recovery/` 같은 Git 제외 위치에 저장한다. 파일은 개인정보·서명 URL을 포함할 수 있으므로 공유하거나 CI artifact로 올리지 않는다.
3. 다음 명령은 새로운 로컬 SQLite 파일만 만든다. 기존 파일이 있으면 `destination_exists`로 중단한다. 스크립트는 Worker/Cron/공급자 비밀값을 로드하지 않는다.

```powershell
node node_modules/wrangler/bin/wrangler.js d1 export seoyeon-zip-validation --remote --output .local/recovery/export.sql
node scripts/verify-recovery.mjs .local/recovery/export.sql .local/recovery/new-copy.sqlite > .local/recovery/manifest.json
```

4. `integrity=ok`, `foreignKeyViolations=0`, 테이블별 행 수·SHA-256와 schema/export 해시를 확인한다. D1 export는 자식 테이블을 먼저 만들 수 있어 사본 적재 중 FK 강제를 끄고 전체 적재 뒤 명시적으로 `foreign_key_check`를 실행한다. 실패하면 rollback하고 사본을 사용하지 않는다. 신뢰하는 D1 export만 입력한다.
5. 기준 export를 별도 새 파일에 다시 복원해 전체 테이블 해시를 비교한다. 운영 비교는 SELECT만 사용하며 `rows_written=0`을 확인한다. 운영 수집은 계속 움직이므로 시각이 다른 수집 상태 차이를 데이터 손상으로 단정하지 않는다.
6. 훈련 파일의 보관·폐기는 소유자 정책에 따른다. 현재 사본은 이 작업의 Git 제외 로컬 폴더에만 있으며 정기 백업이나 다른 장치 복제는 설정하지 않았다.

## 2026-10-02 훈련 결과

- export 생성 04:04:09–04:04:11 UTC, 16,917,640 bytes. 로컬 복원과 전체 행 해시 생성 2,005ms, 37개 테이블, integrity 정상/FK 위반 0.
- posts 3,108, media 5,543, Instagram 판정 209, YouTube 380, 감사 기록 270+372, migration 32, 표시 주소 매핑 60, 확정 fingerprint 129.
- 같은 export를 두 번째 새 사본에 복원한 결과 37개 전체 테이블과 schema의 SHA-256 일치. 두 번째 복원/해시 생성 4,668ms. 판정·revision·감사·사진 JSON 순서를 포함한 전체 행의 재현성을 확인했다.
- 후속 운영 SELECT와 사본의 주요 행 수, Instagram/YouTube 판정별 건수·revision 합계, Instagram 갱신 상태, YouTube 출처 상태 일치. 모든 비교 조회 `rows_written=0`, `changed_db=false`.
- X 수집 상태별 건수는 후속 조회 때 달랐다. export와 조회 사이 예약 수집에 따른 변동이며 사본의 구조·해시 검증과 별도로 기록한다.
- 첫 SELECT 시도는 Wrangler `--file`의 import 경로로 전달됐으며 compound SELECT 오류로 실패했다. 입력에는 SELECT만 있었다. 이후 단순 집계 SELECT의 query 경로로 위 비교를 완료했다.
- 이는 로컬 SQLite 복구 시간이다. 운영 D1 복원, Worker 재연결, 실제 서비스 복구 시간(RTO) 또는 최대 손실 시간(RPO)을 보장하지 않는다. export 이후 새 변경은 사본에 없다.

## 장애 발생 시 순서

1. 운영자: 장애 시각·영향·최근 배포와 migration을 확인하고 현재 DB export/bookmark를 확보한다. 알림·오류·데이터 손상 여부를 구분한다.
2. 코드만 문제이고 DB 호환성이 유지되면 검증된 이전 코드의 재배포 또는 수정 배포를 선택한다. 이번 개선은 schema 변경이 없어 기준 `452a463`과 호환된다. 과거 0031/0032 뷰·테이블을 내리는 역마이그레이션은 하지 않는다.
3. DB가 손상됐다면 복원할 시각, 해당 시점 이후 잃는 판정·감사·수집 결과, 권한·중지 범위를 소유자에게 제시한다. Time Travel은 현재 DB를 과거로 되돌리는 작업이므로 별도 요청 없이 실행하지 않는다.
4. 승인된 유지보수 범위에서 수집/갱신을 중지하고 복원한다. 이전 cursor·lease·외부 실행 ID가 돌아오므로 공급자 유료 실행을 재시작하기 전에 진행 중 실행과 대조한다. 자동 수집 재개 전에 판정/revision·감사·사진 순서·공개 범위·관리자 인증·migration 호환성을 확인한다.
5. 복구 기준 시각, 손실/재처리 범위, 복구 시간, 공개 feed와 관리자 차단 결과를 [VALIDATION](VALIDATION.md)에 기록한다. 확인되지 않은 부분을 성공으로 표시하지 않는다.
