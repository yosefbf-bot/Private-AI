# Shared desktop, Android and WhatsApp workflow

Base: desktop `origin/main` c269a18eec4ea5b4e347e3520be1cd4e9bd88876 (3.0.1-dev); Android `origin/main` 7028ec6d131ffaaf9e03d2f22b3550d7a38ddf3c (1.0). Both fetched before implementation. Changes use separate review branches; the owner merges.

## Architecture found

Desktop Core/SQLite already owns chats, encrypted records, canonical todos and provider/resource policy. Executive rounds and memo parsing exist but repeated rounds edits create duplicate department tasks; parser locations and substring matching can misroute actions. Workflow action updates already enforce revisions and keep clinical closure in the source workflow. HTTPS CompanionGateway authenticates and scopes text chat/status, but cannot share selected PC histories or ingest evidence/actions. WhatsApp verifies selected conversations and senders but ordinary AI answers do not create durable actions. Reminder emission is a PC notification, not proof of remote delivery.

Android is a native Compose/Room app with useful screens, but most transport operations are simulations even when simulation is disabled. Health alone calls the desktop. Default pairing/crypto values, permissive PIN fallback, insecure backup settings and destructive Room migration need repair before transferring private notes. Existing phone records must be preserved.

## Implementation order

1. Repair Android trust, authentication, encryption, migration and real v1 transport. Keep demo samples explicitly isolated from real records.
2. Add a shared encrypted capture service on desktop. Capture provenance and bounded evidence; propose review items grounded in supplied text. Unknown owner/deadline/location stays unknown. Commit canonical todos transactionally with stable source identities. Keep Outlook/WhatsApp messages as internal drafts until the existing reviewed outgoing workflow is used.
3. Extend the narrow HTTPS protocol with optional workflow/notification scopes and explicitly selected desktop conversation grants. Preserve existing endpoints, cancellation, privacy/budget/resource gates. Remote chat excludes unrelated global memory/instructions.
4. Route explicit WhatsApp capture commands through that service. Read-all remains observation only. Approved senders and selected conversation permissions remain authoritative. Track remote reminder delivery separately from PC notification state.
5. Add desktop/phone review UI, durable phone queue and truthful connection/notification/evidence status. A photograph can be preserved as evidence without claiming that a text model interpreted it. Voice transcription remains an independent approved capability.
6. Run Core/SQLite/HTTPS, Android transport/security/migration, full desktop checks and UI checks; publish separate PRs and inspect checks on their exact heads. Report physical phone/live WhatsApp testing separately. New source changes do not inherit earlier binary release-validation flags.

## Deliberate limits

No automatic clinical conclusions, external messages, arbitrary desktop RPC/file access, global lock bypass, trust-all TLS or cloud fallback. Desktop must be awake, reachable and unlocked. PC chat sharing is an explicit grant; device actions/evidence are scoped to their origin. User-entered absolute deadlines enable reminders; ambiguous relative dates require review. No new installer is represented as validated merely because source tests pass.
