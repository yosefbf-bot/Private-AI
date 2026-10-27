# Measured, conservative low-RAM changes — October 27, 2026

Base desktop main: `73f26687a1c7ace4dc03f323bff83915d419c6c5` (3.0.9-dev).
Companion main `9098b1e5840e0e8bb4f0ec5f36b51740d94b7003` needs no changes for this task.
The owner approved measurements, RAM waiting, inactive-model unloading and smaller
inference batches, keeping the chosen brain and supplied input. Compression, new
document splitting, GPU and Ollama changes are outside this task.

## Behavior

- A foreground chat that cannot admit its catalog model can offer **Run when
  memory is free**. It retains the assembled request, instructions and exact
  model in this session; resumption replaces the original failed assistant turn.
  It does not append a duplicate user message, replay tools, send a message,
  change the context again, or switch to a smaller model/cloud because of RAM.
- The offer is local text inference only. Web/image capabilities and Cloud First
  cannot be silently replaced with plain local inference. Blocked routing triage
  retains the complete answer input for the rule-selected answer brain.
- Waiting uses the existing background resource coordinator and foreground
  priority. Approved background chats and ordinary jobs use the same admission
  checks and wait at safe boundaries without needing a desktop button.
- Cancel, lock, Quit, changed privacy/model settings, edited history, changed
  sources, deleted chats and unavailable/changed model files invalidate a wait.
  Revocation does not depend on successfully writing a status record. Queued
  snapshots never restart automatically after reopening. Offers expire after
  15 minutes and are bounded to four / 8 MiB total in memory. Temporary chats
  remain temporary. Persisted chat text remains in the existing encrypted store.
- A ready, inactive Balanced model releases after approximately 30 seconds when
  free RAM is below 4 GiB, unless Keep brain warm explicitly requests follow-ups.
  Healthy-RAM idle settings and Performance mode remain unchanged. Active work
  and loading are protected; the existing critical-memory watchdog remains.
- A cold Balanced load below 4 GiB free uses batch 64 / microbatch 32 instead of
  128 / 64. Comfortable-RAM and Performance loads retain 128 / 64. Model weights,
  f16 cache, supplied input, answer budget, CPU execution and safety floors stay
  unchanged. The admission estimator was not lowered.

## Measurements and the resulting decision

All trials used the real accepted Windows runtime, checksummed public GGUFs,
CPU inference, f16 cache and the same complete synthetic prompt within each pair.
No owner records, prompts, answers, credentials, sessions or output text were
retained. Runtime SHA256:
`ae031a6cdd01510a1fd3e510eafd974071bf178fe57d995f0662f2206acefd90`.
See `LOW_RAM_MEASUREMENTS_2026-10-27.json` for sanitized counters and exact source
fingerprints. Process working set, private commit and system free RAM differ;
neither process peak is a whole-app RAM-saving measurement.

Twelve Small trials compared the two batch profiles three times each at 2K and
4K context. Another six trials compared Small, Medium and High once each at 2K.
All 18 completed nonempty answers without reaching the output limit. Smaller
batches reduced observed peak working set by only about **3–5 MiB**, less than
0.2%. Small 2K median generation was 9.842 vs 9.755 seconds; Small 4K was 8.517
vs 10.524 seconds. Free RAM changed during the run and trials were not randomized.
These mixed timings support no general speedup claim. Consequently smaller
batches are restricted to actual RAM pressure, rather than enabled everywhere.

This was a performance/function test, not a clinical accuracy benchmark. Strict
literal-format checks failed in all twelve repeated Small trials. In the later
six trials, punctuation-insensitive checks passed for both Small and High pairs
and failed for both Medium cases; High also passed the strict check. Answers
were not retained, so no explanation for those mismatches is asserted. Changing
batch sizes does not deliberately lower model precision, but identical answer
quality/output is not proven by these tests.

The earlier 54 configurations were safely refused when approximately 1.2 GiB was
free. Repeated Medium/High at 4K/8K, Extra High (not installed), sustained physical
low-RAM stress, cold-boot and long-context quality acceptance remain unperformed.
Medium/High peak working sets were larger than the simple file-plus-context
estimate; retain learned peak/reserve protection and do not lower admission
floors based on these short trials. The version-only runtime CLI timed out;
normal authenticated runtime startup and genuine inference succeeded. This does
not verify support for cache compression or identify a runtime source tag.

## Verification and use

Focused regression tests cover same-model/full-input waiting, automatic/manual
routing, temporary chats, background chat, IPC/HTTP permissions, cancellation,
stale requests, failed storage, unchanged reserve/watchdog and idle lifecycle.
Real Edge UI checks cover the visible wait/resume/cancel flow in both themes;
synthetic Edge/Chrome browser-report download checks preserve existing behavior.
The current task's exact final counts and GitHub acceptance belong in
`AI_HANDOFF.md` and `PROJECT_STATUS.json` after they execute.

This source change does not replace the owner's installed application or data.
Use a candidate only after its exact-head Windows installer/portable acceptance
passes. Existing physical-phone and live PCC/Power BI account checks are separate.

Recommendation: keep automatic context fitting and all admission protections,
use the waiting option for temporary memory pressure, and retain the current
models. A RAM upgrade offers substantially more headroom than batch tuning.
Consider compression or document splitting only as separate, opt-in work with
quality tests and explicit owner approval.
