# Assistant-first redesign — October 11, 2026

Current source checkpoint. Desktop 3.0.1-dev is based on GitHub main
40566c94acd38577fc03f0456d647f9619ebcb64, branch
chatgpt/assistant-first-workflows-2026-10-07. Android 1.1-dev/code 2 is based on
1e15c200d646cae647cb16139d41d66f2b9e16e0, branch chatgpt/assistant-first-2026-10-07.
Both remotes were fetched again October 11 and remain unchanged. The owner merges main.
The old 1% stop instruction was revoked; do not apply it. New source has not yet
completed fresh Windows packaging/installation acceptance; older binary flags are historical.

## Changed behavior

- Chat is the default. One Dashboard contains canonical follow-ups, reminders and actual
  alerts. Four desktop primary destinations are Dashboard, Notes, Meetings and Library.
  Automation contains schedules/history and secondary Worker configuration. Existing
  clinical/data engines and records remain; standalone huddle, brief, handoff, protocols,
  interdisciplinary actions, playbooks/budget and operations dashboards are removed from
  routine navigation. Critical alerts remain visible. Cloud limits are managed in Settings.
- Notes starts with one text box; optional manual fields are collapsed. Library supports
  persistent facility-policy collections, upload/link/search and projects. Imported policy
  documents do not establish approval or currency.
- Optional local AI drafts enrich source notes and completed meetings with summaries and
  suggested plans. They force Local Only, no tools/web/cloud fallback, and are review items.
  They do not assign unsupported owners/dates, send messages, resolve clinical alerts or
  replace canonical tasks. Interrupted/failed drafts require explicit retry.
- Meetings uses pinned optional whisper.cpp Windows CPU / Tiny English assets. Audio is
  bounded, encrypted before inference, piped over stdin and transcribed locally. No browser
  speech recognition or online speech output is used. Missing assets remain a setup error;
  the corrected Voice UI displays that error without first opening the microphone.
- Android records native PCM audio, encrypted and scoped to the original pairing. The PC
  performs transcription/minutes. Stable IDs/hash receipts prevent duplicate uploads;
  finish requires every committed chunk. Navigation, lock/backgrounding/auth expiry stops
  recording; an unsaved partial chunk up to 20 seconds can be lost. Limit 60 minutes.
- Every WhatsApp send needs unlocked foreground approval showing destination and exact text.
  Background replies/progress/reminders queue for approval. Global disable-writing remains
  authoritative. Read-all and selected conversation permissions remain independent.
  Outlook read/app access stays intact; selected emails can become tracked Dashboard
  follow-ups and internal drafts. No Outlook Send or WhatsApp Delete automation was added.
- Exact, manually tested report recipes can receive separate explicit unattended permission.
  Daily/weekdays/weekly/monthly/once schedules share Automation. Pulls serialize with a
  default five-minute gap after completion. Editing invalidates the grant; login/MFA,
  changed controls and failures require review. PCC-off blocks PCC pulls, not generic
  clinical analytics. No stealth, anti-detection or security-control bypass is implemented.
- Both apps offer saved System/Light/Dark appearance. Desktop screenshots and save/reload/
  system-follow behavior were checked. The phone preserves its prior dark default.
- Android main screens show a compact connection light and last successful sync time.
  The encrypted receipt survives reopening for the same pairing, not re-pairing/Demo.
  Partial refresh does not claim complete sync; a check older than 90 seconds turns amber.
- Android HTTP clients now share a bounded connection pool per pairing. An actual repeated
  HTTPS test exposed the prior per-request client exhausting the desktop's connection cap.
  Certificate validity is still checked on every call; changing pairing retires the pool.

## Verification completed

Ignored local evidence: Validation/assistant-first-2026-10-07.
- Clean locked npm installation passed; lockfile/dependency versions unchanged.
- unit-oct11.log: 524/524 Windows source tests passed, no skips/cancellations.
- hardening-oct11.log: 25/25 overlapping privacy/provider/server/clinical hardening tests.
- syntax-oct11.log: 199 source files; repository-oct11.log: 327 tracked-file policy passed.
- audit-oct11.json: zero production dependency advisories.
- ui-final-theme.log: 33 broad Edge UI checks passed, including chat/files/projects,
  provider selection, PCC, Outlook reading, companion configuration and offline voice failure.
- assistant-ui-theme.log: 20 Core/SQLite/Edge checks passed, including primary navigation,
  notes, canonical actions, meeting minutes, actual file import/collection persistence and
  theme save/reload/system changes. Dark Chat and Dashboard screenshots visually reviewed.
- hardening-ui-oct11.log: authenticated development boundary, denied privileged new RPCs,
  offline speech, Demo isolation, source-linked SBAR edits and optional PCC passed.
- messaging-ui-final.log: synthetic real DOM send requires explicit approval; background
  send is blocked; independent read/write/global override settings save correctly.
- browser-e2e-final.log: actual Edge synthetic HTTPS download/manual sign-in wait, protected
  page extraction, saved browser choice, tested recipe grant and one-time five-minute schedule
  persistence passed. This is not a live PCC account test. The first added test incorrectly
  awaited visible text inside a collapsed section; corrected to await its attached state.
- Actual Windows offline whisper inference on synthetic speech passed earlier in this same
  source workstream (local-speech-validation.json), including encrypted replay, zero provider
  calls and exact asset hashes. No real microphone or patient/staff audio was used.
- Android android-dark-final.log: build, unit tests, lint and app/test APK assembly passed.
  50 tests, 0 failures/errors/skips, including real Node Core pinned HTTPS interoperability.
  Lint: 0 errors, 73 warnings. Debug signing only; not physical-device acceptance.
- Windows packaged validation navigation was updated for the 19 remaining primary/secondary
  routes and dark appearance; its actual execution must be recorded with the new binary.

## Remaining acceptance and limits

New Windows installer/portable, actual package startup/shutdown, installed restart,
uninstall/reinstall, fresh local-model inference and exact-head CI still require this
candidate's own evidence. Preserve previous artifacts/recovery outside Git. No existing
Windows binary is represented as containing this redesign.

Physical Android microphone/Keystore/OS-authentication, notifications, LAN reconnect and
existing-signer upgrade remain unperformed. New debug APK cannot upgrade a differently
signed release. Do not wipe a phone to make an upgrade pass.

Automatic multi-speaker diarization/identity is not implemented. Existing verified profile
and attribution-review tools remain, but continuous recordings start with unknown speakers.
Accuracy, overlap and identity need human review. Transcription setup needs one initial
asset download; weights are not bundled. Core text AI needs a configured local model.

No always-on Outlook importance classifier or SMS integration was added. Users can read
approved email and explicitly track it; authorized WhatsApp notes/inquiries create existing
review items. Photos remain review evidence, not validated image interpretation. AI draft
plans do not silently become completed or assigned tasks. No live account send, real PCC
pull or clinical-data acceptance was performed.

## Continue safely

Read AGENTS.md and both current branches, fetch main before changes/publication, preserve
all work and use review PRs. This report and updated app-guide/USER_GUIDE files explain the
feature changes for the next development session. Do not transfer old binary flags, remove
security gates, infer missing clinical facts, or restore the revoked 1% stop rule.
