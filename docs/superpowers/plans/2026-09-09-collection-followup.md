# Collection follow-up Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; the user requested one agent.

**Goal:** Prevent historical traversal from starving fresh posts, measure CPU cost, and keep paid fallback within the user's approximately USD 5/month budget.

**Architecture:** Keep the existing per-source lease and atomic page batch. Alternate a fresh first-page read with the saved history cursor. Bound history to 20 pages and keep polling fresh pages after history exhaustion/limit. This is best-effort coverage, never a claim of complete history.

**Tech Stack:** Existing JavaScript, D1, Workers, node:test and Miniflare. No new dependencies.

**Spec:** docs/SPEC.md, docs/VALIDATION.md and the user's follow-up authorization. Five-minute scheduler, one source/page per invocation, six sources, no media binaries, private Access. During history catchup latest reads are about 60 minutes apart; after catchup about 30 minutes. Neither is an SLA. Bursts exceeding a first page can be missed; expose coverage rather than claiming completeness.

## Tasks

## Paid private pilot follow-up

The user subsequently paid for Workers Paid and asked to continue. This follow-up extends the earlier inactive measurement task to the existing Access-protected app; no public release or GitHub push.

- [x] Confirm Workers Paid Active in the authenticated dashboard.
- [x] Set CPU limit 100ms, dry-run, apply migration 0003 without deleting existing posts, deploy the private app with DB switches initially off.
- [x] Verify anonymous Access redirect and owner API success before enabling the three verified direct sources. Keep the other three disabled.
- [x] Verify an actual five-minute scheduled invocation and persisted source state; record result and remaining coverage/long-term limits. At 04:55:41 UTC: Seowoo_0501 latest stored 20, total posts 21, CPU 10ms, outcome ok; next lane history persisted. Other two sources' first scheduled successes and long-term operation remain unverified.

The 100ms CPU limit is per invocation, not a USD 5 billing ceiling. Three-source latest refresh is approximately 30 minutes while history is active and 15 minutes after history pauses, excluding delays and retries.

## Earlier measurement task

Execution: all implementation/measurement/documentation tasks below completed; 32 tests and workerd passed. Remote improved CPU samples: 13ms and 7ms. Free headroom remains unproven. Paid checkout is staged but not activated because its agreement includes usage overages beyond the approximate USD 5 budget. No production activation, push or new commit.

- [ ] Add migration 0003 with next_lane and last_latest_success_at. Existing cursor/data survive migration. Select gap/limited sources for latest reads, but keep authentication/schema needs_attention and backoff blocking all lanes.
- [ ] Add tests for latest/history alternation, history cursor survival, bounded history, latest continuation after exhaustion, rollback and stop guards. Implement in collection-cycle/state/scheduler and expose lane/freshness through sources API.
- [ ] Profile parsing/normalization with a bounded in-memory real response. Optimize only measured or structurally redundant work, retaining full-response validation and atomic commit. Preserve collection_runs semantics.
- [ ] Run relevant tests, workerd harness and dry-run. Apply 0003 to isolated validation D1 only. Compare remote scheduled CPU using the same private validation Worker and end with all switches/Cron disabled.
- [ ] Check current Workers Paid minimum/included usage. If free CPU remains unsuitable, report paid option and expected usage; do not remove Access or assume a hard USD 5 billing cap. No provider paid API purchase.
- [ ] Update VALIDATION/PLAN/SPEC with observed results, limitations and remaining release checks. No main push or production activation in this task.
