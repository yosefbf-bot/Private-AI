> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Version 2.1.0

Start with [HYBRID_UPGRADE.md](HYBRID_UPGRADE.md). It covers optional local inference, local commands, messaging, and browser workflows. The instructions below describe the preserved manual/API workflow.

# Set up once, then open and chat

## Installation and first test

Extract the complete package to a local disk folder. Run the installer under your normal Windows account, or run `Portable/PrivateAI.exe`. Both use `%LOCALAPPDATA%\PrivateAI2` for private data. Use one installation at a time per Windows profile. The app takes a per-profile single-instance lock; installer and portable copies are not separate accounts.

The installer is unsigned. Your organization may block it. Do not lower Windows security settings or bypass your organization's controls. IT should inspect the included source, hashes, test report, and binaries. Re-running the installer repairs application files without intentionally removing private data. Uninstallation keeps private data.

Open Settings: save the approved API key, load available models or enter an approved model ID, choose a report work folder, review HIPAA and retention options, and save settings. The approval checkbox is an attestation, not automatic verification. Replacing the key or changing API project/organization revokes this confirmation.

Run local checks. They use synthetic data, no OpenAI requests. They test Windows encryption, private folder ACL, encrypted SQLite backup/cleanup, the local bridge, the bundled app-access helper, file formats, report-folder write/cleanup, and audit-chain integrity. Separately test your API connection and one synthetic chat; generation may incur API charges.

## Daily chat

New Chat creates persistent local history; Temporary Chat does not save chat or imported working files to the app database. Copy, edit/regenerate, stop, and export are available. An explicit export from any chat creates a normal document that remains until removed. Explicitly saving a temporary chat stores it as persistent history.

Attach only the files needed for your question. Supported references: text, Markdown, CSV, text-based PDF, DOCX, XLSX, PNG/JPEG/WebP, EML, MSG, and ICS. Email attachments are not analyzed. Save and attach an email attachment separately if required. Scanned/image-only PDFs need external, organization-approved OCR first. Encrypted files, macros, legacy DOC/XLS, audio, and arbitrary code execution are not supported. Typical limits: 20 MB per file, six attachments per request, 300 PDF pages, 350,000 extracted characters, and 90,000 request-context characters by default. A large image request has an additional 40 MB serialized-request ceiling.

Save an answer as Word, PDF, Markdown, text, Excel, or CSV. Excel/CSV export requires a Markdown table in the answer. Formulas remain text; ordinary safe numeric cells become numbers. Review dates, leading-zero identifiers, totals, and source facts. Reports get unique generic filenames to avoid collisions and PHI-bearing filenames. Open the report to confirm appearance in your actual Office/PDF app.

Projects hold instructions and related chats. Memory is explicit and off by default, with its own expiry. Agents are reusable report prompts and selected file snapshots, not unrestricted computer-use agents.

## Chrome — manual page reads only

Settings → Connect Chrome opens the included extension directory. In `chrome://extensions`, enable Developer mode, Load unpacked, select that directory, and pin the extension. Your administrator may need to allow an unpacked extension and native messaging. The expected ID is `joamalncafnpildccchmddldboiefphl`; do not regenerate its public key.

Opening the panel or sending an ordinary question does not query the tab or extract its page. To read a page, click the toolbar icon on that tab, select Include this page or selection only, and send. Only that attempt reads the chosen content. The checkbox resets even if extraction fails. Old page snapshots are not automatically attached to future follow-up requests, though previous answers remain conversation context. No automatic rereads, browsing, link following, DOM watchers, or page actions are present. Chrome's own pages, PDF viewer, protected pages, cross-origin frames, and certain sites cannot be captured; use selected/copied text or a local file instead.

Chrome has no API key. The included native bridge uses this Windows profile's app and secrets. If the panel cannot connect, open/unlock the desktop app, reconnect Chrome in Settings, reload the extension, and check your organization's policy. If you move the portable folder, reconnect Chrome and update its unpacked-extension location. Never move the whole private-data folder into ShareSync.

## Outlook, WhatsApp, other programs, and folders

Under Apps, independently allow Outlook message reading, calendar reading, draft creation, and appointment creation. Direct integration requires classic Outlook and a configured profile. Message browsing reads only headers for up to 50 recent default Inbox items; choosing one reads its plain body, without attachments. Calendar reading uses the default calendar, a user-selected range of up to 31 days, and up to 200 overlapping events. Dates/times use the PC's local timezone. No shared mailbox picker or attendee/invitation workflow is included. Drafts and appointments are saved/displayed in Outlook after a native confirmation; no Send call exists. Outlook may display its own profile/security prompts. If a write times out, inspect Outlook before retrying to avoid a duplicate.

For WhatsApp or another program: open it, choose Choose an open app, explicitly enable read/write permissions, and later choose Read visible text or Write a draft. The exact executable is hash-pinned; after an app update, choose it again. Screen reads use visible Windows accessibility content, not screenshots or hidden conversations. Draft writes only use an exposed writable text field selected by the user, and replace its current value after confirmation. There are no injected keystrokes, mouse actions, Send clicks, clipboard reads, elevation bypasses, or model-driven computer actions. Some apps expose no usable text/fields; use copy/paste instead. A permission grant is not a HIPAA approval for that app or account. Do not use WhatsApp for PHI unless your organization has expressly approved the particular service and workflow.

Allowed folders have separate read/write grants. Browse reads the selected directory only, not a recursive index; choose a file to import it. Existing originals stay untouched unless you explicitly edit a TXT/MD file and confirm. Version checks reject stale edits, and creating a new note never overwrites an existing filename. Concurrent changes across ShareSync replicas can still create vendor conflict copies—review those normally. New DOCX/PDF/XLSX/CSV reports can be saved into a write-allowed folder. Revoking access stops subsequent actions; it does not erase content you already imported, exported, or wrote to another app.

## Worker and scheduled reports

Install independently on each PC and enter a separate approved API key/project configuration on each. Keys are never shared by the job queue. Choose the same approved ShareSync workspace and unique PC labels. Publish each identity in Worker, compare the displayed fingerprints using a trusted channel, and trust each peer explicitly on both PCs. Assign a remote job to one named Worker; other Workers cannot decrypt or run it.

Enable background jobs and optional start-at-sign-in on the Worker. Keep Windows signed in and awake with the workspace available. Private AI is a per-user background application, not a Windows service. Closing its window keeps it running when Worker is enabled; use the tray menu to pause or quit. Jobs may continue while Private AI is locked. Windows logoff, restart, sleep, missing credentials, or an unavailable work folder prevent unattended execution. An internal daily/weekday scheduler catches up once after a missed time, not once for every missed day. Do not clone the private data directory or copy schedules onto several PCs to run the same task.

Uncertain/interrupted jobs are not automatically generated again; review status before explicitly retrying. Successful generation with a failed export can be exported again without another provider generation. Ordinary analysis schedules use imported snapshots. Explicit local commands such as /unread, /calendar, and /report NAME use the permissions and reviewed workflows described in the hybrid guide. Final reports remain normal documents accessible from other authorized devices through the organization's ShareSync setup.

## Retention, backup, and lock

Default retention is 90 days since last saved activity for local chats, working files, and completed jobs. Memory has separate expiry. Original source files and exported reports are not deleted. Failed cleanup is surfaced/deferred; synced backups and ShareSync version history have separate administrative retention. A local encrypted backup requires this Windows user's original DPAPI master key; a database alone is not a cross-PC backup. Set an optional app passphrase; maintain Windows screen locking, disk encryption, endpoint protection, and managed backups regardless.

