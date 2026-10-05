# Google AI Studio / Gemini handoff

## HIGH PRIORITY — read before every change

Follow [Google AI Studio guardrails](docs/GOOGLE_AI_STUDIO_GUARDRAILS.md) before editing or publishing. In particular, preserve the dependency lockfile and all tracked Windows build assets; a partial preview must never replace the repository. Keep all examples in the isolated Demo workspace and never manufacture production facts. These instructions were explicitly requested after the Google update on 2026-09-29 broke all three CI jobs. Copy the guardrails into AI Studio's project system instructions as well; this file does not configure external memory automatically.

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

PRs #4–#11 are merged. Latest main fetched and verified on 2026-10-02 is
`114e0838fac230d33a9deb2996b7dfc736ce9d90`; it includes the newer architecture plus
the preserved standalone/clinical/WhatsApp/Android gateway work. Active validation
branch: `chatgpt/windows-validation-2026-10-02`. The actual **3.0.1-dev** binary is
code checkpoint `bc964e09c28e996178196661bfccdcef6d3fac41`; later documentation is
supplemental. Fetch main before every new task and again before publication.
Refresh from GitHub after reviewed fixes merge; never replace it with an older export.

Read [current Windows validation](docs/WINDOWS_VALIDATION_2026-10-02.md). Actual
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
