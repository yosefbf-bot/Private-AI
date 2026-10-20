# Windows assistant-first acceptance — October 12, 2026

The actual Windows **3.0.1-dev** installer and portable payload passed acceptance on frozen source **6e915aafee2ee8cd94870f1c521e7b1788d77085**, based on main **40566c94acd38577fc03f0456d647f9619ebcb64**. Later documentation commits are supplemental and do not rebuild these hashes. This is an unsigned development candidate, not a blanket production-readiness or HIPAA certification claim.

## What changed

The assistant-first redesign, one Dashboard, offline meetings, phone-to-PC recording, independent messaging permissions with explicit send approval, five-minute report spacing and both-app appearance controls are described in [the feature checkpoint](ASSISTANT_FIRST_PROGRESS_2026-10-08.md) and [the user guide](USER_GUIDE.md). Clinical engines/data remain available. The final correction makes dark Settings warning/paragraph text readable.

The previous installer test rejected an empty PowerShell 5.1 ExitCode even though the actual installed app exited 0 and passed its checks. Reproduction confirmed redirected Start-Process/WaitForExit can lose the exit code unless its process handle is retained. The validator now retains both process handles and records applicationExitCode. A regression executes the shipped capture/wait/guard statements against real Windows processes returning 0 and 7; a nonzero exit still fails. No gate was relaxed. The failed earlier candidate evidence remains preserved locally.

## Actual results

- 525 Windows source tests passed; zero failed, skipped or cancelled. The 25 hardening tests overlap the full suite. Syntax: 199 files; repository policy: 327 tracked files. No dependency/lockfile change; the prior zero-production-advisory audit and this head's successful dependency CI remain applicable.
- 22 focused real Core/SQLite/Edge checks passed, including notes, meetings, facility policies and saved appearance. Dark Settings warning/paragraph text meets the test's 4.5:1 contrast threshold. Earlier unchanged broad UI (33), actual browser-report retrieval, messaging approval and development-boundary checks remain recorded separately.
- Actual Windows package: 15 acceptance checks, 19 views and 12 built-in diagnostics, including real Windows DPAPI, encrypted SQLite, same-account backup/restore, helper/ACL/pipe, DOCX/XLSX/PDF, lock and optional PCC. No fabricated production residents/speakers.
- Real Small Qwen 1.7B inference through packaged renderer/IPC/Core/router with no API key and PCC off preserved synthetic unavailable medication data as unknown. Medium/High were not repeated; their older October 2 evidence is historical only.
- Genuine NSIS clean installation and installed application both exited 0. Installed EXE/ASAR hashes match the frozen package.
- Actual uninstall retained synthetic standard-location database/vault bytes, removed registration/shortcuts/installation, and restored the fixture. Same-hash reinstall exited 0. A second installed process verified persisted shared notes, evidence, internal drafts, selected chats and canonical follow-ups.
- Portable ZIP CRC and all 583 file hashes passed; 415 structural PE inputs were validated. The actual extracted EXE passed 14 checks, 19 views and 12 diagnostics with exit 0.
- The unchanged hash-bound release evidence gate passed using these actual app/installer/inference reports and fresh TAP output.

[The sanitized machine summary](windows-validation-2026-10-12.json) records exact hashes. Full synthetic execution evidence is ignored under Validation/3.0.1-dev/2026-10-12-assistant-first. Genuine native inputs came from hash-verified CI artifact 11459974453/run 37568590549; native source is unchanged. Final packaged source bytes were checked against the frozen checkout.

## Data and delivery

The owner authorized replacing unused old application/data. The old data was moved intact to a recovery directory outside Git; models were retained. Only isolated synthetic data was used for acceptance. The installed PC application now contains this candidate. Clean install/retention is not representative legacy clinical-data migration acceptance.

Local delivery: Deliverables/Assistant-First-2026-10-12 contains the installer, portable ZIP, guides, source snapshots and checksums. Models/speech weights are not bundled. Configure a local model; optional speech needs its pinned local assets. The portable program still uses Windows-account-protected application data: copying it does not make the DPAPI vault portable to another account/PC.

## Remaining release conditions

The owner explicitly authorized merging both reviewed mains after completion and deleting superseded branches, preserving unique work. Do not merge a known failing head. Desktop code CI regression/dependencies passed and Windows release inputs built/validated, but artifact upload is blocked by GitHub storage quota. Artifact cleanup is awaiting explicit authorization. Android hosted UI/device acceptance is under investigation; local 50-test/build/lint and actual HTTPS results do not replace it.

Physical phone/LAN/microphone/notification and existing-signer upgrade, real Outlook/WhatsApp/PCC accounts, representative clinical review, Windows reboot and interactive wizard remain untested. Automatic speaker diarization/identity, SMS and automatic importance classification were not implemented. Internal drafts do not send messages; every send/delete boundary remains enforced. No live account messages were sent during validation.
