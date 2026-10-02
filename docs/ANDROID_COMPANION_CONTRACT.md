# Android companion desktop contract — 2026-10-02

This is the implemented desktop contract in Private AI **3.0.1-dev**, based on
GitHub main `0a7ec92fa18c52ed8983aa06803977e3a220cf02`. Android is maintained
separately. The supplied Google script's endpoint names are retained; its example
IP, shared key, model name, hardware readings and success fallback are not used.
Actual phone interoperability and the packaged Windows release still require testing.

## Desktop setup

1. Open the Windows desktop app, then **Settings → Android Companion Gateway**.
2. Choose the actual private IPv4 interface: work Wi-Fi/Ethernet, an already enabled
   Windows hotspot, or an already configured Tailscale interface. The default
   `127.0.0.1` is for testing on the PC only. The gateway never discovers its address
   by connecting to a public server, enables a hotspot, or installs a VPN.
3. Choose a free port (default **8443**) and enable/save. Private AI creates its own
   certificate locally and stores the private key in the existing encrypted vault
   database. No Python, pip, separate bridge script, administrator shell or Windows
   certificate-store modification is required. The listener uses only the selected
   address, never all adapters. There is no plain HTTP mode.
4. Select **Pair a phone**, name it, and grant text chat and optional task/alert
   status access. Transfer the one-time pairing link privately. Its key is a secret;
   do not put it in GitHub, logs, a public QR site or a support conversation.
5. Android must validate the paired certificate and the address before sending the
   key or a prompt. See the required Android changes below. An IP alone cannot pair.
6. Keep the PC awake and reachable, Private AI running and unlocked, and background
   work resumed. The gateway can remain in the tray. Locking blocks every API read
   and cancels active chat; the phone cannot unlock the PC. WhatsApp's separate
   explicitly granted lock/background permissions are unchanged.

Windows or workplace network rules may block the connection. No firewall rule is
created automatically. If needed, IT should permit the selected executable/address
and TCP port only from the approved phone/network, with the appropriate Windows
profile. Do not use a blanket all-network rule or router port-forwarding. Guest Wi-Fi
may isolate devices. Changing networks/IP or renewing an expired certificate requires
updated pairing. Disabling the gateway closes connections; revoking a phone cancels
its active request. Saved desktop chats and clinical data remain intact.

## Pairing and required Android changes

The desktop returns a **proposed** Quick Paste format; the Android parser must be
updated to support it. Existing parser behavior has not been inspected or tested:

```text
privateai://pair?host=<actual-ip>&port=<actual-port>&scheme=https&key=<random-device-key>&fingerprint=<sha256-hex>&certificate=<url-encoded-base64-der>
```

Parse as a URI with decoded query parameters. Do not navigate this URI as a webpage.
`certificate` is the public DER X.509 certificate in base64. `fingerprint` is its
SHA-256 digest as 64 lowercase hexadecimal characters, **not** an SPKI pin. Check
that they match and have the user verify the fingerprint against desktop Settings
when pairing. Use that specific certificate as an application-scoped trust anchor,
validate its validity dates, server-auth usage and IP SAN, and reject a different
certificate. Retain ordinary hostname verification. Do not install a trust-all
manager, bypass verification for self-signed certificates, or fetch the certificate
over an unauthenticated connection and silently trust it. Reject redirects/downgrades
and never forward credentials to another origin.

Store the key and trusted certificate using Android secure storage and exclude them
from backups/logs/analytics. Presets may suggest a port or network type, but must not
pretend an example IP/key belongs to the user. The desktop stores only a hash of each
256-bit random pairing key. It cannot redisplay it; revoke and pair again if lost.
Certificates last one year. Enable/save again to renew an expired certificate, then
verify the new pairing on the phone. Android developer guidance:
[Android network security configuration](https://developer.android.com/privacy-and-security/security-config).

## HTTP API

Use the saved HTTPS origin and **`X-Pair-Key: <device-key>` on every request**.
There are no unauthenticated status, task or alert endpoints. Tokens in URL queries,
browser Origin requests, arbitrary Host headers, cookies and arbitrary desktop RPC
forwarding are not supported. Responses have `Cache-Control: no-store`.

| Method/path | Permission | Response |
| --- | --- | --- |
| `GET /mobile/api/v1/status` | Any paired phone | `status: "ONLINE"`, actual `serverName`, `loadedModel` only when the desktop GGUF runtime is ready (otherwise null), `localModelState`, `processingMode`, configured `provider`, `uptime`, granted `scopes`, `protocolVersion: 1` |
| `POST /mobile/api/v1/chat/send` | `chat` | `reply`, `sessionId`, `requestId`, actual `processing: {provider, model, reason}`, `incomplete` |
| `GET /mobile/api/v1/tasks` | `tasks` | `tasks: [{id, status, created, updated}]`, `total`, `truncated`, `details` |
| `GET /mobile/api/v1/alerts` | `alerts` | `alerts: [{id, severity, status, category}]`, `total`, `truncated`, `monitoringEnabled`, `isSurveillanceComplete`, `details` |

`cpuUsage`, `gpuUsage`, `vramUsedGb` and `vramTotalGb` are **null** because this gateway
does not measure them. `activeJobs` is the actual queued/running/waiting/paused count
only with tasks permission, otherwise null. Android must display unknown values as
unavailable, never zero or invented hardware. `ONLINE` means authenticated transport
is available, not that a model is loaded. Ollama/optional provider output is identified
by the chat response; status does not claim to inspect their live model process.

Task and alert lists are capped at 100, with explicit totals/truncation. They expose
status metadata only; no resident IDs/names, report titles, output paths or document
contents. Alert IDs are opaque hashes. The alert endpoint uses production findings
and the shared PCC visibility rules; an empty list or disabled/incomplete monitoring
does **not** establish that residents are safe or a feed confirms absence. Alerts are
polled, not pushed. Approvals/actions must be reviewed on the desktop.

Chat request:

```json
{
  "prompt": "Explain this information I am supplying…",
  "sessionId": "phone-conversation-1",
  "requestId": "unique-id-for-this-send"
}
```

`sessionId` defaults to `default`; use a new one for a new conversation. Session IDs
are scoped to the paired phone and cannot select existing unrelated desktop chats.
Both IDs use 1–80 ASCII letters, digits, underscores or hyphens. Prompts must be
nonempty, at most 40,000 characters; JSON bodies are limited to 192 KiB. Chat uses
the same Core/router, privacy approval, cloud budget, local model and RAM controls
as the desktop. No separate phone AI or hardcoded Ollama/model is installed. Select
**Local Only** on the desktop for local processing; an enabled approved cloud mode
may use that provider. The gateway never claims LAN transport establishes HIPAA
compliance or zero cloud use.

Remote chat permits text questions and safe in-process commands such as `/calc`.
Desktop tool commands (Outlook/browser/resident-record commands), arbitrary file
access, attachment uploads, remote approvals and starting/cancelling report jobs
are not exposed by this endpoint. `attachmentName`/`attachmentType` may be absent
or empty; nonempty metadata returns **422**, because a filename is not file contents.
This is separate from the existing WhatsApp remote jobs interface.

Only one companion generation runs at a time, in the background resource lane.
Foreground desktop work retains priority. Use a response timeout over five minutes
(for example 330 seconds) and display a waiting state; the desktop cancels at five
minutes or on disconnect. Low-memory/background pause can delay or block work.
There is no streaming response/progress endpoint yet.

Supply a stable `requestId` for a particular send. A completed response can be replayed
without another generation while its 24-hour record is retained. Reusing an ID with
different input returns 409; an interrupted/in-flight ID returns 409 requiring
review, not an automatic retry. After that retention window a replay is not assured.
Do not automatically create new IDs after timeouts: an earlier provider request may
already have cost money. Limit polling to a reasonable interval (for example 30s);
the service allows 120 requests/minute per source address and bounded connections.

Non-2xx responses contain **`{"error":{"code":"…","message":"…"}}`**, never a
success-shaped reply. Handle 401 (pair/revoked), 403 (scope/policy), 423 (locked),
409 (busy/paused/retry review), 413 (too large), 415 (JSON required), 422 (attachment
unsupported), 429 (rate limit), and 503 (model/provider/availability failure).
Display failures honestly. Do not replace them with simulated answers or an echo
described as completed inference. A deliberately enabled simulation mode must label
every screen/output **Simulation — desktop not contacted**, and must not use PHI.

## Copy into the Android development chat

> Integrate the Android companion with the desktop contract in
> `docs/ANDROID_COMPANION_CONTRACT.md` from the reviewed Private AI desktop branch.
> Preserve the four `/mobile/api/v1` endpoint paths and X-Pair-Key authentication.
> Implement its Quick Paste URI, per-device secure credential storage, certificate
> trust/validity/IP verification, nullable status values, actual error responses,
> per-conversation session IDs and stable request IDs. Remove the static default key,
> trust-all TLS behavior, invented telemetry and successful simulated fallback.
> Clearly separate offline demo mode. Do not assume IP addresses or models from
> examples. Test against the real desktop gateway with synthetic data before PHI.

## Desktop validation and acceptance

Real Core/SQLite and loopback HTTPS regression tests verify TLS/authentication,
pairing persistence/revocation, lock/disable, context isolation, limits, failure
responses, cached retries, PCC visibility and cancellation. Desktop IPC and Edge UI
exercise save/reload/pair/revoke; development HTTP rejects every new configuration
RPC. These tests use synthetic data. Physical Android parsing/trust behavior,
LAN/hotspot/Tailscale reachability, sleep/reconnect and the packaged Windows
application/installer remain explicit acceptance steps. No firewall was modified
and no production phone was paired during development.
