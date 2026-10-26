# Speed and memory Batch 2 — startup and renderer

Base main: `41d487cae731054d0912611b16a84d3a3655319b`.
Branch: `chatgpt/batch2-startup-renderer-20261026`. Version: 3.0.9-dev.
The owner requested all remaining batches in order, a brief summary after each,
and GitHub publication after verification. Installed owner applications and data
are untouched. This batch changes desktop and shared Chrome/Firefox UI assets;
the Android protocol and companion application are unchanged.

## Changes and measured scope

| Area | Before → after | Preserved behavior |
| --- | --- | --- |
| Startup ACL | Two PowerShell processes → one protection plus persisted-descriptor verification process | Full raw ACE/numeric trustee/inheritance/rights checks before vault access; separate verification remains available for recovery and sign-in |
| Initial renderer static module graph | 799,149 bytes / 32 modules → 235,297 bytes / 15 modules on this Windows working tree | Deferred feature instances retained; route/lock cancellation and detached route containers prevent delayed rendering over a different page |
| Welcome/sidebar display images | 3,502,602 source-image bytes → 115,181 display-image bytes | Original local artwork retained as fallback; this reduces initial asset transfer/decoding, not installed package size |
| Meeting list | Decrypted complete meeting/transcript records → encrypted metadata projection | Full selected meeting and canonical task state still read through meetingGet; legacy full-list consumers unchanged |
| 2,000-entry transcript fixture | 2,000 hidden DOM rows → zero collapsed, first 100 expanded | Show more retains access to every entry; source data is not shortened |
| 10,000-chat sidebar fixture | 10,000 initial buttons → 100 | Search covers all records, pagination reflects offscreen rename/deletion, unchanged rows remain mounted |
| Worker status | Broad summary every 30 seconds → narrow status only while visible | Unsaved Worker settings remain mounted; hidden event bursts make zero refresh RPCs, visibility restoration refreshes promptly |
| Dashboard/Automation | Event bursts trigger repeated broad refreshes or leave stale outcomes → coalesced visible refresh | Editing/review dialogs defer updates, including responses already in flight; canonical revisions remain required |
| Extension streaming | Replaces/reparses whole conversation on each delta → active answer only | Sanitization, formatting, copy actions and reading position retained; regenerated Firefox assets match |

These are measured bytes, process-launch counts and synthetic operation/DOM counts.
No whole-application RAM, battery, CPU percentage or first-paint timing improvement
has been established. Browser RAM floors, brain selection, context/output limits,
clinical evidence, data retention and security approvals are unchanged.
The completed Markdown cache already met the 4 MiB target and was retained,
not duplicated. There are no new dependencies or lockfile changes.

## Compatibility and review

The meeting projection marker advances to version 2; canonical schema-3 records
and existing record metadata layouts remain readable by older applications.
Existing old-writer SQL invalidation rebuilds disposable projections as needed.
Meeting recording controls are no longer remounted for notes or follow-up edits.
Pending-audio failures leave a usable page for retry; finalization still checks
the authoritative audio state. Navigation, lock and explicit stop still stop
capture. New notes typed while a previous submission waits are not cleared.

Worker snapshot is wired through desktop IPC and authenticated development HTTP,
with normal lock checks and no browser-extension permission. Automatic status
reads do not extend the inactivity lock; actual pointer/keyboard activity does.

One bounded independent read-only review identified inactivity-lock renewal,
failed-finish generation invalidation, in-flight Dashboard review loss and stale
offscreen pagination. Each was corrected and covered by IPC or real-browser
regressions. No additional review loop was run.

## Verification

- Focused regression tests were observed failing before the startup/meeting/lazy
  changes, then passing. Final targeted startup/rendering set: 31/31.
- Actual Windows ACL grant, inheritance, junction and retained-byte fixtures pass.
- Authenticated development HTTP and clinical navigation regressions: 6/6.
- Hardening: 30/30. Production dependency audit: zero vulnerabilities. Guides match.
- Real Edge UI: 41 general checks; assistant workflows, 10,000-chat bounds,
  2,000-entry transcript paging, simulated local capture lifecycle, pending-audio
  recovery, hidden Worker refresh, retained settings, delayed Dashboard reviews,
  both themes and contrast checks pass. Physical microphone capture is not tested.
- Edge and Chrome synthetic report download/sign-in wait, protected capture,
  browser choice, exact tested grant, schedule and five-minute spacing pass.
  A pre-existing ambiguous schedule-details test selector was made exact without
  changing application behavior or removing any assertion.
- First full suite: 870/874; the four reported failures represented two stale
  eager-import assertions and their parent suites. Both assertions now verify
  deferred imports; focused rerun: 16/16. Final full suite: 874/874, no skips. Syntax274, repository446, Gitleaks
  current/history0. Exact-head hosted package acceptance follows in the review PR.

Actual owner-account PCC/Power BI use, physical-phone acceptance and the owner's
installed build are not established by these synthetic/source checks. The full
Windows installer/app/inference/retained-data/portable release gates remain
required for the new immutable candidate before merge.
