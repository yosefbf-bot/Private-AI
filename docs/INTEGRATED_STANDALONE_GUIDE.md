# Standalone clinical use and optional connections

This supplement describes the **3.0.1-dev** source and its optional connections.
The Windows candidate validated on **2026-10-02** belongs to code checkpoint
`bc964e09c28e996178196661bfccdcef6d3fac41`. Its application, installer and local-model
checks passed for the exact binaries in [that historical report](WINDOWS_VALIDATION_2026-10-02.md).
The current shared companion features require a matching newly built installer or
portable package and new dated, artifact-specific acceptance evidence. A version
label alone does not establish that a package contains these changes. Windows
builds remain unsigned; human clinical, live-account/phone and representative
existing-data upgrade acceptance remain separate.

## First use on this PC or a new PC

1. Install the candidate that matches the source features you need. Verify its code
   checkpoint and installer hash against its dated candidate report; the
   `PrivateAI-Setup-3.0.1-dev-x64.exe` filename alone is not enough. A GitHub merge
   does not update an installed application. Windows may show an unsigned-app notice.
2. Open **AI Processing**, choose **Local Only**, and select/configure a local model.
   The installer includes the inference runtime, but does not include GGUF weights
   or copy the acceptance tests' model settings into your live profile. Existing
   downloaded models can be selected; a new PC needs a model download or an approved
   local model file before model-based inference works offline.
3. Start with **Small**. The tested PC had about 5.9–6.5 GiB available during model
   checks; High worked in those conditions but still depends on current RAM and
   workload. Prefer Small or Medium if other programs reduce available memory.
   Extra 8B was not installed or tested. Keep the resource protections enabled.
4. Use **Projects & Documents**, **Clinical imports**, **Operations & Meetings** and
   the built-in guide as needed. Missing data remains unavailable/unknown. Today
   now shows unmeasured census/occupancy/HPPD plainly in neutral styling; confirmed
   zero remains a recorded zero.
5. Configure **Messaging** only when ready to connect your WhatsApp account and
   choose exactly which conversations may receive replies. No live WhatsApp account
   was connected by the acceptance tests.

The portable ZIP contains the complete Windows program and needs the same model
configuration. The October 2 ZIP passed extracted-app acceptance for the historical
`bc964e09` payload only. A ZIP containing the current changes needs its own matching
hashes and extracted-app acceptance. It is not a mobile app; Windows-protected data
is not a portable vault that can be copied freely between Windows accounts or PCs.

## Use Private AI without cloud or PCC

The application, saved chats/projects, clinical rules, built-in references,
deterministic tools and document/import functions start without an API key or PCC.
Choose **AI Processing** to configure a local GGUF model; use **Local Only** to
prohibit cloud processing. A configured loopback Ollama provider also works locally.
Models/runtime must already be installed for offline inference. Downloads require
Internet access. RAM and CPU limits still apply.

Local First/Smart Hybrid can escalate only when the selected provider is configured
and permitted. Cloud First falls back to local text when the provider is unavailable
before any answer is received. It does not combine local output with a partially
streamed cloud answer or bypass authentication/privacy refusal. Changing an active
provider's credentials cancels pending requests. A local draft still needs review.
Local image/web requests are explicitly rejected when unsupported.

The **Local Assistant** provider retains its built-in reference/template helper.
It is labeled as a template/reference response, not model inference or measured
clinical accuracy. Configure a GGUF model or Ollama for model-based reasoning.

## General clinical imports

Open **Clinical imports**. Supply mapped CSV or JSON reports, review their source
date, column mapping and operator identity, then validate/import. The same existing
parsers, normalized clinical records, rule engine, provenance and alert-review
workflow serve both generic and PCC imports. PDF/DOCX/XLSX document analysis remains
available through Files/chat; structured clinical ingestion still requires reviewed
conversion/mapping. This change does not claim arbitrary PDFs are automatically
converted into verified resident records.

Missing diagnosis/medication/behavior information remains unknown. Imported evidence
can be stale or incomplete; absence from an import does not establish clinical
absence. Quality-measure estimates remain unavailable when required inputs are
missing. Clinical findings and drafts require independent review.

## Optional PointClickCare

Use **Settings → Integrations → PointClickCare**. Fresh installations start not
connected. Enable manual imports/feed monitoring only when using PCC exports.
Existing installations with legacy PCC import records keep manual-import capability
through a one-time metadata migration. Existing explicit disabled settings win.

With PCC off, its import entry, feed panels and source-monitoring warnings disappear
from routine views. Its importer, sync and scheduled-sync operations are blocked.
General clinical analysis, previously imported records and clinical findings stay
available. Historical PCC feed alerts are retained, not silently resolved or deleted.
Re-enable manual mode to restore the PCC views and monitoring of supplied PCC reports.
Generic imports do not satisfy PCC's expected-feed contract.

No live PCC synchronization is supplied. API, SFTP, relay or file-drop synchronization
can be added at `source/snf/sources/pcc.cjs` through the centralized integration
service, feeding the same normalized importer and rules. Disabling an active adapter
invalidates late results. Demo configuration/data remain isolated from production.

## WhatsApp remote questions and alerts

Connect and explicitly enable the dedicated WhatsApp bridge in **Messaging**.
Read-all defaults on; turning it off does not change selected conversations' access.
Writing requires a verified selected conversation/group and approved senders.
Open read/write accepts ordinary questions; command-only mode requires the PC code.
**Disable all writing** overrides replies, progress, forwarding and report-job alerts.

The new **Notify when report jobs finish or fail** option is off by default. When
enabled, permitted background replies send only a short task ID and completion or
failure state to the selected default destination. No resident name, report title,
path, document content or clinical finding is included. The complete/failure switches,
app lock, background permission and writing override still apply. Duplicate events
are suppressed; uncertain delivery is not automatically retried.

Private AI, the PC and WhatsApp connection must be running/reachable. Offline local
AI does not make WhatsApp work offline. Account-wide observations are not automatically
added to AI prompts. Live account acceptance remains separate from synthetic tests.

## Android companion

Use matching updated desktop and Android builds. On the PC, open **Settings →
Android Companion Gateway**, select your actual private network interface,
enable/save HTTPS, then choose **Pair a phone**. Grant text chat and any optional
task/alert metadata, notes/evidence workflow or reminder-notification scopes you
want. Select existing PC conversations the phone may read and continue; unrelated
PC histories remain excluded. You can change that selection or revoke the phone.

Transfer the one-time pairing link privately into Android Settings using **Quick
Paste**, and compare its certificate fingerprint with the PC. The implemented
Android client verifies the paired certificate, address and validity dates before
sending the key or a request; an IP alone cannot pair. Full phone records and
configuration require Android OS screen-lock/biometric authentication and Keystore
encryption. Normal desktop chat/evidence access requires Private AI running and
unlocked, background work resumed, and the PC awake and reachable. No firewall rule
is opened automatically. WhatsApp permissions are independent.

The companion uses the PC's AI configuration, rather than a separate phone model.
Local Only keeps generation local; other requests follow approved desktop provider
and privacy settings. Android Clinical privacy requests require local processing
and HIPAA mode without cloud fallback. With no model available, notes and follow-ups
still work, while inference reports its actual unavailable state.

The implemented workflow supports phone notes/rounds, JPEG/PNG/PDF/plain-text
evidence up to **5 MiB**, assignment/deadline review, follow-up completion, and
internal Outlook/WhatsApp drafts. Photos remain evidence for human review; the
local text model does not interpret them. Completing an administrative follow-up
does not resolve a clinical alert. Drafts remain internal until reviewed and used
through the desktop's existing permissions; the phone cannot send correspondence,
approve clinical actions or run arbitrary desktop commands. Task/clinical-alert
access shares metadata rather than resident details.

Optional generic due-reminder notices use a separate restricted notification-only
key. Android background checks normally occur at least **15 minutes** apart and
can be delayed by permission, battery or OS scheduling. A separate desktop pairing
opt-in permits generic reminder metadata while the desktop app is locked; full
chat/workflow access stays blocked. The restricted key cannot read notes, chats or
evidence or run AI, and revoking the phone revokes both keys. These notices are
follow-up aids, not emergency paging.

See the [notes, rounds and companion guide](NOTES_ROUNDS_COMPANION_GUIDE.md) and
[connection contract](ANDROID_COMPANION_CONTRACT.md). Physical phone, LAN,
camera/dictation and notification-delivery acceptance remain separate from source
tests and hosted emulator checks. This guide does not claim those checks or a new
Windows package have passed.
