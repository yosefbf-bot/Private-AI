# Google AI Studio / Gemini handoff

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

The user's AI Studio integration uses `main`. PRs #4 and #5 are merged; the current verified base is `6e3f85b3faffb1688f34d7681c5765e5be04cf82`. New administrator workflow changes are on `chatgpt/administrator-workflows-2026-09-28`; read `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md`. They reach AI Studio after a reviewed merge and project refresh. Do not overwrite the repository from an older export.

Prefer isolated `studio/*` branches when the integration supports them. If only `main` is available, work there only under the user's existing explicit main-only workflow; refresh from GitHub after reviewed fixes are merged. Never replace the full repository with the files visible in the web preview. Preserve lockfiles, Windows build assets and security gates. Read the current source before claiming a feature exists.

Any UI task must include the backend contract and save/reload behavior. Do not create plausible sample clinical facts or fake audio telemetry to make a screen look finished. Use empty/unknown states and clearly describe unimplemented capabilities. Run the documented tests and report the exact failures; do not alter tests to expect fabricated production data.

Preserve the user-requested speaker feature: local acoustic measurements may suggest a name, but similarity is not identity accuracy. Require three independent confirmed recordings, abstain on ambiguity, and keep explicit human confirmation before verified names or task attribution. Continuous diarization and offline speech-to-text remain future work.

Preserve versioned input previews, clinical source closure, dated unit metrics and per-PC budget reservations. A heading check is not factual verification; HPPD is not a compliance score; extracted sections are not OCR or whole-document synthesis.
