> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Hybrid additions in 2.1.0

See HYBRID_UPGRADE.md for processing modes, local inference, usage metering, browser recipes, and optional messaging. The table below describes the preserved base features; its scheduler restrictions apply to ordinary analysis prompts, while approved /report, /unread and /calendar commands can retrieve fresh data.

# What exists and what still requires validation

| Area | Included | Limit |
| --- | --- | --- |
| Windows delivery | NSIS installer and extracted portable application, bundled Electron and Windows helper runtime | Cross-built, unsigned; real Windows execution not tested here |
| Chat | Stream, stop, copy, edit/regenerate, persistent/temporary chat, local projects and explicit memory | API key/account not provided; real API request not tested |
| Privacy | DPAPI, encrypted SQLite records/metadata, ACL validation, audit, 90-day retention, cleanup, local checks | HIPAA requires administrator approval and agreements; no compliance certification |
| Chrome | Side panel, manual page/selection capture, sanitized answers, native bridge | Real Chromium UI/logic tested with synthetic native IPC; actual installed Windows Chrome extension bridge not tested |
| Documents | TXT/MD/CSV/PDF/DOCX/XLSX/images/EML/MSG/ICS references; DOCX/PDF/XLSX/CSV/TXT/MD reports | Text-based PDF only; no OCR, audio/video, macros, code execution, or automatic email-attachment reading |
| ShareSync | Custom work folder, unique reports, safe paths, encrypted Worker handoffs | Local simulated folder tests only; actual ShareSync/service controls not tested |
| Worker | Per-PC keys, mutual trust, designated recipient, persistent claim, status, pause, scheduled jobs | Per-user signed-in app, not a Windows system service; no exactly-once guarantee across manual machine cloning or restored old state |
| Scheduler | Daily and weekday schedules; catch up once; local or designated Worker execution | No live mailbox/folder watchers, unattended webpages, calendars as triggers, or arbitrary workflows |
| Outlook | Chosen Inbox messages, date-limited default calendar, reviewed draft and appointment creation | Classic Outlook only; no send, invitation, shared-mailbox picker, or live Windows COM test |
| WhatsApp / selected apps | Explicit visible-text read and selected writable-field draft; exact EXE fingerprint | Best-effort UI Automation. Some versions offer no supported field; manual copy/paste fallback. Not a WhatsApp-specific API connector |
| Folders | Separate read/write grants, explicit browse/import, TXT/MD editing, report saving | No recursive indexing or arbitrary binary/system-file editing; no distributed file lock |
| Browser actions / cowork | User-chosen reference → chat → reviewed copy/export | No autonomous navigation, clicking, form filling, browser scripts, or general computer-control agent |
| Migration | v2 schema migrations preserve encrypted records; separate PrivateAI2 profile | Automatic import of Python/v0.x history not implemented; originals preserved |
| Updates | Re-run installer / replace complete portable application files | No code signing or automatic updater; distribution requires IT review |

The security-first choices above intentionally narrow automated app actions. A permission flag is not a promise that every third-party program supports accessibility or is approved for PHI.

