# Limited RAM without silently lowering quality — October 28, 2026

Base main: `fd796e7b5448a8de09a869f19ba827a4a8b5cd28`.
Desktop version: 3.0.9-dev. Companion unchanged.

## What changed

The existing RAM admission, reserve/watchdog, inactive unloading, pressure-only
64/32 batches and heavy-work serialization remain in place. Inspection found a
quality defect in foreground chat resumption: the queued path directly generated
one answer, skipping automatic required-tier escalation and the original hybrid
review threshold. This task repairs that path rather than adding another queue.

- A queued automatic request resumes the same deterministic routing decisions,
  including required-tier escalation, uncertainties and source checks. It can
  wait again for a required larger model; low RAM does not authorize a downgrade.
- Session-only checkpoints reuse completed inference and failed-attempt outcomes.
  The original two-inference limit remains cumulative across the wait. A completed
  Small assessment followed by waiting for High executes Small once, not twice.
- The original model catalog, cap and warm-model eligibility are captured before
  waiting. Other chats cannot substitute their subsequently warmed brain.
- Queued transport remains Local Only. The original review threshold still
  applies; insufficient evidence, incomplete input/output or a cap below the
  recommended tier keeps a clearly labeled review-required draft. No low-RAM
  cloud request is added.
- The wait status follows the actual required model during escalation. The final
  answer retains routing, evidence checks, local token accounting and output limit.
- Checkpoints retain routing input and bounded outcomes, not original streaming
  callbacks/controllers that could retain unrelated chat/file lookup state. Their
  retained serialized data counts toward the existing offer-memory budget.

No new packages, model substitutions, quantization, compressed cache, lossy
summaries, document splitting, worker routing, permissions or production data
changes. Existing file streaming, bounded processing and durable report-job
checkpoints are reused. An approved Worker remains subject to its own admission;
this change does not automatically transfer a chat to another PC.

## Measurements

New non-admin whole-process-tree baseline measurements ran against the already
installed accepted build, with separate synthetic profiles. Owner data, sessions,
browser registrations and credentials were not used. The old cancelled UAC/event
tracing benchmark was not restarted. These are baseline observations, not a
before/after speed or memory-saving claim.

| Measurement | Observed baseline |
| --- | ---: |
| Windows-visible total RAM | 15.58 GiB |
| Tray-only steady idle mean summed working set | 374.94 MiB |
| Tray-only steady idle mean private commit | 148.45 MiB |
| Tray-only steady idle CPU, one-core equivalent | 0.849% |
| Tray-only process count | 3 |
| Synthetic validation + real Small peak summed working set | 2.692 GiB |
| Synthetic validation + real Small peak private commit | 1.365 GiB |
| Active trial minimum available system RAM | 2.752 GiB |
| Active trial maximum sampled process count | 8 |
| Collector start to hidden renderer ready, upper bound | 3,801 ms |
| Renderer-ready observation after validation began | 1,020 ms |
| Real Small inference / packaged validation | Passed / 16 checks |

The 3,801 ms bound includes process/Core startup and collector setup; the 1,020 ms
value starts later, when validation began. Neither measures cold boot or visible
first paint. One-second sampling plus query time can miss
short-lived processes or transient peaks. Summed working set counts shared pages
per process; private commit measures something different. CPU is a sampled
lifetime lower bound, expressed as a percentage of one core. The synthetic idle
profile has no connected phone or WhatsApp account. Competing applications can
change system-available RAM. Neither this sample nor the earlier 3–5 MiB batch
savings establishes a large whole-app reduction.

Prior exact-runtime single synthetic native trials (October 27, same unchanged
local engine code) measured Small load/generation 1,653/2,445 ms; Medium
2,473/7,901 ms; High 2,896/6,355 ms. These are single observations, not statistical
speed comparisons or clinical-quality acceptance. Retain the prior failed
literal-format checks and repeated-trial limitations in
[the original measurements](LOW_RAM_SAFE_CHANGES_2026-10-27.md).

`scripts/measure-app-tree.cjs` makes the whole-tree measurement reusable. It
accepts only an isolated tray-idle or existing packaged-validation scenario,
uses bounded local counter queries and stream hashing, fences owned-process
cleanup against PID reuse, observes the existing critical-memory floor, and
supports a `<output>.cancel` file. Run trials sequentially without competing
tests/builds. It does not install an app, trace the owner session or change a
saved Windows policy. It is developer tooling, outside the packaged runtime.

## Verification and limits

Focused real Core/encrypted SQLite tests cover same full input/output limits,
Small→High and Small→Extra escalation, reuse of successful/failed inference,
the two-call limit, changed catalog/threshold rejection, warm-model drift,
cancellation while High waits, status accuracy, and explicit restart recovery.
Synthetic uploaded facts, totals, exact quotation evidence and missing-data
cases retain their expected semantics and review flags. Model responses are
controlled in these routing regressions: they prove pipeline behavior, not
general LLM accuracy or clinical equivalence.

The real installed Small trial separately confirmed that an unavailable
medication feed remains unknown. Model weights, f16 cache, input and configured
output caps were not reduced. Cancellation/source/history/privacy/lock/archive
checks and existing security gates remain in place. Source checks and tests do
not establish that an arbitrary larger model can run below its physical needs.

Chat wait snapshots remain session-only: after restart the original encrypted
request remains, its old wait is interrupted, and the user must retry explicitly.
No credential or tool operation is silently replayed. Existing durable report-job
checkpoint recovery is unchanged. There was no physical memory-pressure allocator,
live PCC/Power BI account use, phone test or owner installation in this task.

See `PROJECT_STATUS.json` for final local counts and exact-head CI status. An
initial full-suite source-fingerprint failure was fixed using the normal generator.
An initial UI cancellation test raced its asynchronous Stop RPC; it now waits
for acknowledgement before restoring RAM and retains all no-extra-call assertions.
Initial failures are retained in local evidence, not relabeled passes.

## Recommendation

Use the current wait/resume behavior and keep RAM reserves. This task establishes
quality-preserving recovery, not large RAM savings. The smallest worthwhile next
performance step is to measure one representative complete report with its
required brain, then optimize any demonstrated full-file copies with bounded
readers. More physical RAM remains the direct way to fit larger model weights;
do not enable compression or split documents without separate approval and tests.
