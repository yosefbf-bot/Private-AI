# Low-RAM work: seven batches — October 28, 2026

Base main18f1f08; desktop3.0.9-dev. Branch chatgpt/low-ram-seven-batches-20261028. The owner authorized the revised plan in order and main integration only after final gates. This is the local verification record; GitHub exact-head checks and Windows acceptance artifacts remain the release authority. The installed owner app/data and companion are unchanged.

## What changed

| Batch | Decision and behavior |
| --- | --- |
| 1 — Measure first | Added a fixed30-case synthetic evaluation and a bounded Windows per-process/constraint tool. Confirmed mapped GGUF weight pages. Kept the admission estimate, reserve and watchdog. |
| 2 — Complete-input context | Verified Small can allocate1K for fitting short requests under pressure. All16 shared native chat/SBAR cases had identical generated-token sequences across1K/2K. Nine longer documents retain2K; answer budgets are never shortened. Cold admission/learned peaks retain at least the old2K budget. Compatible warm engines are reused. Invalid budget metadata cannot bypass checks. Removed the byte-budget minimum that could borrow reserved output space. Disabled native context shifting so earlier source tokens cannot be silently discarded. |
| 3 — Runtime defaults | Pinned b10809 already supports automatic Flash Attention. Left it on its existing auto setting, cache compression off, and pressure-only64/32 batches intact. No unmeasured runtime optimization or speed claim. |
| 4 — Background work | Kept existing between-call waits/checkpoints, serialized heavy work and foreground priority. Repaired the older sectioned-report and automatic-draft callers to preserve required brain/escalation and wait for RAM, including when an approved cloud is available. Completed sections are reused; locking cancels drafts awaiting RAM. No new Windows memory-priority policy: the bounded real-allocation trial was pressure-stopped after7 cases, not accepted. No production hard working-set cap. |
| 5 — Idle window | Added one-shot, cancellable reclamation of owned idle renderer/GPU pages through the existing native helper. It never destroys the renderer. Recordings, requests, jobs, models, browsers and other visible windows exclude it. Native ownership uses retained handles, image/ancestry and birth-time checks. A readiness handshake rechecks idleness immediately before mutation. No periodic shell process. Packaged Windows acceptance now requires measured reclamation and unsent-draft retention through hide/restore. |
| 6 — Browser/documents | Retained1.5GiB browser floor. Added scheduled wait/resume/exactly-once/cancel tests. Existing PDF OCR already runs serially at scale2; added assertions for serial work, unchanged render quality, page cleanup and incomplete-source handling. No new document splitting or summarization. |
| 7 — Memory health | Existing Run local checks now gives numeric commit/page-file advice, persisted in the encrypted maintenance record. Unknown readings remain unknown. No Windows setting changes or new polling/UI dashboard. |

## Measurements

The matched one-prompt Small runs used 990.3MiB private commit at2K and 877.6MiB at1K: 112.7MiB less. This is not a whole-app saving or permission to load with less safety headroom. Default768-token answers are not cut to qualify for1K.

The isolated Electron-view repeat reduced renderer/GPU resident memory from 218.5MiB to 1.5MiB after250ms. Private commit stayed 141.5MiB. Restore measured 49ms before / 56ms after; the synthetic draft survived. This prototype is not packaged-app or sustained-idle acceptance. Do not add this resident saving to the different private-commit measurement.

| Brain at2K | Semantic cases /30 | Decode tokens/s (median) | Peak private MiB | Peak resident MiB |
| --- | --- | --- | --- | --- |
| small | 28/30 | 5.25 | 1188.6 | 2204.0 |
| medium | 15/30 | 7.37 | 1649.9 | 3537.9 |
| high | 29/30 | 7.03 | 2309.7 | 4630.9 |

Each30-case set contains25 native responses and5 deterministic calculations. These are raw synthetic task checks, not clinical accuracy or full-app performance. Live host load varied, so no matched speedup is claimed. Separate streaming trials measured Small median TTFT2252ms and13.565 decode tokens/s; the nonstream token-identity runs correctly leave TTFT unknown.

Small still missed citation C03 and explicit planned/not-completed S05, identically before/after compact context. Medium missed supplied counts/citations and followed a quoted instruction in C08; it receives no compact tuning. High had one semantic miss, S05. Its original resident-label failure was the exact supplied phrase resident Alpha, now recorded as a representation difference. Strict representation/schema deviations remain visible separately. Human review and normal evidence/escalation rules remain necessary.

## Honest constraint and quality evidence

Commit and working-set caps each passed two synthetic cases at1.5GiB; they are diagnostics only. The condition-c256MiB touched allocation released under pressure and stopped the trial after7 cases. Sampling can miss the instantaneous low point before release. No lower production admission or background priority change is supported. Sustained low-RAM stress, battery, cold-boot and condition-c transcription/long-job equivalence remain unperformed.

Fixed prompts and expected facts never changed. Reanalysis verifies fixture/output hashes, preserves original verdicts, and separates type/label representation from factual mistakes. Wrong identities, units, values, missing citations and injected instructions still fail. Earlier streaming generated-token arrays were empty and were not accepted as identity evidence; that trial was cancelled. The final normal nonstream path returned nonempty actual token IDs, giving16/16 shared-case token identity. Hard faults are unavailable without separate tracing; total faults are never called hard faults.

Raw receipts and synthetic output remain in workspace Validation/LowRAMSeven-20261028 outside Git; sanitized numeric evidence is LOW_RAM_CONSTRAINED_2026-10-28.json. Per-group repeated-token fields concern repetitions; compactComparison concerns the separate cross-context identity check.

Pinned runtime references: https://github.com/ggml-org/llama.cpp/blob/b10809/tools/server/server-context.cpp and https://github.com/ggml-org/llama.cpp/blob/b10809/tools/server/server-task.cpp. The runtime can shift/discard earlier tokens unless disabled; generated token IDs differ in availability between streaming and nonstream responses.

## Verification and preservation

Local full source1036/1036,0skips after the two background caller repairs; hardening30/30. The final cloud-eligible test extension adds one case: all4 background regressions and the affected12-test set pass. Three regressions reproduced the original downgrade/cancellation defect before the caller fix. Initial full-run failure was stale build metadata; regenerated using the existing prepare:browser script. The fixed evaluator's focused set passed15/15.

Actual Edge general UI46; assistant25, note drafts14, contrast117, dark visibility7; clinical UI8; hardening UI passed. Synthetic Edge/Chrome sign-in/download/approval/date/folder/report workflows passed. Initial general-UI launch used a missing bundled Chromium path; rerun used installed Edge through the existing supported environment option. Firefox/Chromium and live PCC/Power BI were not exercised in this run.

Production dependency audit0; current/history Gitleaks0; CI scope-policy19 passed. Required final syntax/repository/guide/source-fingerprint checks precede publication. Fresh helper compilation and installer/upgrade/portable/full packaged idle acceptance are required in exact-head Windows CI; no SDK is installed locally, and component Add-Type tests are not an installer test.

Independent bounded read-only review found seven measurement-tool issues and two idle timing issues. They were fixed, regressed and re-reviewed with no remaining material issue. Evaluator equivalence/identity reporting received its own narrowly bounded review after a concrete false failure. Main performed all implementation; no nested delegation or extra services.

The cancelled base-main CI had completed995 source tests and its clinical assertions, then hung waiting for server close before browser close. A real pending-response regression reproduced it. Browser-first cleanup and closeAllConnections now terminate; the unchanged UI assertions have a5-minute CI-step deadline. Failed/cancelled history remains history, not a pass.

PR49's first head4d3dd108 run40726580885 passed source/regression, ACL, dependencies, secrets and fresh helper/runtime compilation but failed the first clinical UI click's5-second stability check on Edge155. Installer/model acceptance was consequently skipped. The clinical fixture now uses standards mode, actual app CSS/MIME, a representative viewport and an explicit foreground/scroll before the ordinary click. All assertions remain; failed clicks emit synthetic geometry/RAF diagnostics. Local Edge156 clinical8/8 passed. The next exact-head Windows run must validate Edge155 and packaged acceptance; this local result does not erase the failed run.

No dependency/license/version changes; package-lock and build assets preserved. No owner install, database, credentials, models or pairing changed. No new cloud fallback, smaller brain substitution, lossy summaries, cache compression, autonomous loop or duplicate integration. Astra is not needed to finish these changes. A future narrowly scoped model-quality review can use the recorded misses without repeating this whole project audit.
