# Private AI 3.0.4-dev — User guide

Current source guide, updated October 14, 2026. Use with matching builds. Source changes do not update installed applications or establish physical-phone acceptance.

## Start here

**Where:** New chat; Dashboard, Notes, Meetings, Library

1. Start a New chat to ask questions, review documents or prepare a draft. Dashboard is the single overview of recorded follow-ups and alerts.
2. Use Notes for a quick observation, Meetings for notes or local recording, and Library for projects, documents and facility policies. More contains optional automation, connections and clinical tools.
3. Choose Settings → Local models & processing to configure local AI. Choose a work folder in Settings. More → User guide and /help work without a model or API key.

**Keep in mind:** Standalone executive dashboards were removed from routine navigation; existing records and analysis engines are preserved. Source changes do not update an installed application automatically.

## Clinical analytics with optional PointClickCare

**Where:** More → Clinical imports; Settings → Integrations → PointClickCare; Dashboard

1. Clinical rules, nursing-home references, projects and document analysis work without PCC or an API key. Configure a local model in AI Processing for AI reasoning.
2. Use Clinical imports for reviewed CSV/JSON reports from any supported source. Generic and PCC reports use the same normalized clinical engine and source-evidence review workflow.
3. Enable PointClickCare manual imports in Settings → Integrations only when needed. Disabling it hides PCC panels and blocks PCC import/sync; it preserves data and general clinical findings.
4. Unknown, stale and incomplete data are not confirmed negative findings. Review original records and clinical findings before acting.

**Keep in mind:** Live PCC synchronization is not included. Existing legacy PCC imports preserve manual mode; explicit disabled settings remain disabled. Built-in reference/template replies are labeled and are not model inference.

## Pair the Android companion

**Where:** Android main screens → connection badge; Desktop Settings → Companion

1. On the PC, open Settings → Android Companion Gateway. Enable HTTPS on the actual approved private LAN/VPN interface and save. The PC must be awake and reachable; no firewall, hotspot or VPN changes are made automatically.
2. Choose Pair a phone with QR. Name the phone, grant only the access you need, and explicitly choose any shared PC conversations. Optional workflow and notification scopes remain off until selected.
3. On the unlocked Android app, open Settings → Desktop connection → Scan desktop QR, or paste the private invitation. Camera permission is requested only when you choose Scan. The invitation expires after three minutes and can be used once.
4. Wait for Connected after the phone verifies the certificate and completes a real authenticated status request. A scanned code alone is not a connection. If a response is lost after a device was created, inspect Paired phones on the PC, revoke the incomplete device, and create a new invitation.
5. Older companion versions can use the legacy manual link in Older companion app / manual setup on the PC. Its device credential remains reusable until revoked; keep it private.
6. Physical camera, microphone, background notifications and LAN/VPN behavior require device acceptance. Five-minute phone sessions preserve the existing encryption key. Longer periods and Off while active remain unavailable until a reviewed key migration is authorized.

**Keep in mind:** Closing, locking or reconfiguring invalidates unused QR invitations without deleting established pairings. Full phone access is denied while the desktop is locked; separately authorized generic notification-only access keeps its existing boundaries. Never put pairing links in websites, messages, logs or GitHub.

## Capture notes, rounds, reminders and drafts

**Where:** Notes; Dashboard

1. Write a simple note and choose Save note. The PC preserves the source and creates review follow-ups; Details is optional for a confirmed owner, deadline, location or email/WhatsApp draft.
2. A configured local model can prepare an additional draft summary and suggested plan while the app is unlocked and background work is enabled. This never calls a cloud provider or sends correspondence. Without a local model, source notes and text-based review suggestions still work.
3. Review assignments and confirm deadlines in Dashboard. Add a completion note before closing a follow-up. Source clinical alerts require their own evidence review.
4. Use Outlook → Read a message → Track a reply / follow-up to preserve correspondence as a note and prepare an internal draft. In an approved WhatsApp conversation, use note:, rounding:, remind me to, or /note, /round, /remind and /draft.

**Keep in mind:** Model drafts and text extraction need review. Ambiguous deadlines/owners remain unknown; undated items are follow-ups, not timed notifications. Images remain evidence for review, not an implemented image interpretation.

## Chat, edit and save a response

**Where:** New chat

1. Choose New chat (Ctrl+K), type a message, and press Enter to send. Shift+Enter adds a new line. Stop cancels an active response.
2. Use Edit under your message to change it. Sending the edit replaces the later conversation branch. Regenerate retries the last question and may use your configured model or API.
3. Use Copy or Save as… below the answer. DOCX, PDF, XLSX, CSV, MD and TXT exports go to your chosen work folder.
4. Assistant answers appear in a light-grey box. Model-routing and verification notices appear below as compact footnotes; they still matter when reviewing the answer.

**Keep in mind:** The saved response can include verification notices. A local evidence score is a heuristic, not a measured accuracy percentage.

## Choose and download a local brain

**Where:** Settings → Local models & processing

1. Open AI Processing → Local brain tiers. Small is Qwen3 1.7B Q4_K_M; Medium is Llama 3.2 3B Q4_K_M; High is Qwen3 4B Q4_K_M; Extra High is Qwen3 8B Q4_K_M.
2. Use Download model for a missing tier, or Locate existing file to reuse a compatible GGUF already on disk. Existing downloads are verified and reused.
3. Choose a local tier and automatic tier cap, then Save processing settings. Load selected / starting model loads it explicitly; normal reasoning loads a model when needed.
4. Extra High is optional and needs considerably more available RAM. Only one model is loaded at a time.

**Keep in mind:** A larger model is not guaranteed to be correct. Downloads require internet, but ordinary local inference does not. Missing models are never downloaded automatically.

## Automatic tier selection

**Where:** Settings → Local models & processing

1. In AI Processing, choose Automatic for the local tier and choose the highest allowed automatic tier. Save processing settings.
2. With Small installed, the app uses it for a short assessment and may switch to an available larger tier. It checks available RAM and stops the previous engine before loading another.
3. When the configured context does not fit available RAM, Automatic may use 2048 context tokens if all supplied input and instructions fit. The saved context setting, RAM reserve and observed memory protection stay intact; a response footnote discloses the adjustment.
4. When a larger tier is unavailable, capped or cannot fit, the answer may remain a smaller-model draft with a visible footnote.
5. Health & recovery → Keep loaded brain for follow-ups controls optional reuse. Zero keeps the default Small-first behavior.

**Keep in mind:** The selection is a heuristic. It does not guarantee the best tier, and allowing a higher cap does not install that model.

## Reduce RAM use and model loading problems

**Where:** Settings → Local models & processing; Health & recovery

1. Open AI Processing and choose Unload now before changing to a smaller model or context.
2. Try Small or Medium, Local context tokens 2048, and Maximum local answer tokens 512. Save processing settings, then Load selected / starting model.
3. Close unused heavy programs and browser sessions. Balanced reduces CPU demand; a smaller brain and context reduce model RAM demand.
4. Health & recovery shows available RAM, the active model and waiting reasons. Keep free RAM and RAM recovery delay control resource checks.

**Keep in mind:** Do not reduce the RAM reserve just to force an oversized model to load. Work may wait or pause until enough RAM returns. The engine can stop when RAM becomes critically low.

## Local Only, Local First and cloud modes

**Where:** Settings → Local models & processing

1. Open AI Processing → Processing mode. Local Only blocks cloud providers; configured GGUF and loopback Ollama models remain available.
2. Local First and Smart Hybrid may escalate only to a configured, permitted provider. Cloud First uses local text when cloud is unconfigured or fails before producing output; it never bypasses privacy/authentication refusal.
3. Ordinary local commands and built-in guide answers use local code, without a model or API key.
4. Use Save processing settings after changing the mode. The provider information beneath a response shows how that response was produced.

**Keep in mind:** No model/key is required for saved data, clinical rules, references or deterministic tools. Model reasoning needs a configured local model or optional provider. Missing records remain unknown. Local drafts require review; image/web capability and RAM limits still apply.

## Configure an optional AI provider

**Where:** Settings; Local models & processing; Usage

1. Open Settings to select an optional provider and save its key/model. OpenAI, other allowed cloud providers and local Ollama remain separate configurations.
2. Complete the privacy approval shown by the app before using cloud requests in HIPAA mode.
3. Choose a processing mode that permits cloud use only when desired. HIPAA cloud approval remains bound to the approved OpenAI configuration; other cloud providers remain blocked in HIPAA mode.
4. API Usage shows recorded usage. Configure price inputs for estimates; an unknown price is not a promise that a request is free.

**Keep in mind:** ChatGPT subscriptions do not supply an API key to this app. API billing is separate. Guide answers use no API credits, and no key belongs in a prompt or shared work folder.

## Attach and ask about documents

**Where:** Library; chat attachment button

1. Use the + attachment button in chat, or Files → Import files. From Files, choose Ask about this file to begin a related chat.
2. Ask a specific question and identify the documents to compare. The current build supports text PDFs, DOCX, XLSX, CSV, TXT, EML, MSG and images.
3. Use /extract to return attached extracted text without a model. Check extraction before relying on a complex table or document.
4. Use Save as… to create a report in your approved work folder.

**Keep in mind:** Image understanding depends on the selected provider/model; the bundled text brains cannot inspect image pixels. Scanned PDFs may need OCR outside this app. Unsupported legacy file formats should be converted before import.

## Choose an output folder or ShareSync

**Where:** Settings → Work folder

1. Open Settings and choose your approved Work folder. This can be a ShareSync folder approved for your work.
2. The app installs separately from this folder. Exported reports and approved Worker handoffs use the work folder.
3. For two PCs, select the same synced work folder on each and connect their identities in Worker after checking fingerprints.
4. Use Open work folder in Worker to open the selected destination.

**Keep in mind:** Do not place the app database, encrypted key file, browser profiles, caches or model downloads into the shared task folder. Each PC keeps its protected application data locally.

## Organize a project

**Where:** Library → Manage projects / chats

1. Open Projects → New project. Enter its name, instructions and optional output subfolder.
2. Choose New project chat to work with its instructions. Import or attach the relevant documents explicitly.
3. Edit updates the project settings; Remove project removes its project record. Review deletion prompts before confirming.

**Keep in mind:** Project instructions guide answers; they do not grant access to apps, folders, websites or cloud services.

## Create a reusable report agent

**Where:** More → Automation → Saved assistants

1. Open Agents → New agent. Enter a name and clear instructions, select an output format and choose any working files to include.
2. Use Run report, then choose this PC or a connected Worker when offered. The job follows AI Processing settings.
3. Review the resulting report and the recent-job status. Edit the agent to reuse improved instructions.

**Keep in mind:** An agent is a reusable task configuration. This version is not a general-purpose autonomous controller that can perform arbitrary operations across every desktop app.

## Schedule a report

**Where:** More → Automation

1. Open Scheduled tasks and create or edit a report with its prompt, selected files, and output format.
2. Choose one-time, daily, weekdays, weekly, monthly, custom interval, or a work-folder file-change watcher. Enter the fields for your chosen recurrence. Times use this PC's local time.
3. Weekly days use 0 for Sunday through 6 for Saturday. Monthly dates beyond the end of a shorter month use its last day. Interval and watcher polling use minutes.
4. The first watcher poll records a baseline; a later file metadata change triggers a report. The watcher path is relative to the approved work folder.
5. Duplicate creates a paused copy. Review it before enabling. Keep the PC, app, and Worker running; paused background work cannot run scheduled jobs.

**Keep in mind:** One-time jobs disable after their run. A file watcher detects file metadata changes, not arbitrary conditions in emails or websites. Scheduled reports use your existing processing and privacy settings.

## Pause background work and understand job states

**Where:** Header menu → Pause background work; Health & recovery

1. Use Pause background work in the top bar. Active work reaches a safe boundary before it pauses; this is not an immediate termination of an in-progress action.
2. Use Resume background work when ready. Foreground chat receives priority at safe boundaries.
3. Running means an active phase; Waiting means a resource or priority condition is blocking progress; Paused means a manual or recovery pause; Failed means the job ended with an error.
4. Open Health & recovery for the reason. Use Stop on a recent job to cancel it.

**Keep in mind:** One background AI job and one browser session are permitted. Close an open automation browser session before local reasoning needs its RAM.

## Set up a Worker PC and Windows startup

**Where:** More → Automation → Worker settings

1. Open Worker, choose this PC’s role, and enable background jobs if desired. Save Worker settings.
2. Enable Start Private AI when I sign in to Windows if you want it to launch at sign-in; this can be changed later.
3. Choose the same approved ShareSync work folder on both PCs. Compare the displayed fingerprints and connect each trusted PC to the other.
4. Keep the Worker awake and signed in. Closing the window can leave enabled background work running; Quit in the tray stops the app.

**Keep in mind:** Each PC needs its own local credentials and model files. A Worker role does not remove approvals or provide guaranteed desktop-input isolation.

## Run a reviewed browser report

**Where:** More → Browser tasks; Automation

1. Create an exact report workflow, choose its allowed website and controls, and test it manually using your authorized account. Choose PointClickCare as the source for PCC reports; enable the optional PCC integration first.
2. After a successful tested download, explicitly allow that exact workflow to run unattended. Changes invalidate the grant and require a new test and approval.
3. Add a daily, weekday, weekly, monthly or one-time schedule. Report pulls run one at a time with a default five-minute gap measured from the previous pull’s completion. An optional analysis prompt uses existing provider/privacy settings after download.
4. Keep the PC awake, the app running and unlocked, and background work enabled. Review login/MFA, rate-limit and changed-page errors manually; the affected schedule pauses instead of retrying indefinitely.

**Keep in mind:** Website retrieval requires network access; local analysis can run offline. This feature does not evade site controls or guarantee acceptance by PCC. Live PCC report retrieval must be tested with your facility’s authorized workflow. Downloads are not automatically mapped into resident records.

## Automation warnings and safe deferral

**Where:** Preflight dialog; Apps; Browser reports

1. Read the preflight warning before an action that may affect ordinary PC use. It identifies affected apps only when the action provides evidence for those names.
2. Desktop mouse/keyboard input may affect whichever app is currently in focus. Window, clipboard and shared-session effects are described when applicable.
3. Choose Defer safely to leave the action unexecuted, or Run now — I approve when you are ready for that invocation.
4. Keep Private AI visible, focused and unlocked for manual approval. Unattended jobs do not bring it forward to ask.

**Keep in mind:** App help is explanatory. It never grants permissions, clicks approval buttons, or bypasses these controls. Exact tested report recipes may receive separate explicit unattended approval. This never authorizes Outlook or WhatsApp sending/deleting.

## Use the browser companion in Chrome, Edge or Firefox

**Where:** Settings → Browser Companion

1. Open Settings → Browser Companion → Set up browser companion in the rebuilt desktop app. This registers the local host and opens the extension folder.
2. Chrome/Edge: open chrome://extensions or edge://extensions, enable Developer mode, select Load unpacked, and choose that folder.
3. Firefox: use about:debugging#/runtime/this-firefox → Load Temporary Add-on and choose manifest.json in the firefox subfolder. Temporary installation ends on browser restart.
4. Pin and click the toolbar icon to open the sidebar. Ask a question. Enable Include page only when you intend to read the current page; click the icon on that tab first to grant access.
5. Disconnect browser companions in Settings and close open panels when finished. Re-run setup if the desktop executable moves.

**Keep in mind:** Firefox live native integration is not yet validated and permanent distribution requires Mozilla signing. Brave/Vivaldi are unverified Chromium compatibility candidates; a toolbar popup is used when sidebar APIs are unavailable. Browser-internal pages, Bitwarden's hosted vault, extension pages and some PDF viewers cannot be captured. The companion uses the desktop app; it contains no independent model or API key.

## Use approved Outlook access

**Where:** More → Connections → Outlook

1. Open Apps to review and grant the available Outlook read permissions you intend to use.
2. Use /unread for unread messages, or /calendar today and /calendar tomorrow for the supported calendar lookup.
3. Review any interruption approval before the helper interacts with Outlook.

**Keep in mind:** A help question about Outlook does not read your mailbox. The actual commands require permissions and may be deferred when unattended.

## Configure the WhatsApp bridge

**Where:** More → WhatsApp

1. Connect your authorized WhatsApp session and select conversations and verified senders. Read-all can be turned off independently of selected conversation permissions.
2. Selected command/read-write conversations can accept authorized inquiries and notes. Reading a conversation alone never grants task execution or sending.
3. Review each prepared outgoing message in the outbox on the PC. Every send requires explicit approval of the destination and exact text. Disable all writing overrides selected write grants.
4. Status messages, progress and reminders are also prepared for approval. Outlook/WhatsApp drafts remain internal until reviewed; Outlook drafts can be created with desktop confirmation.

**Keep in mind:** Unattended sending has been removed at the owner’s request. Replies are not delivered merely because a remote task completed. The PC must be awake and reachable. WhatsApp attachment sending and deleting WhatsApp messages are not implemented.

## Privacy settings and retention

**Where:** Settings

1. Open Settings to review HIPAA mode, cloud approval and retention. The default retention is 90 days; choose a listed duration, a custom duration or Keep indefinitely if appropriate.
2. Use Save settings. Run retention cleanup now applies the configured cleanup to eligible expired local records and working copies.
3. Original documents and explicitly saved reports are separate from the app’s working copies. Manage those in their approved storage location.
4. Protected app data remains under %LOCALAPPDATA%\PrivateAI2; credentials stay local to the Windows user.

**Keep in mind:** HIPAA mode is an app control, not a compliance certification. The app does not change your organization’s provider agreements, endpoint controls or approved channels.

## Use a temporary chat

**Where:** More → Temporary chat

1. Choose Temporary chat before sending. It does not use or save the app’s memory and is removed when closed.
2. Choose Save chat to convert it to a saved conversation when you intentionally want to keep it.
3. Explicitly exported files remain in the work folder even when the temporary chat ends.

**Keep in mind:** Temporary chat does not erase copies held by an external provider or other applications. Processing-mode and provider permissions still apply.

## Manage what the app remembers

**Where:** Settings → Review saved memories

1. Open the Memory controls from Settings. Enable memory only when you intend it to be used.
2. Add, edit or delete an entry, choose its duration, and choose global or project scope.
3. Temporary chats never use or update app memory.

**Keep in mind:** Saved memory is user-approved text included in eligible requests; it is different from the PC’s RAM.

## Recover interrupted work and export diagnostics

**Where:** Header menu → Health & recovery

1. Open Health & recovery after a crash, interrupted session or sleep. Read the recorded status and reason before resuming.
2. Acknowledge startup notice dismisses the safe-start notice. Resume background work is a separate action.
3. For an eligible failed local report, use Review & resume report. Saved inputs and completed steps are reused; a request that was not saved may need to run again.
4. Use Run local checks or Export diagnostics. Review the technical report before sharing it.

**Keep in mind:** Diagnostics exclude prompts, file contents, credentials, paths and device names. Recovery does not replay every kind of job or guarantee that an external action was undone. Do not delete the data folder to repair a launch error.

## Install, use portable and upgrade safely

**Where:** Installer; Portable folder

1. For regular setup, extract the installer ZIP and run Installer → PrivateAI-Setup-3.0.0-x64.exe. Quit running copies first; use the existing location when updating.
2. For portable use, extract the entire portable ZIP to a permanent folder and run Portable\PrivateAI.exe. Keep all supporting files together.
3. Both use local user data outside the program folder. Models and chats do not need to be redownloaded during this update.
4. The bundled local engine needs no separate Microsoft runtime installation. The installer works per user without administrator rights.

**Keep in mind:** Copying the portable folder to another PC does not automatically transfer protected data or models. Windows execution of a new build must still be checked on the target PC.

## Set global custom instructions

**Where:** Settings → Custom instructions

1. Open Settings and enter your preferences in Custom instructions.
2. Save Settings. The instructions are combined with relevant project instructions and approved memory for chat requests.

**Keep in mind:** Instructions do not override app permissions or provider restrictions. Do not use this field to store resident data or credentials.

## Archive and restore chats

**Where:** Chat → Archive; Settings → Manage archived chats

1. Open the chat and choose Archive. It disappears from the active sidebar list.
2. Open Settings → Manage archived chats to restore a conversation.

**Keep in mind:** Archiving does not delete the chat or exempt it from retention. Temporary chats cannot be archived. Archiving a WhatsApp session makes its next inquiry start a new chat.

## Ask Private AI to troubleshoot

**Where:** Chat; Health & recovery; User guide

1. Type /diagnose or troubleshoot Private AI for local read-only configuration checks. These do not need a model or API connection.
2. Review the observed configuration separately from the suggested steps. The check does not test the network, key validity, installer, or live WhatsApp connection.
3. Use /help followed by a topic for instructions, and include the error code and what you were doing when asking for more help.
4. For a failing local model, inspect AI Processing and Health & recovery. For browser or WhatsApp problems, inspect the relevant connection and permissions.

**Keep in mind:** Diagnostics do not automatically fix settings or send messages. They do not expose your API key, work-folder path, or resident records. Other questions still follow your selected AI processing mode.

## Check when this app source was updated

**Where:** Bottom of sidebar

1. Read Last updated at the bottom of the sidebar. The date uses this PC's local time.
2. The timestamp changes when source content changes during build preparation. Opening the app does not reset it.

**Keep in mind:** This is a source-build timestamp, not evidence of an automatic update or completed release validation.

## Record and transcribe a meeting locally

**Where:** Meetings

1. Create a meeting. Paste notes or choose Set up local transcription once to download the verified Windows CPU runtime and English model (about 87 MB). Subsequent recording and transcription are local; no browser speech service is used.
2. Record with participants’ permission. Bounded audio chunks are stored encrypted before transcription. Retry pending audio before finishing; a missing runtime never produces a fake transcript.
3. Finish to prepare source-based minutes and follow-ups. With a configured local language model, an additional draft summary/plan can be prepared. Review the transcript and confirm assignments/deadlines before acting.
4. Use Speaker review to correct attribution and manage confirmed voice profiles. Experimental acoustic suggestions require human confirmation; new continuous recordings use Unknown Speaker until reviewed.

**Keep in mind:** Automatic multi-speaker diarization is not implemented. Do not treat acoustic similarity as verified identity. Long AI drafts can be explicitly marked partial; original transcript/minutes are retained. Local speech setup currently requires a one-time download; English Tiny model accuracy and physical microphone quality need review.

## Keep facility policies together

**Where:** Library → Facility policies

1. Choose Facility policies to select or create that collection. Upload reference documents or link existing files.
2. Use a project chat or extracted-text search to consult the saved documents. Keep approval dates and versions in the source documents.

**Keep in mind:** Uploading a document does not establish that a policy is approved, current or applicable. Existing documents and clinical rules are preserved.

## Light and dark appearance

**Where:** Settings → Appearance

1. Choose Follow system, Light or Dark. The change applies immediately and is saved automatically on this PC.
2. The Android companion has its own Appearance selection in Settings. Theme choices do not change privacy, connection or model settings.

**Keep in mind:** Only this non-sensitive appearance preference is stored outside the encrypted workspace so the locked screen can use the same theme.

## Local meaning search and scanned document OCR

**Where:** Library → Set up local search & English OCR

1. Set up the optional local tools once in Library. Approximately 68 MiB of public model/language files are downloaded; documents and queries stay on the PC.
2. Choose a collection and Meaning · local, then ask a question. Word search remains available without setup. Results cite original passages; ranking is not clinical confidence or proof of source currency. Stop cancels the search.
3. After setup, import English photos or scanned PDFs through the existing file importer. Local Only chat can use recognized photo text. Original images remain stored; check unverified machine text, names, doses and dates against the original.

**Keep in mind:** OCR and meaning search work offline after setup. English print is the initial language; handwriting and poor scans may be inaccurate. Search covers at most 2,048 passages and discloses incomplete coverage. No cloud inference or API key is required.

## Search saved work

**Where:** Sidebar → Search

1. Enter a word or phrase to search saved chats, notes, meetings, projects, documents, follow-ups and report job metadata.
2. Open Sources and collection to narrow the selection. Dedicated clinical records require explicit opt-in.
3. Open a result to review its current source. Library results retain the searched phrase and selected file.

**Keep in mind:** Search is local word search of saved text. It does not search attachment bytes, credentials, archived/temporary chats, live feeds or arbitrary files. Import completed report exports into Library to search their text. Scan limits and unknown clinical coverage are shown.

## Review source dates and prepare a redacted copy

**Where:** Library → Search/show coverage → open a file

1. Open Source dates and review metadata to record publication/effective dates, version, reviewer and review deadline. Save and reload the review.
2. Open Privacy review and redacted copy, find identifier patterns, and select the exact spans you want removed. Optional manual ranges use extracted-text positions.
3. Prepare the selected redacted copy, review it, and copy the reviewed text. The original document remains unchanged.

**Keep in mind:** Upload dates do not prove source currency. Owner approval attestation is not independent proof of facility approval. Pattern suggestions can miss sensitive information; a redacted copy is not a guarantee of de-identification or permission to disclose.

## Review correspondence follow-ups

**Where:** Dashboard → Correspondence follow-ups

1. Open Settings to choose approved WhatsApp cache, selected Outlook snapshots, keywords, explicit unread flags and an optional recurring cache-review interval.
2. Review cached messages now, then inspect the source text before creating a follow-up. Enter an owner or deadline only when known.
3. Save review suggestions to the existing Notes/follow-up queue. Internal Outlook or WhatsApp drafts are reviewed separately; no message is sent automatically.

**Keep in mind:** Recurring review is off by default. Outlook snapshots are saved only from messages you explicitly open after granting read access and enabling this option. This does not watch the Inbox or establish whether someone replied. Missing dates, unread status and reply status stay unknown; duplicate source reviews retain the same canonical follow-up.
