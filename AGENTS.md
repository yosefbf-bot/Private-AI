# Instructions for ChatGPT / Codex and other coding agents

Read `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` and `docs/WORKFLOW_VOICE_REVIEW_2026-09-28.md` before edits. GitHub is authoritative. Record the base commit and inspect the current diff. Use a separate `chatgpt/*` branch for ChatGPT changes. Do not merge or overwrite `main` automatically.

Preserve `package-lock.json`, the tracked `build/` scripts and icon, security boundaries, and native IPC restrictions. A web preview export is not a complete desktop checkout. Never remove files merely because the preview does not use them.

For each new RPC, wire and exercise both desktop `source/main.cjs` and development `server.cjs`, keeping their different permissions. For each editable field, verify save, reload, and downstream use. Test real Core/SQLite and IPC, not only module existence or source regexes.

No invented production measurements, diagnoses, medication, code status, staff identity, source citations, timestamps, or facility protocol approvals. Missing data stays unknown. Do not label incomplete monitoring as an all-clear. Synthetic content must use the isolated demo store, and copied reports must be labeled. Browser speech recognition must remain blocked in HIPAA/Local Only and when policy is unavailable. Stop capture on navigation, meeting completion and policy changes.

Run the verification commands in `AI_HANDOFF.md`. Record failures and unperformed tests honestly. Update the handoff and project status with the actual tested scope; no source test result establishes Windows release readiness.
