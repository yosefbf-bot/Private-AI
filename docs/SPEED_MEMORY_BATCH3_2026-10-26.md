# Speed and memory Batch 3 — idle work and resource admission

Built after Batch2 source96dd90f, incorporating its acceptance correction1dc6f51.
Branch chatgpt/batch3-idle-work-20261026; version3.0.9-dev. Batch2 PR39 is
still awaiting its corrected exact-head packaged Windows acceptance.

## Changes

- Resource ownership, foreground priority and pause waits subscribe to revisioned
  notifications. Cancellation detaches immediately; only RAM pressure/recovery
  needs one shared500ms timer. Existing memory thresholds, configured reserve,
  sustained-recovery delay, browser exclusion and foreground priority remain.
- Speech admits1.5GiB before taking the AI lane, unloads idle local weights with
  actual-exit waiting, verifies speech assets, then rechecks cancellation, pause,
  priority and RAM before launching. It releases ownership before waiting again.
  This fixes a background-transcription/foreground-chat deadlock.
- Model peak samples start at request completion without delaying responses or
  cancellation. Failed samples, like successful samples, are fenced until model
  activity changes. Missing observations remain unknown and never lower reserves.
- ShareSync intake lists asynchronously and reads/parses one bounded envelope at
  a time in a short-lived worker thread. Foreign payloads never enter the main
  thread; signature, peer, expiry, payload validation and transactional claims
  remain. Closed/paused/changed workspaces are rechecked after await. Approved
  queued jobs still work while the interactive UI is locked. Core shutdown
  terminates a pending reader. Existing formats and original files are retained.

## Measured bounds and acceptance

- Waiting for ownership or an explicit pause: zero production polling timers.
- Multiple RAM waits: one shared timer; no lingering timer after cancellation.
- Five unchanged idle ticks following a failed process query: zero new queries;
  one initial attempt total. New activity permits a new observation.
-32MiB synthetic foreign envelope: main-thread heartbeat continued; returned
  result null; zero synchronous queued-body reads on the main thread. Accepted
  encrypted tasks and replay/claim recovery still execute exactly once.
- Actual Electron44 ASAR probe read the synthetic envelope from a module inside
  app.asar through a worker thread; no extra package exclusions/dependencies.
- One bounded independent read-only review found no additional confirmed issue
  in resource, speech, memory or intake changes. Local full suite:885/886 pass, no skips. The real Edge sign-in test
  hit LOW_MEMORY on this PC (1.73GiB available); isolated rerun also hit the
  unchanged guard after launch. This is recorded as failed local acceptance,
  not a pass. Exact-head hosted Windows acceptance remains required.
- Targeted resources/speech/worker31/31 and earlier tiers/stability75/75 pass.
  Hardening30/30, production audit0, guide/repository checks and Gitleaks
  current/history0 pass. Syntax276 files passes.

## Rejected optimization: Windows WhatsApp resident monitor

A bounded read-only UIA prototype was built with the official checksum-verified
portable .NET10.0.403 SDK. Native synthetic-window snapshot parity, unchanged
poll, edited-message event and teardown passed. Its idle helper working set was
58,191,872bytes (~55.5MiB), with531.25ms CPU observed after setup/test calls.
The existing one-shot reader has no resident helper between polls. This does not
establish lower aggregate RAM; the prototype is NOT shipped. Original Windows
WhatsApp runtime/helper code was restored and rebuilt. Prototype/evidence is
saved outside Git under Release/Batch3-20261026/native-monitor-prototype.
Recommend retaining the current reader until a genuinely low-footprint event
source can demonstrate a benefit. No owner WhatsApp account was accessed.

## Limits

No whole-app RAM/CPU/battery percentage, physical-phone acceptance or live PCC/
PowerBI acceptance is claimed. Owner installations/data remain untouched.
No schema, dependencies, model limits, approval/PHI policy or release gates change.
