# Shared desktop, Android and WhatsApp update

## What changed

This is an addition to the latest GitHub architecture, not a replacement of the
clinical app. Desktop **3.0.1-dev** starts from main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`;
Android **1.1-dev** starts from main `7028ec6d131ffaaf9e03d2f22b3550d7a38ddf3c`.
Both use `chatgpt/shared-companion-workflows-2026-10-05` for owner review.
Review [desktop PR #13](https://github.com/yosefbf-bot/Private-AI-OG-google-version/pull/13)
and [Android PR #1](https://github.com/yosefbf-bot/AI-Mobile-companion-app/pull/1)
together. Android published source is `56e6796926b02e109df8ccbfe4fa70013ce5852c`;
the APK is bound to its unchanged production input digest in the validation report.

The PC, paired Android phone and approved WhatsApp conversations now feed one
encrypted notes/rounds service. Original observations and bounded evidence are
retained. Source-grounded text rules propose canonical Action Center review
items, follow-up deadlines and internal Outlook/WhatsApp drafts. Missing owners,
locations, dates and clinical facts remain unknown. A picture is preserved for
review; this update does not implement image interpretation. Operational completion
requires a note and does not resolve a clinical alert.

Phone users can create new chats and read/continue PC chats explicitly granted
to their device. Other PC conversations and unrelated global context are excluded.
The phone uses desktop AI, including local-only/HIPAA request requirements;
those requirements do not weaken desktop provider, permission, budget or resource
rules. General notes/action review can operate without an AI model.

WhatsApp commands `/note`, `/round`, `/remind`, `/draft outlook` and `/draft whatsapp`
create the same source-linked records, with approved captioned incoming evidence.
Normal questions remain AI chat; `/new` starts fresh. Read-all remains independent
of selected writing/task permissions. Disable-all-writing blocks delivery and
pauses commands under the existing policy. Due reminders return to the approved
source conversation only with current sender, task, writing, background and lock
permissions. Uncertain delivery remains for review rather than blind replay.

## Security and behavior changes

Full Android access now needs real OS authentication and Keystore encryption.
The former application PIN/fixed-key shortcuts and simulated real-mode responses
are removed. Existing phone data is preserved through additive migrations;
historical demo caches stay labeled unverified. Production/demo stores are separate.
Pairing verifies HTTPS certificate/address/fingerprint, uses revocable device keys
and does not expose general desktop RPC or automatically open the firewall.

Saved phone requests use stable IDs, immutable privacy and per-device destination
bindings. Lock/background/Stop invalidates current network work, including later
evidence chunks; unlocking again cannot authorize an old request. Foreground chat
generation cancels when the phone locks. Saved notes can be retried/reviewed after
unlock; no asynchronous background AI-job service is represented as implemented.

Optional generic phone reminder notifications use a separate restricted key.
Checks normally occur at least 15 minutes apart, subject to battery/OS delays.
No Internet-validated network is required for a reachable private LAN. A separate
desktop opt-in permits generic reminder metadata while its app is locked; full
chat/evidence access remains locked. This is polling, not immediate push or clinical
emergency paging. The PC must be awake and reachable.

Rounds edits no longer duplicate linked delegations or invent urgency-based
4-hour/24-hour deadlines. Follow-up edits preserve explicitly disabled reminders;
an undated action's first confirmed deadline enables a reminder. Invalid dates
are rejected. Saved AutoReminders configuration now actually controls emission.
An internal approval is no longer reported as an external message dispatch.

The phone dashboard now describes cached counts/status rather than claiming an
all-clear or live desktop execution. Recent activity uses saved report-task rows
instead of hard-coded completed surveillance/report claims. Unsupported quick
actions point users to PC review; missing source coverage remains unknown.

## Files by function

- Desktop capture/automation: `source/capture-workflows.cjs`, Core, workflow and
  executive engines, messaging bridge and WhatsApp adapter; encrypted source,
  evidence, canonical actions, exact revisions, retention and due receipts.
- Desktop API/UI: CompanionGateway, production IPC and restricted dev adapter,
  Notes and rounds/Action Center, pairing scopes/chat grants, app help and guides.
- Android transport/workflow: paired TLS adapter, shared models, repository/outbox,
  ViewModel, chat, notes, files, settings and on-device dictation.
- Android protected storage: OS-auth/Keystore, encrypted config/records, Room
  migrations/schema, picker/lock lifecycle, restricted notification store/worker,
  backup exclusions and signing-compatible application identity.
- Validation/handoff: actual Core/SQLite/HTTPS and UI tests, Android crypto/Room/
  network regressions, official Gradle wrapper, GitHub emulator workflow and guides.

## Validation scope

The isolated final Windows source suite passed **500/500**, no failures/skips.
Focused safety, production IPC/development HTTP, 30 synthetic general Edge checks
and three bounded captures UI checks passed. Syntax checked 183 files, repository
policy passed and production dependency audit found zero vulnerabilities. A
parallel Gradle/full-suite attempt hit normal LOW_MEMORY protections; the isolated
rerun passed without weakening those gates.

The final Android debug app/test APK build passed, as did 45 unit tests with zero
failures/errors/skips, including real desktop pinned-HTTPS interoperability.
Lint passed with zero errors and 72 warnings; the actual app signature verified.
Source input digest, artifact hashes and detailed scope are recorded in its
`docs/ANDROID_VALIDATION_PROGRESS.md`. Physical phone, real private LAN, OS device
upgrade, live accounts and clinical acceptance are distinct from these results.
No real WhatsApp or Outlook message was sent. Exact-head GitHub checks must be
read for each final commit: an earlier successful run does not validate a later head.
The desktop head `2354815` run `37359845980` was cancelled before any steps because
GitHub reported no hosted runner acquired; this is not an executed test pass.

No new Windows installer/package was built in this update. The earlier actually
tested Windows installer/inference belongs to code `bc964e09`, not these sources.
A new official build must prepare genuine helper/model-runtime inputs and repeat
hash-bound packaged-app/installer evidence on that binary. Do not copy old true
execution flags into a new release report. Debug Android signing does not establish
an upgrade over a different existing signer; preserve its data/release key.

## How to continue in ChatGPT Work

Give the next task both repository links and this instruction:

> Continue Private AI from the latest GitHub main in both repositories. Fetch and
> verify main, active branch, worktree and versions first. Read AGENTS.md,
> AI_HANDOFF.md, desktop PROJECT_STATUS.json/guardrails and the companion contract.
> Preserve or integrate the unmerged chatgpt/shared-companion-workflows-2026-10-05
> work before editing; do not replace newer source with an exported snapshot.
> Preserve the source-linked capture/Action Center engine, selected chat sharing,
> independent WhatsApp read/write controls, restricted reminder credentials,
> OS-auth/Keystore migrations and provider/privacy/resource/security gates.
> Keep PCC and cloud optional, retain general clinical capabilities, and keep
> missing clinical data unknown. Use a new chatgpt/* branch and review PR; I merge
> main. Report actual end-to-end checks and remaining phone/live-account/new-binary
> acceptance. For an official installer build, validate the actual new Windows
> app/installer/local models and bind the report to its exact hashes.

Source ZIPs are snapshots for transfer/reference. The repositories and handoffs
are the authoritative feature/validation history. For use, follow
`docs/NOTES_ROUNDS_COMPANION_GUIDE.md`, `docs/INTEGRATED_STANDALONE_GUIDE.md` and the
Android `docs/SHARED_DESKTOP_WORKFLOWS.md`.
