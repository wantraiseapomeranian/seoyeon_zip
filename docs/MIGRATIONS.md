# DB 마이그레이션 이력

운영 DB는 `wrangler.jsonc`의 `seoyeon-zip-validation`이다. 이력은 `d1_migrations`에 저장한다. 새 변경 전에는 저장소의 SQL 파일, 운영 이력, 실제 스키마를 함께 확인한다. 파일명이 이력에 없다는 이유만으로 과거 SQL을 다시 실행하지 않는다.

## 2026-09-22 이력 보완

0012~0017은 실제 반영됐지만 이력 6개가 누락된 상태였다. 0001~0011·0018~0028의 기존 이력 22개는 존재했다. 이 보완은 해당 상태를 대상으로 하며 새 DB 설치용 마이그레이션이 아니다.

실행 전 읽기 전용 조회로 다음을 대조한다.

- `manual_posts`, `instagram_sync`, `instagram_sync_runs`, `instagram_sync_pending`의 정의.
- `instagram_photo_rows`, `instagram_feed_posts`, `feed_posts`, `managed_feed_posts`의 **최신** 정의. 뒤의 0014·0020·0024에서 변경된 뷰를 초기 정의로 되돌리지 않는다.
- `collection_state`의 `WEV86_`, `merongseo806`, `yeoniverse_bb`, `wavefunc0806` 행 존재. 활성 여부·revision·커서는 그대로 둔다.
- 이력의 누락 파일이 위 6개뿐인지 확인한다. 실제 스키마나 소스 행이 없거나 정의가 다르면 이 보완 SQL을 실행하지 않는다.

보완 파일은 자동 적용 대상인 `migrations/` 밖의 `scripts/sql/reconcile-2026-09-22-migrations.sql`에 둔다. 확인한 DB에만 명시적으로 실행한다.

```sh
npx wrangler d1 execute seoyeon-zip-validation --remote --file scripts/sql/reconcile-2026-09-22-migrations.sql --json
```

단일 INSERT로 누락 이름만 추가한다. 기존 이력의 ID·이름·시각을 유지하며 재실행 시 이미 있는 이름은 추가하지 않는다. 새 `applied_at`은 **보완 시각**이며 최초 SQL 적용 시각을 복원한 값이 아니다. 검증은 `tests/migration-ledger.test.mjs`에 있다.

실행 후 이력 파일명 전체 일치, 기존 22행 보존, 전체 스키마 정의 유지, 해당 소스 행 존재를 다시 확인한다. `npx wrangler d1 migrations list seoyeon-zip-validation --remote`로 대기 항목도 확인하고 실제 결과를 `docs/VALIDATION.md`에 기록한다.

## 다음 변경부터

정상적인 새 마이그레이션은 적용 이력도 남기는 Wrangler migration 절차를 사용한다. 명시적 `d1 execute`가 필요한 예외에서는 적용 성공과 실제 스키마 확인 후 이력 등록까지 한 작업으로 기록한다. 운영 데이터가 바뀌는 SQL은 이력 보완 SQL과 구분한다.
