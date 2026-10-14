# Local companion pairing — Phase 4 source changes

The existing HTTPS gateway now has an additional, local QR bootstrap. Existing
per-device keys, selected chat grants, workflow scopes, encrypted records,
notification-only access and legacy manual links are preserved. This source
checkpoint does not replace an installed application or establish physical-phone
acceptance.

## Owner setup

1. In desktop Settings → Android Companion Gateway, enable the actual approved
   private LAN/VPN interface and save. The PC must be awake and reachable. The
   app does not add firewall rules, set up a VPN or expose all network adapters.
2. Choose Pair a phone with QR, name it, grant only needed permissions and select
   any PC histories to share. Workflow/notifications remain optional.
3. In the unlocked companion, choose Settings → Desktop connection → Scan desktop QR. Camera
   permission is requested on that action. Manual invitation paste is available
   when a camera is unavailable. Keep either form private.
4. Wait for an authenticated connection. Scanning alone never means Connected.
   Close cancels unused invitations; Regenerate creates another short-lived
   invitation with the same reviewed grants. Closing a completed wizard does not
   revoke the phone. Use Paired phones → Revoke to remove durable access.

If an exchange response is lost after the PC creates a device, automatic replay
is forbidden. Inspect Paired phones, revoke the incomplete device and create a
new invitation. Existing pairing configuration stays intact on a failed phone
replacement. Never paste either link into a website, support chat or GitHub.

## Additive wire contract

`privateai://pair/v2` has exactly `version=2`, `host`, `port`, `fingerprint`, `id`,
`token` and `expires`. `expires` is invitation epoch milliseconds. The payload
contains no permanent key, certificate blob, PHI or remotely chosen permissions.

The only invitation-authenticated route is POST
`/mobile/api/v1/pair/exchange`, with JSON `{version:2,id,token}`. Existing Host,
Origin and address binding apply before a stricter preauthentication throttle
and 2 KiB body limit. Every ordinary route retains device-key authentication.
The normal API remains protocol version 1; bootstrap version 2 is separate.

The PC holds only token hashes in bounded RAM. Invitations last three minutes
using a monotonic deadline. Lock, cancel, stop/reconfigure, certificate replacement
and restart invalidate pending invitations. After bounded body parsing, the
gateway rechecks owner unlock, generation, certificate, selected-chat eligibility
and device capacity. A synchronous encrypted Store transaction commits the device
before invitation consumption, without an intervening await. Commit failure
does not consume the invitation. Concurrent exchanges issue at most one device.

The response includes `version`, durable device `id`, `name`, `key`, optional
independent `notificationKey`, `baseUrl`, public DER `certificate`, `fingerprint`,
certificate `expires` as the existing date string, and approved grants. Full-key
authenticated GET `/status` confirms the owner-visible connection receipt.
Notification-only polling cannot confirm pairing or retrieve confidential data.

Android checks certificate fingerprint, validity, non-CA/server purpose and IP
identity during TLS verification before transmitting the token. Redirects and
automatic connection retries are disabled. Captured DER then passes the existing
full-certificate validator and ordinary pinned client. Actual authenticated status
and current unlock/config epochs are required before encrypted configuration save.
No bootstrap secret is stored in Room, an outbox, saved UI state or logs.

Legacy `privateai://pair?...` has an empty path and retains its certificate-bearing
manual parser. Its device credential is reusable until revoked; being displayed
once does not make that credential single-use. Older paired clients are retained.

## Reused components and limits

- [Nayuki QR-Code-generator](https://github.com/nayuki/QR-Code-generator), MIT,
  v1.8.0 commit `720f62bddb7226106071d4728c292cb1df519ceb`: locally vendored
  algorithm, original TypeScript/license header and source/module hashes retained.
  Compiled once with integrity-verified TypeScript 5.9.3, then wrapped as an ES
  module. No new desktop runtime package or remote QR service.
- [ZXing core](https://github.com/zxing/zxing/releases/tag/zxing-3.5.4), Apache 2.0,
  3.5.4 commit `f651b0a0375676e47144f73397dddff8868b0e4c`, with existing CameraX
  1.5.0 version aliases: on-device QR decoding. Camera analysis follows
  [CameraX lifecycle guidance](https://developer.android.com/media/camera/camerax/analyze).
  Images are closed and camera/analyzer/executor released on exit boundaries.

Five-minute session age uses monotonic time and the existing nonexportable
300-second authorization-bound key. Ten/twenty/thirty-minute and Off choices are
unavailable with an explanation. No existing key is rotated and no ciphertext is
migrated. Enabling longer sessions requires explicit approval, an additive key
design, recovery testing and genuine long-duration encrypted operations.

## Acceptance scope

Actual Node HTTPS/SQLite tests cover replay, concurrency, expiry, lock after body
await, certificate/generation/grant/capacity changes, restart, real COMMIT rollback,
outer-transaction rejection and response-loss recovery. Native IPC reaches the
same gateway; development HTTP denies its privileged configuration operations.
Actual Edge exercises QR rendering/regeneration, exchange, scoped denial,
authenticated success, secret DOM cleanup, Done and explicit revocation.

A synthetic Edge-rendered QR is shared with the Android decoder tests. This
establishes encoder/decoder compatibility, not a physical camera scan. Current
source suite/build/lint and hosted device results must be recorded separately
when completed. Real phone camera/microphone/OEM background behavior, Wi-Fi/VPN,
PC sleep/reboot, account access and signed existing-phone upgrade remain explicit
device/account acceptance gates. No such result is inferred from compilation.
