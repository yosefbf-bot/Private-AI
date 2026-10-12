# Assistant-first simplification

Base: GitHub main `40566c94acd38577fc03f0456d647f9619ebcb64`, which includes all audit fixes through `2e4bd14`. New review branch: `chatgpt/assistant-first-workflows-2026-10-07`. Existing package acceptance remains a separate unfinished task; old binary flags cannot validate this redesign.

The owner explicitly requested a major interface teardown. Keep the data, analytical engines, permissions, clinical review boundaries, migrations and encrypted stores. Replace competing everyday dashboards with one Dashboard, and make chat the default. Primary destinations: Dashboard, Notes, Meetings and Library. Worker becomes secondary Automation configuration. Remove standalone huddle/brief, handoff, interdisciplinary-action, protocol and playbook/budget navigation. Existing clinical alert review must remain reachable and unresolved critical alerts must not disappear. Preserve budget enforcement even though its standalone page is removed.

Implementation:

1. Consolidate navigation, header/status noise and task review into one dashboard of actual follow-ups, reminders and alerts. Put advanced tools in secondary controls; no empty EHR-dependent cards.
2. Make note capture one text field plus optional evidence. Hide manual fields behind Details. Use the existing idempotent encrypted capture/task path across PC, WhatsApp and Android; retain exact source links and unknown fields. Improve optional AI planning without inventing completed work or silently sending messages.
3. Add a facility-policy collection to the existing project/file library, with real upload/link/search and source references, without claiming a policy was approved merely because it was uploaded.
4. Provide a focused Meetings workflow reusing stored meetings, minutes, canonical follow-ups and verified voice profiles. Add genuine offline transcription with a pinned whisper.cpp Windows CPU runtime and model, optional download/setup, bounded microphone chunks, encrypted retained audio, ephemeral protected working files, cancellation and no cloud speech fallback. Recording requires explicit user initiation and ends on stop/navigation/lock. Speaker suggestions remain unverified until confirmed; no claim of medical or identity accuracy.
5. Simplify companion capture/navigation consistently while preserving pairing, encrypted pending work and notification-only background credentials. Do not introduce simulated production capabilities.
6. Test real Core/SQLite, both RPC authorization paths, persistence/replay/review, microphone cancellation, local transcription on synthetic audio, current browser UI and companion build/tests. Update guides/status/PRs. New Windows and Android packages require their own actual artifact acceptance.

Internet is needed only to acquire optional transcription assets. Once installed, meeting audio stays on the PC. No live account sends or real patient audio are needed for implementation tests. Mail/WhatsApp permissions and clinical resolution remain separate from operational follow-up completion.

## Additional owner request — 2026-10-08

Preserve optional PCC report workflows and add explicit unattended authorization for a previously tested, unchanged report recipe. Existing generic browser approval remains unchanged. Add daily/weekly/monthly browser-report schedules to the same Automation list and run history. Serialize pulls, persist a minimum configurable gap (owner-selected default five minutes), and stop on login, changed workflows, disabled PCC, lock, pause or errors. No stealth/anti-detection measures or automatic retries. Use a headless dedicated profile only for approved scheduled pulls; require manual login/MFA. Website-specific setup and actual PCC account acceptance remain required. Keep Outlook/WhatsApp send/delete approval independent.
