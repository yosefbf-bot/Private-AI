# Four-phase reliability and companion update

## Verified baseline and scope

Desktop main: `c2815043f6f065a2de0e4ff5ddad03df3bd0c9db`, 3.0.3-dev.
Android main: `cdf64d1214927237bb49bb24cb23a3b69a12eb0a`, 1.1-dev/code 2.
Both were fetched before work; both checkouts were clean. Development uses
`chatgpt/four-phase-reliability-2026-10-13` in each repository. The owner merges main.
The existing installation, data, models, pairings and signing identity are retained.

This implements the owner's four-phase master document and companion addendum.
The addendum is part of the same plan, not a second implementation of its features.
No new release or installation is authorized by this progress checkpoint.

## Improvements to the supplied steps

1. Separate adoption decisions from actual function/test status. The four direct
   integrations are accepted in the existing 3.0.3 Windows report. The six projects
   guide improvements to existing modules; our preceding comparison proposed
   changes and did not implement those proposals. Package absence is not a defect.
2. Put the reproduced Outlook calendar contract and retained staffing CSV defects
   in Phase 1. Missing staffing information must stay unknown, including downstream
   calculations. Fix the actual contracts rather than add Graph or DuckDB.
3. Inspect Android authentication, immutable pending-request privacy and Keystore
   lifetime in Phase 1. Auto-prompt lifecycle prerequisites may be fixed there;
   coordinated QR/session/privacy changes and physical acceptance remain Phase 4.
4. Specify one foreground session policy before adding 20-minute/Off choices.
   Never make UI labels outlive cryptographic authorization. Any required migration
   must retain old ciphertext/keys and have demonstrated recovery before use.
5. Keep QR bootstrap separate from enduring device credentials: short-lived,
   atomically consumed grant, certificate pin authenticated before secret exchange,
   owner-approved scopes, revocation and older-client/manual compatibility.
6. Treat notification delivery as source-linked administrative events, with
   acknowledgment distinct from clinical resolution. Preserve metadata-only locked
   polling, existing task records and one Dashboard.
7. Qualify battery labels unless device measurements support numeric estimates.
   Foreground polling and WorkManager notifications are separate controls.
8. Audit coverage and run tests proportional to actual changes at each checkpoint;
   run complete suites at phase boundaries. Preserve prior passing and failed
   evidence; do not repeat unchanged installer/model acceptance without a reason.

## Execution plan and current status

| Phase | Work | Status |
|---|---|---|
| 1 | Architecture/security/lifecycle audit, confirmed reliability fixes, resource/cancellation and truthful capability review | Source checkpoint validated locally; hosted/device/release acceptance pending |
| 2 | Ten-row adoption/function evidence matrix; validate four integrations and improve existing reference-inspired paths | Local source checkpoint passed; new exact-head native build/CI pending |
| 3 | Permissioned correspondence triage, scoped search, freshness, shared notification/recovery workflows | Pending |
| 4 | Companion auto-unlock, session/privacy/battery controls, QR bootstrap, interoperability and release acceptance | Auto-prompt/privacy/polling prerequisites implemented; QR and longer sessions pending |

Phase 1 work is divided between desktop core/storage/worker/provider review,
Android lifecycle authentication, companion privacy/synchronization/TLS review,
and the two confirmed desktop fixes. No known critical regression may be ignored
at a phase boundary. Optional unavailable account/device capabilities are recorded
as unperformed acceptance rather than fabricated passing tests.

## Existing adoption/function inventory

| # | Reference | Adoption in current baseline | Actual function/evidence |
|---|---|---|---|
| 1 | sqlite-vec | Direct dependency | Local scoped Library meaning search; accepted Windows evidence |
| 2 | Tesseract.js | Direct dependency | English photo/scanned PDF OCR; accepted Windows evidence |
| 3 | Sherpa-ONNX | Reference; no new package | Offline Whisper and reviewed experimental profiles exist; real diarization absent |
| 4 | Chokidar | Reference; no new package | Single-file polling exists; settled/folder intake improvements pending |
| 5 | DuckDB | Reference; no new package | Existing CSV import/metrics corrected for quoting, missing data and qualified cost estimates; replacement matcher still requires review |
| 6 | Microsoft Graph | Reference; no new package | Existing Classic Outlook calendar contract corrected; live account acceptance and optional Graph deferred |
| 7 | MCP | Reference; no new package | Existing browser tool lock/cancellation/grant boundaries strengthened and tested |
| 8 | Readability | Direct dependency | Explicit filtered article capture; accepted Edge evidence |
| 9 | Presidio | Reference; no new package | Provider/export safeguards exist; content redaction reviewer absent |
| 10 | Gitleaks | Developer/CI integration | Redacted current/history scans; accepted exact-head checks |

## Evidence and release boundaries

Baseline desktop: 552 automated tests, 25 explicit hardening checks, 208 syntax
checks and real Windows installation/portable/OCR/search/Small inference acceptance
are in `OFFLINE_TOOLS_WINDOWS_VALIDATION_2026-10-13.md`. These are historical
evidence for the unchanged accepted binary, not validation of new changes.
Android baseline evidence and physical-phone limits are in its own handoff/report.

New source tests, commits, reproduced failures, migration/security findings and
phase completion will be appended here at meaningful checkpoints. No tests for
the new four-phase source are claimed at this initial planning checkpoint.
Live Outlook/WhatsApp/PCC sending, production data changes, installation replacement,
signer changes, unsafe migration and main merging require the applicable explicit
authorization. Ordinary development and synthetic validation are already authorized.

## Resume

Complete the Phase 1 reviews and reproduced fixes, test their actual saved/output
behavior and inspect both diffs. Then run the broader regression/security checks,
record exact results and make a tested Phase 1 checkpoint. Do not start duplicate
systems or mark the remaining phases complete from a successful build.


## Validated Phase 1 checkpoint — October 13 night

### Changes and observable behavior

- Outlook calendar formatting consumes the helper's actual events/truncated
  envelope, supports legacy arrays and rejects malformed data instead of reporting
  an empty calendar. The reminder interval stops when Core closes.
- Worker claiming and the encrypted waiting recovery record now share an atomic
  transaction. Failure of initial status publication does not lose a claimed job;
  interruption/restart retains its recovery record without duplicate execution.
- Browser launch, navigation, route and action boundaries recheck cancellation,
  lock, generation and scheduled grant. Lock closes the worker. A late launch or
  locator result cannot continue after authority is revoked.
- The shared CSV parser handles quoted commas, multiline fields and apostrophes.
  Staffing imports require names/actual hours and reject inconsistent/nonfinite
  values without partial writes. Missing optional fields remain unknown, zeros
  remain zero, and exact aliases avoid treating EmployeeID as a name or total
  hours as overtime. Analysis qualifies coverage and imported period; it no
  longer invents rates, monthly savings, workweeks or next-shift forecasts.
  Planning equivalents use 40 hours consistently. Replacement matching is a
  separate remaining review: it still contains default hours/rates assumptions.
- Voice playback no longer offers barge-in while recognition is stopped.
- Android automatic OS prompting, always-on protected-app capture protection,
  persisted additional processing preference and restartable privacy-bound polling
  are detailed in its companion checkpoint. No vault key or signer migration.

### Tests actually run

- Complete desktop suite: **577 passed, zero failures/skips**, 22.07 seconds.
- Explicit hardening: **25 passed**. Syntax: 212 files; repository policy: 357
  tracked files. Production dependency audit: zero vulnerabilities.
- Gitleaks 8.30.1: current source and Git history scans each found zero secrets.
- Actual Edge general UI and hardening UI checks both passed, including offline
  speech boundaries, one Dashboard, optional PCC and Demo isolation.
- Android full unit run: 64 pass plus one unavailable external fixture; subsequent
  fresh real synthetic desktop pinned-HTTPS interoperability: one pass/zero skips.
  Combined case coverage: **65 passed** across the two retained runs.
- Android lint: zero errors/42 warnings. App/test APKs built; final instrumented
  test compilation and unchanged-signer verification passed. Device execution
  remains **not performed**; compiled tests are not device acceptance.

Ignored desktop evidence is in `Validation/four-phase-worker-temp/` (desktop logs)
and `Validation/four-phase-2026-10-13/` (Android receipt/XML and interop logs).
Earlier failures are preserved: sandbox denied loopback; using TEMP inside Git
correctly triggered the dev-server source/data boundary and polluted the scanner's
Git-less fixture. Full tests passed using ordinary system TEMP outside Git with
approved local loopback access. Android's polling test required a queued test
scheduler to avoid a test-only unconfined timer join race; assertions remain.

### Remaining work / safe resume

The four-phase upgrade is approximately **20–25% complete by planning estimate**,
not a claim of release acceptance. Phase 1 source fixes are validated locally;
hosted exact-head checks and changed-APK device acceptance remain pending.
Phases 2 and 3 are pending. Phase 4 prerequisites above are implemented; QR,
longer sessions and physical device/release acceptance are pending. Existing four
adopted projects remain complete in the accepted 3.0.3 baseline. Improvements
inspired by the other six are partial, not six new finished integrations.

Do not expose 20/30-minute/Off unlocking until a backward-compatible, recovery-tested
cryptographic session design exists: the current vault key has fixed 300-second
OS authorization. Implement one-time QR bootstrap only after certificate pin
validation and atomic scoped-token exchange, preserving older manual pairing.
Prioritize these security constraints, folder intake/settling, replacement-matcher
truthfulness, correspondence/search workflow and real device acceptance next.

Both review branches preserve source locally. Publication status must be checked
on resume; do not assume commits/PRs or hosted checks exist until recorded.
Installed 3.0.3, owner data/models/pairings and Android signing identity are unchanged.
No fresh installer, release, main merge or production-data operation occurred.
One-time automation `resume-private-ai-four-phases-once` resumes this thread
October 14, 2026 at 3:25 a.m. America/New_York. Stop after the 1% summary.
On resume fetch both mains, inspect branches/status and this tracker, reconcile
upstream changes, finish Phase 1 review publication/acceptance, then continue 2–4.


## October 14 Phase 2 source checkpoint

Read `FOUR_PHASE_LIBRARY_AUDIT_2026-10-14.md` for the grouped 4+6 matrix.
Existing single-file watchers now require two stable nonmissing observations;
slow writes reset the wait, deletion never runs, encrypted state survives restart,
and editing/workspace changes baseline safely. UI/help explicitly says selected
attachments are the analysis input; this is not folder auto-import.
Replacement comparisons preserve unknown inputs and require explicit reviewed
compensation rules; $310 mixed regular/OT example is checked through desktop IPC
and real authenticated HTTP. Voice HUD no longer claims barge-in while speaking.
Native Outlook helper now returns allDay, avoiding all-day false conflict warnings.

595 full tests, zero failures/skips; 25 targeted watcher/Worker, 56 focused
matcher/production, 14 actual transport and independent 49/58 boundary batches
passed (overlap full suite). Edge general/hardening UI passed. Current/history
Gitleaks zero. No dependency/schema/phone production changes. Native .NET SDK is
unavailable locally; exact-new-head CI helper build and release acceptance pending.
Both older desktopPhase1 CI runs passed every job. Android's old cancellation test
failure was IME Back handling, not a second prompt; corrected test/source guide
published as13694876 onPR3, fresh hosted device acceptance pending.

Next phase uses existing records/permissions for unified search, source freshness,
administrative notices and correspondence review. Keep canonical tasks/clinical
closure, one Dashboard, source links, no global plaintext index or cloud dependency.
Do not grant unattended Outlook focus-affecting access merely to enable triage;
classify authorized cached messages and offer reviewed foreground checks first.
Full four-phase completion/release/production installation is not claimed.
