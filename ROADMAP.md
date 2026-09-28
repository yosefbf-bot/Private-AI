# Future work

- Packaging source inputs were restored and base CI release-file checks passed. Still validate clean install, upgrade from known working 2.1.x, data/vault persistence, full feature smoke tests and uninstall/reinstall at immutable artifact hashes.
- Complete organizational response to historical vault/database exposure, including separately reviewed key re-encryption and authorized history cleanup.
- The previous five dependency findings are historical; the prior repair audit passed with zero production vulnerabilities. Re-audit each release and record new findings.
- Complete browser visual QA for Today, evidence/follow-up, Demo Mode and PCC Import Center on a working Chromium/Windows runtime.
- Reconcile any legacy seeded residents and mirrored credentials before an installed-data upgrade.
- Independent security and clinical acceptance of current main and subsequent review branches.
- Validate clinical rules/mappings against de-identified representative facility reports; assign clinical review owners and approved effective dates.
- Validate all provider-suggested model IDs against currently accessible provider inventories; add healthcare policy adapters only after contractual/endpoint review.
- Continue incremental extraction of the remaining clinical/UI monoliths with regression coverage.
- Defer mobile, new providers/integrations, unrestricted agents, computer control and image generation until hardening and release validation are complete.


## Next product work (not implemented by the workflow/speaker branch)

1. Consolidate Today/Operations and Automation/Agents/Schedules navigation; preserve stable backend contracts.
2. Build a unified action queue linked to alerts, SBAR callbacks and meetings, retaining separate clinical sign-off.
3. Save/version reviewed PCC mappings and expose missing/changed feeds.
4. Add change-since-review briefings and evidence packets with coverage and source dates.
5. Version playbooks with required inputs, approval boundaries, output checks and spending limits.
6. Add searchable long-document sections and whole-document coverage accounting.
7. Implement actual staffing/payer feeds before showing metrics or regulatory conclusions.
8. Validate experimental local speaker signatures on Windows; evaluate a proper local speaker-embedding model and offline transcription before continuous diarization. Never equate heuristic similarity with accuracy.
