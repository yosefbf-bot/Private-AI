> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Security boundary and deployment review

Reviewed 2026-09-10. This is HIPAA-oriented software, not a compliance certification or legal conclusion. Organization authorization and a documented risk assessment remain necessary. It is not a fully offline AI model.

| Layer | Implemented behavior | Organization responsibility / limit |
| --- | --- | --- |
| Device | Standard-user Windows app; no elevation in normal install | Supported patched Windows, BitLocker, Windows lock, managed identities, endpoint controls, incident response, secure disposal |
| Private storage | DPAPI-wrapped master key; AES-256-GCM records and metadata; private directory DACL restricted to user SID and SYSTEM; SQLite WAL, full sync, migrations | Same-user malware or administrators can act as the user; DPAPI is not protection against a compromised logged-in session |
| Retention | 90-day default, memory expiry, temporary-chat lifecycle, app-owned backup cleanup | Logical deletion is not forensic secure erasure; storage snapshots, paging, crash dumps, OS backups and sync version history require independent controls |
| Audit | Allowlisted event metadata and HMAC-chained integrity; no prompts, bodies, filenames, tokens, or keys in audit details | Not tamper-proof. Whole-database rollback or tail removal cannot be detected without an external trusted anchor. Export/store compliance evidence under organization policy |
| Browser | MV3, activeTab only, manual extraction, native messaging; no API key, global website permissions, content script, telemetry, or automatic reads | Managed Chrome must permit this extension/host; other extensions and the browser's own controls are outside this app |
| Local transport | Exact extension-origin allowlist; encrypted authenticated Windows named-pipe protocol; native operation allowlist excludes settings/secrets/app access | No product TCP/HTTP listener or LAN API. Windows named pipes still depend on Windows/SMB/firewall controls; this is not a claim that Windows networking is disabled |
| Provider transport | Fixed OpenAI HTTPS origin, normal certificate verification, no redirect following, dedicated nonpersistent API session | Corporate proxy/trust configuration and approved OpenAI account. No certificate validation bypass or local root certificate installation |
| Provider retention | Foreground Responses requests with `store:false`; no hosted files/vector stores/conversations or provider background mode; web-search tool blocked in HIPAA mode | `store:false` does not establish a BAA, MAM, or ZDR. Your administrator must verify the approved model/endpoint and current account/project settings and exceptions |
| Other PCs | Distinct local identity/keypair per PC; signed encrypted handoffs addressed to one Worker; local persistent single-use claims | Keep private databases and keys off shared folders. Do not clone a running identity or restore old queue/claim snapshots as a second live worker. Same API project quotas are still shared |
| ShareSync | Generic unique report filenames, safe relative paths, separate output/queue folders, encrypted handoff payloads | Final reports are ordinary plaintext document files at the application layer. Approved ShareSync BAA/configuration, ACLs, encryption, devices, access revocation and independent retention are required |
| Apps/folders | Independent user-selected grants; on-request reads; preview before chat; explicit write confirmation; no programmatic sending | Third-party app/account suitability must be separately approved. UI Automation varies by version. Writable-field providers may have app-specific side effects; use synthetic tests first |

## Provider details

OpenAI's current documentation describes separately configured Modified Abuse Monitoring and Zero Data Retention, model/endpoint limitations, safety exceptions, image handling exceptions, and application-state behavior. This app's HIPAA setting cannot inspect your contract or remotely enforce those administrative settings. It disables all provider web search in HIPAA mode; it does not attempt the documented cache-only exception. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and your executed agreements. No API key was supplied for live account validation during this build.

## Local application safeguards

The renderer has sandboxing, context isolation, no Node integration, an exact trusted IPC sender check, restrictive CSP, and blocked remote renderer networking. Answer Markdown is sanitized and remote images are removed. Untrusted document/webpage text is marked as reference material, not instructions. The model has no app, folder, shell, or computer-control tools to execute a reference's malicious instructions.

Document extraction/export runs in a short-lived separate process with a memory ceiling and timeout; no key or vault handle is passed to it. Process isolation limits crashes, but is not a complete least-privilege OS sandbox: the utility process still runs under the Windows user's rights. Import only authorized documents. No macros, formulas, remote embedded images, or email attachments are executed. Office/PDF software used later to open exports is a separate security boundary.

Production Electron fuses disable RunAsNode, NODE_OPTIONS, Node CLI inspection, and loading the application from outside its ASAR. ASAR is packaging, not authenticated code signing. This build is unsigned and does not claim verified update authenticity or embedded-ASAR integrity enforcement. No automatic application updater is included. The optional model download verifies a pinned checksum. IT should sign and approve reviewed releases for broader deployment.

No cleartext application temp files are used for chat or imported content. DPAPI, memory, local file parsing, OS paging, Windows crash reports, other apps, and third-party sync retain their own behavior. An app lock hides interactive content but is not a separate cryptographic logoff; authorized background jobs may continue. Workstation protections remain essential.

Granting an Outlook/UI Automation read can make the selected local source visible to Private AI. It is not sent to OpenAI until the user explicitly uses it in chat and sends. Visible UI Automation text is best effort, not a guarantee that every provider's accessibility tree perfectly matches pixels. Permissions are checked again after asynchronous reads so locking/revoking prevents returning content. Write timeouts cannot guarantee the target app did nothing; inspect it before retrying. Version checks on local TXT/MD edits are optimistic, not a distributed ShareSync lock.

## Primary implementation references

- [Windows DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) and [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Microsoft Outlook automation](https://learn.microsoft.com/en-us/office/vba/outlook/concepts/getting-started/automating-outlook-from-other-office-applications)
- [Windows UI Automation overview](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-overview)

These references describe platform capabilities, not validation or endorsement of this package.

## 2.1.0 additions

See HYBRID_UPGRADE.md for the extended boundary: authenticated loopback inference, optional automated WhatsApp replies, explicit background access, private browser profiles, and usage retention. The earlier manual Apps preview restrictions remain; approved Messaging commands are a separate opt-in execution channel. Browser report recipes and messaging do not grant the Chrome Companion automatic page access.

