# Google AI Studio / Gemini handoff

## HIGH PRIORITY — read before every change

Follow [Google AI Studio guardrails](docs/GOOGLE_AI_STUDIO_GUARDRAILS.md) before editing or publishing. In particular, preserve the dependency lockfile and all tracked Windows build assets; a partial preview must never replace the repository. Keep all examples in the isolated Demo workspace and never manufacture production facts. These instructions were explicitly requested after the Google update on 2026-09-29 broke all three CI jobs. Copy the guardrails into AI Studio's project system instructions as well; this file does not configure external memory automatically.

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

PRs #4–#9 are merged. Latest main fetched on 2026-09-29 is `a5d22b623c5c49fccd36b41bd4488d2a64fac346`; its Google update broke all three CI jobs by deleting the lockfile and Windows build assets. Repair PR #10 restores them and addresses executive Production/Demo regressions. Read `docs/GOOGLE_MAIN_REPAIR_2026-09-29.md` for current evidence and `PROJECT_STATUS.json` for the verified code checkpoint. Refresh from GitHub after reviewed fixes merge; do not overwrite the repository from an older export.

Use an isolated `studio/*` branch and a pull request. If the integration cannot use a separate branch, provide a reviewable patch and stop publication. Never replace the full repository with the files visible in the web preview. Preserve lockfiles, Windows build assets and security gates. Read the current source before claiming a feature exists.

Historical PR #9 release-validation evidence: 384 regression tests, 25 overlapping hardening tests, 27 Edge UI checks, four-browser synthetic checks and zero production audit findings. Its Windows package/unsigned installer was built; isolated packaged DPAPI restart/restore and built-in checks passed. This is not a package built from the newer Google update. Repair PR #10 passes 414 regression tests, 25 hardening tests and expanded Edge hardening UI; no new installer acceptance is claimed. Installer/installed-data, representative PCC, real speakers and real account/Bitwarden/native-companion acceptance remain unperformed. High-tier local inference is conditional on RAM: an initial pass was followed by a low-memory stop. Read `docs/WINDOWS_RELEASE_VALIDATION_2026-09-28.md` and `docs/HUMAN_ACCEPTANCE_2026-09-29.md`; do not promote these checkpoints to production-ready or overwrite installed vaults.

Any UI task must include the backend contract and save/reload behavior. Do not create plausible sample clinical facts or fake audio telemetry to make a screen look finished. Use empty/unknown states and clearly describe unimplemented capabilities. Run the documented tests and report the exact failures; do not alter tests to expect fabricated production data.

Preserve the user-requested speaker feature: local acoustic measurements may suggest a name, but similarity is not identity accuracy. Require three independent confirmed recordings, abstain on ambiguity, and keep explicit human confirmation before verified names or task attribution. Continuous diarization and offline speech-to-text remain future work.

Preserve versioned input previews, clinical source closure, dated unit metrics and per-PC budget reservations. A heading check is not factual verification; HPPD is not a compliance score; extracted sections are not OCR or whole-document synthesis.
