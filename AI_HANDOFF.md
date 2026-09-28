# Shared AI development handoff

Read `AGENTS.md`, `GEMINI.md`, `PROJECT_STATUS.json`, `ARCHITECTURE.md`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` before changes. GitHub is authoritative; record the exact base SHA and inspect the latest source/history. Roadmap entries, old manuals and UI mockups are not implemented-feature evidence.

## Current workstream

PR #4 was merged into main at `21969ff21a5ab51bdb12900aea2d618eb96a3466`; its regression, dependency and release-file CI checks passed (run 36363249305). Do not repeat that merge or treat its old branch notes as current status.

PR #5 is merged into main at `6e3f85b3faffb1688f34d7681c5765e5be04cf82`. Its six high-priority repairs, dashboard cleanup and experimental voice improvements are the base for this work.

PR #6 is merged into main at `a897ba7a6f7ea0d79ec4e3593cc1260396e03a7e`; regression, dependencies and release-file CI passed (run 36465145722). Read `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` for the implementation matrix and remaining physical acceptance.

Current branch: `chatgpt/application-checkup-2026-09-28`. Read `docs/APPLICATION_CHECKUP_2026-09-28.md` for the measured workflow optimization, selected-workspace surveillance alert fix and actual Windows/Edge test scope. This branch requires review/merge before AI Studio's main-only project can sync it. Preserve dated earlier review reports as historical evidence.

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

Current local verification: 370 regression tests and 23 hardening tests passed; production audit found zero vulnerabilities. `node --expose-gc tests/workflow-benchmark.cjs` provides a repeatable synthetic performance measurement without a timing-sensitive CI gate. Local release-file verification remains blocked on the two generated Windows binaries; consult branch CI separately.

`npm run build` and `lint` are syntax checks only. `check:release` is the Windows input gate. Restored build scripts/icon are present; Windows helper/runtime binaries must be built by the documented workflow. Actual install, existing-data upgrade, vault, local inference and feature execution at the artifact SHA remain release requirements. Record exact passing/failing counts and all unperformed tests in PROJECT_STATUS; do not reuse historical claims as current evidence.

## Speaker recognition contract

Keep the speaker feature available. Local recordings produce experimental suggestions only after three confirmed recordings, quality checks, a strict similarity threshold and separation from competing profiles. These thresholds are not probabilities. Automatic suggestions are never verified identity or task ownership; a person must confirm each attribution. Do not substitute browser transcript confidence for speaker identity. Do not fabricate acoustic samples, add roster score bonuses, or silently train on corrections. Keep local capture separate from policy-gated browser transcription, and preserve capture cancellation and raw-audio non-retention.
