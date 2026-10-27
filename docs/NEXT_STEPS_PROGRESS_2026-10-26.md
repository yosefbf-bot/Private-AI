# Next steps after the six speed/memory batches

Owner authorized all six tasks in `CODEX_NEXT_STEPS_2026-10-26.md` on October 26.
Initial fetched desktop main: `74283cb03ccac2cb454497ce4f68ffe191108ff6`;
companion: `ed388c0e1f03f78a2f8eaaf1fff46f9b76bd80f8` (both clean).
Task 1 branch: `chatgpt/clinical-safety-20261026` in the existing isolated desktop
efficiency worktree. Preserve the shared node_modules junction; do not run npm ci there.

## Order and acceptance

1. Clinical safety: reproductions, minimal fixes, independent review, full local
   gates, real Electron capture, exact-head PR checks before merging.
2. Whole-app measurements: re-audit isolated harness; compare frozen 80f4352 and
   74283cb three times sequentially. Preserve raw evidence locally; publish only
   sanitized medians and honest limitations, never owner data/registry values.
3. Browser memory: measure five actual headless report runs. Lower a profile's
   budget only with evidence and margin. Owner-present pressure test needs an
   answer to the pending question; otherwise record that part unperformed.
4. Installed health: read-only hashes/metadata/rollback inventory first. Installed
   ASAR already matches fbb135ac197271bbb6ea4a4cec3301f01056198268f657eccd0a0af7fe8095cb.
   Owner did install the speed build; older handoff's installation status is stale.
   Installed-profile interaction needs the plan's current approval/presence.
5. Companion request receipts, proven-unused dependencies, owner phone checklist;
   preserve pairing, signing and encrypted privacy requirements. No direct API mode.
6. Repair hardening UI regression; inventory comparison folders and ask before
   deletion. Earlier automatic deletion denial must not be worked around.

## Task 1 local verification

- Nine Core/SQLite regressions reproduced, then passed: Demo commands, stale
  meeting saves/finalization, normalized incidents, recipient/actor attribution,
  reference protocol verification. Initial six-failure test commit: 9cfcc44.
- Seven real Edge clinical UI scenarios passed (eight reported
  tests including parent): Review search recovery, copy/reference safeguards,
  late Operations/import rendering, and late alert actions after lock.
- Shipped entry-point IPC tests exercise audio intent and revocation. Real
  Electron with a synthetic audio device permits armed audio, denies unarmed
  capture/camera, and ends tracks on hide. No physical microphone acceptance claim.
- Independent review found dirty sign-off after rerender, loss of occurrence-time
  precision, missing handoff detail/coverage, and copied SBAR uncertainty. Fixed
  each with targeted regressions. Removed standalone views remain out of navigation.
- General Edge UI 42 checks; assistant 25 + notes/drafts 14, contrast 117 and dark
  visibility 7; Edge and Chrome synthetic report flows passed. Native capture
  saved PCM, denied camera/unarmed requests and stopped on hide. Physical audio
  remains untested. Final full suite 937/937, no failures/skips.
- Hardening 30/30; syntax 294 files; repository 471 tracked files; guide check
  passed; production dependencies and current/history secret scans zero findings.
  PR44 head6a4a54c passed all8 required jobs and merged as8260541; main checks passed.

Architecture corrections to the proposed plan: current stored Review severity
is `medium` (rules convert `review`); filtering supports both without rewriting
history. Fall/wound/transfer/lab rule codes listed in the proposal do not exist;
handoff uses normalized imported source records and preserves historical alerts.
Meeting edits use a content revision covering every writer rather than relying
on all existing services to increment a new numeric revision field.

No dependency/version/schema changes and no installed app or owner data edits.

## Tasks 2–6 checkpoint

- Task2 audited harness and frozen builds prepared; process-policy approval and
  UAC approval obtained, but Windows consent remains pending. No whole-app timing
  or RAM percentage is claimed. See WHOLE_APP_MEASUREMENT_2026-10.md.
- Task3 five real headless Edge report runs measured. A lower candidate failed the
  repeated1GiB pressure abort boundary, so all lower-budget changes were reverted.
  Keep1.5GiB. See HEADLESS_REPORT_MEMORY_2026-10-26.md.
- Task4 installed speed payload/rollback verified; actual installed GUI18checks,
  20views and realSmall inference passed in a fresh synthetic profile. Owner data
  unchanged. See NEXT_STEPS_VALIDATION_2026-10-26.md and local owner results.
- Task5 companion PR18 preserves encrypted receipts and removes proven-unused SDKs;
  desktop provides additive optional history IDs. No new schema/dependency or scope.
  Independent review passed; hosted Android acceptance/APK size remain pending.
- Task6 current hardening UI already passes; now included in the existing Windows
  job. Referenced cleanup pair could not be located; no unverified files deleted.

Remaining desktop evidence/checks are grouped with the receipt-contract PR to
avoid separate identical full CI runs. Do not merge either runtime change until
its exact-head gate passes. Installed build and physical phone acceptance remain
separate from current-source GitHub acceptance.
