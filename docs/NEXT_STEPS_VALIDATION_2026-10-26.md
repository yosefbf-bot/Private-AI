# Remaining next-step validation and housekeeping

## Installed speed build

The owner approved the installed-app check and reported they had not used this
build yet. Installed ASAR SHA-256 matches the accepted speed payload:
`fbb135ac197271bbb6ea4a4cec3301f01056198268f657eccd0a0af7fe8095cb`.
Read-only metadata confirmed the profile/vault and three existing model files
were present. No owner records were opened/decrypted, and no record-level
pre-upgrade baseline exists, so complete historical record retention is not claimed.

Actual installed executable acceptance used its existing release-validation mode
and a new synthetic profile. It exited successfully with 18 checks, 20 views and
real local Small inference, no API key or PCC connection. Automatic selection used
Small/2048 tokens while preserving saved4096; larger tiers were declined on available
RAM. Dark Settings screenshot was reviewed for readable contrast. All19 rollback
manifest entries matched. Local owner results: `OWNER_UPDATE_RESULTS_3.0.9-speed.txt`.
No production installation/data replacement occurred. The newer clinical and
receipt source work is separate from this installed speed artifact.

## Hardening UI

The reported stale Library wording was already corrected in speed-work commit
96dd90f. The unchanged hardening UI test passes against current source and actual
Edge. Add it to the existing Windows acceptance job rather than a new job; local
execution took about seven seconds. It checks authenticated development access,
blocked production operations, local-only speech, Demo isolation, SBAR edits and
preserved advanced workflows. No assertion was removed to obtain that pass.

The native audio fixture initially failed when it attempted a second recording
immediately after hide/show while the renderer still reported hidden. The fixture
now waits for initial visible state, verifies PCM recording/saving before the hide
transition, then tests camera denial and hide revocation. All existing assertions
remain; production visibility, focus, permission and revocation rules are unchanged.
The actual Electron synthetic-device check passed after that fixture correction.
This proves recording and hide revocation, not recording after restore. Physical
microphone and restore-and-record acceptance remain separate.

## Cleanup inventory

The prior handoff referred to about3.23GB of temporary comparison folders without
absolute paths. Bounded checks of build evidence, coordination staging and relevant
temporary directories could not identify the pair. In particular the assumed
`Release/Batch6-20261026/baseline` and `candidate` paths do not exist. No deletion
candidate is verified; no cleanup bytes or deletion success are claimed.

Retain the accepted speed delivery, `Batch6-20261026/accepted-Windows.zip`, its
sanitized evidence/source inventories, and the rollback delivery. If the original
temporary folders are later located, record their resolved paths/sizes and request
the owner's approval before deletion. Do not substitute accepted release folders
for an unidentified cleanup target or work around an earlier approval rejection.

## Physical phone

Companion documentation includes a synthetic-data owner checklist covering in-place
signed update, LAN/VPN reconnect, lock/unlock, camera/microphone, generic locked
notifications, offline drafts and recording-to-desktop transcription. It is prepared
only; no physical-phone pass is claimed. Hosted emulator and HTTPS evidence remain
distinct from owner-device/account acceptance.
