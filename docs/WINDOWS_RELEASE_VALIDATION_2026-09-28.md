# Windows release validation — 2026-09-28

## Checkpoint and environment

Base main fetched through GitHub: `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a` (PR #8); PR #7 is already merged at `f0b6d88e274a77e38fb7ee67a686b5e1b81251b2`. Main [CI 36499532128](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36499532128) passed. Work uses isolated `codex/release-validation-2026-09-28`, not the desktop main checkout. No pre-existing uncommitted work was discarded.

Windows 11 Pro 10.0.26200, x64; Intel Core 5 120U, 10 cores/12 logical processors; 16,335,120 KiB visible RAM. Initial free memory approximately 5.7 GiB; disk free approximately 237 GiB. Node 24.19.0. No .NET SDK or native C++ build toolchain installed. CI cross-builds the checksum-pinned Windows runtime and .NET helper; the validation branch retains those outputs and their hashes for Windows packaging.

Existing `%LOCALAPPDATA%\PrivateAI2` database/vault presence was checked by metadata only. Neither contents nor secrets were read or modified. Three installed GGUF models were identified by filename/size (Small 1.7B, Medium 3B, High 4B); this is not inference evidence. Extra High 8B is absent.

## Baseline before application changes

Source is unchanged from base; status-only checkpoint `814f044`, packaging-input retention `fc5d0e6`. Raw synthetic test logs are outside the checkout in the chat workspace (`work/release-baseline-*.log`).

| Command | Observed result |
| --- | --- |
| `npm ci --ignore-scripts` | Pass; 603 packages added, 604 audited. Deprecation warnings: fstream 1.0.12, node-domexception 1.0.0, glob 10.5.0, fluent-ffmpeg 2.1.3. |
| `npm test` (TAP reporter) | 380 pass, 0 fail/cancelled/skipped/todo; 326 top-level tests; 11.381 seconds. |
| `npm run test:hardening` | 23 pass, 0 fail/cancelled/skipped/todo; 1.638 seconds. |
| `npm run lint` | Pass; 154 source files syntax checked. |
| `npm run check:repository` | Pass; 250 tracked files. |
| `npm audit --omit=dev --audit-level=high` | Exit 0; 2 moderate findings, no high/critical. Nodemailer GHSA-6vj9-mwq6-2f5v through mailparser 3.9.23. |
| `npm run check:release` | Exit 1: missing `build/desktop-helper/PrivateAI.Access.exe` and `build/local-runtime/llama-server.exe`. |
| `npm run test:hardening-ui` (installed Edge) | Failed: PCC assertion read transient `Loading…`; final diagnostic page already showed blocked development imports. Investigate/wait for the real ready state, retain the policy assertion. |
| `npm run test:ui` (installed Edge) | Failed: old harness waits for chat welcome on startup; current application starts at Today. Adapter/navigation assumptions need updating without weakening assertions. |
| `npm run test:messaging-ui` | Passed synthetic UI permission save/remove and synthetic message DOM send observation; no external messages sent. |
| `npm run test:browsers` | Passed Edge, Chrome, managed Firefox and Chromium: synthetic login/download, sensitive-field capture exclusions and browser selection persistence. No real password manager or native extension connection tested. |
| `node --expose-gc tests/workflow-benchmark.cjs` | 400 documents, 80 jobs, 1,500 actions; 9 samples, median 220.43 ms, range 193.86–276.00 ms; 1,981 decryptions / 34,366,771 bytes. Synthetic, hardware-specific observation. |

## Release status

Blocked pending actual artifact, packaged application, install/upgrade/restore and acceptance evidence. Source tests and successful main CI are insufficient. Clinical rules remain experimental; representative de-identified PCC acceptance and real-speaker validation have not occurred. No next-stage product enhancement is approved as complete by this document.

## Final validation checkpoint — 2026-09-29

The preceding section records the initial baseline, not the final result. Final validated application source checkpoint: `5d4772ee9fb70b324a61397ddde93c8b4d1e0f20`, on `codex/release-validation-2026-09-28`. Generated build metadata and final documentation follow in separate commits. The final branch tip is recorded after committing in the external `release-verified-evidence-2026-09-29/final-revision.json`, avoiding a self-referential commit hash inside this document. Artifact hashes below bind the actual executed bytes.

### Defects discovered and fixed

- Packaged PDF processing failed with `No "GlobalWorkerOptions.workerSrc" specified.` PDF.js's Node default was unavailable in Electron's utility process. Explicitly resolving the shipped worker fixes PDF read/write without remote workers, weaker parsing limits or changed Electron fuses. Actual packaged PDF self-check now passes.
- Release-file validation accepted arbitrary placeholder files. It now checks required regular files and PE structure, including truncation and x64 native runtime/launcher requirements. Valid managed AnyCPU .NET DLLs remain supported. Five packaging-integrity tests pass.
- New-order alerts invented absent dose/frequency and treated upload/report time as order recency. Missing order dates remain null; old explicitly dated orders are not newly started on reimport; unknown recency and absent dose/frequency are disclosed. MED-NEW evaluation version is `3.0.1-2`; existing alert histories are preserved.
- Screenshot review found a green “Clear” clinical card despite incomplete feeds. It now shows “Incomplete,” explains missing/stale evidence and avoids clinical-stability claims. Unknown prescriber no longer becomes “Attending Physician.” The Edge regression verifies the warning and absence of the success state.
- Staffing/census numeric coercion accepted whitespace, booleans and arrays. These are rejected; valid trimmed decimal input remains supported. Synthetic RN/LPN/CNA, three shifts, provenance, duplicates, payer totals and incomplete-unit/day tests pass. A later partial import removes the previous complete-day HPPD calculation. No compliance or facility-wide coverage claim is added.
- Targeted mailparser 3.9.23 → 3.9.31 update resolved the two moderate Nodemailer dependency findings. No forced audit upgrade or unrelated refactor.
- Existing UI harnesses had stale startup, collapsed-details, attachment-name, guide-count and mode-label assumptions plus a PCC loading race. Updated interaction/readiness checks retain policy and persistence assertions. Screenshots now use ignored build output paths. Packaged navigation originally accepted stale content before the asynchronous refresh completed, and hidden-window screenshots could capture older frames. The harness now requires the selected page and correct heading, waits for rendered frames, and records each observed heading. Earlier screenshots from that harness are superseded.

### Final commands and exact results

| Verification | Result |
| --- | --- |
| Clean `npm ci --ignore-scripts` | 603 added / 604 audited; pass. Existing transitive deprecation warnings remain: inflight, lodash.isequal, rimraf 2, glob 7/10, boolean, fstream, node-domexception and fluent-ffmpeg. |
| `npm test`, TAP | **384 passed**, 0 failed/cancelled/skipped/todo, 330 top-level tests; 11.620 seconds (final repeat; earlier clean-install run: 12.526 seconds). |
| `npm run test:hardening` | **25 passed**, 0 failed/cancelled/skipped/todo; 2.105 seconds (final repeat; earlier run: 1.741 seconds). This subset overlaps the full suite; do not add counts. |
| Syntax | 158 tracked JavaScript files passed. |
| Repository policy | 255 tracked files at the code checkpoint passed; final documentation adds files. No runtime database, PHI, credential, model or recording intentionally entered Git. |
| Production audit | 0 vulnerabilities. |
| `check:release` | Pass, **406** Windows helper/runtime PE files validated. |
| Entire packaged-tree PE check | Pass, **415** exe/DLL/native-addon files validated. |
| `test:ui` | **27** synthetic UI/keyboard checks passed in installed Edge 154.0.4258.37. |
| `test:hardening-ui` | Pass: authenticated loopback development app, Today, Demo isolation, evidence/follow-up, PCC restrictions, Surveillance, Operations/SBAR persistence, Automation and five workflow pages. |
| `test:messaging-ui` | Pass: synthetic permissions/save/remove and local DOM send observation; no external message sent. |
| `test:browsers` | Pass: Edge, Chrome, managed Firefox and Chromium synthetic login/download, sensitive capture exclusions and browser selection persistence. |
| Windows `build:win` | Pass: actual Electron x64 application and unsigned NSIS installer built on Windows. Portable npm needed a workspace-local launcher; no application workaround was required. |
| Packaged fresh/restart runs | Both exit 0; **12 acceptance checks each**, including 21 page renders, plus **12 built-in self-checks each**. These are distinct check groups, not independent clinical tests. |

CI [36504427261](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36504427261) built helper/runtime from `fc5d0e64013c62166f45507f892f058142f33965`; all 411 downloaded input hashes matched. CI [36521131256](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36521131256) passed regression, dependencies and release-files at `ab1880ef6d63de5079403124f982f077306bed8f`. The final source checkpoint run [36575990119](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36575990119) at `5d4772ee9fb70b324a61397ddde93c8b4d1e0f20` has passed regression and dependencies; its runtime build is in progress at documentation time. Later branch-tip CI is recorded in the PR and external final-revision evidence; do not attribute an earlier run to a later commit.

### Windows artifacts and acceptance

Installer: `dist/PrivateAI-Setup-3.0.1-dev-x64.exe`.

- Installer SHA256: `24084a22e37846203119bf023cfa045b65bdf34a0a70e2d1cba1617a727cbf22`
- Executed `PrivateAI.exe` SHA256: `20799c5d7497767975a5960dee1d100c8118228adb945481bb1e92a1dac8f508`
- Executed `resources/app.asar` SHA256: `f5ca1092c8fca37b08bc94943a89d0803fd4424a5c6822514bf0d8ccbcef8870`

Actual packaged application execution passed in a fresh, isolated data directory and a second process using the same directory. Verified DPAPI startup, no initial seeded residents/speakers, preserved vault hash and encrypted synthetic records, SQLite backup opened with a copied same-account DPAPI vault, helper health, ACLs, protected local IPC, deterministic chat, DOCX/XLSX/PDF read/write, audit integrity, Messaging, application lock/wrong-passphrase rejection/unlock, navigation and graceful process exit.

Synthetic persistence fixtures include chats/projects and opaque file, SNF, workflow, disabled schedule, peer and secret records. This proves encrypted storage survival, **not** complete functional upgrade compatibility for each subsystem. Real installed chats/settings/credentials, model paths and ShareSync configuration were not accessed or upgraded. The current database-only backup UI is not a cross-account vault recovery package.

The installer was **built, not executed**. This account already has Private AI shortcuts, and Windows Sandbox is absent; no shortcut/registry or installed-vault replacement was attempted. Clean interactive install, existing 2.1.x upgrade, uninstall/reinstall, Windows restart, tray acceptance, signed distribution and native companion connection remain blocked on a spare account/VM and administrator participation. The artifact evidence gate must therefore remain unsatisfied; no fake installer evidence was written.

### Local AI and resource observations

Small 1.7B, Medium 3B and High 4B catalog checksums passed. An initial real-runtime sequence generated responses with all three, then passed cancellation and browser-lane blocking. Extra High 8B is absent and was not downloaded. A final repeated sequence passed Small and Medium; High loaded but generation failed. A targeted repeat recorded an explicit `low-memory` stop. Resource protection worked and was not relaxed. High-tier dependable acceptance remains conditional/blocked on available RAM; this is not a universal hardware claim.

| Observation | Small | Medium | High |
| --- | --- | --- | --- |
| Initial load | 1,694 ms | 2,887 ms | 3,320 ms |
| Initial generation | 1,168 ms | 2,446 ms | 3,067 ms |
| Initial observed post-generation working set | 2,337,841,152 B | 3,945,832,448 B | 4,955,578,368 B |
| Final repeated load | 2,111 ms | 2,879 ms | 3,710 ms before failed generation |
| Final repeated generation | 1,313 ms | 3,264 ms | Not completed |
| CPU observation, all 12 logical CPUs | 10.3% over 3,450 ms | 17.1% over 5,658 ms | Not measured successfully |

CPU observations include measurement overhead. Generation is non-streaming; first-token latency was not measured. Sequential unload/load, cancellation, checksums and browser-lane rejection were exercised with real runtime/model bytes. Automatic tier selection, Local Only/Local First/Smart Hybrid/Cloud First policy, foreground priority and background pause/resume have source regression coverage; no live cloud request/fallback or end-to-end physical browser/model transition is claimed here.

Packaged renderer readiness measured 527 ms / 541 ms **after validation begins**, not total installer/cold-launch time. Loaded application aggregate working set was 953,944 / 955,108 KiB after a short settle period (~932 MiB); this is not a long-duration idle or memory-leak benchmark. Existing synthetic workflow benchmark after changes: 400 documents, 80 jobs, 1,500 actions; 9 samples; median **206.69 ms**, range 192.75–285.14 ms; 1,981 decryptions / 34,366,771 bytes. Baseline median was 220.43 ms with identical decryption volume. No performance optimization is claimed from that small timing variation. Long-duration memory retention, SQLite growth and larger libraries remain unmeasured.

### Clinical, voice, UI, security and deferred scope

PCC technical regression coverage includes report/mapping validation, version changes, schema drift, duplicate hashes/imports, source dates, feed health, provenance, accepted/rejected rows, rollback, retained evidence, persistent critical alerts and Demo isolation. No representative de-identified PCC reports were provided/validated. Clinical acceptance remains blocked; the import of falls, infections, weight, wounds, transfers or lab/vital records does not imply a validated surveillance rule for every domain.

No human microphone recording, speaker enrollment comparison or accuracy measurement occurred. Existing conservative recognition remains available. The local-embedding assessment and a guided held-out-speaker protocol are in `HUMAN_ACCEPTANCE_2026-09-29.md`; no new embedding runtime, offline transcription or continuous diarization was installed or claimed.

Twenty-one packaged navigation views were verified by active selection and expected heading. Four important screenshots were captured after waiting for rendered frames; Today, Operations, Settings and AI Processing screenshots were reviewed, and the full synthetic UI suite covers minimum sizing, chat, projects, schedules, settings, browser companion, Outlook permission simulation and keyboard/dialog basics. Full human keyboard/accessibility, long-content, Back/Forward and actual account workflows remain incomplete. Real Bitwarden autofill and native extension connectivity were not tested.

Historical exposed vault/database paths and three credential-shaped strings in an old test blob require owner review. Current tips are clean under the bounded scanner; history is not remediated. No published history rewrite, branch deletion, credential rotation, active key change, PHI access or legacy-record deletion occurred. See the human-action document for exact paths/commits, scan scope and approval boundaries.

Phase 11 is deliberately deferred: scheduled revision-pinned playbooks, deterministic formula definitions, OCR, semantic retrieval, whole-document synthesis and facility protocol approval are not implemented by this phase. Installer/clinical/speaker acceptance is not yet stable enough to justify those additions.

### Changed files and remaining release blockers

Changes cover the CI artifact retention step; release/repository scanners and ignore rules; mailparser lockfile; PDF worker setup; bounded Windows/inference validation scripts; medication import/rule/evidence wording; Today missing-data labels; numeric import validation; associated regression/UI tests; build metadata; and status/architecture/handoff/acceptance documentation. No unrelated application redesign or rewrite occurred. Use `git diff --name-only 1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a HEAD` for the exact final file inventory.

**Release readiness is not supported yet.** Remaining blockers: installer/upgrade/uninstall acceptance; protected real-data restore; representative PCC and independent clinical signoff; real speakers/microphones; real native companion/Bitwarden/provider accounts; historical exposure remediation; reviewed legacy-data disposition; High-tier RAM headroom; comprehensive UI/accessibility and long-running stability checks. Follow the exact **HUMAN ACTION REQUIRED** steps in `HUMAN_ACCEPTANCE_2026-09-29.md`. Review this branch before merging; do not distribute the unsigned validation installer as a production release.
