# Speed and memory plan — Batch 1 (2026-10-26)

Base: `80f4352467a8e340ec848605f49d1fc63c624a3a`; version 3.0.9-dev.
Owner approved Batch 1 of the uploaded six-batch plan, in order. Later batches
remain separate. No dependency, model, resource-floor, retention or CI changes.

## Implementation

- Explicit encrypted job summaries omit result/recovery bodies. Failed playbook
  drafts load only when requested; export/search/recovery keep authoritative text.
- Phone task listings SQL-limit to 100 summaries, with total/truncated preserved.
  Status counts use a disposable encrypted aggregate.
- Unchanged WhatsApp/correspondence snapshots do not rewrite source/candidate
  records. Coverage checks remain separate; revisions, stale review and original
  observation/expiry semantics remain enforced.
- Drafting, speech and reminders select encrypted eligibility summaries, then
  reload authoritative records before actions. Speech shares one audio snapshot on idle passes and refreshes once after an awaited transcription. Finalization retains its independent pending-audio guard.
- Attendance groups a single table read; retention uses SQL counts; configured
  PCC does not scan import history. General analytics and Demo remain independent.
- Staffing imports select winning type/date/unit snapshots, retain all history,
  and load contributing batches once. Duplicate detection/sequence writes and
  encrypted snapshot derivation use transactions.

## Storage compatibility and implementation adjustment

Keep schema version 3 and original table layouts. Separate disposable projection
versions and encrypted aggregates avoid adding plaintext clinical/status indexes.
SQL invalidation handles older writers, identical timestamps, deletes and rollback.
A missing/obsolete projection is backfilled once without changing source bytes,
expiry or timestamps. Aggregates are rebuilt lazily under a transaction after
invalidation instead of maintaining a second incremental source of truth. This
reduces migration risk; the first read after a relevant change still processes
summaries. Completed canonical history is never deleted for performance.

## Measured synthetic regressions

- Idle pass over 20 completed notes, 20 meetings, 20 tasks: 80 full-body decryptions
  before, 0 after (drafting + speech + reminders).
- 30 staffing batches, two contributing current snapshots: 30 body reads before,
  2 after. Historical batch count, units, provenance and unknown HPPD preserved.
- Identical two-message WhatsApp + correspondence recheck: 6 source/candidate
  writes before, 0 after. One changed message writes only its three records.
- 130 phone jobs: task API decrypts 100 summaries; repeated status decrypts no
  individual job summaries after aggregate creation. Counts remain exact.
- 20 attendance records, four display-name groups: baseline algorithm 100 reads;
  measured new path 20. Mixed-case matching, old/excused records preserved.

These are deterministic operation counts, not measured whole-app RAM, battery,
startup or latency percentages. The first legacy backfill has one-time costs.

## Validation / delivery

Full source suite: 866 passed, 0 failed/skipped. Targeted final identity/recovery
checks: 16/16. Hardening: 30/30. Syntax: 269 files. Repository policy and generated
guides passed; production dependency audit: 0 vulnerabilities. General UI: 40
checks; assistant UI: 25 workflows, 14 note/draft checks, 117 surface contrast and
7 dark visibility checks. Authenticated hardening UI passed, including denial of
the new draft read in development. The plan's pre-existing UI failure was not
reproduced. Native dispatch shares the workflow router; the new operation remains
production/unlocked only and is not exposed to the phone or extension.

Independent read-only review covered storage, legacy invalidation, staffing,
job consumers and asynchronous speech. A regression reproduced a stale snapshot
attempting premature finalization; the existing engine guard already prevented
completion. Refresh after await now avoids that erroneous attempt. The regression
passes, and the final guard reads encrypted metadata rather than audio bodies.

The first full run found the expected stale build-identity file and an older mock
missing the new aggregate API. Both were corrected without weakening assertions.
UI fixture URL/closed-details setup was also corrected; final UI checks passed.
Exact-head GitHub/package acceptance is required before merge. Production
installation and owner data are untouched. Physical phone and live PCC/Power BI
acceptance remain separate from synthetic gateway/browser checks.
