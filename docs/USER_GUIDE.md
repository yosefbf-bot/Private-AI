> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 3.0.0 — User guide

This guide is bundled with the app. Open User guide in the sidebar, or type /help in chat. Common how-to answers use local code without loading a model or calling OpenAI. Help explains features; it does not change settings or grant permissions.

### Start here

**Where:** User guide

1. Open User guide in the sidebar to browse or search these instructions at any time.
2. For help in chat, ask “How do I change my local brain?” or type /help models. Common guide answers are retrieved locally without loading a brain or calling OpenAI.
3. Choose AI Processing to configure local models or cloud use. Choose Settings to select your approved work folder. Then start a New chat.

**Keep in mind:** The guide explains supported features. Asking for instructions does not itself change settings or grant permissions.

### Chat, edit and save a response

**Where:** New chat

1. Choose New chat (Ctrl+K), type a message, and press Enter to send. Shift+Enter adds a new line. Stop cancels an active response.
2. Use Edit under your message to change it. Sending the edit replaces the later conversation branch. Regenerate retries the last question and may use your configured model or API.
3. Use Copy or Save as… below the answer. DOCX, PDF, XLSX, CSV, MD and TXT exports go to your chosen work folder.
4. Assistant answers appear in a light-grey box. Model-routing and verification notices appear below as compact footnotes; they still matter when reviewing the answer.

**Keep in mind:** The saved response can include verification notices. A local evidence score is a heuristic, not a measured accuracy percentage.

### Choose and download a local brain

**Where:** AI Processing

1. Open AI Processing → Local brain tiers. Small is Qwen3 1.7B Q4_K_M; Medium is Llama 3.2 3B Q4_K_M; High is Qwen3 4B Q4_K_M; Extra High is Qwen3 8B Q4_K_M.
2. Use Download model for a missing tier, or Locate existing file to reuse a compatible GGUF already on disk. Existing downloads are verified and reused.
3. Choose a local tier and automatic tier cap, then Save processing settings. Load selected / starting model loads it explicitly; normal reasoning loads a model when needed.
4. Extra High is optional and needs considerably more available RAM. Only one model is loaded at a time.

**Keep in mind:** A larger model is not guaranteed to be correct. Downloads require internet, but ordinary local inference does not. Missing models are never downloaded automatically.

### Automatic tier selection

**Where:** AI Processing

1. In AI Processing, choose Automatic for the local tier and choose the highest allowed automatic tier. Save processing settings.
2. With Small installed, the app uses it for a short assessment and may switch to an available larger tier. It checks available RAM and stops the previous engine before loading another.
3. When a larger tier is unavailable, capped or cannot fit, the answer may remain a smaller-model draft with a visible footnote.
4. Health & recovery → Keep loaded brain for follow-ups controls optional reuse. Zero keeps the default Small-first behavior.

**Keep in mind:** The selection is a heuristic. It does not guarantee the best tier, and allowing a higher cap does not install that model.

### Reduce RAM use and model loading problems

**Where:** AI Processing; Health & recovery

1. Open AI Processing and choose Unload now before changing to a smaller model or context.
2. Try Small or Medium, Local context tokens 2048, and Maximum local answer tokens 512. Save processing settings, then Load selected / starting model.
3. Close unused heavy programs and browser sessions. Balanced reduces CPU demand; a smaller brain and context reduce model RAM demand.
4. Health & recovery shows available RAM, the active model and waiting reasons. Keep free RAM and RAM recovery delay control resource checks.

**Keep in mind:** Do not reduce the RAM reserve just to force an oversized model to load. Work may wait or pause until enough RAM returns. The engine can stop when RAM becomes critically low.

### Local Only, Local First and cloud modes

**Where:** AI Processing

1. Open AI Processing → Processing mode. Local Only blocks every OpenAI request, including model-list and connection tests.
2. Local First and Smart Hybrid can use OpenAI only when cloud access is allowed and the required API/privacy settings are complete. Cloud First uses the configured API for AI reasoning.
3. Ordinary local commands and built-in guide answers use local code, without a model or API key.
4. Use Save processing settings after changing the mode. The provider information beneath a response shows how that response was produced.

**Keep in mind:** Local Only cannot provide live web search through OpenAI. Some tasks may be refused or need a smaller scope when local capability or RAM is insufficient.

### Set up OpenAI API access

**Where:** Settings; AI Processing; API Usage

1. Open Settings to save your OpenAI API key and configure the model, organization or project fields when needed.
2. Complete the privacy approval shown by the app before using cloud requests in HIPAA mode.
3. In AI Processing, choose a mode that permits cloud use and enable Allow OpenAI when needed if appropriate. Local Only continues to block OpenAI.
4. API Usage shows recorded usage. Configure price inputs for estimates; an unknown price is not a promise that a request is free.

**Keep in mind:** ChatGPT subscriptions do not supply an API key to this app. API billing is separate. Guide answers use no API credits, and no key belongs in a prompt or shared work folder.

### Attach and ask about documents

**Where:** Files; chat attachment button

1. Use the + attachment button in chat, or Files → Import files. From Files, choose Ask about this file to begin a related chat.
2. Ask a specific question and identify the documents to compare. The current build supports text PDFs, DOCX, XLSX, CSV, TXT, EML, MSG and images.
3. Use /extract to return attached extracted text without a model. Check extraction before relying on a complex table or document.
4. Use Save as… to create a report in your approved work folder.

**Keep in mind:** Image understanding depends on the selected provider/model; the bundled text brains cannot inspect image pixels. Scanned PDFs may need OCR outside this app. Unsupported legacy file formats should be converted before import.

### Choose an output folder or ShareSync

**Where:** Settings → Work folder

1. Open Settings and choose your approved Work folder. This can be a ShareSync folder approved for your work.
2. The app installs separately from this folder. Exported reports and approved Worker handoffs use the work folder.
3. For two PCs, select the same synced work folder on each and connect their identities in Worker after checking fingerprints.
4. Use Open work folder in Worker to open the selected destination.

**Keep in mind:** Do not place the app database, encrypted key file, browser profiles, caches or model downloads into the shared task folder. Each PC keeps its protected application data locally.

### Organize a project

**Where:** Projects

1. Open Projects → New project. Enter its name, instructions and optional output subfolder.
2. Choose New project chat to work with its instructions. Import or attach the relevant documents explicitly.
3. Edit updates the project settings; Remove project removes its project record. Review deletion prompts before confirming.

**Keep in mind:** Project instructions guide answers; they do not grant access to apps, folders, websites or cloud services.

### Create a reusable report agent

**Where:** Agents

1. Open Agents → New agent. Enter a name and clear instructions, select an output format and choose any working files to include.
2. Use Run report, then choose this PC or a connected Worker when offered. The job follows AI Processing settings.
3. Review the resulting report and the recent-job status. Edit the agent to reuse improved instructions.

**Keep in mind:** An agent is a reusable task configuration. This version is not a general-purpose autonomous controller that can perform arbitrary operations across every desktop app.

### Schedule a report

**Where:** Scheduled tasks; Worker

1. Open Scheduled tasks and create or edit a report with its prompt, selected files, and output format.
2. Choose one-time, daily, weekdays, weekly, monthly, custom interval, or a work-folder file-change watcher. Enter the fields for your chosen recurrence. Times use this PC's local time.
3. Weekly days use 0 for Sunday through 6 for Saturday. Monthly dates beyond the end of a shorter month use its last day. Interval and watcher polling use minutes.
4. The first watcher poll records a baseline; a later file metadata change triggers a report. The watcher path is relative to the approved work folder.
5. Duplicate creates a paused copy. Review it before enabling. Keep the PC, app, and Worker running; paused background work cannot run scheduled jobs.

**Keep in mind:** One-time jobs disable after their run. A file watcher detects file metadata changes, not arbitrary conditions in emails or websites. Scheduled reports use your existing processing and privacy settings.

### Pause background work and understand job states

**Where:** Top bar; Health & recovery

1. Use Pause background work in the top bar. Active work reaches a safe boundary before it pauses; this is not an immediate termination of an in-progress action.
2. Use Resume background work when ready. Foreground chat receives priority at safe boundaries.
3. Running means an active phase; Waiting means a resource or priority condition is blocking progress; Paused means a manual or recovery pause; Failed means the job ended with an error.
4. Open Health & recovery for the reason. Use Stop on a recent job to cancel it.

**Keep in mind:** One background AI job and one browser session are permitted. Close an open automation browser session before local reasoning needs its RAM.

### Set up a Worker PC and Windows startup

**Where:** Worker

1. Open Worker, choose this PC’s role, and enable background jobs if desired. Save Worker settings.
2. Enable Start Private AI when I sign in to Windows if you want it to launch at sign-in; this can be changed later.
3. Choose the same approved ShareSync work folder on both PCs. Compare the displayed fingerprints and connect each trusted PC to the other.
4. Keep the Worker awake and signed in. Closing the window can leave enabled background work running; Quit in the tray stops the app.

**Keep in mind:** Each PC needs its own local credentials and model files. A Worker role does not remove approvals or provide guaranteed desktop-input isolation.

### Run a reviewed browser report

**Where:** Browser reports

1. Open Browser reports to create or review a supported recipe for the approved site and its defined steps.
2. Review the interference warning before manually opening or running browser work. Log in or complete verification yourself when required.
3. Run the reviewed recipe from the interface or use /report NAME for a saved recipe. Close the browser session when finished.

**Keep in mind:** Separate profiles do not guarantee focus isolation. Visible browser actions can take focus, share session state, open windows or download files. Unattended interfering actions are deferred.

### Automation warnings and safe deferral

**Where:** Preflight dialog; Apps; Browser reports

1. Read the preflight warning before an action that may affect ordinary PC use. It identifies affected apps only when the action provides evidence for those names.
2. Desktop mouse/keyboard input may affect whichever app is currently in focus. Window, clipboard and shared-session effects are described when applicable.
3. Choose Defer safely to leave the action unexecuted, or Run now — I approve when you are ready for that invocation.
4. Keep Private AI visible, focused and unlocked for manual approval. Unattended jobs do not bring it forward to ask.

**Keep in mind:** App help is explanatory. It never grants permissions, clicks approval buttons, or bypasses these controls.

### Use the browser companion in Chrome, Edge or Firefox

**Where:** Settings → Browser Companion

1. Open Settings → Browser Companion → Set up browser companion in the rebuilt desktop app. This registers the local host and opens the extension folder.
2. Chrome/Edge: open chrome://extensions or edge://extensions, enable Developer mode, select Load unpacked, and choose that folder.
3. Firefox: use about:debugging#/runtime/this-firefox → Load Temporary Add-on and choose manifest.json in the firefox subfolder. Temporary installation ends on browser restart.
4. Pin and click the toolbar icon to open the sidebar. Ask a question. Enable Include page only when you intend to read the current page; click the icon on that tab first to grant access.
5. Disconnect browser companions in Settings and close open panels when finished. Re-run setup if the desktop executable moves.

**Keep in mind:** Firefox live native integration is not yet validated and permanent distribution requires Mozilla signing. Brave is an unverified Chromium compatibility candidate. Browser-internal pages and some PDF viewers cannot be captured. The companion uses the desktop app; it contains no independent model or API key.

### Use approved Outlook access

**Where:** Apps

1. Open Apps to review and grant the available Outlook read permissions you intend to use.
2. Use /unread for unread messages, or /calendar today and /calendar tomorrow for the supported calendar lookup.
3. Review any interruption approval before the helper interacts with Outlook.

**Keep in mind:** A help question about Outlook does not read your mailbox. The actual commands require permissions and may be deferred when unattended.

### Configure the WhatsApp bridge

**Where:** Messaging; Apps

1. Open Messaging and connect the dedicated WhatsApp Web account by scanning its QR code. Keep Private AI and the connection running; no particular chat needs to stay open.
2. Read all conversations continuously defaults on when the bridge is enabled. Turn it off to stop broad reading without changing selected-conversation permissions.
3. Load connected conversations, select and verify each permitted destination, and configure approved sender IDs and command-only or open read/write mode. Open read/write accepts ordinary messages from approved senders.
4. Disable all writing overrides every WhatsApp reply and forwarding option and pauses incoming task execution; reading continues according to the read settings. Enable actual response text and task-start commands separately as needed.
5. Show latest observed messages to inspect encrypted local observations. Reading does not automatically send messages to an AI model. Clear locally observed messages removes those app records, not messages in WhatsApp.
6. Follow-up context is kept separately per conversation and sender. Send /new to start fresh; approved-command mode also requires the configured prefix and PC code.
7. Enable progress notices for a running-time notice each minute. Actual response text is on by default for new configurations, and long answers are split into numbered messages. Existing saved preferences are preserved.

**Keep in mind:** The Web account receives new text-message events across conversations and refreshes up to 100 available recent messages per conversation. It does not download media, recover unavailable history, or operate while the PC/app/connection is offline. History never starts tasks. Windows-native intake remains open-conversation-only. The unofficial whatsapp-web.js connection needs live account validation before release.

### Privacy settings and retention

**Where:** Settings

1. Open Settings to review HIPAA mode, cloud approval and retention. The default retention is 90 days; choose a listed duration, a custom duration or Keep indefinitely if appropriate.
2. Use Save settings. Run retention cleanup now applies the configured cleanup to eligible expired local records and working copies.
3. Original documents and explicitly saved reports are separate from the app’s working copies. Manage those in their approved storage location.
4. Protected app data remains under %LOCALAPPDATA%\PrivateAI2; credentials stay local to the Windows user.

**Keep in mind:** HIPAA mode is an app control, not a compliance certification. The app does not change your organization’s provider agreements, endpoint controls or approved channels.

### Use a temporary chat

**Where:** Temporary chat

1. Choose Temporary chat before sending. It does not use or save the app’s memory and is removed when closed.
2. Choose Save chat to convert it to a saved conversation when you intentionally want to keep it.
3. Explicitly exported files remain in the work folder even when the temporary chat ends.

**Keep in mind:** Temporary chat does not erase copies held by an external provider or other applications. Processing-mode and provider permissions still apply.

### Manage what the app remembers

**Where:** Settings → Memory

1. Open the Memory controls from Settings. Enable memory only when you intend it to be used.
2. Add, edit or delete an entry, choose its duration, and choose global or project scope.
3. Temporary chats never use or update app memory.

**Keep in mind:** Saved memory is user-approved text included in eligible requests; it is different from the PC’s RAM.

### Recover interrupted work and export diagnostics

**Where:** Health & recovery

1. Open Health & recovery after a crash, interrupted session or sleep. Read the recorded status and reason before resuming.
2. Acknowledge startup notice dismisses the safe-start notice. Resume background work is a separate action.
3. For an eligible failed local report, use Review & resume report. Saved inputs and completed steps are reused; a request that was not saved may need to run again.
4. Use Run local checks or Export diagnostics. Review the technical report before sharing it.

**Keep in mind:** Diagnostics exclude prompts, file contents, credentials, paths and device names. Recovery does not replay every kind of job or guarantee that an external action was undone. Do not delete the data folder to repair a launch error.

### Install, use portable and upgrade safely

**Where:** Installer; Portable folder

1. For regular setup, extract the installer ZIP and run Installer → PrivateAI-Setup-3.0.0-x64.exe. Quit running copies first; use the existing location when updating.
2. For portable use, extract the entire portable ZIP to a permanent folder and run Portable\PrivateAI.exe. Keep all supporting files together.
3. Both use local user data outside the program folder. Models and chats do not need to be redownloaded during this update.
4. The bundled local engine needs no separate Microsoft runtime installation. The installer works per user without administrator rights.

**Keep in mind:** Copying the portable folder to another PC does not automatically transfer protected data or models. Windows execution of a new build must still be checked on the target PC.

### Set global custom instructions

**Where:** Settings → Custom instructions

1. Open Settings and enter your preferences in Custom instructions.
2. Save Settings. The instructions are combined with relevant project instructions and approved memory for chat requests.

**Keep in mind:** Instructions do not override app permissions or provider restrictions. Do not use this field to store resident data or credentials.

### Archive and restore chats

**Where:** Chat → Archive; Settings → Manage archived chats

1. Open the chat and choose Archive. It disappears from the active sidebar list.
2. Open Settings → Manage archived chats to restore a conversation.

**Keep in mind:** Archiving does not delete the chat or exempt it from retention. Temporary chats cannot be archived. Archiving a WhatsApp session makes its next inquiry start a new chat.

### Ask Private AI to troubleshoot

**Where:** Chat; Health & recovery; User guide

1. Type /diagnose or troubleshoot Private AI for local read-only configuration checks. These do not need a model or API connection.
2. Review the observed configuration separately from the suggested steps. The check does not test the network, key validity, installer, or live WhatsApp connection.
3. Use /help followed by a topic for instructions, and include the error code and what you were doing when asking for more help.
4. For a failing local model, inspect AI Processing and Health & recovery. For browser or WhatsApp problems, inspect the relevant connection and permissions.

**Keep in mind:** Diagnostics do not automatically fix settings or send messages. They do not expose your API key, work-folder path, or resident records. Other questions still follow your selected AI processing mode.

### Check when this app source was updated

**Where:** Bottom of sidebar

1. Read Last updated at the bottom of the sidebar. The date uses this PC's local time.
2. The timestamp changes when source content changes during build preparation. Opening the app does not reset it.

**Keep in mind:** This is a source-build timestamp, not evidence of an automatic update or completed release validation.

