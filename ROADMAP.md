# Future work

- Restore missing Windows packaging tooling and exact runtime/helper/icon inputs; validate clean install, upgrade from known working 2.1.x, data/vault persistence, full feature smoke tests and uninstall/reinstall at immutable artifact hashes.
- Complete organizational response to historical vault/database exposure, including separately reviewed key re-encryption and authorized history cleanup.
- Remediate the five high-severity dependency findings without breaking the WhatsApp/browser stack.
- Complete browser visual QA for Today, evidence/follow-up, Demo Mode and PCC Import Center on a working Chromium/Windows runtime.
- Reconcile any legacy seeded residents and mirrored credentials before an installed-data upgrade.
- Independent security and clinical review of this hardening PR before integration.
- Validate clinical rules/mappings against de-identified representative facility reports; assign clinical review owners and approved effective dates.
- Validate all provider-suggested model IDs against currently accessible provider inventories; add healthcare policy adapters only after contractual/endpoint review.
- Continue incremental extraction of the remaining clinical/UI monoliths with regression coverage.
- Defer mobile, new providers/integrations, unrestricted agents, computer control and image generation until hardening and release validation are complete.
