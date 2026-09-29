# Google main update repair — 2026-09-29

## Source and diagnosis

- Base/main, fetched again during review: `a5d22b623c5c49fccd36b41bd4488d2a64fac346`.
- PR #9 already merged at `a4127e09472b03337346c47be8fee964330854cf`; its Windows evidence remains historical, not acceptance of this newer source.
- Branch: `chatgpt/google-main-ci-repair-2026-09-29`.
- Verified code checkpoint: `ec0ae9c74123eb74c410e8865609ddcf8aeacbe5`. Subsequent documentation commit does not change application code. The PR identifies the final publication SHA.
- GitHub CLI run/log/annotation inspection: [failing main run 36640248873](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36640248873).
- Google deleted `package-lock.json` and all nine tracked `build/` files. Regression/dependencies failed at npm cache setup; release-files could not load `build/setup-runtime.cjs`. Dependencies had not changed.
- Repair `e3f9483e284a3621b097b156a9fd69462b0253c6` restores those ten files exactly from the verified parent. Its [three GitHub jobs passed](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36641696462).

## Additional confirmed defects repaired

The new executive engines selected the live store even in Demo Mode. They seeded invented room, employee and license records into Production; missing staffing/census inputs yielded sample facts; drafts asserted unprovided clinical stability and operational actions. A license save fabricated an expiration date and used an invalid canonical todo ID, creating duplicate renewal tasks on repeated saves. Browser speech output could select a remote voice.

Repairs reuse the existing isolated Demo namespace, including canonical tasks and metadata; suppress live Demo notifications; remove automatic Production samples and fabricated draft facts; show missing inputs as unknown; preserve one valid renewal task ID; and require an explicitly local speech voice. Production sample-CSV loading is disabled. Existing records are retained unchanged for reviewed disposition.

Files changed beyond the exact restoration: executive assistant/desk/analytics engines, the shared executive workspace helper, the two executive UI modules, their existing regression fixtures, three real Core/SQLite safety tests, and the Edge hardening UI test. Documentation adds persistent Google guardrails and reconciles current status/handoff/roadmap/architecture.

## Verification actually executed

Environment: Windows 11 Pro 10.0.26200 x64; Node 24.19.0. Synthetic test data only. Installed production vaults/data were not opened or modified.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | 603 packages added, 604 audited; existing transitive deprecation warnings |
| `npm test` | 414 passed, 0 failed/skipped/cancelled; final run 11,620.6746 ms |
| `npm run test:hardening` | 25 passed, 0 failed/skipped/cancelled; overlapping subset, 1,825.3595 ms |
| `npm run lint` | 166 tracked JS files passed |
| `npm run check:repository` | 265 tracked files at code checkpoint; 267 including final documentation passed |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `npm run test:hardening-ui` | Edge passed existing workflows plus new Production empty states, Demo boundary, sample-import restriction and remote-only TTS refusal |
| `npm run check:release` | Required files and 406 structurally valid Windows PE binaries passed |
| Git diff review | Restored files match verified parent; no unrelated deletion or dependency change |

Local release checking used copies of the previously verified source-built helper/runtime from the release-validation worktree; all 411 copied files matched the prior CI SHA-256 manifest and helper/runtime sources are unchanged. GitHub independently rebuilds them. This is not a new Electron/NSIS build, installer test or production upgrade acceptance. No new installer hash is claimed.

The three new database tests first reproduced failures before repair, then passed. Existing mock tests now supply explicit synthetic fixtures instead of depending on automatic Production seeding; expected behaviors were not disabled. One concurrent full-suite/UI invocation failed session authentication because both used port 3000 (413/414). Serial reruns passed 414/414. Run server-based suites serially. An intermediate UI test navigation failure was corrected to close its modal before navigating; the completed Edge run passed.

## Remaining limitations and human action

- Review/merge this PR after the exact final head checks pass. Do not overwrite main with an AI Studio preview export.
- If the faulty Google version was run against installed data, review potentially seeded executive rooms, hires, licenses and duplicate renewal tasks with the administrator. This patch prevents new automatic contamination; it does not silently delete or retroactively classify existing records.
- Paste `docs/GOOGLE_AI_STUDIO_GUARDRAILS.md` into the Google AI Studio project's system instructions. AGENTS.md and GEMINI.md require reading it; repository edits do not configure Google's account memory.
- New assistant features are deterministic templates/heuristics and require human review. They are not independently validated clinical, staffing, legal or regulatory conclusions, nor evidence of live provider execution.
- Existing Windows installer/upgrade/uninstall, protected installed-data restore, full UI/accessibility, real accounts/Bitwarden/native companion, representative de-identified PCC and human speaker acceptance remain pending. Historical credential/vault remediation still requires separate authorization.
- No PHI, credentials, runtime database, production vault or generated binary is added to this repair. No history rewrite or key rotation occurred. Production readiness remains blocked.
