# Notes, rounds and follow-ups

This source update adds one desktop-backed workflow for the PC, native Android companion and approved WhatsApp conversations. Both repositories use `chatgpt/shared-companion-workflows-2026-10-05` review branches. Editing source does not update existing installed apps or installers.

## On the PC

Open **Notes and rounds** in the sidebar or Action Center. Enter your observation, an optional location/owner/deadline, and an optional picture, PDF or text file up to 5 MiB. Choose an optional Outlook or WhatsApp draft, then save. The original note and evidence are encrypted in the existing store. Text parsing creates administrative **Review** items in the normal To-Do/Action Center. Confirm assignment/deadline and record completion when appropriate. Completing a follow-up does not resolve a clinical alert, SBAR or resident concern. Unknown facts stay unknown; pictures are preserved without claiming the local text model interpreted them.

Drafts remain internal. Edit recipient and wording before use. The Outlook option goes through the existing desktop confirmation and Classic Outlook draft permissions; it saves a draft and does not send. Copy a WhatsApp draft into the intended conversation when you choose to send it. Phone clinical approvals and external sends are not exposed.

Pending follow-ups retain their note/evidence/review links. Eligible closed records and abandoned uploads follow retention. An uncertain WhatsApp delivery is kept for review and is not blindly retried.

## Android

Use **Settings → Android Companion Gateway** on the PC. Choose your actual private network address, enable HTTPS and pair the phone. Select optional notes/evidence and notification permissions. Select any existing PC chats the phone may read and continue; other chats are excluded. Change that selection or revoke access later.

Transfer the one-time pairing link privately into Android Settings and check its certificate fingerprint against the desktop. The phone verifies the certificate/address/validity dates; an IP alone cannot pair. No blanket firewall rule or public listener is installed. The PC must be awake, connected and running Private AI. Normal chat/evidence access requires its app to be unlocked.

Full phone records/configuration require Android screen-lock/biometric authentication and Keystore encryption. A separate notification-only key permits explicitly enabled generic due notifications; it cannot read chats, notes, pictures or resident information. **Allow generic reminder metadata while desktop locked** is a separate desktop pairing opt-in. Revoke the phone to revoke both keys. Permission/battery settings and Android scheduling can delay notifications; these are follow-up aids, not clinical emergency paging.

The companion uses the PC's AI. Clinical privacy requests explicitly require local-only processing and HIPAA mode, without cloud fallback. Other desktop approval/budget/resource controls still apply. With no model, notes and follow-ups still work; inference reports its real unavailable state.

Encrypted pending notes/chat requests survive disconnection. Stable request IDs prevent completed retries from creating another generation or note. Interrupted/ambiguous requests require review; no successful answer is invented. Demo data uses a separate labeled workspace. Existing phone records are preserved/migrated, and historical simulated records require source review.

## WhatsApp

Connect the Web account in Messaging, verify the conversation/group, approve sender IDs, enable tasks and permitted replies. In **Approved commands** include the saved prefix and PC code. **Open read/write** accepts commands directly from approved senders. Read-all never grants execution to other chats/senders.

| Command | Result |
| --- | --- |
| `/note <observation>` | Saved note and review follow-ups |
| `/round <findings>` | Source-linked rounds note and review items |
| `/remind <note>` | Follow-up whose deadline requires review |
| `/remind <ISO timestamp with Z or offset> <note>` | Follow-up with an explicit reminder deadline |
| `/draft outlook <note>` | Internal Outlook draft and review item |
| `/draft whatsapp <note>` | Internal WhatsApp draft and review item |
| `/new` | Fresh AI conversation for this conversation/sender |

Attach supported evidence with a capture command in its caption. Only the verified Web account path downloads approved incoming evidence of known size up to 5 MiB. Read-all does not download media. Unsupported/unknown-size attachments fail clearly; Windows intake does not acquire media through this path.

WhatsApp reminders return to the source conversation only while current sender/destination/task/background permissions allow it. PC notification emission and remote delivery are separate. Read-all is independent; **Disable all writing** blocks replies/reminders and pauses commands while permitted reading continues. Normal questions still use AI chat with unrelated global memory/instructions excluded. Group replies are visible to group members; existing channel/privacy approval remains necessary.

## Behavior changes and acceptance limits

- Parser proposals retain exact source spans and clause-local rooms; “contact” no longer matches the AC keyword.
- Rounds edits reuse linked delegations. New rounds no longer guess 4-hour/24-hour deadlines from urgency. Existing confirmed deadlines/legacy links remain.
- Internal approval no longer claims an external dispatch.
- Android real mode reports actual responses/unknown telemetry. Unsupported job controls report their limitation instead of simulated success; their planned screens remain.
- Phone workflow views are bounded and show truncation. Review older records on the desktop. Phone chat history is its own or explicitly shared.

Source/Core/SQLite/HTTPS and synthetic UI checks are distinct from physical Android, LAN, live WhatsApp/accounts and packaged Windows acceptance. No real messages/mailbox writes/PHI are required for development tests. New binaries require their own acceptance evidence; earlier Windows flags belong to the earlier candidate only.
