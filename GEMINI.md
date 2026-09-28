# Google AI Studio / Gemini handoff

Read `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` first.

The user's AI Studio integration uses `main`. This review lives on `chatgpt/ai-studio-review-2026-09-25`; these fixes will reach AI Studio only after the user merges them and reloads/syncs the project. Do not overwrite the repair branch or independently reimplement these changes from an old export.

Prefer isolated `studio/*` branches when the integration supports them. If only `main` is available, work there only under the user's existing explicit main-only workflow; refresh from GitHub after reviewed fixes are merged. Never replace the full repository with the files visible in the web preview. Preserve lockfiles, Windows build assets and security gates. Read the current source before claiming a feature exists.

Any UI task must include the backend contract and save/reload behavior. Do not create plausible sample clinical facts or fake audio telemetry to make a screen look finished. Use empty/unknown states and clearly describe unimplemented capabilities. Run the documented tests and report the exact failures; do not alter tests to expect fabricated production data.
