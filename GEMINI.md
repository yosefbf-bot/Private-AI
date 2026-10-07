# Google AI Studio / Gemini handoff

## Pre-use audit repairs — 2026-10-06

Preserve the fixes and tests described in [the repair report](docs/PRE_USE_AUDIT_FIXES_2026-10-06.md): indefinite retention, voice stop/privacy and sidebar toggle, Worker restart status reconciliation, neutral regulatory notice and the targeted Mammoth parser override. Base main: `1527da64ba667ee862e2e71221f51063e4c06fa1`. This source change is newer than the frozen Windows candidate below; do not copy its execution flags or ship its older installer as containing these repairs. Current validation is in `PROJECT_STATUS.json` and the review PR.

## HIGH PRIORITY — read before every change

Follow [Google AI Studio guardrails](docs/GOOGLE_AI_STUDIO_GUARDRAILS.md) before editing or publishing. In particular, preserve the dependency lockfile and all tracked Windows build assets; a partial preview must never replace the repository. Keep all examples in the isolated Demo workspace and never manufacture production facts. These instructions were explicitly requested after the Google update on 2026-09-29 broke all three CI jobs. Copy the guardrails into AI Studio's project system instructions as well; this file does not configure external memory automatically.

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

## Current Windows candidate — 2026-10-06

The tested **3.0.1-dev** binary is frozen code `46a385d2a8d1b14acf3e960f2b4c601159ba3d04`, based on main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`; later reports/handoffs/source exports are supplemental. Read [the dated report](docs/WINDOWS_VALIDATION_2026-10-06.md) and [sanitized machine summary](docs/windows-validation-2026-10-06.json). Actual package/install/uninstall/reinstall, synthetic default-path DPAPI/SQLite retention, installed restart, Small local inference and 575-file portable roundtrip/extracted-app acceptance passed the unchanged hash gate. Current packaged shared capture/evidence/actions/internal drafts/selected-chat/lock/restricted reminders were exercised through IPC and pinned loopback HTTPS. No real message or mailbox dispatch occurred.

Exact-code checks: 500 Windows tests, 499 Linux CI tests, 25 hardening, 184 syntax; both code CI workflows 37441844506/37441839760 passed all three jobs. Production audit is **3 moderate, 0 high, 0 critical** through mammoth/argparse/sprintf-js, not zero findings; see [the primary advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Current model acceptance is **Small**; Medium/High remain historical October 2 bc964e09 evidence. Physical Android/LAN/notifications, live WhatsApp/Outlook/native browser, representative data upgrade, reboot/wizard, clinical human review and signing/updater remain separate. This is an unsigned development candidate, not production readiness or HIPAA certification.

The failed 11a9114 TLS-client and 34f9d3e IPC-unlock/Notes harness attempts remain retained. Corrections were validation-only; no production TLS relaxation or established production UI defect. Preserve the prior deliverables. Do not transfer any binary's flags by version label, and fetch main before future work/publication. Supplemental documentation commits require their own exact-head CI; they do not rebuild this installer.

Android review head 85db208 also passed 4 hosted emulator instrumentation tests. Hosted unit tests passed 44 with 1 explicitly skipped external desktop fixture; local tests passed 45 with 0 skips. Local lint has 0 errors/72 warnings, hosted lint 0/74. These are separate debug/hosted checkpoints, not physical-phone or existing-signer upgrade acceptance; production APK inputs remain the separately documented local checkpoint.

## Shared companion update — 2026-10-05 source checkpoint

Main was fetched and verified again before publication as `c269a18eec4ea5b4e347e3520be1cd4e9bd88876` (PR #12 merged). Desktop source review is [PR #13](https://github.com/yosefbf-bot/Private-AI-OG-google-version/pull/13); matching native Android review is [PR #1](https://github.com/yosefbf-bot/AI-Mobile-companion-app/pull/1), source `56e6796`. Both use `chatgpt/shared-companion-workflows-2026-10-05`; the owner merges. Read `docs/SHARED_COMPANION_UPDATE_2026-10-05.md` and both handoffs. Latest review branches contain additional encrypted notes/evidence, canonical follow-ups/internal drafts, selected PC chat sharing, scoped HTTPS and approved WhatsApp capture/reminders. They are newer than main until merged.

Final local source scope: 500 Windows tests; 45 Android tests including actual pinned-HTTPS Node Core interoperability; Android debug app/test APK build and lint (zero errors, 72 warnings). The app signature verified, with development signing only. Exact-head GitHub checks and emulator/physical-phone acceptance are distinct; an earlier head's successful CI is not a later head pass. No new Windows binary was produced, and older packaged evidence must stay tied to its old hashes. Photos are preserved evidence; remote drafts are internal, no external dispatch. Full phone access requires actual OS authentication and cancels foreground work on lock/background; optional generic reminder polling uses a separate restricted credential. Unknown clinical coverage is not an all-clear.

## Previous Windows candidate

PRs #4–#11 are merged. Latest main fetched and verified on 2026-10-02 is
`114e0838fac230d33a9deb2996b7dfc736ce9d90`; it includes the newer architecture plus
the preserved standalone/clinical/WhatsApp/Android gateway work. Active validation
branch: `chatgpt/windows-validation-2026-10-02`. The actual **3.0.1-dev** binary is
code checkpoint `bc964e09c28e996178196661bfccdcef6d3fac41`; later documentation is
supplemental. Fetch main before every new task and again before publication.
Refresh from GitHub after reviewed fixes merge; never replace it with an older export.

Read [historical Windows validation](docs/WINDOWS_VALIDATION_2026-10-02.md). Actual
application, NSIS installation and real local-model inference passed the unchanged
artifact-hash gate. Small/Medium/High passed twice with current available RAM;
keyless/PCC-off renderer/IPC/Core inference passed Small and installed High using
synthetic unknown medication status. Resource/privacy protections remain enabled.
Extra is absent and untested. Source checks passed 472 tests on Windows, 25 hardening,
178 syntax files, 29 Edge general checks, restricted hardening and synthetic Messaging
UI, repository policy and zero production-audit vulnerabilities. Exact code-checkpoint
CI 37055284317 passed all three jobs. Linux has 471 tests
because actual Windows PowerShell 5.1 interoperability is Windows-only.

The two behavior fixes are BOM-free installer evidence output and neutral, explicit
unavailable Today metrics; confirmed numeric zero is retained. General clinical
capabilities and optional PCC/WhatsApp/gateway permissions are preserved.
Actual candidate uninstall/reinstall and installed restart passed, preserving
synthetic database/vault bytes and reinstalling the same payload. The final
post-NSIS stage is 570 files/415 PE binaries; its standard helper addition matched
the pinned cache, and ZIP roundtrip hashes passed for every file.
The actual ZIP-extracted app also passed 13 acceptance checks, 12 diagnostics and
21 views; this does not make encrypted data portable across Windows accounts.
Representative installed-data upgrade, Windows restart, interactive wizard,
clinical/speaker/live WhatsApp/account/browser/physical-phone acceptance remain
pending. The installer is unsigned; these are development-candidate results,
not a production-readiness or HIPAA certification. Do not infer a configured local
model in a fresh installation from isolated acceptance tests.

Use an isolated `studio/*` branch and a pull request. If the integration cannot use a separate branch, provide a reviewable patch and stop publication. Never replace the full repository with the files visible in the web preview. Preserve lockfiles, Windows build assets and security gates. Read the current source before claiming a feature exists.

Historical checkpoints remain in `PROJECT_STATUS.json` and the dated reports.
PR #9 passed 384 source tests and isolated packaged checks but did not execute its
installer. Repair PR #10 passed 414 source tests after the Google update deleted
required build files; see `docs/GOOGLE_MAIN_REPAIR_2026-09-29.md`. The older High
low-memory stop remains in that history. It must not be reported as the current
candidate's outcome. Read `docs/HUMAN_ACCEPTANCE_2026-09-29.md` for remaining human
tests; do not overwrite an installation/vault without its owner's authorization.

Any UI task must include the backend contract and save/reload behavior. Do not create plausible sample clinical facts or fake audio telemetry to make a screen look finished. Use empty/unknown states and clearly describe unimplemented capabilities. Run the documented tests and report the exact failures; do not alter tests to expect fabricated production data.

Preserve the user-requested speaker feature: local acoustic measurements may suggest a name, but similarity is not identity accuracy. Require three independent confirmed recordings, abstain on ambiguity, and keep explicit human confirmation before verified names or task attribution. Continuous diarization and offline speech-to-text remain future work.

Preserve versioned input previews, clinical source closure, dated unit metrics and per-PC budget reservations. A heading check is not factual verification; HPPD is not a compliance score; extracted sections are not OCR or whole-document synthesis.
