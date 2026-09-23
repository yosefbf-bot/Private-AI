> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 2.1.1 — Hybrid upgrade evaluation

This is an in-place upgrade of 2.0.1. It retains the Windows startup fix, encrypted database, Windows-protected key, 90-day default retention, report folder, manual Chrome capture, and existing OpenAI connection. No data reset is required.

## Upgrade and start

1. Close Private AI, including its tray icon. Extract the installer ZIP and run `Installer/PrivateAI-Setup-2.1.1-x64.exe` using the same Windows account and installation folder. Do not uninstall or delete `%LOCALAPPDATA%\PrivateAI2`.
2. Open **AI Processing**. Smart Hybrid is the default. Select Local Only if you want every OpenAI call blocked. Existing API keys/settings remain saved.
3. The CPU inference runtime is bundled. Download **Qwen3-4B Q4_K_M** with the app's button (about 2.50 GB), or select a compatible GGUF model you already have. Downloading is optional. The pinned default model's checksum is verified. Its Apache-2.0 license and publisher are linked below.
4. Model files downloaded by the app live in `%LOCALAPPDATA%\PrivateAIModels`, outside normal program updates. They contain public model weights, not chat history. Models load on demand and unload after five idle minutes. Balanced mode limits CPU use. RAM pressure unloads the model; only one local inference request runs at a time.
5. In **Worker**, enable background jobs and optional start-at-sign-in if wanted. Windows must remain signed in and awake. Closing the app window keeps an enabled Worker or messaging bridge running; Quit stops it. A system restart requires Windows sign-in again.
6. Run **Settings → Run local checks**, then try `/calc (120 + 30) * 4`. Test real work only after the Windows checks and your organization's review.

The portable download is an alternative, not another user account. Extract it to a separate local folder and run `Portable/PrivateAI.exe`. Both forms use the same account's existing encrypted data; run one at a time.

## What works locally

- `/calc 120 * 4` — arithmetic with no LLM or API call.
- `/extract` — return the text of attached documents without inference.
- `/unread` or “Check today's unread emails” — list up to 50 unread classic Outlook messages after granting access in Apps.
- `/calendar today` or `/calendar tomorrow` — retrieve a date's classic Outlook appointments after permission is granted. Appointments are sorted and timed overlaps are flagged. Meetings are not moved automatically.
- `/status` — Worker/model status, without an API call.
- `/report NAME` — run an explicitly configured browser report workflow and save the download to your approved work folder.
- Ordinary questions/documents use your selected processing mode. The local model can summarize and explain short text. Images, overly large context, freshness-sensitive requests, and high-stakes reasoning may require cloud processing. In Local Only, unsupported tasks stop or receive an explicitly unverified local draft; no cloud request is made.

The local model does not receive arbitrary shell/computer-control tools. Commands embedded in documents and pages are not executed. Existing Apps and folder permissions continue to control access.

## Reliability and API usage

Scores are **validation heuristics, not probabilities or guaranteed accuracy**. Local answers are checked for source quotations, matching numerical tokens, missing context, and available tool results. This does not independently prove that every interpretation is correct. Cloud answers are labeled as requiring review rather than assigned an invented accuracy score.

API Usage shows measured local tasks, cloud attempts, provider token counts, and daily/weekly/monthly totals within retained history. Configure your exact model's input, cached-input, and output rates to get token-cost estimates. Unknown prices and failed requests with unknown usage remain explicitly unknown. Tool/search charges are excluded. Local-model tokens are not OpenAI tokens. Dollar savings and counterfactual API calls avoided are not fabricated.

The existing bounded document/context preparation remains in use. This is not a full retrieval/indexing system for arbitrary hundreds-of-page files; excessive inputs are rejected rather than silently truncated.

## Browser report workflows

Browser reports use a separate local Edge profile. You sign in yourself. No account credentials are embedded in a workflow. Add an HTTPS report URL, a precise download-button selector, and any reviewed fill/click/wait steps. Additional trusted origins may be needed for your site's sign-in flow. The workflow stops if a selector is ambiguous, navigation leaves those origins, or the expected download does not appear. Setup depends on the reporting website; no facility-specific workflow has been validated here.

Only document formats are saved, under the selected report folder. A report-browser task unloads the local model; inference does not run alongside that heavy workflow. The Chrome Companion remains manual and is not used to scan ordinary pages automatically.

## WhatsApp setup and limits

Messaging is optional and starts disabled. It is experimental because WhatsApp's interface can change.

1. In Messaging, open WhatsApp Web, sign in yourself, and select your dedicated group. This uses a separate local Edge window/profile. Keep it open.
2. Send a harmless message from your phone. Verify the open group and choose the stable sender ID belonging to your trusted account. Display names are not used for authorization.
3. Review the privacy warning and select the permissions you want. Copy the displayed command example, which includes the prefix, this PC's command code, and `/status`.
4. Enable the bridge, wait a few seconds for its initial baseline, and send a **new** command. Existing messages are ignored. Each PC has its own command code.
5. Response text is off by default; enable it if approved. Documents stay in the report/ShareSync folder. Attachment sending is not implemented/enabled in this release. Task chats remain encrypted in Private AI and follow retention.
6. Background access while the app is locked requires its separate checkbox. This permits only the bridge's approved tasks; it does not unlock the desktop interface. Disable the bridge to stop new remote work. An action already underway may have completed.

**Windows-app limitation:** native intake is capability-gated. It works only when the selected WhatsApp process exposes stable group/message identifiers through Windows accessibility. If those identifiers are unavailable, the app refuses to infer identity from displayed names; use Web intake. Automatic replies currently use the separately connected Web fallback. Desktop-only automatic sending is not implemented.

Before sending a reply, the Web adapter verifies the group identity/header. If delivery cannot be confirmed, the bridge disables itself and does not retry. On-PC pairing and actual WhatsApp delivery have not been tested here. Treat a failed/uncertain status as a reason to inspect the group before repeating a command.

Optional forwarding of desktop results applies when the Private AI window is not focused. Use the global setting or the per-task choice below the chat box. The bridge and response-text permission still apply. Started, completion, and failure notices are configurable. Continuous progress updates are not implemented.

## Privacy boundary

OpenAI traffic uses HTTPS. Local inference uses an authenticated random loopback port bound to `127.0.0.1`; it is not exposed to the LAN and does not use TLS. The Chrome native connection remains the existing protected local connection. Multiple PCs maintain separate keys, ports, and databases.

No API keys, WhatsApp profiles/cookies, or live databases go into ShareSync. Normal diagnostics exclude message bodies. Encrypted app records, usage records, and outbound-message records follow local retention. WhatsApp and ShareSync have their own retention/version policies; app cleanup cannot remove every external copy. Keeping WhatsApp open consumes additional RAM, and the model checks available memory before loading.

Installing this application, encryption, or disappearing messages does not establish HIPAA suitability. Your organization's approvals and provider/channel requirements still apply.

## Evidence and remaining acceptance work

- The earlier 2.0.1 startup and key-preservation tests remain in the regression suite.
- Real Qwen3-4B Q4_K_M CPU inference was run successfully on Linux with zero OpenAI calls; this is not a speed benchmark for your laptop.
- Mode enforcement, memory refusal/unload, usage separation, privacy checks, deduplication, group changes, and uncertain-delivery behavior have synthetic regression tests.
- UI checks run in Chromium with synthetic data/IPC. No live mailbox, WhatsApp account, facility website, or ShareSync service was accessed.
- Actual Windows installation/startup, Windows runtime loading, classic Outlook, live WhatsApp pairing/replies, your browser report recipes, and all-day operation remain on-PC acceptance checks.

The full proposed plan is therefore **not completely accepted/validated**. This build implements the main hybrid path and controlled adapters, with the specific limits above. It is an unsigned evaluation build, not a production certification.

Sources: [Qwen3-4B GGUF publisher](https://huggingface.co/Qwen/Qwen3-4B-GGUF), [pinned llama.cpp runtime b10809](https://github.com/ggml-org/llama.cpp/releases/tag/b10809), [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/b10809/tools/server/README.md).

