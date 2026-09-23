> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Requested release implementation tracker

## Official 3.0 build authorized

The user's latest instruction is "make 3.0". This supersedes the earlier hold on the official build. Release preparation is active. Do not treat unfinished healthcare-engine phases or earlier feature requests as implemented. Scope clarification and a safe clean-Windows installer validation environment have been requested while independent release preparation proceeds.

Added build/Test-CleanWindowsInstall.ps1 to execute a real installer on a clean Windows test account/VM, reject pre-existing Private AI installations/data, verify payload hashes, execute the installed app's validation mode, and record truthful evidence. The script has not yet been executed against a 3.0 installer; its existence is not installer-validation evidence.

Current candidate work: package and extension versions are 3.0.0, Windows executable resource metadata now updates while code signing remains disabled, and the complete implemented-feature guide has 28 topics. Added /diagnose and natural "troubleshoot Private AI" configuration checks without model/API calls or silent changes. Tests pass 229/229. Actual packaged Windows application run passed in Validation/application-3.0-candidate. The installer candidate exists in Validation/candidate but has NOT been executed. Model-inference validation is recorded separately. Healthcare scope and clean Windows test-environment questions remain pending. See RELEASE_CANDIDATE_STATUS.md; this is not a finished official release.

## Next major workstream — Healthcare Knowledge Engine

The user supplied a full 38-section Healthcare Knowledge Engine specification. Preserve it as the next major upgrade scope, integrated into the existing app. Full requirements: [HEALTHCARE_KNOWLEDGE_REQUIREMENTS.txt](HEALTHCARE_KNOWLEDGE_REQUIREMENTS.txt). Architecture mapping, implementation phases, and acceptance gates: [HEALTHCARE_KNOWLEDGE_PLAN.md](HEALTHCARE_KNOWLEDGE_PLAN.md).

Use RAG over curated references with the existing reasoning models, not retraining to memorize changing healthcare information. Include clinical and medication knowledge as first-class domains, reference/PHI classification and scope isolation, version-aware authoritative retrieval, passage-level citations, facility/project knowledge, approved source updates, and healthcare review agents. Preserve all existing app capabilities, privacy controls, local/cloud modes, resource safeguards, and user preferences.

This planning addition does not mean the engine is implemented or populated. All four requested phases remain pending. It also does not authorize the official 3.0 build: continue waiting for the user's explicit build request. Include the complete engine documentation and troubleshooting behavior in the updated user guide when implemented.

## Current release decision — wait for explicit 3.0 build request

The user is adding more features for the next major upgrade. Do not start or deliver the official 3.0 build until the user explicitly says to make 3.0. This supersedes earlier release deadlines and instructions to finish packaging immediately. Continue recording and implementing features as requested; development checkpoints are not official releases.

When the user authorizes the next official build, complete this release checklist:

- Review the accumulated feature list and clearly identify completed, deferred, and externally blocked items.
- Set the official version to 3.0.0, refresh browser packages and the Last updated metadata, and freeze the release source.
- Produce a Windows installer suitable for a new PC and a portable package, with all required runtime dependencies.
- Produce the complete source-code archive and refreshed cumulative ChatGPT Work handoff.
- Consolidate a new user guide covering all shipped updates, fresh-PC installation, upgrades, setup, browser companions, WhatsApp permissions and remote use, troubleshooting, and known limitations.
- Execute the final Windows application and installer in a safe test environment, including fresh-PC installation and actual local-model inference. Tie evidence to the exact final artifacts; do not substitute synthetic tests or an earlier candidate's results.
- Validate shipped WhatsApp and browser integrations, document any remaining unverified behavior, run appropriate regression/UI checks, and provide checksums and release notes.
- Revisit signing and update hosting if provisioned by then; never describe an unsigned build as signed.

No new installer or complete 3.0 user guide is being produced as part of this planning update. Mobile implementation remains deferred; its future layout stays in the plans.

### Additional requested feature: user guide and AI troubleshooting

- The official build must include an updated user guide covering every shipped change, both inside the app and as a separately usable guide in the release package. This is an explicit required deliverable, not just release notes or developer documentation.
- When a user asks for help, the AI should explain how to use the app and help diagnose problems using the current guide, known limitations, and relevant available app diagnostics. Cover setup, installation, local models, API/provider errors, browser companions, WhatsApp connection/permissions, jobs, and file handling.
- Give clear troubleshooting steps, distinguish verified findings from possible causes, and explain when an issue requires user action or support. Do not claim to have inspected a device, connection, log, or setting without actually accessing it.
- Keep basic guide lookup and common troubleshooting available without a working model or API connection. Use AI for further explanation when available. Diagnostic access must follow existing permissions and avoid exposing credentials or unrelated private content.
- Validate help against the shipped version and representative failures before the official build. This is a requested expansion of existing offline help and diagnostics, not a claim that full AI troubleshooting is already implemented.

User requested the following after WhatsApp work began. Continue the full scope; do not treat table items as completed merely because a module or setting exists.

## Completed source batch: WhatsApp permissions and account reading
- Earlier single/group permissions, unattended reply exception, direct-chat IDs, UI and tests.
- New read-all default-on setting independent of selected writes; disable-all-writing override.
- Account-wide event connector, encrypted observations, bounded task queue, UI reader and dependency lock.
- 45 focused tests passing; styled UI test to rerun after current changes.
- No actual account messages have been sent or live pairing tested.

## Outstanding requested scope
1. Actual Windows application and installer execution, isolated test data; truthful evidence.
2. Actual local-model inference using Windows engine and a real model.
3. Autonomous tool-using Research / Website / Excel agents and cited multi-step research.
4. Scheduler: once, weekly, monthly, custom, conditional watcher, Duplicate.
5. AI-guided browser actions respecting approval and domain/tool boundaries.
6. Python/pandas/openpyxl data-analysis runtime and UI.
7. Scanned PDF OCR and legacy .xls.
8. File-library FTS5, semantic/optional embedding search; persistent project knowledge.
9. Outlook send/invitations/shared mailbox selection/watcher; New Outlook connection requires suitable API authentication.
10. WhatsApp attachments and continuous progress notices; native Windows outgoing support is separate from account Web sending.
11. Global custom instructions; archive chats; optional alternate provider; basic image generation.
12. Mobile implementation deferred by user. Future responsive companion layout is documented in MOBILE_FUTURE_PLAN.md; WhatsApp is the primary remote interface.
13. Signing and automatic updater. User has NO signing certificate/service or release host. Configuration can be implemented; signed artifacts, public updates, and reputation require external provisioning.
14. Credential Manager first, DPAPI fallback migration.
15. Export cumulative handoff for ChatGPT Work, with changed files, patch, instructions and validation limits.

## User answers
- Signing certificate/service and release host: none.
- Images/provider: unsure; basic imaging needed. Default OpenAI images, alternate provider optional/off.
- Mobile: skip implementation; preserve future layout in overall plans and handoff.

## Environment
Source: C:/Users/Yfriedman/Documents/AI Assistant/PrivateAI-2.1.7-Source/PrivateAI-2.1.7-Source
Original ZIP: C:/Users/Yfriedman/Documents/AI Assistant/PrivateAI-2.1.7-Source.zip
Node packages: C:/Users/Yfriedman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules
Set NODE_PATH to bundled node_modules for current tests; node --test --test-isolation=none avoids sandbox child-process errors. Headless Edge tests need execution escalation. No subagents authorized.

npm lock updated using bundled pnpm --package=npm@11.6.0 dlx npm install --package-lock-only --ignore-scripts --no-audit --no-fund (network escalation succeeded).
Existing report-export integration failed FILE under sandbox earlier; investigate before full release. Original release scripts hard-code obsolete counts and preserve old dependencies. Must not fabricate validation flags or remove gates to force packaging.

## Pause checkpoint - resume September 16, 2026 at 02:15 America/New_York
User explicitly requested pause until credits reset at 2:15 AM. No build/test processes remain running.

Most recent priority: actual Windows validation MUST gate release. Do not merely emit false flags and call a release finished. Tie evidence to artifact hashes.

Completed since tracker creation:
- New WhatsApp account reader and independent settings: 45 focused tests passed.
- Styled headless Edge UI and synthetic DOM send test passed after correcting the readAll control label. Screenshot Validation/messaging-permissions.png.
- Updated source/app-guide.json WhatsApp topic and regenerated docs via build/generate-guides.cjs.
- npm dependency install completed (540 packages), lifecycle scripts disabled. Root package.json + package-lock.json include whatsapp-web.js 1.34.7.
- Full Windows synthetic suite ran with execution escalation: 216 tests, 214 passed, 2 failed ONLY because symlink creation requires Windows privilege. Evidence Validation/current-tests.tap. Earlier export-worker failures disappear with child-process execution allowed. Fix symlink fixtures using Windows directory junctions to meaningfully test escape protection, then rerun affected checks and full release suite as appropriate.
- ACTUAL Windows inference PASSED with the existing Qwen_Qwen3-1.7B-Q4_K_M.gguf: two synthetic source questions yielded 12 and 124. Evidence Validation/windows-inference.json, runtime and model SHA256 included. build/validate-windows-inference.cjs executes real LocalBrain Windows engine; no cloud call. This is not yet inference through the final packaged candidate.
- Original 2.1.7 portable ZIP extracted (safe member paths) to Validation/windows-baseline, 782MB. Contains full repaired runtime/helpers. Source ZIP/installed app untouched.
- Created source/windows-validation.cjs and integrated main.cjs --release-validation=ABSOLUTE/application-evidence.json. Uses isolated app-data sibling, hidden window, real DPAPI/SQLite, renderer IPC calculation, messaging UI and connector dependency resolution; writes truthful evidence and screenshot then quits. NOT YET EXECUTED; review and test this integration. Avoid modifying current real user data.
- build/create-windows-candidate.cjs copies baseline Electron runtime to Validation/electron-runtime (PrivateAI.exe copied as electron.exe) and invokes electron-builder dir using current dependency tree and original helper/local runtime. Two attempts FAIL with NpmNodeModulesCollector 'No JSON content found in output'. Candidate is incomplete, not runnable/releasable. Diagnose npm list command invocation/PATH (the environment lacks normal npm.cmd). Do not claim a build succeeded based on process exit: electron-builder background error surprisingly yielded exit code 0 despite logged error.
- npm executable exists at C:/Users/Yfriedman/AppData/Local/pnpm/store/v11/links/@/npm/11.6.0/d53b287ebb9364890cbbbbe9d945df23f4c3100a44d2d755301da414fe2aee36/node_modules/npm/bin/npm-cli.js and npm.cmd. Prefixing this bin in PATH did NOT fix collector. Inspect installed node_modules/app-builder-lib/out/node-module-collector files; may need npm_execpath or run npm directly and full dependency collection fix. Do not weaken dependency validation.
- WindowsSandbox.exe is absent. Asked user via async whether disposable Windows VM/test PC available; no answer yet. Actual installer execution isolated from existing installation remains blocked pending safe environment; implementing an automated acceptance harness/release gate is still useful. Do not silently overwrite app registration/shortcuts to test the installer on their current installation.

Pending async user questions: mobile companion browser vs native Android; disposable Windows VM/test PC. Answered: NO signing cert/service or release host. Basic imaging needed, provider unsure (use OpenAI images default if implementing; alternate configurable optional/off).

Next actions:
1. Diagnose isolated candidate packaging failure; run exact candidate with --release-validation and inspect evidence.
2. Add actual Windows application/installer/inference evidence gates in final release scripts (not yet written).
3. Export cumulative WhatsApp handoff ZIP BEFORE or alongside broader changes. NOT YET CREATED. Include files, base hashes/unified patch against original 2.1.7 source ZIP, safe apply script, simple ChatGPT Work prompt, dependency/packaging notes and actual validation limits. Do not include node_modules, Validation/windows-baseline, candidate runtime, models, profiles or personal data.
4. Continue user table scope in outstanding list. No scheduler/agent/analysis/OCR/mobile/provider etc implementations yet; inspections only. Preserve full scope and do not mark stubs complete.

Encoding gotcha: Windows Python defaults cp1252. ALWAYS use encoding='utf-8' in read_text/write_text for source/docs. One invalid UTF8 source/ui/messaging.mjs was repaired; all other checked files were valid. Never silently replace Unicode text with mojibake.

Runtime/tool locations:
Node: C:/Users/Yfriedman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
Python: C:/Users/Yfriedman/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
pnpm: C:/Users/Yfriedman/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd
Models: C:/Users/Yfriedman/AppData/Local/PrivateAIModels (Qwen1.7B, Qwen4B, Llama3.2 3B).

## Updated user release instruction (while paused)
At 02:15 AM Eastern resume, try to implement the entire feature table before the next five-hour window ends (target 07:15 AM Eastern). Reserve time for packaging and validation. Deliver a new release named Private AI 3.0 (package version 3.0.0), Windows installer, complete source code, updated installation/upgrade/use instructions, and preserve prior portable + ChatGPT Work handoff scope. Do not trade actual validation for a time deadline; report any unfinished or externally blocked items accurately.
User suggested same information could serve mobile and desktop, perhaps with an opening prompt. Practical interpretation communicated: browser-based responsive mobile companion sharing information; Windows installer cannot run on Android. No need for redundant mode prompt when responsive layout suffices. Implement authentication/access boundaries before remote access.
Resume automation updated in this task; remain paused until scheduled time unless user explicitly asks to start earlier.

## Resumed work: September 16, after 02:15 Eastern

This section supersedes the packaging and source-status statements in the historical pause checkpoint above.

- Fixed npm dependency collector invocation with a generated local npm wrapper; the Windows candidate packages successfully with the new WhatsApp dependency.
- Actual packaged Windows application executed successfully in isolated app data. Evidence: Validation/application-run-2/application-evidence.json. It exercised renderer/preload IPC, DPAPI/SQLite, calculation, Messaging controls, and packaged connector resolution. This evidence belongs to that candidate's exact EXE/ASAR hashes, not to subsequent source edits or a final 3.0 build.
- Actual local-model inference passed as described above. Final packaged application inference must still be checked.
- Installer execution is still unverified. Windows Sandbox is absent; an existing Private AI installation must not be overwritten just to test a candidate. An isolated Windows test environment is needed.
- Scheduler source supports one-time, weekly, monthly, interval, and file-change watcher schedules plus Duplicate. Date validation tests pass; complete UI and scheduling integration checks remain.
- Global custom instructions and archive/restore chat controls have been added in source; complete integration validation remains.
- Windows path-escape fixtures now use directory junctions. The affected access/file-worker/scheduler suite passed 26/26.
- WhatsApp sessions now preserve follow-up context per conversation AND sender. `/new` starts fresh; deleted or archived sessions get a new chat. New configurations include response text by default, while existing saved preferences are preserved. Long replies are split, and optional minute-by-minute progress notices recheck write policy. The targeted messaging suite passes 37/37, using synthetic messages only. No live WhatsApp pairing/sending claim is made.
- MOBILE_FUTURE_PLAN.md records the user's final mobile scope and proposed layout. No mobile feature is implemented or exposed.
- Current complete source suite: 222 tests passed, zero failures or skips (Validation/current-tests.tap). Updated headless Edge Messaging controls and synthetic DOM delivery check passed. This does not establish live WhatsApp delivery or final packaged acceptance.
- Cumulative Work handoff is now created: PrivateAI-3.0-Work-Handoff-Checkpoint.zip at the outer workspace root. It contains changed files, preimage/postimage SHA256 manifest, cumulative patch, START_HERE prompt, and a checked apply script. Applying to original source, rechecking already-applied files, and refusing conflicting edits were exercised. It is explicitly a source checkpoint, not a completed 3.0 release. Regenerate after subsequent changes with build/export-work-handoff.py.

All other outstanding items remain open until implemented and verified. Source work must not be labeled a finished 3.0 release before packaging and actual Windows acceptance evidence exist.

## Follow-up: sidebar update date and browser compatibility

- Added Last updated at the bottom of the sidebar, backed by source/build-info.json. Browser asset preparation and the beforePack hook update it only when source content changes. The navigation area scrolls independently so the footer remains accessible in shorter windows.
- Shared extension logic now uses Firefox's browser API or Chromium's chrome API. Added generated Firefox sidebar package under chrome_extension/firefox, exact Firefox native-host identity checks, and per-user Firefox/Edge host registration plus disconnect/uninstall cleanup. Chrome's public key and stable extension ID are preserved.
- Browser setup instructions are in the app and docs/BROWSER_COMPANION.md. Chrome and Edge use the Chromium folder. Brave is an unverified compatibility candidate, not a tested browser. No Safari or mobile port was attempted to keep this change small.
- Firefox isn't installed in this environment. Its API/manifest behavior is tested synthetically, but live Firefox native messaging is unverified. Permanent Firefox distribution requires Mozilla signing; temporary developer installation is documented.
- Complete regression suite: 226/226 passed. Desktop/companion UI harness passed 25 checks in Windows Edge after fixing Linux-only launch flags; the footer also passed on-screen bounds checks at 650px and 850px window heights after the layout fix. No real browser accounts, registry registrations, or installed app were changed for these tests.
- Standalone extension checkpoint ZIP and refreshed cumulative Work handoff are provided. These source changes still require rebuilding the desktop app before Firefox setup can work; they do not alter the installed 2.1.7 executable.

## Latest scope change: mobile deferred; WhatsApp primary
User explicitly says skip mobile for now, but include its layout in overall plans. This SUPERSEDES earlier mobile implementation scope and the pending browser/native question. Do not implement or expose a mobile service in 3.0. Include future responsive mobile companion layout/design in roadmap and ChatGPT Work handoff only.
WhatsApp is the primary remote communication interface for jobs, tasks, status/results, and regular AI inquiries. Prioritize reliable unattended two-way replies in verified selected conversations alongside independent read-all on/off and disable-all-writing override. Remain paused until scheduled 02:15 resume.

