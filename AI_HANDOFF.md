# Shared AI development handoff

## Audit follow-up — 2026-10-07

Read [the follow-up](docs/AUDIT_FOLLOWUP_2026-10-07.md). Completed Worker results now survive temporary status-publication failure, and unavailable speech recognition no longer requests microphone access. A third confirmed fix prevents window-close callbacks from reading SQLite after shutdown. All 509 Windows tests passed after this correction; rebuild and acceptance remain required. Earlier repairs are preserved. Fresh native inputs were obtained from exact-head CI 37568590549 and are being manifest-verified for a new Windows package. Until a new dated execution report exists, older installer flags do not establish acceptance of these fixes.

## Pre-use audit repairs — 2026-10-06

Read [the repair report](docs/PRE_USE_AUDIT_FIXES_2026-10-06.md). Based on main `1527da64ba667ee862e2e71221f51063e4c06fa1`, this branch fixes indefinite retention, voice stop/privacy (including the duplicate sidebar toggle), interrupted Worker status publication, the regulatory exemption claim and Mammoth's production dependency advisory. Android/protocol/schema are unchanged. See `PROJECT_STATUS.json` and the review PR for current source checks. The older installer below does not contain these repairs; its Windows execution flags must not be transferred to this branch. A new hash-bound package acceptance is still required; the local generated native build inputs are currently absent.

## Current Windows candidate — 2026-10-06

The tested **3.0.1-dev** binary is frozen code `46a385d2a8d1b14acf3e960f2b4c601159ba3d04`, based on main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`; later reports/handoffs/source exports are supplemental. Read [the dated report](docs/WINDOWS_VALIDATION_2026-10-06.md) and [sanitized machine summary](docs/windows-validation-2026-10-06.json). Actual package/install/uninstall/reinstall, synthetic default-path DPAPI/SQLite retention, installed restart, Small local inference and 575-file portable roundtrip/extracted-app acceptance passed the unchanged hash gate. Current packaged shared capture/evidence/actions/internal drafts/selected-chat/lock/restricted reminders were exercised through IPC and pinned loopback HTTPS. No real message or mailbox dispatch occurred.

Exact-code checks: 500 Windows tests, 499 Linux CI tests, 25 hardening, 184 syntax; both code CI workflows 37441844506/37441839760 passed all three jobs. Production audit is **3 moderate, 0 high, 0 critical** through mammoth/argparse/sprintf-js, not zero findings; see [the primary advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Current model acceptance is **Small**; Medium/High remain historical October 2 bc964e09 evidence. Physical Android/LAN/notifications, live WhatsApp/Outlook/native browser, representative data upgrade, reboot/wizard, clinical human review and signing/updater remain separate. This is an unsigned development candidate, not production readiness or HIPAA certification.

The failed 11a9114 TLS-client and 34f9d3e IPC-unlock/Notes harness attempts remain retained. Corrections were validation-only; no production TLS relaxation or established production UI defect. Preserve the prior deliverables. Do not transfer any binary's flags by version label, and fetch main before future work/publication. Supplemental documentation commits require their own exact-head CI; they do not rebuild this installer.

Android review head 85db208 also passed 4 hosted emulator instrumentation tests. Hosted unit tests passed 44 with 1 explicitly skipped external desktop fixture; local tests passed 45 with 0 skips. Local lint has 0 errors/72 warnings, hosted lint 0/74. These are separate debug/hosted checkpoints, not physical-phone or existing-signer upgrade acceptance; production APK inputs remain the separately documented local checkpoint.

## Shared captures and native Android integration — 2026-10-05

Fresh base: desktop main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`, Android main `7028ec6d131ffaaf9e03d2f22b3550d7a38ddf3c`. Both use `chatgpt/shared-companion-workflows-2026-10-05`. Read `docs/SHARED_CAPTURE_IMPLEMENTATION_PLAN_2026-10-05.md`, `docs/SHARED_COMPANION_UPDATE_2026-10-05.md`, `docs/NOTES_ROUNDS_COMPANION_GUIDE.md` and the extended Android contract. Desktop draft review is [PR #13](https://github.com/yosefbf-bot/Private-AI-OG-google-version/pull/13); the matching Android source `56e6796` is [PR #1](https://github.com/yosefbf-bot/AI-Mobile-companion-app/pull/1). The user merges both mains.

Shared encrypted source notes/evidence produce idempotent canonical review todos and internal drafts. Exact source spans and unknown fields remain; no AI/clinical conclusion or external send is inferred. Rounds edits reuse delegations and preserve confirmed deadlines. New unknown deadlines are no longer guessed from urgency. Remote inference excludes unrelated global context; optional phone local/HIPAA constraints cannot weaken desktop safeguards.

HTTPS adds scoped captures/actions/drafts/evidence, explicitly selected PC conversation history/continuation and generic reminder metadata. Full pairing remains lock-denied; a separate notification-only credential is accepted only for notification list/receipt. Explicit desktop pairing can allow that metadata while locked without changing Core's general lock. Revocation removes both credentials. WhatsApp capture commands retain verified sender/conversation gates, independent read-all/global-write controls and uncertain-delivery tombstones. AutoReminders is now actually saved/validated.

Final isolated complete Windows source run: 500 tests passed, with zero failures or skips. Focused shared safety runs, desktop IPC/development HTTP and 30 synthetic Edge UI checks passed; the bounded captures component additionally passed three real Core/Edge checks. Hardening 25 and production dependency audit zero. Exact initial head `80fde3f` passed all three GitHub jobs in run `37319044402`; later fixes require their own exact-head check. The frozen Android source passed 45 unit tests with zero failures/errors/skips, including actual Node Core pinned-HTTPS interoperability; lint passed with zero errors and 72 warnings. Debug app/test APKs built and the app signature verified using portable hash-verified JDK/SDK; source digest and APK hashes are in Android's validation report. No physical phone, real LAN, real account message or mailbox write occurred. Source checks do not establish packaged release readiness. Local release-file gate remains blocked until native helper/runtime inputs are prepared; earlier CI built and validated genuine inputs without weakening that gate.

Final review fixed opted-in locked WhatsApp reminders, preserved explicitly disabled reminders through follow-up edits, rejected unrepresentable dates, and made byte-bounded list labels accurate. One full-suite attempt while Gradle consumed RAM hit normal LOW_MEMORY protections (472 passed, 27 failed, one timed out); the isolated final 500-test run passed after the owned build exited. An additional general UI retry hit the same protection; the previously completed 30 checks and the isolated three changed-component checks are the actual passing UI scope.

Android full credentials/records require real device authentication and Keystore encryption, additive Room/content migration, separate demo data, real pinned HTTPS responses and encrypted stable pending requests. Known old simulated phone data must be retained but clearly labeled unverified. Full phone background credentials must never be decrypted by a generic notification worker; use only the restricted key/certificate. Physical OS-authentication/Keystore, migration, camera/local dictation, notification delivery and signing compatibility still require acceptance.

Later desktop head `2354815` run `37359845980` ended before any steps: GitHub annotations report that no hosted runner was acquired after multiple attempts. It is not an executed test failure/pass; inspect the final published head separately. Android handoff and actual final local results are in its own repository. Preserved source exports are transfer snapshots; GitHub remains authoritative.

The earlier validated installer/package below belongs to its exact earlier code checkpoint. It does not contain this source update. Preserve recovery/models outside Git and keep the existing release/privacy/resource gates. If allowance reaches 1% remaining, save/stop; use the latest explicit resume instruction in the chat. The prior one-time 3:35 AM wakeup was superseded and paused after the user resumed manually.

## Historical Windows validation — 2026-10-02

PR #11 is merged. Latest GitHub main was fetched and verified as
`114e0838fac230d33a9deb2996b7dfc736ce9d90`, matching the 10/1 integration tree.
Validation branch: `chatgpt/windows-validation-2026-10-02`.
The tested **3.0.1-dev** binary is built from code checkpoint
`bc964e09c28e996178196661bfccdcef6d3fac41`; later handoff/guide commits are supplemental
and do not change its hashes. Read [the dated Windows report](docs/WINDOWS_VALIDATION_2026-10-02.md)
and `PROJECT_STATUS.json` before making release claims.

Actual Windows application, installer and local-model execution now passed the
unchanged hash-bound release evidence gate. The NSIS installer exited 0 and its
installed EXE/ASAR match the tested package. Fresh/restart packaged runs passed
real DPAPI/SQLite synthetic persistence/restore, 12 built-in diagnostics, 21 views,
IPC lock, optional PCC and independent WhatsApp controls. No live messages were sent.
With no API key and PCC off, real renderer/IPC/Core inference through Small and
the installed High model kept synthetic unavailable medication status **unknown**.

Small 1.7B, Medium 3B and High 4B passed two real inference rounds, including model
checksums, cancellation and browser-lane guards. Initially available RAM was about
5.9–6.5 GiB; High used about 4.6 GiB at context 4096. High remains conditional on
available RAM/workload; no protection was weakened. Extra 8B is absent and untested.
The earlier High low-memory failure is historical evidence, not this candidate's result.

Source checks: **472 Windows tests**, **25 overlapping hardening tests**, **178 JS
syntax checks**, repository policy and zero-vulnerability production audit; **29 Edge
general UI checks**, updated restricted hardening UI and synthetic WhatsApp UI passed.
Linux registers 471 tests because the added interoperability test genuinely requires
Windows PowerShell 5.1. Merged-main CI run 37050270590 supplied hash-verified release
inputs. Exact code-checkpoint CI run 37055284317 passed all three jobs, including
471 Linux tests, 25 hardening, 178 syntax checks, zero audit findings and 406 PE inputs.
Later supplemental-documentation publication CI is checked separately on the PR.

Two bounded fixes are included: the installer validator writes BOM-free UTF-8 that
the existing evidence gate can parse in PowerShell 5.1, and Today renders unavailable
census/occupancy/HPPD explicitly with neutral styling while preserving confirmed zero.

The owner authorized replacement of the unused old app/data; a recovery copy was
preserved outside Git and was not used as clinical/test input. This is clean-app-state
installation acceptance, not representative existing-data upgrade acceptance.
The actual candidate uninstaller exited 0, preserved synthetic standard-path
database/vault bytes and removed its folder/registry/shortcuts; same-hash reinstall
and installed second-process restart passed with the original synthetic vault/records.
The post-NSIS final stage has 570 files/415 PE binaries; its standard helper addition
matched the pinned builder cache and every ZIP roundtrip file hash was verified.
The actual ZIP-extracted application passed 13 acceptance checks, 12 diagnostics
and 21 navigation views with the same EXE/ASAR hashes.
Windows restart, interactive wizard, representative clinical/PCC, real speakers,
live WhatsApp/accounts/native browser connections and physical Android acceptance
remain pending. The installer is unsigned and the development candidate is not a
production or HIPAA compliance certification. The fresh live app still requires
local-model configuration; GGUF weights are not bundled.

Use [the standalone guide](docs/INTEGRATED_STANDALONE_GUIDE.md) for local setup, optional
PCC and Messaging. Android must implement the certificate and pairing contract in
`docs/ANDROID_COMPANION_CONTRACT.md`; no phone acceptance or automatic firewall change
is inferred. Keep the current GitHub architecture, earlier preserved functionality,
all vault/security boundaries and the unchanged release gate.

## Historical 10/1 standalone integration checkpoint

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

## Historical workstreams and preserved implementation details

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
