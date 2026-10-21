# Protected report sign-in — 3.0.9-dev candidate

Base: `452800210a33e34b1d18a648d1288562d9061d56`, fetched clean from main.
This is an additive report feature. Browser sessions, clinical rules, providers,
phone pairing, existing vault/database and model settings are preserved.

## Owner setup and recovery

In More → Browser tasks, configure the exact report workflow and optional
automatic sign-in instructions. Instructions contain only URLs, selectors and
operations. The saved workflow has separate username/password fields which are
cleared before the save RPC and never restored as a draft or returned by a read
API. Enter credentials once on each Windows PC. A native confirmation identifies
the approved login destinations and explains the Windows-user trust boundary.

Open the report browser and sign out once, then use **Test saved sign-in and
download**. Only an actual password submission followed by the ready control
establishes credential proof. A cached session cannot verify a replacement
password. A complete manual report download is also required before approval.
Credential or workflow changes revoke the proof and grant.

After testing, allow unattended report pulls. **Allow this exact report to be
retrieved while Windows or Private AI is locked** is a separate, default-off
scope displayed in the native confirmation. Existing approvals do not acquire
that permission. The PC must remain awake, Private AI running, and background
work enabled. Sleep/crash recovery keeps its existing review/pause safeguards.
The feature cannot wake a powered-off PC or bypass Windows sign-in after reboot.

Failures show sign-in/report stage, step number, expected control and an
allowlisted error code. They do not establish that a password is incorrect.
**Open page to help** reopens the configured report page, without retaining a
session URL. **Walk through report** explicitly approves a visible run that can
leave its failed page open. No automatic screenshot, page contents, raw exception
or transient URL is saved. Close the browser when finished. App lock closes a
visible troubleshooting context.

Complete MFA/CAPTCHA manually. If credentials changed, save their replacement;
if the website changed, edit its selectors. Test again, approve again, and
re-enable paused schedules in Automation. Any scheduled failure revokes the
recipe grant and disables its linked schedules, so multiple schedules cannot
repeatedly submit the same failing credentials. Pull spacing remains five
minutes by default, unrelated to detection avoidance or defeating site controls.

## Security and architecture

- Existing Electron `safeStorage` / Windows DPAPI encrypts a separate private
  `report-signins/<recipe-id>.dpapi` file. The inherited private directory ACL
  is verified before use. Recipe ID, normalized recipe hash and random
  credential revision are inside the encrypted payload. Copying a file to a
  different workflow or using it after an edit fails closed.
- No new dependency or general password-manager import was added. The free
  [keytar project](https://github.com/atom/node-keytar) is archived; the existing
  [Electron protection](https://www.electronjs.org/docs/latest/api/safe-storage)
  fits the current app. It protects data at rest under the Windows account;
  other programs/malware running as that user are outside this isolation.
- Only the trusted desktop IPC can save/remove credentials, with native
  confirmation on save. Development HTTP, native browser extension and companion
  APIs have no credential read/write operation. Neither AI nor the clipboard
  participates in sign-in. Password-manager/browser setup remains owner-operated.
- Protected sign-in uses Chromium with extensions disabled and service workers
  blocked. WebSocket connections are closed. Each secret-bearing control must be
  unique, visible, enabled, at the exact approved HTTPS top-page path, and part
  of an approved native POST form. Password fields must actually be password
  inputs; new-password/OTP fields are not password targets.
- Request-time method/destination checks enforce declared POST actions and stop
  submit handlers rewriting the form to GET. Secret-bearing URLs are blocked.
  `route.fetch(maxRedirects: 0)` prevents browser-managed POST forwarding.
  Approved top-level 301/302/303 responses become separately checked GET
  navigations; 307/308 POST forwarding, unapproved or non-navigation redirects
  fail closed. This also applies to report navigation/download redirects.
- This is guarded HTTP/POST/redirect/WebSocket behavior, not a sandbox for
  arbitrary website code or every browser transport. Only trust the actual
  report/login sites. The approved site necessarily receives the credentials.
  No Playwright tracing/HAR/debug output is enabled; DEBUG/PWDEBUG blocks broker
  use rather than risking value-bearing debug logs.
- A scheduled worker receives an opaque lease tied to an immutable recipe,
  current grant, dispatch schedule snapshot and live request. It rechecks
  cancellation/revocation after asynchronous boundaries. A once-only schedule's
  own dispatch transition remains valid; subsequent edits revoke the lease.
  Core lock, chat, phone, messaging and provider gates are unchanged.
- Optional analysis is persisted separately after retrieval and waits for an
  unlocked tick. Failure remains needs-review, based on the actual analysis job
  result. Download success is independent of analysis success. Interrupted
  analysis is not automatically resubmitted.
- Database backups and exports contain no credential file. Re-enter credentials
  when restoring onto another PC. App uninstall/upgrade retains private data;
  Remove saved credentials deletes that workflow's file and revokes approval.

## Verification and limits

Targeted source/Core/encrypted SQLite and actual desktop IPC checks pass.
Independent security review found and prompted fixes to request/redirect
handling, analysis completion reporting and truncated approval scope. The second
source review reports no remaining material findings at its recorded hashes.

Actual Windows tests use only isolated synthetic data. Real Electron/DPAPI and
Edge exercise a POST login, explicit redirects, menu/download redirects,
credential-file retention through process restart, approved locked retrieval,
and deferred analysis. An actual form submit-handler GET rewrite must be blocked
before any synthetic username/password reaches its unexpected endpoint. Only
the ephemeral loopback HTTPS fixture uses its self-signed test certificate;
production website TLS validation remains unchanged. No owner password/vault,
cookie export, account login or production data was inspected.

Current full-suite, UI, exact-head GitHub, installer/package and owner installation
results belong in PROJECT_STATUS and the next acceptance receipt, not inferred
from these narrower tests. This candidate is not a claim of live PCC/Power BI,
federated SSO, device-compliance, physical phone or production HIPAA acceptance.
MFA, CAPTCHA, changed websites and organization policies can still require help.
