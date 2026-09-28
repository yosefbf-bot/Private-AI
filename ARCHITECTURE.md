# Private AI architecture — 3.0.1 development

## Desktop boundary
`source/main.cjs` boots Electron on Windows, restricts the local data folder ACL, opens a DPAPI-wrapped vault via `startup-storage.cjs`, and exposes validated IPC through `preload.cjs`. The renderer is sandboxed with context isolation. Native browser companion uses authenticated encrypted local IPC with a narrower allowlist. Desktop data remains `%LOCALAPPDATA%\PrivateAI2`; downloaded model paths and upgrade behavior are preserved.

`database.cjs` uses Node SQLite, WAL, schema migrations through version 3, and AES-GCM encrypted record payloads/metadata. SQL record kinds/IDs/timestamps are not all encrypted. Audit metadata is allowlisted and integrity chained; not a substitute for externally anchored compliance records. Existing local databases/keys are never replaced by this source cleanup.

## Providers and reasoning
`providers.cjs` owns provider IDs, endpoint/auth/capability/policy metadata and suggested model IDs. `api.cjs` is the shared streaming transport; `server/unified-client.cjs` is only a compatibility export. Selection is explicit, never inferred from a key prefix. A configured model error does not silently switch to a different provider. Suggested model IDs require provider availability validation.

`provider-policy.cjs` binds organizational approval to provider, endpoint, model, organization/project, credential fingerprint and policy version. Material changes invalidate approval; legacy booleans are unapproved. HIPAA cloud generation currently permits only explicitly approved OpenAI chat configuration. Other providers require a reviewed policy adapter; realtime PHI is blocked pending separate review. This is technical enforcement, not contractual compliance certification.

`hybrid-router.cjs` coordinates deterministic tools, local inference and permitted cloud escalation. Local Only prohibits cloud use. `local-brain.cjs`, tiers, model manager and resources manage GGUF runtime/RAM, foreground priority, one background AI lane and browser constraints. Ollama URLs must be loopback. Worker, schedules and ShareSync retain their existing task/peer contracts; no vault/database/credentials belong in synced work folders.

## Applications and browser
`access.cjs` gates selected folders and Windows helper operations, including Outlook. Browser automation retains explicit resource/interference approval. Chrome/Firefox companion performs user-initiated capture. WhatsApp adapters retain configured conversation/write permissions; this work does not add unrestricted agents or computer control.

## Development web adapter
`server.cjs` is loopback-only, requires an external random access token, sets an HttpOnly SameSite session and requires CSRF headers for mutations. Host/origin checks reject browser cross-origin access and DNS-rebinding hosts. Requests have an operation allowlist; filesystem grants, background automation, cloud approval, document uploads and exports are blocked. Data is outside the repository in a separate development directory. Its file-protected vault is not Windows DPAPI. No production network/TLS/reverse-proxy mode is supported. The UI must display Development / Demo Mode — Not for PHI.

## Clinical and PCC data
`snf-command-center.cjs` remains the compatible orchestrator while domain modules under `source/snf` handle imports, evidence, rules, demos, alerts and summaries as implemented. It is read-only relative to PCC: reports are imported; there is no direct EMR write integration. Production initializes without sample residents. Human review is required for clinical, diagnosis, indication, GDR and regulatory conclusions.

Imports must retain source dates and batch/row provenance; import time does not make old data fresh. Unresolved alerts remain open through report omissions. Demo records require a separate encrypted namespace and labeled output. See PROJECT_STATUS and verification notes for which clinical improvements have passed tests; module names/roadmap entries do not establish completion.

## Release boundary
Windows build scripts, the NSIS include and icon have been restored from the integrated baseline. Locally generated helper/runtime binaries listed in `scripts/release-manifest.json` are still required. Structural PE and evidence helpers were reconstructed with tests, not recovered from a proven release. `npm run check:release` is an intentional failing gate until these inputs exist. No Windows executable/installer or release has been produced or validated by this hardening task.

## Clinical modules and administrator flow
`source/snf/index.cjs` dispatches desktop/development clinical RPCs to the selected workspace. `demo.cjs` wraps the encrypted store with a `demo:` namespace; production automation and global alert counts remain tied to the live store. `import/batch-manager.cjs`, `validation.cjs`, `provenance.cjs`, and `feed-health.cjs` govern mapped batches, immutable original rows, source dates, rollback, duplicates and feed health. `rules/registry.cjs`, `engine.cjs`, and `evidence.cjs` produce versioned evaluation snapshots; `alerts/lifecycle.cjs` records operational transitions and audit history. `retention.cjs` pins unresolved evidence while purging expired unreferenced import history.

`source/ui/snf/today.mjs` is the administrator landing view; `import-center.mjs` handles CSV mapping and batch review. The larger SNF UI remains available for drill-down. Provider/cost/routing details are collapsed in normal chat. See docs/HARDENING_REVIEW.md for implementation versus acceptance boundaries.

## Voice and browser data
`voice-history.cjs` stores transcripts as encrypted records with retention and deletion; temporary conversations do not create voice history. `source/ui/legacy-storage.mjs` migrates older plaintext draft/transcript copies and removes them only after backend persistence (or deliberate temporary-data discard). Browser speech recognition is disabled under HIPAA/Local Only because the browser may send audio to a remote service. This does not supply a new offline speech engine.


## Operations, meeting and SBAR review
Both desktop and development dispatch into `operations-copilot.cjs`, retaining their transport security policies. The selected SNF workspace governs its Store, demo followups and notification isolation. Missing staffing/capacity/payer data remains unknown. SBAR evidence version 2 excludes invented clinical facts; draft/review/finalization transitions invalidate approval after editing. Completed meetings without pending actions and closed SBAR records follow Store retention; unresolved loops stay retained. Legacy SBARs require recreation from verified sources. Meeting browser speech uses the HIPAA/Local Only gate; bounded local acoustic sampling and conservative speaker suggestions are now wired through `ui/speaker-capture.mjs` and `speaker-match.cjs`; continuous diarization and live acoustic filtering remain unimplemented. See the 2026-09-28 workflow review for human-confirmation and measurement limits.

Development preview origins are exact and explicitly configured; anonymous HTML/token endpoints do not disclose bearer credentials. See AI_HANDOFF.md for current authentication and preview configuration.

## Administrator workflows

`source/workflows/index.cjs` dispatches action/review/decision/evidence, mapping/metric, document and playbook/budget operations. Review workflows use the selected SNF store; production document/jobs/budget operations are denied in demo/development. `ui/workflows.mjs` composes five pages using existing modal/forms/navigation. Encrypted `wf_*` records are additive; no SQL migration or plaintext search index.

Cloud generation and connection tests pass through `workflows/budget.cjs` immediately before `client.generate`; synchronous monthly reservations prevent concurrent use of the last budget slot. Local inference is unaffected. Optional priced allowances require configured exact model rates and reject unpriced features; they are not provider invoice guarantees. Playbook jobs retain input/revision provenance and check required output headings before export. Sectioned report jobs may exceed normal contextChars only through bounded, checkpointed section processing.
