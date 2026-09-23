> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Private AI 2.1.4 — primary-PC upgrade

Built on the confirmed 2.1.3 source, version 4. This is an application-code upgrade, not a replacement local engine. Electron, desktop helper, dependencies, and the no-admin Windows local-model runtime are preserved from the 2.1.3 portable release.

## Upgrade an existing 2.1.3 installation

1. Finish or stop current tasks. Quit Private AI from its tray icon, not just its window.
2. Extract `PrivateAI-2.1.4-Upgrade.zip` into a new folder.
3. Run `APPLY_UPGRADE.cmd`. Choose the existing `PrivateAI.exe` in your installed or portable application folder. Do not choose a shortcut or the setup EXE.
4. The updater checks the exact 2.1.3 application archive, verifies the new archive, and replaces only `resources/app.asar`. It leaves a code-only `app.asar.2.1.3.backup` beside it. It refuses an unexpected base or a running app; it does not kill processes, request administrator access, or change PowerShell policy.
5. Start Private AI using your usual shortcut. You should see **Pause background work** at the top. Existing settings remain unchanged; enable jobs in Worker settings if needed.

If organization policy blocks the script, do not weaken security settings. Your IT team can perform the same checked archive replacement. Alternatively, extract the full 2.1.4 Portable ZIP into a new folder, quit the old app, and run its `Portable/PrivateAI.exe` under the same Windows user. Never run both copies at once. This delivery has no newly rebuilt setup EXE; the existing installer remains 2.1.3.

No model redownload or data migration is introduced. Chats, keys, permissions, model downloads, private data location, ShareSync output settings, manual Chrome capture, and retention settings are not replaced. Do not install program files inside the private-data folder. Existing configured autostart/shortcuts continue to point to their old location unless you update that location in place.

Rollback: quit Private AI, keep a copy of the 2.1.4 archive, then have IT replace `resources/app.asar` with the saved 2.1.3 archive. Do not remove chats or model folders. A portable-only upgrade can be rolled back by reopening the retained 2.1.3 folder after quitting the new copy.

## What changes

- Foreground chat has priority before the next background extraction, model/API call, or export. An already-running call or file write finishes safely; it is not forcibly preempted. Responses are not regenerated just to change priority.
- One background task across local jobs, schedules, ShareSync jobs, and messaging-triggered reasoning. AI calls are serialized; one report/WhatsApp browser session is reserved at a time.
- The top-level pause control pauses background work at its next safe boundary. Running, Waiting, Paused, and Failed states include reasons. Stop also cancels a waiting local task.
- Low RAM pauses background phases with available/required estimates. General phases reserve 1 GiB; new browser phases require 1.5 GiB available after the model exits. Local loading retains the 2.1.3 weight/context memory estimate. These are estimates, not a guarantee against Windows paging or changing RAM pressure.
- The model is released before a new browser session. The app waits for process exit and refuses to interrupt a loading/busy engine for browser startup. It reloads only when a later local reasoning request needs it. Close the report or WhatsApp browser window to make local reasoning available again. Cloud requests can still run with a browser open if existing policy allows them.
- Browser launches/actions, WhatsApp Web sending, Outlook session access, and desktop draft writes/opening apps have a preflight warning. Known components are named; desktop input is explicitly described as potentially affecting whichever app is in focus. Separate browser profiles are not claimed to isolate focus.
- Choose Defer safely, Run now, or Cancel. Approval is per manual invocation, not permanent permission. Unattended or locked invocations are blocked before these effects; the app never brings itself forward merely to request approval. Run blocked report workflows from Browser reports when you can approve them. A deferred/failed job is not silently retried.
- This stricter safety gate also defers unattended WhatsApp replies and Outlook/report workflows. Incoming polling remains local and retains existing permissions, but this is not a hands-free desktop agent. Deferred WhatsApp output remains in the local outbox record under existing retention; there is no automatic resend. Original document outputs remain in the configured work folder.
- Scheduling, polling, calculations, and known deterministic commands use local code. No added model calls for scheduling, resource decisions, or interruption warnings. No network/model inference calls were needed to implement or test this release.

## Validation and limits

145 automated tests passed on Linux, including the original security/retention, manual Chrome reading, local-only policy, files, worker, messaging, model-startup tests and 17 new coordination/integration tests. Mocked Windows/browser boundaries confirm that denied actions do not reach launch/helper/send operations. Actual TXT/DOCX/XLSX/PDF processing tests passed. 34 source modules passed syntax checks. Packaged archive content and unchanged dependency/runtime bytes are checked during packaging.

Windows execution, the PowerShell updater, real Windows focus behavior, actual ShareSync service behavior, and local-model inference on this PC remain unverified. Earlier 2.1.3 validation files are historical, not new 2.1.4 Windows results. No claim of HIPAA certification or unlimited autonomous desktop control is made. Review and test on your approved PC before using with sensitive work.

