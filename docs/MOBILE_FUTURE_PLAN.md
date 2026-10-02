# Mobile companion — implemented desktop transport and future layout

Update 2026-10-02: the user supplied the separately developed Android companion's
four endpoint paths. The desktop now has an optional, authenticated HTTPS gateway
with per-phone pairing/revocation. See [the implemented contract and Android changes](ANDROID_COMPANION_CONTRACT.md).
Android itself is maintained separately; no APK or physical-phone validation is
included here. WhatsApp remains the primary remote interface for jobs, progress,
results and ordinary questions. The broader UI/actions below remain a layout plan,
not a claim that every mobile feature is implemented.

## Proposed layout

The future companion would use a responsive interface with four bottom navigation tabs:

- **Chat:** conversation list, message history, attachments, composer, and Stop. Show whether the PC is connected and which processing mode is active.
- **Tasks:** queued/running/completed jobs, meaningful progress, results, and permitted cancellation/retry controls.
- **Files:** authorized project files, search, and generated reports with download actions.
- **Settings:** paired PC, connection state, notification preferences, and revoke/sign-out controls.

On narrow screens each tab occupies the screen. On tablets and desktops use a navigation sidebar and a detail pane. Keep the composer above the keyboard and make progress/results accessible without keeping a page open. A mode-selection prompt is unnecessary when layout follows screen width.

## Proposed operation

The companion would send authenticated requests to Private AI on the PC. The PC would retain the AI configuration, local models, credentials, project knowledge, and task execution. This is an application interface, not a streamed remote desktop. Running a separate AI model on the phone is outside this plan.

The PC must be on and reachable for PC tasks and local inference. Design an explicit offline state; do not imply that a disconnected phone can complete PC work. Any later cloud-only mode is a separate feature with its own consent, data policy, and storage design.

The desktop transport implements HTTPS, explicit interface binding, device pairing,
revocation, bounded requests and cached responses for stable request IDs. Android
must implement the documented certificate trust and error behavior, and complete
LAN/sleep/reconnect acceptance. Desktop IPC and the development server remain private.

A Windows EXE cannot run on Android or iOS. The desktop installer could eventually include the PC side of the companion and pairing instructions; the phone would use a separately delivered web interface or native app.

## WhatsApp requirements for the current release

1. Read-all defaults on after explicitly enabling and connecting the bridge. Turning it off preserves selected-conversation access.
2. Only selected, verified conversations and approved senders may start tasks. Open read/write accepts ordinary AI questions; approved-command mode requires the PC code.
3. Replies, forwarding, progress, and future attachment delivery must recheck the selected destination and disable-all-writing override at the sending boundary.
4. Preserve AI conversation context per conversation and sender. `/new` starts fresh context. Do not insert unrelated account-wide observations into model prompts automatically.
5. Keep the current Windows validation and release gates independent of this future layout plan.

