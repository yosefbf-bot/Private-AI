# Remote commands in 2.1.0

The optional Messaging bridge is now implemented as an experimental Windows/Web adapter. See [HYBRID_UPGRADE.md](HYBRID_UPGRADE.md) for setup, permission checks, privacy warnings, and remaining limits.

Only new messages from approved stable sender IDs in the verified group, beginning with the configured prefix and this PC's command code, are accepted. Ordinary conversation and previously visible messages are ignored. Polling consumes no AI tokens. Local commands stay local; reasoning follows the selected processing mode and cloud permissions.

Completion/failure and optional started notices return through the WhatsApp Web connection. Response text needs a separate permission. Windows-app intake requires stable accessibility identifiers; native-only sending and attachments are not implemented. Documents stay in the approved report folder. Uncertain delivery disables the bridge without retrying.

This is a UI-based integration, not the official WhatsApp Business API. Live account pairing/delivery, platform eligibility, and the organization's approval of the channel remain to be checked. A group title alone never authorizes a task. The app does not claim that disappearing messages or encryption establish HIPAA suitability.

Outlook message/calendar reading and reviewed drafts remain available in Apps. Monitoring emails to yourself as a remote-command channel is not included in this hybrid release.
