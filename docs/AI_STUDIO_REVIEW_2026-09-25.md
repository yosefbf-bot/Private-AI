# Review of AI Studio updates — 2026-09-25

Historical report: PR #4 was merged at `21969ff` and its CI passed. Statements below describe the review-time state. For subsequent changes, read `WORKFLOW_VOICE_REVIEW_2026-09-28.md`.

Repository: `yosefbf-bot/Private-AI-OG-google-version`.
Branch: `chatgpt/ai-studio-review-2026-09-25`.
Base: `b537dd9a9d43c4660c7036c85eece02ff2578705`.
Compared with integrated hardening baseline `2c7a63e8474fe2b19c4ec7bd24ba7e8b17d3d28f`.
Reviewed updates: `9132263` (development preview), `ffaf238` (Automation/voice UI), `b537dd9` (Operations/meeting/SBAR).

## What went wrong and what changed

| Finding | Repair and prevention |
| --- | --- |
| `package-lock.json` and nine tracked Windows build assets disappeared from the recent updates. CI's `npm ci` and packaging references could no longer work. | Restored the baseline lockfile and build assets. Preserve desktop files in preview exports; syntax-only build success is not installer evidence. |
| New Operations, meeting, SBAR and speaker RPCs were registered only in the development server. | Added desktop routing after the existing unlock/native-origin gates. Added a test through actual desktop IPC using real Core/SQLite and a mocked Electron boundary. |
| Operations reported a made-up facility, 106 residents, capacity/payer estimates, staffing hours, survey scores and healthy automation without inputs. Today also substituted positive numbers for missing/zero values. | Removed fabricated metrics, made unsupported fields unknown, used actual resident records and antipsychotic rule IDs, exposed feed completeness, and removed unconditional staffing compliance claims. Imported resident counts are not a live census. |
| SBAR fabricated vitals from an alert, diagnoses, medications, Full Code, symptoms/pain, recent events and source labels. Family drafts asserted comfort and prior provider contact. Packaged examples were treated as approved protocols. | Removed fabricated facts and source attribution. Missing source time remains unknown. Packaged protocols remain unapproved references; entered standing orders require verification. Exact resident IDs and the real `snf_med_order`/ISO date schema prevent wrong-resident matching and omitted imported medications. |
| SBAR could finalize without review; passing `status: finalized` bypassed the edit lock. Reviewed edits retained review status. Text fields had no save action. | Enforced draft → review → finalize, named reviewer/finalizer, explicit revision reasons and renewed review after edits. Added Save Draft, disabled sign-off/copy while unsaved, and regenerated communication text after editing. Legacy SBARs are preserved but flagged and blocked from sign-off until recreated with verified sources. |
| New modules bypassed the selected demo namespace. Repeated action conversion created duplicate tasks. | Routed through the selected encrypted SNF workspace, isolated demo todos/events, labeled generated demo text, refreshed UI selections when workspaces change and made conversions idempotent. Demo simulation buttons are disabled in production. |
| Meeting speech recognition bypassed voice policy. Fake staff profiles and samples were seeded in production; microphone diagnostics and speaker recognition used constants/random numbers. | Fail-closed microphone policy, stop on navigation/completion/policy changes, unknown speaker labels until manual verification, no automatic profile seeding, no fabricated samples/learning. Simulated old samples are excluded from the recognition list. Acoustic matching/quality functions are experimental helpers, not proof of an end-to-end audio pipeline. |
| The server returned its bearer token publicly in HTML and `/api/dev-token`; all `*.run.app` sites were trusted, forwarded host was trusted and cross-origin localhost ports were accepted. | Removed token disclosure. Added an iframe-compatible token form. Default is exact loopback host/origin; optional preview requires one explicitly configured HTTPS origin. Forwarded Host cannot expand trust. Session/CSRF checks remain required; SSE query credentials are restricted to the event path. |
| Git-less file scanning stripped the leading dot from `.env`, bypassing the secret filename check. Existing app audit event names were removed. | Preserve dotfile names and restore `app_registered`/`app_opened`. Added a git-less export regression test. |
| New sensitive records had no retention integration. | Completed meetings without pending commitments and closed SBARs follow existing retention. Open communication loops and pending meeting actions are retained. Explicit deletion also purges backups outside demo. |
| Quick-enable Worker could report success on a Primary-only PC although Core rejected enabling. | Direct Primary-only users to role configuration before enabling. |

## Why the previous checks missed it

Several new tests verified imports, strings and stand-alone mocks without calling the desktop dispatcher. Others explicitly expected the invented staffing/census values, automatically seeded identities, invented vital age or pretend protocol approval. Those expectations were replaced with assertions against fabricated data, with explicit synthetic fixtures where a populated dataset is required. Security gates were not weakened.

The destructive file deletions are visible in Git history; their cause inside AI Studio is not independently known. Do not assume an intentional deletion or a particular export mechanism.

## Verification

See `PROJECT_STATUS.json` for the final test totals. Verified locally on Node 24/Linux: clean lockfile install with scripts disabled; unit/integration suite; hardening subset; syntax; repository policy; production dependency audit. Tests cover desktop IPC, actual HTTP token secrecy, missing clinical facts, review transitions, demo isolation, exact resident IDs, imported medication dates, microphone policy, task idempotence, retention and git-less secret scanning.

Supplementary DOM checks rendered all seven Operations tabs and Automation using the real Core, and exercised SBAR field edit → save → communication text and review button state. A temporary external DOM harness was used without changing app dependencies. This is not browser layout or Windows validation. `tests/hardening-ui-check.cjs` was updated for the new authentication form/current selectors and Operations/SBAR navigation, but full browser execution is blocked here: Chromium exits before page creation.

`npm run check:release` correctly still fails for the locally unbuilt `build/desktop-helper/PrivateAI.Access.exe` and `build/local-runtime/llama-server.exe`. CI contains prerequisite build steps; this review did not produce or certify an installer. No Windows clean install, existing-data upgrade, local inference, hardware audio or actual PCC clinical acceptance was performed.

## Limits and next handoff

- Changes are review-branch source changes, not deployed or merged. AI Studio's main-only project sees them only after a user-approved merge and sync/reload.
- Staffing/payer/capacity imports, a validated survey score, automatic acoustic capture/filtering/diarization and facility protocol approval workflow remain unimplemented. Unknown states are intentional.
- SNF clinical rules remain heuristic and require independent clinician review. This repair is not validation of all clinical recommendations, regulations or historical source data.
- Old SBARs, meetings, profiles or transcripts produced before this repair may already contain synthetic facts. Preserve and inspect them before real use. The repair does not silently delete clinical records or repair factual content in old transcripts/minutes. Old seeded sample identities can remain visible for user review; their known synthetic samples are excluded from automatic recognition.
- Speaker profile retention is user-managed via explicit deletion; long-term organizational retention/legal holds still need facility approval. Pending meeting actions and open SBAR loops deliberately remain retained.
- Exact preview origin: set `PRIVATE_AI_DEV_PREVIEW_ORIGIN=https://your-exact-preview.run.app` outside Git. Enter the local `PRIVATE_AI_DEV_TOKEN` via the login form; no bearer token is served to anonymous visitors. Preview remains development/demo only, not for PHI.
- Before further changes, read `AGENTS.md` and `GEMINI.md`. Preserve source files omitted from a preview. Add both transport routes and exercise save/reload behavior, not just a successful screen render. Keep build, Windows acceptance and clinical acceptance gates distinct.
