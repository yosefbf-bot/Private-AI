# Future work

- Packaging source inputs were restored and base CI release-file checks passed. Still validate clean install, upgrade from known working 2.1.x, data/vault persistence, full feature smoke tests and uninstall/reinstall at immutable artifact hashes.
- Complete organizational response to historical vault/database exposure, including separately reviewed key re-encryption and authorized history cleanup.
- Dependency findings vary by checkpoint. PR #8 recorded two moderate mailparser/nodemailer findings and no high/critical findings; rerun the audit for release validation.
- Complete browser visual QA for Today, evidence/follow-up, Demo Mode and PCC Import Center on a working Chromium/Windows runtime.
- Reconcile any legacy seeded residents and mirrored credentials before an installed-data upgrade.
- Independent security and clinical acceptance of current main and subsequent review branches.
- Validate clinical rules/mappings against de-identified representative facility reports; assign clinical review owners and approved effective dates.
- Validate all provider-suggested model IDs against currently accessible provider inventories; add healthcare policy adapters only after contractual/endpoint review.
- Continue incremental extraction of the remaining clinical/UI monoliths with regression coverage.
- Defer mobile, new providers/integrations, unrestricted agents, computer control and image generation until hardening and release validation are complete.


## Merged administrator workflows and release validation

The implementation matrix in `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` covers navigation consolidation, unified action/review/decision workflows, evidence packets, versioned mappings, measured staffing/census imports, document sections, playbook previews and local budget limits. PR #6 merged these changes. PR #7 (checkup) and PR #8 (browsers/Bitwarden) also merged. Main fetched on 2026-09-28 is `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a`; CI run 36499532128 passed. The release-validation branch must establish a fresh baseline and actual Windows artifact evidence before next-stage enhancements.

Remaining product extensions: scheduled revision-pinned playbooks, deterministic validated calculation definitions, document OCR and semantic retrieval, automatic staffing/payroll connections and facility-specific approved scoring. Current CSV unit metrics do not establish facility-wide coverage or regulatory compliance.

Validate experimental speaker signatures on Windows and held-out real speakers. Evaluate a proper local speaker-embedding model and offline transcription before continuous diarization. Keep manual attribution and abstention available.
