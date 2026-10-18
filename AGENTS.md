# Instructions for ChatGPT / Codex and other coding agents

User standing instruction: before each new implementation task, fetch GitHub and verify the latest `origin/main` SHA, active branch, worktree status and application version. A local folder, uploaded archive or version label is not proof of currency. Preserve local changes, then integrate them into the current GitHub architecture. If the remote cannot be checked, disclose that limitation. Recheck main before publication and reconcile new upstream changes without discarding work.

High-priority persistent project policy: read `docs/GOOGLE_AI_STUDIO_GUARDRAILS.md` before every change. It records the user's required safeguards after the 2026-09-29 Google update removed release assets and reintroduced production sample data.

Read `AI_HANDOFF.md`, `PROJECT_STATUS.json`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` and `docs/WORKFLOW_VOICE_REVIEW_2026-09-28.md` and `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` before edits. GitHub is authoritative. Record the base commit and inspect the current diff. Use a separate `chatgpt/*` branch for ChatGPT changes. Do not merge or overwrite `main` automatically.

Preserve `package-lock.json`, the tracked `build/` scripts and icon, security boundaries, and native IPC restrictions. A web preview export is not a complete desktop checkout. Never remove files merely because the preview does not use them.

For each new RPC, wire and exercise both desktop `source/main.cjs` and development `server.cjs`, keeping their different permissions. For each editable field, verify save, reload, and downstream use. Test real Core/SQLite and IPC, not only module existence or source regexes.

No invented production measurements, diagnoses, medication, code status, staff identity, source citations, timestamps, or facility protocol approvals. Missing data stays unknown. Do not label incomplete monitoring as an all-clear. Synthetic content must use the isolated demo store, and copied reports must be labeled. Browser speech recognition must remain blocked in HIPAA/Local Only and when policy is unavailable. Stop capture on navigation, meeting completion and policy changes.

Run the verification commands in `AI_HANDOFF.md`. Record failures and unperformed tests honestly. Update the handoff and project status with the actual tested scope; no source test result establishes Windows release readiness.

Workflow edits must retain stale-revision checks, source-linked clinical closure, demo isolation and budget reservation before network calls. Keep expired/missing source data distinct from resolved work. Do not weaken normal input limits when changing opt-in sectioned jobs.

## Current assignment authorization — 2026-10-14

For this four-phase assignment, the owner explicitly authorized Codex to merge
completed review pull requests after their current exact-head GitHub tests and
checks pass, then synchronize the local main and development checkouts safely.
This supersedes older owner-only merge instructions for this assignment only.
Continue using separate `chatgpt/*` branches and review PRs; do not bypass failed
or pending checks, force-push, discard unfinished work, or remove unique history.
The owner also authorized removing obsolete build/version files and fully merged
branches after verifying they are no longer needed. Preserve active work, current
accepted delivery, recovery/reference evidence, credentials, signing keys, models
and pairings. This permission does not authorize replacing installed production
apps/data or weakening release, privacy, resource or security gates.


## Standing feature-addition preference — 2026-10-14

Before implementing a new feature, check GitHub for suitable free open-source components. Evaluate license, maintenance, security, offline/privacy behavior and compatibility. Reuse existing capabilities instead of adding duplicates. Prefer focused integration of trustworthy components when it saves work; use custom code when available projects do not fit. Explain selected components and meaningful feature/function changes. This does not override release or permission gates.

## Standing CI spending preference - 2026-10-18

The owner requests lower GitHub Actions usage. Read `docs/CI_COST_CONTROLS.md`
before workflow changes. Batch coherent, locally checked work before pushing;
avoid repeated unchanged builds and duplicate branch-push/PR validation.
Keep PR/main validation and manual full acceptance. Require the current `ci-gate`
and its selected checks to succeed. Runtime/build/dependency/test/workflow/contract
and unknown changes still require full validation, including actual Windows or
Android emulator acceptance. Only the explicit administrative-document path may
skip runtime jobs, and those skips must never be described as executions.
Do not use skip-CI commit directives or weaken checks to conceal a failure.
Use trusted dependency-only caching; preserve accepted release/current rollback
payloads and evidence before temporary artifacts expire. Do not raise billing
budgets, enable paid external services or replace installed apps to save CI cost.
