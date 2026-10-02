# Combine local standalone work with current GitHub

Base: `0a7ec92fa18c52ed8983aa06803977e3a220cf02` (main, PR #10 merged).
Branch: `chatgpt/import-local-hardening-2026-10-01`.

## Pre-change inspection and implementation plan

The user authorized combining the local 3.0.0 checkpoint with GitHub 3.0.1-dev,
preserving both sets of useful work. GitHub is authoritative. The local archive
predates the provider registry, approval fingerprints, budgets, clinical rules,
PCC imports, executive/workflow/voice features and recent browser/security fixes.
51 cumulative changed paths differ from both the old original and current GitHub;
a whole-directory copy would regress the current app. Preserve the original local
archives as historical inputs, with their evidence clearly scoped to that build.

Current architecture: Core owns the existing encrypted Store, provider registry,
shared router, SNFCommandCenter and workflows. SNF imports already normalize mapped
rows into `snf_*` records with immutable batch/row provenance. Domain rules consume
those records, not live PCC objects. The PCC report catalogue and required-feed
monitoring are coupled to the general SNF UI. There is no live PCC synchronizer.
General clinical references, SBAR, operations and executive workflows do not need
a PCC connection. Preserve their data and selected Demo namespace.

Plan, before application edits:

1. Port optional-cloud/keyless text routing into the current multi-provider policy,
   preserving approval fingerprints, endpoint restrictions, budgets, local/Ollama
   options, clinical reference context and safe no-model helpers. Recheck policy at
   network boundaries; no fallback after partial output or policy/auth refusal.
2. Reuse the local integration capability service, adapting it to the existing PCC
   manual importer. Keep general mapped clinical imports and rules independent.
   Explicitly tag source provenance; PCC-off blocks its importer and monitoring
   without deleting existing records or suppressing unrelated clinical findings.
   Missing evidence remains unknown. Keep future sync disabled until supplied.
3. Expose one integration settings control; hide inactive PCC-specific entry points
   and feed warnings while retaining general clinical/import/operations features.
   Preserve Demo behavior and desktop/development/native IPC boundaries.
4. Port opt-in WhatsApp report-job alerts and safe local engine errors. Preserve
   the newer default-conversation UI and send-boundary checks. No live messages.
5. Merge guide changes and preserve historical local source/handoff/evidence. Do
   not replace current status with the older claim that clinical modules are absent.
6. Run the full combined regression, hardening, syntax, repository/privacy, audit
   and applicable UI checks; inspect release-input and exact-commit CI results.
   Open a review PR. Do not merge main or claim installer/clinical/account acceptance.

Baseline: clean locked dependency installation completed with lifecycle scripts
disabled; 414 tests passed, repository policy passed, 166 JS files syntax-checked.

## Implemented behavior and preserved work

GitHub main was fetched again before publication and remained at the base above.
The standing instruction now requires checking remote SHA/branch/status/version
before new work and checking again before publication. The application remains
3.0.1-dev. This source integration is not a new official 3.0 installer release.

- **Clinical sources:** `Integrations` is the authoritative capability service.
  `snf/sources/pcc.cjs` registers the existing manual PCC adapter; normalized records,
  parsers, rules, provenance, deduplication and human-review workflows are reused.
  Generic/manual imports remain available independently. No database schema bump.
- **PCC off:** no PCC import, sync, scheduled sync, feed panels or routine source
  monitoring alerts. Historical records/alerts remain encrypted and intact. Clinical
  findings based on retained/imported evidence remain available. Re-enable restores
  PCC views. Legacy PCC imports opt into manual mode once; an explicit disabled
  setting is preserved. Generic imports never activate PCC during restart.
- **Evidence safety:** generic and PCC feed snapshots/dates are separate. Missing
  data is unknown; snapshots record availability. Missing medication/QM inputs show
  Unknown, not a clinical zero. No invented SBAR source/date fallback. Existing
  diagnostic, medication, behavior, GDR, infection/fall/wound/lab record handling,
  references, SBAR, administration, operations and executive workflows are retained.
- **AI independence:** clinical/regulatory text may use configured GGUF models in
  all processing modes without keys. Offline fallback occurs only before provider
  output and never after policy/auth refusal. Newer provider fingerprints, key
  cancellation, budgets, endpoint validation, local Ollama and clinical context stay
  authoritative. No-model startup/tools work. Built-in helpers are accurately labeled
  templates/references, not inference or a measured 95% reliability result.
- **WhatsApp:** newer account-wide reading, independent selected writing, override,
  sender/context isolation, progress/chunked responses and send-time checks retained.
  Optional report-job notifications add task ID/status only; disabled by default.
  No live messages were sent. App/PC/connection must remain running.
- **Release tooling:** preserves the newer Windows validation/restore/navigation
  tests and evidence gates; adds the older opt-in real-inference test to that harness.
  The clean-account installer validator now takes ExpectedVersion instead of
  hard-coding 3.0.0. Its PowerShell syntax was checked; it was not executed.
- **Small security update:** DOMPurify 3.4.15 → 3.4.16 for
  [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p).
  All three vendored copies are synchronized. Existing optional/platform lockfile
  entries were preserved. The Android gateway also adds pinned `selfsigned` 5.5.0 and its certificate
  dependencies; existing shared ASN.1 schema moves to 2.10.0. No unrelated upgrade.
- **Recovery/handoff:** exact historical local source and cumulative change archives,
  hashes and per-path disposition manifest are under `handoff/local-3.0-2026-10-01`.
  They must not overwrite this newer checkout. Current instructions and in-app help
  were updated. The supplied Android contract now has an optional desktop HTTPS
  service with explicit device pairing and metadata scopes. All example IPs/keys/
  telemetry were discarded; no Python server, public listener or firewall change.

## Android companion implementation plan (2026-10-02)

Re-fetched GitHub before this additional implementation: `origin/main` remains
`0a7ec92fa18c52ed8983aa06803977e3a220cf02`, branch
`chatgpt/import-local-hardening-2026-10-01`, version `3.0.1-dev`. All earlier
integration changes remain in this checkout. The supplied Android script defines
four `/mobile/api/v1` endpoints; its addresses, static key and telemetry are examples.

Use an optional in-process Node HTTPS service, not another Python server or the
restricted development server. Route text through Core's existing chat/router,
budget and provider policies. Add desktop-only settings, explicit interface choice,
per-device pairing/revocation, certificate generation without changing certificate
stores, and encrypted persistence. No automatic firewall rule or public listener.
Authenticate all endpoints; preserve lock, cancellation and background interference
protections. Mobile chat cannot invoke desktop tools. Expose actual status and
opt-in task/clinical-alert metadata, never fabricated telemetry or successful inference.
Document Android certificate verification and nullable telemetry requirements,
request retries, unsupported attachment metadata and incomplete monitoring.

Test real Core/SQLite over HTTPS with synthetic data, including wrong/revoked keys,
TLS validation, request limits, context isolation, locked/disabled operation,
policy restrictions, cancellation and honest failures. Exercise each new RPC through
desktop IPC and verify rejection in development HTTP. Review Settings save/reload
and pairing/revocation in the browser. Keep Windows installer and physical-phone
acceptance explicitly separate from these tests.

## Files grouped by purpose

Routing/local diagnostics: `source/hybrid-router.cjs`, `routing-capabilities.cjs`,
`local-brain.cjs`, `local-assistant.cjs`, `core.cjs`, security messages and response UI.

Clinical integration: `source/integrations.cjs`, `snf/sources/pcc.cjs`, normalized
import/provenance/feed-health modules, evidence/rules, clinical projections,
workflow mappings, Today/Surveillance/import/settings UI, desktop/development RPCs.

Communications: `source/messaging.cjs`, desktop/Core job event, messaging UI/tests;
`companion-gateway.cjs`, `companion-tls.cjs`, `ui/companion.mjs`, desktop RPCs and
restricted-development refusals, encrypted session/retry retention, TLS/IPC/UI tests.

Release/security/docs: Windows validator and clean installer script; dependency
lockfile and sanitizer assets; browser metadata/last-updated stamp; instructions,
user guides, project status, historical handoff and synthetic screenshots.

## Verification (Windows host; synthetic data)

- Clean `npm ci --ignore-scripts --no-audit --no-fund`: 627 packages installed.
- Complete `npm test` equivalent: **471 passed, 0 failed/cancelled/skipped**.
  Baseline was 414; 57 regression cases were added. Tests cover actual Core/SQLite,
  desktop IPC startup/offline/keyless paths, adapter cancellation, migration/reopen,
  normalized clinical evidence, PCC off/on, provider policies/budgets and WhatsApp.
- `npm run test:hardening`: **25 passed**, overlapping the full suite.
- Edge general UI: **29 checks passed**, including CSV/JSON UI → actual Core,
  save/reload/downstream PCC off/on visibility, feed labels and record preservation.
- Edge restricted-development hardening UI and synthetic WhatsApp DOM/UI: passed.
  New `integrationSave` reaches real desktop IPC; authenticated development HTTP
  rejects it. Native IPC permissions were not expanded.
- Syntax and whitespace checks passed. Repository scan includes historical archive
  contents inspection before adding them; final staged-file scan passed (292 files).
- Production audit: **0 vulnerabilities** after the sanitizer patch.
- Local `check:release`: **blocked** in this fresh clone because generated Windows
  helper/runtime EXEs are absent. Existing tracked build inputs are preserved.
  GitHub Actions builds genuine inputs and runs the release-file gate; exact pushed
  commit results are recorded in PR checks. No substitute binaries were supplied.
- Installer/application/inference acceptance for this combined artifact: **not run**.
  Historical Windows results in prior reports/archives belong to their own hashes.
  The installed app, production vault/database and active WhatsApp account were not
  opened, upgraded or used for acceptance.

## Remaining dependencies and risks

Local model files/runtime are needed for model inference, within RAM/CPU constraints.
Model downloads, optional cloud AI, WhatsApp and live web tasks require connectivity.
Structured clinical imports still require reviewed mapping/conversion. The bundled
reference/template helper is not autonomous clinical reasoning. There is no live PCC
synchronizer; future API/relay/SFTP/file-drop adapters should return mapped reports
through `Integrations.read` and `SNFCommandCenter.ingestReports`, honoring capability,
source identity and cancellation before publication.

The migration only writes optional capability metadata (and a copied legacy PCC
feed snapshot), preserving source records, settings, rules, evidence and SQLite
version. Representative real/de-identified clinical acceptance, actual clean install,
installed-data upgrade/uninstall, real account/browser integration and sustained local
model validation remain release requirements. Source/UI tests cannot establish these.

Android specifics and the copyable developer handoff:
[Companion contract](ANDROID_COMPANION_CONTRACT.md). The phone must implement real
certificate verification. Actual phone/LAN/hotspot/Tailscale and sleep/reconnect
acceptance are pending. The desktop gateway does not claim HIPAA compliance or
measure CPU/GPU/VRAM; cloud use follows the desktop provider/privacy settings.

Synthetic screenshots: [PCC off](screenshots/integration-pcc-off.png),
[PCC manual mode](screenshots/integration-pcc-on.png),
[integration settings](screenshots/integration-settings.png),
[Android gateway](screenshots/integration-companion.png).
