# Instagram result synchronization

Approved scope: completed Apify task results automatically enter the private review inbox. New posts stay pending, existing decisions survive. Do not start paid runs or change the pilot schedule/budget.

1. Reuse the validated Instagram importer as an internal function supporting a single atomic page/checkpoint transaction.
2. Add a separate D1 sync lease and run ledger. Every five minutes discover task runs in bounded pages, accept SUCCEEDED runs only, and import one bounded dataset page. Reject malformed/oversized/partial responses without advancing their checkpoint. Retry with backoff.
3. Use server-side APIFY_TOKEN, an explicit task id, and an enable switch. No webhook or Access exception. No token in URLs, responses, logs, exports, or Git.
4. Show read-only sync status in the Instagram inbox. Preserve existing manual JSON import and review workflows.
5. Test duplicate runs, pagination, failure retry, atomic rollback, concurrent execution, approval preservation, disabled/missing configuration and public authorization. Build and review. Apply only the new migration, retaining the historical migration-ledger caveat.
6. Deploy through GitHub. Configure the credential as a Worker secret and verify an existing completed run (no new scraper run). If credential configuration needs the user, report code/deployment separately from active synchronization.

API references: https://docs.apify.com/api/v2/actor-task-runs-get and https://docs.apify.com/api/v2/dataset-items-get . Task id observed in existing pilot state: W7bGic2wKjj2BKhSE. Initial discovery includes the existing task's history, not unrelated Actors. Successful run outputs are treated as immutable snapshots; later edits to already-synced datasets are outside this flow.
