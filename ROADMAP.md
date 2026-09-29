# Future work

- Windows x64 package and unsigned NSIS installer built; isolated packaged startup/restart, synthetic DPAPI restore and built-in checks passed. Still validate clean installer execution, upgrade from known working 2.1.x, protected installed-data persistence, full feature acceptance and uninstall/reinstall at immutable artifact hashes.
- Complete organizational response to historical vault/database exposure, including separately reviewed key re-encryption and authorized history cleanup.
- Release-validation mailparser patch resolved the two moderate dependency findings; production audit now reports zero vulnerabilities. Continue auditing at future checkpoints.
- Automated Edge UI/keyboard, hardening/messaging and four-browser checks passed. Complete human visual/accessibility, long-content, Back/Forward and actual account acceptance; synthetic navigation is partial evidence.
- Reconcile any legacy seeded residents and mirrored credentials before an installed-data upgrade.
- Independent security and clinical acceptance of current main and subsequent review branches.
- Validate clinical rules/mappings against de-identified representative facility reports; assign clinical review owners and approved effective dates.
- Validate all provider-suggested model IDs against currently accessible provider inventories; add healthcare policy adapters only after contractual/endpoint review.
- Continue incremental extraction of the remaining clinical/UI monoliths with regression coverage.
- Defer mobile, new providers/integrations, unrestricted agents, computer control and image generation until hardening and release validation are complete.


## Merged administrator workflows and release validation

The implementation matrix in `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` covers navigation consolidation, unified action/review/decision workflows, evidence packets, versioned mappings, measured staffing/census imports, document sections, playbook previews and local budget limits. PR #6 merged these changes. PR #7 (checkup) and PR #8 (browsers/Bitwarden) also merged. Main re-fetched on 2026-09-29 is `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a`; CI run 36499532128 passed. Release validation has established a fresh baseline and Windows artifact evidence, but installer/clinical/speaker acceptance remains incomplete. Read the dated Windows validation and human acceptance documents before next-stage enhancements.

Operational and executive roadmap for the daily Executive Desk, OnShift staffing analytics, regulatory sentinel, and the AI Chief of Staff assistant suite is documented in `docs/EXECUTIVE_DESK_AND_OPERATIONS_ROADMAP.md`.

Remaining product extensions: scheduled revision-pinned playbooks, deterministic validated calculation definitions, document OCR and semantic retrieval, automatic staffing/payroll connections and facility-specific approved scoring. Current CSV unit metrics do not establish facility-wide coverage or regulatory compliance.

Validate experimental speaker signatures on Windows and held-out real speakers. Evaluate a proper local speaker-embedding model and offline transcription before continuous diarization. Keep manual attribution and abstention available.
