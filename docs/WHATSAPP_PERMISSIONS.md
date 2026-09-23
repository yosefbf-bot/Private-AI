> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# WhatsApp: independent read and write permissions

Implemented source behavior:

- `readAll` defaults to true. While the bridge is enabled and connected, read new text messages across the account, including chats not open onscreen. Turning read-all off stops broad observation and leaves selected-chat reading and replies available.
- Only explicitly selected conversations/groups can receive writes. Keep per-conversation sender IDs, command-only versus open read/write modes, and optional unattended command replies.
- `disableAllWriting` overrides all sends and desktop forwarding and pauses incoming task execution. Reading continues. Turning read-all on/off never grants/revokes write permission or cancels a selected-chat reply.
- Old `readOnly` settings migrate to `disableAllWriting`; old paired-group settings remain command-only.
- New `WhatsAppAccount` uses whatsapp-web.js 1.34.7 message events and stable account chat IDs. It sends directly to a verified chat ID, with sendSeen disabled, without navigating a sidebar or replacing a draft. Dedicated Edge QR pairing is required; the app does not take over other sessions.
- New messages are saved in encrypted `messageIn` records under app retention. The UI can show the latest 200 or clear local observations. These records are not automatically injected into model prompts.
- All accessible direct/group chats receive a rotating refresh of up to 100 recent messages, one chat per idle poll. Incoming events are captured while tasks run. Task queue is bounded at 1,000 and exposes overflow; it never retries uncertain sends. Old history cannot start tasks.

## Setup

Open Messaging, connect the Web account, scan QR if necessary, enable the bridge, review Read all and Disable all writing, and save. For writes, Load connected conversations, choose one, Verify and add selected conversation, enter approved sender IDs, choose a mode, and save. Enable task execution, completion notifications, and actual response text to get full answers remotely. Locked operation remains an independent opt-in. Read-all can operate with no write destinations.

## Limits and verification

WhatsApp is the primary remote interface; mobile implementation is deferred. Follow-up questions preserve AI context per conversation and sender. `/new` starts a new conversation; in approved-command mode include the prefix and PC code. Archiving or deleting the associated desktop chat causes the next remote question to start fresh. Other members of a WhatsApp group can still see replies sent to that group.

New configurations include actual response text by default; existing saved choices are preserved. Longer answers are split into numbered messages instead of truncated. An optional progress switch sends a notice every minute while work runs. Completion, progress, and each answer segment recheck write permissions. A writing override or revoked destination blocks remaining segments, and uncertain delivery disables the bridge without retrying. A progress notice indicates elapsed running time, not a claimed percentage of work completed.

The app and PC must remain running with a connected WhatsApp session. Disconnected sessions are shown as such; reopen the connection to reconnect. No guarantee of unavailable/deleted/older unsynced history. Media contents are not downloaded. The Windows-native intake remains limited to its open chat. Use Web for full-account coverage.

The account connector is unofficial; WhatsApp changes may break it. Tests use injected clients and synthetic browser DOM, not a live account. Actual WhatsApp pairing/event delivery/sending must be validated before release. Sending never bypasses unrelated Outlook/browser/desktop protections. Reading/toggles do not retract an already-dispatched network send.

Dependency: https://github.com/wwebjs/whatsapp-web.js
API reference: https://docs.wwebjs.dev/Client.html

## Packaging

Install from the updated package.json/package-lock.json with lifecycle scripts controlled. The new whatsapp-web.js dependency and its transitive dependencies must be included in app.asar. The old preserve-asar.cjs deliberately rejects changed dependency sets; do not bypass that assertion or merely overwrite source into the old archive. Build the complete dependency tree and validate packaged dependency resolution. Use existing installed Edge, not a downloaded Puppeteer browser. Session profiles and real user data must never enter source/release archives.

The edits and tests here do not update the installed app or existing installer.

