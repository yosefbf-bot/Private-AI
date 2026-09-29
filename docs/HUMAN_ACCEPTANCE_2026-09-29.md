# Human acceptance and protected-data remediation

This is a test plan, not evidence of completed human acceptance. Use the artifact hashes and actual results in `WINDOWS_RELEASE_VALIDATION_2026-09-28.md`. No representative de-identified PCC folder was supplied or identified in the repository. Do not put reports, audio, credentials or application data in Git.

## HUMAN ACTION REQUIRED — installed-data acceptance

Use a spare Windows account/VM for clean install and uninstall/reinstall. Windows Sandbox is unavailable on the validation PC. Never run destructive recovery against the only copy of `%LOCALAPPDATA%\PrivateAI2`.

1. Record installer SHA256, Windows version, account and installation path. Close Private AI, including tray/worker instances. Have the administrator create an access-restricted backup of the **entire** PrivateAI2 directory, including `vault.dpapi`, the database, WAL/SHM if present and sessions. Separately preserve ShareSync workspace/settings and model paths. Keep this backup outside Git and cloud sharing unless approved. Verify the backup is readable by that same Windows account. A database-only backup is insufficient if the vault is lost.
2. On the spare account, run the installer interactively. Verify shortcuts, installer destination, launch, explicit Demo toggle, empty production residents, loopback-only inference and graceful quit. Record any SmartScreen/signature notice; these validation artifacts are unsigned.
3. For the existing-account upgrade, use a protected test copy under the same Windows account first. Record pre/post counts and reviewed samples for chats, projects, files, settings, provider configuration, credentials (use without revealing), encrypted clinical records, workflows, schedules, ShareSync and model locations. Check that vault hash does not change. Do not reinitialize a missing/unreadable vault.
4. Test backup and restore in a second isolated directory, restart, unlock and inspect the synthetic records. Then repeat only with an administrator-approved protected copy of the existing installation. Preserve the original throughout. The current Backup button creates database snapshots, not a complete portable vault-recovery package; recovery to another Windows account requires a separately designed/approved key migration.
5. Test lock/unlock, tray worker startup/stop, quit, application restart, Windows restart, and uninstall/reinstall on the spare account. `deleteAppDataOnUninstall` is false; verify actual persistent data survives. Retain screenshots and results outside Git. Do not replace the real installation merely to run this checklist.

## HUMAN ACTION REQUIRED — representative PCC acceptance

Have a clinical reviewer supply approved, de-identified structural examples and expected results. Use a separate test workspace and record anonymized case IDs only in the evidence report. For each case record: source file hash, exact report type, source date, mapping ID/revision, accepted/rejected row counts, import/batch/evaluation IDs, rule version, expected observation, actual observation, reviewer/date and pass/fail.

| Cases | Required observations |
| --- | --- |
| Census, medication profile and order changes | Exact report identification; required columns; no guessed order date/dose/frequency; rename/file-hash duplicate and semantic duplicate detection. |
| Saved mapping and revision | Reviewed preview binds to mapping revision; renamed/added/missing columns fail clearly; changed previews cannot import silently. |
| Diagnoses, behaviors, progress notes, GDR, psychiatry, pharmacist review | Missing documentation says it is absent from imported evidence; no claim it does not exist in PCC. Confirm the evidence required by each implemented rule. |
| Antipsychotics, new meds, PRN, dose changes | Compare reviewer expectations to AP/PRN/MED-NEW rule outputs, source dates, unknown fields and immutable evidence. Clinical judgment remains human. |
| Falls, infection/antibiotics, weight, wounds, transfers/readmission, labs/vitals | First inventory supported parsers/rules in the current source. Verify imported records/provenance; do not call import-only data a validated alert rule. Record unsupported coverage explicitly. |
| Omitted feeds, stale dates and empty later reports | No all-clear from incomplete evidence; unresolved critical findings persist; existing alert history remains available. |
| Rejected rows/parser failure | Accepted/rejected preview matches reviewed input; failure rolls back records while preserving failed-batch evidence. |
| Demo, Production, export and retention | No cross-workspace records; exports labeled; evidence retained for unresolved alerts; only reviewed clinical closure resolves findings. |

Synthetic source regression tests cover these technical contracts where implemented. They do not establish clinical sensitivity, specificity, regulatory compliance or representative PCC compatibility.

## HUMAN ACTION REQUIRED — real speakers and microphone

Use two consenting known speakers plus one held-out unknown speaker, with no resident information in spoken content. Keep enrollment local. Do not retain raw audio in Git or use browser transcription in HIPAA/Local Only.

1. Enumerate microphones. Test allow, deny and revoke permission; navigate away, cancel, lock and return during capture. Confirm recording stops and no stale capture becomes enrollment.
2. Enroll at least three independent, human-confirmed samples for each known speaker. Use separate held-out phrases for testing; do not test with the enrollment audio itself.
3. Test quiet/normal/louder speech, different distance, moderate background noise, overlap, ambiguity and the unknown speaker. Record case ID, true speaker, proposed speaker or abstention, confirmed attribution, false match and failure reason. Leave raw recordings ephemeral unless separately approved.
4. Delete a profile/sample and ensure it is not used for future matching. Old unqualified samples must remain inspectable but excluded from matching. Confirm a similarity threshold never appears as calibrated accuracy and no suggestion automatically verifies identity or assigns task ownership.
5. Report counts: attempted trials, false matches, correct suggestions, correct abstentions, same-speaker abstentions and capture failures. Do not report an accuracy percentage without a defined representative protocol and sufficient independent samples.

### Local embedding architecture assessment

The existing measured signature and conservative abstention remain enabled. A learned local embedding is a plausible improvement, but improvement on this PC has **not** been measured. [SpeechBrain's ECAPA model](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb) declares Apache-2.0 and provides speaker embeddings. [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/index.html) documents Windows support and [speaker identification](https://k2-fsa.github.io/sherpa/onnx/speaker-identification/index.html), making a bounded local helper a candidate for evaluation. Model weights and datasets need their own license review; a runtime license is not blanket approval for every model.

Recommended experiment: pin model/runtime hashes and licenses; run CPU inference in a memory-limited local helper with ephemeral audio; store only encrypted, versioned embeddings; compare held-out speakers/noise against the existing implementation. Keep three confirmed enrollments, a calibrated rejection threshold, competing-profile margin, human confirmation and manual attribution. No replacement until measured false-match/abstention results justify it. Offline transcription and continuous diarization are separate, unimplemented acceptance tracks.

## HUMAN ACTION REQUIRED — historical repository exposure

Read-only history inspection found these sensitive paths: `app-data/privateai.db`, `app-data/privateai.db-wal`, `app-data/privateai.db-shm`, `app-data/vault.key`. Introduction is reachable at `59f0b78f173503594e4004c8791872ab3ac5474c`; database modifications also occur at `1b07548718b01376244d0daa73d3f29606cbb635`, WAL at `3369c489fc05761f78d0c2168caacf023fa39c73`; removal was `571c317f47a57a5c293bbd40ff6729939ce6dfd7`. Contents were not printed or decrypted. Whether the historical encrypted records contain live credentials/PHI requires an authorized forensic review. Treat any credentials protected by an exposed key as potentially compromised.

All four fetched remote branch tips (main, backup-9-28-26, chatgpt/3.0.1-hardening and the validation branch) passed the runtime-path inventory on 2026-09-29. This does not remove historical objects, forks, clones or cached PR artifacts.

The subsequent reachable-object scan inspected 525 non-vendor text blobs of at most 2 MiB and found two additional historical paths, `app-data/test.db-shm` and `app-data/test.db-wal` (history includes `fcdeba02920822fe85a3ebf680556092bd466a1a`, `f6e36badd9484dd63f79c86e47f4c7523731dcb1` and merge `2c7a63e8474fe2b19c4ec7bd24ba7e8b17d3d28f`). Three credential-shaped strings also matched historical `tests/providers.test.cjs`, blob `d53cf0da1ed1a9dfc9e2cbecc7c8682bf89c0c53`; related changes are `4fe1e73db2e106f6de602e1d4ad0a784f6b717ea` and `431dd0964abfdd422fe30c3a22265af390ba1d06`. Their validity was not tested, and their contents were not displayed. An authorized owner must determine whether they were real credentials. The scan is bounded pattern detection, not a forensic guarantee; it does not decrypt historical databases or inspect external clones.

Safe work performed: path/commit inventory, current-tip policy check, stronger exclusions for database journals, model files and recordings. No history rewrite, branch deletion, credential rotation, active-vault access or re-encryption occurred.

Administrator approval required: identify affected providers/accounts privately; revoke/rotate exposed credentials; select a maintenance window; secure rollback backups; coordinate all collaborators; decide whether to invalidate affected installations and migrate active encryption material. Test any vault migration against disposable copies first, including interruption and wrong-account rollback. Do not invent a replacement key over an existing encrypted database.

Prepared history-cleanup procedure (NOT executed): create a fresh mirror clone in a dedicated directory, inventory and securely preserve original refs, then run `git filter-repo --path app-data/ --invert-paths`. Inspect all rewritten refs and rescan; get explicit approval before force-pushing named branches/tags. Coordinate re-cloning and GitHub cached-object removal. Do not blindly force-push a mirror, delete unrelated refs or assume history cleanup revokes leaked credentials.

## Legacy-data review

No legacy data was silently removed. Before live use, a reviewer must inventory old seeded residents/sample clinical records, acoustic profiles, pre-evidence-version-2 SBARs, mirrored provider credentials and old drafts/transcripts in an approved copy. Preserve original IDs, reason for classification, reviewer, date and proposed disposition. Old SBARs remain inspectable but cannot be signed off as current verified evidence; invalid/old acoustic samples are filtered from matching; browser draft/transcript migration removes the plaintext copy only after encrypted persistence succeeds. Seeded resident detection is not reliable from a name alone: require provenance/manual review, exclude confirmed synthetic material from production conclusions, and perform cleanup only after approval with an audit record.

## Remaining account/UI acceptance

Real Bitwarden unlock/autofill, native companion connection in each installed browser, Brave/Vivaldi, Outlook account operations and live provider approvals require the account owner. Use autofill without reading passwords. Do not send messages while testing. Review full keyboard/focus behavior, Back/Forward expectations, long content, window sizes and permissions with the final packaged artifact. Automated navigation and synthetic UI tests are partial coverage, not full accessibility or human acceptance.
