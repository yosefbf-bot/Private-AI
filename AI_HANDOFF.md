# Shared AI development handoff
## Current integration — 2026-10-02

GitHub main `0a7ec92fa18c52ed8983aa06803977e3a220cf02` was fetched/verified before
integration and again before publication. Active branch:
`chatgpt/import-local-hardening-2026-10-01`, version **3.0.1-dev**.
Local 3.0.0 standalone work has been adapted into the newer clinical/provider/
workflow architecture; the exact old archives are historical references under
`handoff/local-3.0-2026-10-01`, never replacements for the current checkout.

Read `docs/LOCAL_HARDENING_INTEGRATION_2026-10-01.md` and
`docs/INTEGRATED_STANDALONE_GUIDE.md`. General clinical imports/rules remain available
with PCC off. One capability service controls PCC manual import/monitoring.
Optional cloud/local text routing retains newer privacy approvals and budgets.
WhatsApp gains opt-in status-only report-job notifications and retains independent
read/write permissions. Existing data is preserved. DOMPurify is patched to 3.4.16.

Current local verification: 471 full-suite tests; 25 overlapping hardening tests;
29 general Edge UI checks; restricted-development and synthetic WhatsApp UI passed;
production audit zero vulnerabilities. Generated Windows helper/runtime inputs are
absent in this fresh clone; exact-head Actions must build/check them. The combined
artifact has not undergone actual installer, packaged application, local inference,
installed-data or live-account acceptance. Earlier Windows results below are historical.
The Android companion is developed separately. The desktop now implements the four
authenticated HTTPS endpoints, explicit interface binding and per-phone pairing in
`docs/ANDROID_COMPANION_CONTRACT.md`. Android must verify the paired certificate and
implement the documented URI/error/null handling. Phone/LAN acceptance is pending.
No firewall rule or development IPC exposure was added. Main is for the user to merge after review.


Read `AGENTS.md`, `GEMINI.md`, `PROJECT_STATUS.json`, `ARCHITECTURE.md`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` before changes. GitHub is authoritative; record the exact base SHA and inspect the latest source/history. Roadmap entries, old manuals and UI mockups are not implemented-feature evidence.

## Current workstream

PR #9 is merged at `a4127e09472b03337346c47be8fee964330854cf`; its main CI passed (36587165573). Latest main fetched on 2026-09-29 is `a5d22b623c5c49fccd36b41bd4488d2a64fac346`, whose Google update deleted the lockfile/build inputs and failed all three CI jobs (36640248873). Current repair branch: `chatgpt/google-main-ci-repair-2026-09-29`. Verified code checkpoint `ec0ae9c74123eb74c410e8865609ddcf8aeacbe5`: 414 tests, 25 hardening tests, Edge hardening UI, syntax/policy, zero-finding audit and 406 PE release inputs passed. Read `docs/GOOGLE_MAIN_REPAIR_2026-09-29.md` and the mandatory `docs/GOOGLE_AI_STUDIO_GUARDRAILS.md`. Previous packaged Windows evidence is historical; installer and human acceptance remain blocked. Existing faulty-version executive samples/tasks need reviewed disposition, not silent deletion.

PR #4 was merged into main at `21969ff21a5ab51bdb12900aea2d618eb96a3466`; its regression, dependency and release-file CI checks passed (run 36363249305). Do not repeat that merge or treat its old branch notes as current status.

PR #5 is merged into main at `6e3f85b3faffb1688f34d7681c5765e5be04cf82`. Its six high-priority repairs, dashboard cleanup and experimental voice improvements are the base for this work.

PR #6 is merged into main at `a897ba7a6f7ea0d79ec4e3593cc1260396e03a7e`; regression, dependencies and release-file CI passed (run 36465145722). Read `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` for the implementation matrix and remaining physical acceptance.

PR #7 is merged at `f0b6d88e274a77e38fb7ee67a686b5e1b81251b2`. Its checkup findings remain in `docs/APPLICATION_CHECKUP_2026-09-28.md`.

PR #8 is merged at `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a`, the main checkpoint fetched on 2026-09-28. Main CI run [36499532128](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36499532128) passed. Read `docs/BROWSER_PASSWORDS_2026-09-28.md` for browser choices, Bitwarden handoff and acceptance limits. PRs #6–#8 no longer require merging.

Executive Desk, Operations Analytics & Assistant Consolidation (2026-09-29):
Implemented the Administrator Executive Desk (`source/executive-desk-engine.cjs`, `source/ui/executive-desk.mjs`), Operations Analytics & Regulatory Sentinel (`source/operations-analytics-engine.cjs`, `source/ui/operations-analytics.mjs`), and Executive AI Assistant Suite (`source/executive-assistant-engine.cjs`). Read `docs/EXECUTIVE_DESK_AND_OPERATIONS_ROADMAP.md`.
Consolidation and architecture review enforces strict adherence to single canonical systems:
- Executive Desk rhythm, inbound triage ("My Commitments" vs. "Waiting On"), Department Head delegation, and Executive Rounds punch list findings synchronize bidirectionally with canonical Action Center `todo` and `wf_action_meta` records. Edits, completions, and closures propagate across views without duplicating task stores.
- Scheduled 4:30 PM unclosed-loop audit reuses existing scheduler infrastructure without spawning independent daemons or background execution engines.
- Operations Analytics ingests OnShift/universal staffing schedules and evaluates deterministic formulas for approaching overtime, incidental punch leakage, and FTE deficits. All outputs explicitly declare source coverage, assumptions, and disclaimers as staffing planning estimates (not automatic hiring directives or employee evaluations).
- Regulatory Compliance Sentinel tracks license and certification renewal windows (CLIA, BNE/CDS narcotics, DOH operating certificate, Life Safety fire/generator, Medical Director credentials) and creates linked canonical Action Center tasks within active renewal windows.
- AI Assistant features (context ghostwriter, meeting prep dossiers, voice memo multi-parser, commute audio briefing, contract scanner, difficult conversation coach, 14-day conflict radar) currently use deterministic templates and heuristics, not demonstrated local/hybrid provider execution. The repair removes invented facts, isolates Demo and restricts commute speech to explicitly local voices. Human review and existing microphone policy remain required.
- Navigation remains consolidated: sidebar links to `Today`, `Action Center`, and `Operations & Meetings` without top-level bloat. Executive Desk is reachable from the Today command header, and Operations Analytics is integrated directly within Operations & Meetings.
- Original module verification covered 27 mock-based subtests. The repair adds three real Core/SQLite safety tests; current full-suite and Edge results are recorded above. Do not treat the original module tests as complete integration acceptance.

Historical PR #9 validation branch: `codex/release-validation-2026-09-28` (explicit user-requested naming), based on that main SHA, re-fetched unchanged on 2026-09-29. Preserve dated earlier reports as historical evidence. Release validation passed 384 regression tests and 25 hardening tests (overlapping subset), syntax, repository policy, zero-finding production audit and four-browser synthetic checks. The real Windows package passed isolated DPAPI startup/restart/restore and its 12 built-in checks after fixing the PDF utility-process worker. An unsigned NSIS installer was built, not installed. Read `docs/WINDOWS_RELEASE_VALIDATION_2026-09-28.md` and `docs/HUMAN_ACCEPTANCE_2026-09-29.md` for artifact hashes, exact coverage and blockers. This is not production readiness.

Small/Medium local inference passed repeated actual-runtime tests. High passed once but later triggered low-memory protection; Extra High is absent. Existing installed data/vaults were not opened, upgraded or replaced. Real installer/upgrade/uninstall, representative PCC, microphones/speakers, account/Bitwarden/native-companion and full UI acceptance remain pending. Historical vault/database objects and credential-shaped test strings require authorized owner investigation; do not rewrite history or rotate active material without explicit authorization. Next-stage product enhancements remain deferred until acceptance is stable.

## Non-negotiable implementation rules

- Never commit secrets, PHI, runtime databases, vault keys, credentials or browser sessions. Preserve installed `%LOCALAPPDATA%\PrivateAI2` data/vaults and the Store/Core/IPC contracts.
- Keep `package-lock.json` and tracked Windows `build/` inputs. Web preview exports can omit required desktop files; absence in the preview is not authorization to delete them. Use `npm ci --ignore-scripts` with the lockfile.
- Desktop renderer calls go through `window.privateAI`; no Node access in UI. Wire new features in both desktop IPC and the restricted development adapter, retaining their separate allowlists and unlock/origin checks.
- For editable UI, verify edit → save → reload → downstream/copy output. Review/finalization must apply to the saved revision. Test the actual call path through Core/SQLite/IPC/HTTP where relevant, not only mock module methods or source strings.
- Never invent clinical or operational measurements, source citations/dates, diagnoses, medication, code status, staff identities, audio samples or facility approval. Missing data is unknown; incomplete imports are not an all-clear. Built-in protocols are unapproved references.
- Demo content belongs in the selected isolated encrypted namespace; generated/copied output must say DEMO DATA. Do not seed production. Legacy SBARs predating evidenceVersion 2 are retained for inspection but cannot be signed off; recreate from verified sources.
- Browser speech recognition may send audio off the device. Meeting and chat microphone policies must block it in HIPAA/Local Only and when policy is unavailable; stop capture on navigation, completion and policy changes. No simulated audio measurement can be labeled as verified training.
- Keep clinician review gates, immutable evidence, pending callbacks and unresolved critical alerts. Clinical source changes are supplemental and require independent clinical acceptance.
- Do not weaken security or tests to make a preview green. Keep changes bounded, review diffs and document limitations. Do not claim Windows readiness from source tests.

## Development preview authentication

Development mode is `Development / Demo Mode — Not for PHI` and binds to `127.0.0.1:3000`. Data stays outside the repository; the development vault is not Windows DPAPI. No production LAN/cloud hosting is supported.

The server loads or generates a random token in the git-ignored local `.env`. `PRIVATE_AI_DEV_TOKEN` must be at least 32 characters. The UI uses a DOM token form compatible with iframes, then POST `/api/session` and session/CSRF headers. Token injection into HTML and the unauthenticated `/api/dev-token` endpoint were removed because they defeated token possession. Do not restore them.

By default accept exact localhost/loopback host and origin/port combinations only. An optional `PRIVATE_AI_DEV_PREVIEW_ORIGIN` accepts one exact HTTPS preview origin, e.g. the project's own run.app origin. Wildcard cloud host trust and untrusted `X-Forwarded-Host` are prohibited. Session headers support restricted-cookie previews; session query credentials are accepted only on `/api/events`. A parent frame's origin is not the API's origin. Keep filesystem, import/export and background automation restrictions.

## Verification commands and evidence

Use Node 24. Run:

```
npm ci --ignore-scripts
npm test
npm run test:hardening
npm run check:repository
npm run lint
npm audit --omit=dev --audit-level=high
npm run check:release
```

Run `npm run test:hardening-ui` where Chromium is available, providing `PRIVATE_AI_TEST_CHROMIUM` when necessary. It covers the login form, Today/demo/evidence/follow-up navigation, Surveillance, Operations SBAR edits, Automation and all five workflow pages. The current checkup passed in Windows Edge after removing forced single-process launch flags and correcting the modal scope; the completed Today screenshot was visually inspected. Earlier supplemental DOM checks remain historical evidence. Full packaged-desktop, visual and keyboard acceptance is still pending.

Current browser verification: `npm run test:browsers` passed synthetic download/sign-in, filtered page/selection capture and browser choice save/edit/reload/use in installed Chrome/Edge and managed Firefox/Chromium. The general Edge UI suite passed 27 synthetic UI/keyboard checks; hardening and messaging UI checks also passed. Real Bitwarden vault/autofill, Brave/Vivaldi, and packaged native companion connectivity remain on-PC acceptance. `npm run setup:browsers` installs optional matching Firefox/Chromium runtimes into Playwright's per-user cache; it does not import a regular browser profile. Local release-file verification now passes with genuine CI-built inputs: 406 helper/runtime PE files. These ignored generated inputs are not committed; retain their hash manifest and CI provenance.

Browser passwords stay in browser/manager-controlled profiles. Do not add password getters, vault/clipboard extraction, cookie export or automatic manager unlock. The new login step waits for a post-login control, and users handle unlock/MFA. Manual browser setup permits network access; an automated report run reinstalls its reviewed-origin filter before navigating. Native companion permissions and the development-browser denylist remain unchanged.

`npm run build` and `lint` are syntax checks only. `check:release` is the Windows input gate. Restored build scripts/icon are present; Windows helper/runtime binaries must be built by the documented workflow. Actual install, existing-data upgrade, vault, local inference and feature execution at the artifact SHA remain release requirements. Record exact passing/failing counts and all unperformed tests in PROJECT_STATUS; do not reuse historical claims as current evidence.

## Speaker recognition contract

Keep the speaker feature available. Local recordings produce experimental suggestions only after three confirmed recordings, quality checks, a strict similarity threshold and separation from competing profiles. These thresholds are not probabilities. Automatic suggestions are never verified identity or task ownership; a person must confirm each attribution. Do not substitute browser transcript confidence for speaker identity. Do not fabricate acoustic samples, add roster score bonuses, or silently train on corrections. Keep local capture separate from policy-gated browser transcription, and preserve capture cancellation and raw-audio non-retention.
