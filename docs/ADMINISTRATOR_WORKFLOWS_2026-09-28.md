# Administrator workflow implementation — 2026-09-28

Base main: `6e3f85b3faffb1688f34d7681c5765e5be04cf82` (PR #5 merged).
Branch: `chatgpt/administrator-workflows-2026-09-28`.

## Plan and outcome

The six high-priority defects and immediate voice/dashboard recommendations were already implemented by PR #5 and are now in main. This branch implements the next product recommendations. It does not merge itself into main or establish Windows release readiness.

| Recommendation | Implemented behavior | Boundary |
| --- | --- | --- |
| Consolidate navigation | Today links to Operations and Action Center; Projects & Documents groups project/file work; Automation links agents, schedules, workers and playbooks; connections/tools are grouped | Existing routes and native IPC restrictions retained |
| Unified work queue | Alerts, meeting actions, To-Dos and SBAR loops with owner, deadline, overdue status, source navigation and revision-checked edits | Clinical resolution remains in the alert/SBAR workflow; converted meeting tasks appear once |
| Changes since review | Persisted review baseline classifies new, changed, resolved, unchanged and unavailable sources | Action records only; disappearance is not resolution; first review establishes baseline |
| Related alerts | Group by resident while preserving every item and its evidence | No inferred causal relationship or hidden critical alert |
| Meeting carryover | New meetings reference unresolved actions from earlier meetings of the same type; current status resolves from the original task | References rather than cloned assignments; finalized minutes are dated snapshots |
| Decision log | Reason, owner, reassessment date, source link, status and prior revisions | Operator-entered reviewer name is not authenticated clinical sign-off |
| Evidence packets | Reviewable source/evaluation/row provenance, source dates, current feed coverage, linked actions and decisions; desktop Markdown export | Rechecked before export; demo copy labeled; unavailable evidence remains explicit |
| Saved PCC mappings | Versioned reviewed headers and mappings; exact schema mismatch requires remapping; accepted/rejected preview before using a saved mapping; batch records mapping revision | Raw CSV/JSON import remains available; representative facility exports need acceptance testing |
| Staffing/census/payer imports | CSV preview, rejection details, deduplication, dated unit snapshots, shift/role hours and source provenance | Aggregate direct-care RN/LPN/CNA hours, not staff roster identities or payroll integration |
| Measured HPPD | Sum imported direct-care hours / imported unit census for the same date; requires full-day completeness attestation | Missing/zero census and incomplete-day hours produce unavailable HPPD; no staffing compliance or survey score |
| Versioned playbooks | Immutable revisions, required document inputs and headings, ten-minute run previews bound to files/settings/policy; replay protection; saved job revision; failed output checks retain a readable draft | Manual runs on this PC; calculations remain reviewed instructions, not a validated formula engine; no automatic delivery or playbook scheduling |
| Spending controls | Persistent monthly request-count limits and optional conservative dollar allowance; reservations precede network calls and survive errors | Per-PC UTC month; configured rates, not invoice accuracy; unknown models/web/images blocked with dollar limits; realtime uses local fallback when any budget enabled |
| Searchable documents | Exact extracted-text sections, page markers where present, character offsets, source revision, project-file links, extraction coverage | First 50 matches disclosed; no OCR, semantic vector index, or claim of whole-document reasoning |
| Longer reports | Opt-in report jobs bypass the single-prompt cap only through bounded section planning; up to 128 sections, complete source splitting and existing checkpoints | Original extraction limits remain (20 MB input, 350,000 text characters, PDF page limit); extra sections may cost more; normal chat limits unchanged |
| Voice recognition | PR #5 local capture, three confirmed samples, strict similarity/separation and abstention remain available | Suggested names require human confirmation; similarity is not calibrated identity accuracy |

## What was disconnected

The earlier features had separate action views and state: completing a converted meeting task could diverge from its meeting assignment, and the older To-Do editor discarded fields it did not submit. The new shared queue references existing sources and now preserves completion, owner and deadline across both editors. Deadline edits rearm reminders and update linked meeting actions.

Mappings were recreated for every import, with no reviewed revision attached to the batch. Playbooks were generic prompts without a preview tied to actual file revisions. Large jobs hit the single-context rejection before the existing section processor could help. Operational staffing/payer cards lacked actual input paths. The new workflows address these gaps without treating missing input as a reassuring measurement.

Testing also caught an evidence-preview issue: elapsed feed age changes continuously. The export review token now ignores the elapsed-age counter while retaining the underlying source dates, feed status, evidence, assignment and decisions; a real source/status change still invalidates review.

## Usage

1. Open **Action Center** from Today. Assign an owner/deadline, inspect the source or packet, and mark the reviewed action snapshot. Filters do not change which loaded records the review baseline covers.
2. Use **Record decision** on an item to retain the source link. Reassess or close it in **Decision log**.
3. In **PCC Import Center**, select a CSV, confirm report type/date/operator, map columns, save a reviewed mapping, then inspect the import preview. Changed headers cannot silently reuse an old profile.
4. In **Staffing & Census**, import aggregate CSVs. Staffing columns: `date,unit,shift,role,hours`. Census columns: `date,unit,census` plus optional `capacity,medicare,medicaid,other`. Payer categories must be mutually exclusive and sum to census when complete. Use YYYY-MM-DD and numeric nonnegative counts. Rejected snapshots do not partly update metrics.
5. Use **Projects & Documents** to attach imported files to projects and search their extracted sections. Removing a file removes it from search without leaving a second index copy.
6. Create a **Playbook** with required documents and headings, then inspect **Preview run**. Changed settings/files/revisions require a new preview. Failed heading checks leave the draft visible under Playbook runs and do not export it. Heading presence does not verify content.
7. Configure **Cloud budget** limits if wanted. A request limit of zero blocks billable generation. Existing reservations are retained when changing limits. Limits do not cover other applications, provider-side usage, or other PCs' ledgers.

## Storage, permissions and compatibility

No SQL schema migration or dependency change. New `wf_*` records use the existing encrypted Store; action/decision records follow the selected production/demo namespace. The last review stores identifiers/hashes rather than copies of clinical source records. Decisions retain open reassessment work; closed decisions, metric imports, action metadata and run claims follow the configured retention period. Mapping/playbook revisions are configuration history; monthly budget ledgers contain counts/allowances, not prompt text. Project file references and optional To-Do owners are additive and compatible with older records.

All new RPCs route through both desktop and development dispatch. Development permits only selected-workspace review/assignment/decision/packet-inspection operations; imports, exports, document access, playbook execution and budget changes remain denied. New operations are not added to the native bridge allowlist. No messages, emails, external app writes, credentials or clinical data are included in this branch.

## Verification and remaining acceptance

See `PROJECT_STATUS.json` for final counts. Verification includes real Core/encrypted SQLite, shipped desktop IPC with platform boundaries mocked, real authenticated development HTTP, saved revision and stale-preview tests, duplicate handling, full-day metrics, cloud-budget concurrency, report export failure behavior and long-section processing. Supplementary DOM checks exercise all five workflow pages, assignment/decision persistence, budgets/playbooks, PCC mapping save/preview/import, source coverage and demo restrictions. These are not Chromium screenshots or Windows execution.

Still required before a production release:

- Run the Windows build workflow and validate its immutable installer hash. Exercise clean install, upgrade with existing encrypted records, lock/unlock, backup/restore under the matching Windows account, uninstall/reinstall, local inference and exports. Preserve the existing vault.
- Validate representative de-identified PCC exports and staffing/census snapshots with the facility's reviewers, including payer categories and the census convention used for daily HPPD.
- Perform full Chromium/Windows visual and keyboard acceptance. This environment previously failed before Chromium page creation; DOM checks do not replace visual acceptance.
- Validate real microphones and held-out real-speaker samples, ambiguity, noisy/overlapping speech, permission denial and capture cancellation. Continuous diarization, an evaluated embedding model and offline transcription remain future work.
- Complete independent security/clinical review and separately authorized remediation of historical vault exposure. No automatic history rewrite, key rotation or deletion of legacy clinical records was attempted.

## Instructions for ChatGPT/Codex and Google AI Studio/Gemini

Read current GitHub source, AGENTS, status and this review before claiming a feature exists. PR #5 is merged; do not repeat its merge or restore stale pre-repair files. This new branch reaches the main-only AI Studio project only after review/merge and refresh. Preserve native/build/lockfile assets and security boundaries.

Keep reviewer-entered data distinct from verified clinical approval. Do not replace missing data with estimates, treat HPPD as compliance, interpret budget allowance as an invoice cap, or turn speaker similarity into identity accuracy. Test edited values through save, reload and their source/derived views. New transports must exercise both authorization boundaries. Update these notes and actual test counts with each change; do not turn outstanding physical acceptance into a passing claim.
