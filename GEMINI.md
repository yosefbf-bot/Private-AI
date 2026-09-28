# Google AI Studio / Gemini handoff

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

The user's AI Studio integration uses `main`. PR #4 is already merged at `21969ff`. Current workflow and speaker changes live on `chatgpt/workflow-voice-improvements-2026-09-28`; read `docs/WORKFLOW_VOICE_REVIEW_2026-09-28.md`. These new changes reach AI Studio after a reviewed merge and project refresh. Do not restore outdated defaults or overwrite the current branch from an old export.

Prefer isolated `studio/*` branches when the integration supports them. If only `main` is available, work there only under the user's existing explicit main-only workflow; refresh from GitHub after reviewed fixes are merged. Never replace the full repository with the files visible in the web preview. Preserve lockfiles, Windows build assets and security gates. Read the current source before claiming a feature exists.

Any UI task must include the backend contract and save/reload behavior. Do not create plausible sample clinical facts or fake audio telemetry to make a screen look finished. Use empty/unknown states and clearly describe unimplemented capabilities. Run the documented tests and report the exact failures; do not alter tests to expect fabricated production data.

Preserve the user-requested speaker feature: local acoustic measurements may suggest a name, but similarity is not identity accuracy. Require three independent confirmed recordings, abstain on ambiguity, and keep explicit human confirmation before verified names or task attribution. Continuous diarization and offline speech-to-text remain future work.
