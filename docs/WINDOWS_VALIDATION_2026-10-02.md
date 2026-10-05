# Windows candidate validation — 2026-10-02

The **3.0.1-dev** candidate now has actual Windows application, installer and
local-model execution evidence. All three flags are true and the unchanged
hash-bound release gate passed. This is an unsigned development candidate;
remaining human, live-account and representative-data acceptance is still required.

## Exact source and build

- Authoritative repository: [Private AI](https://github.com/yosefbf-bot/Private-AI-OG-google-version).
- Merged main verified before work/resumption: `114e0838fac230d33a9deb2996b7dfc736ce9d90`,
  the same tracked tree as the 10/1 integration. PR #11 is merged.
- Validation branch: `chatgpt/windows-validation-2026-10-02`.
- Tested code/binary checkpoint: `bc964e09c28e996178196661bfccdcef6d3fac41`.
  Later handoff/guide commits are supplemental; they do not change this installer.
- Environment: Windows 11 Pro 10.0.26200 x64, Node 24.19.0, Electron 44.3.0.
- Genuine helper/runtime inputs came from successful merged-main
  [CI run 37050270590](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/37050270590),
  artifact 11247250109. ZIP SHA256:
  `cb1578401fad4f5f994269e35cc603afe562d9f78b735f341e8da2be838d0f42`.
  All 411 manifest entries were verified in fresh staging; the unchanged input
  validator passed 406 PE binaries. Pre-NSIS staging had 569 files/414 PE binaries;
  the final post-NSIS tree has **570 files/415 PE binaries**. Per-file hashes remain
  with the candidate evidence outside Git.

NSIS added its standard 32-bit `resources/elevate.exe` helper (107,520 bytes), SHA256
`9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37`.
It matched the pinned NSIS 3.0.4.1 builder cache exactly; all previous 569 files
retained their hashes. An initial ZIP check rejected this extra file before the
post-NSIS baseline was established. The helper was inspected, the final baseline
recorded it, and unchanged staging/release evidence gates passed again. Every file
then passed the 570-file ZIP roundtrip hash check. Initial rejected evidence remains
retained; no validator was bypassed or helper removed to make the check pass.
The actual application launched from that extracted ZIP also passed 13 acceptance
checks, all 12 built-in diagnostics and 21 navigation views, with the same EXE/ASAR
hashes. Portable here describes the program package, not a transferable encrypted
vault or an Android application.

Input-build CI is not proof that the installed application works. Exact
code-checkpoint [CI run 37055284317](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/37055284317)
passed all three jobs; its logs confirm 471 Linux source tests, 25 hardening, 178 syntax
checks, zero audit findings and 406 PE inputs. Final supplemental-documentation
publication CI is checked separately on the review PR. Any rebuilt binary
needs its own hashes and actual acceptance evidence; do not transfer these flags by
version label alone.

| Candidate artifact | SHA256 |
| --- | --- |
| `PrivateAI-Setup-3.0.1-dev-x64.exe` | `0aac1fd122501a336251dc7cf6b074a285a65c9cadd53131973494af99bb5ebe` |
| `PrivateAI.exe` | `4179dce6f3e57e1ea535ed0fa41093275e0e1ef7347d5fe264eb4b81db7e8921` |
| `resources/app.asar` | `d82d1fb13cc37cddd26fe0f7d745533cdec773bc2c207ed05a4397fbf57bd6f1` |
| `resources/local-runtime/llama-server.exe` | `a9a88ca88ef1f3c320c07afe38cf4ab7759cfdef1c692e430c2d32e33f4bcc15` |

## Windows application and installation

Fresh and second-process packaged runs passed real DPAPI vault/SQLite startup,
synthetic encrypted-record persistence, same-account backup/restore, protected IPC,
lock/wrong-passphrase/unlock checks, optional PCC toggling and independent Messaging
controls. Each passed all **12 built-in diagnostics**, including the bundled Windows
helper, ACL, named pipe, encrypted backup, DOCX/XLSX/PDF processing and audit integrity.
The diagnostics recorded zero network requests. **21 navigation views** rendered
without loading/error states; screenshots were retained with synthetic evidence.
The fresh model-enabled run passed 14 acceptance checks and the restart passed 13.

The owner explicitly authorized replacement of the unused old app/data. Recovery
material was preserved outside Git and not used as clinical/test input. The real
NSIS installer then ran against a genuinely clean application state, exited **0**,
and installed EXE/ASAR hashes matched the tested payload. Installed application
acceptance passed the same checks; registry/desktop/Start-menu registration was
observed. The clean-state validator's existing-install/data guards were not bypassed.
The validator ran under the already allowed PowerShell policy; no policy bypass,
manual installer-registration deletion or fake executable was used.

The actual candidate uninstaller also exited **0**. Synthetic SQLite/vault files
placed at the standard application data location were retained byte-for-byte;
installation folder, registration and both shortcuts were removed. The same-hash
installer then reinstalled successfully and its installed app passed 13 acceptance
checks, all 12 diagnostics and 21 views. A second installed-app process also passed
those checks and preserved the original synthetic encrypted records and DPAPI vault.

An initial acceptance-harness attempt checked registration before NSIS's temporary
child finished cleanup and was rejected. The final harness waited within a bounded
settle window for every removal invariant and passed without manual registration
deletion. The initial failed evidence was retained. This was a test-timing finding;
no shipped uninstaller regression was established. These synthetic checks are **not**
a representative existing-data upgrade or production-data preservation guarantee.

## Actual local inference and memory

The packaged runtime executed installed, checksum-verified Small 1.7B, Medium 3B and
High 4B models in **two separate rounds**. Every tier returned a real synthetic
`READY` response and passed cancellation/process-stop and browser-lane resource
blocking. Context was 4096, output limit 128. Extra 8B was absent and was not tested.

| Tier | Observed working set | Load time across two rounds | Generation time across two rounds |
| --- | --- | --- | --- |
| Small | about 2.2 GiB | 1.69–1.70 s | 1.21–1.46 s |
| Medium | about 3.7 GiB | 2.50–2.93 s | 3.08–3.50 s |
| High | about 4.6 GiB | 2.88–2.89 s | 3.34–4.39 s |

The PC exposed about 15.6 GiB total RAM, with about **5.9–6.5 GiB initially free**
during these runs. These are short observed tests, not sustained workload/performance
guarantees. High remains conditional on available RAM, context and competing programs.
No RAM reserve, cancellation, browser-lane or privacy safeguard was weakened. The
earlier High low-memory result is preserved in the 9/28 report and historical status.

Real **renderer → IPC → Core → router → local model** tests passed Small in the final
unpacked app and High through the actual installed executable. They used no API key,
Local Only, PCC off, context 2048/output 128 and only synthetic input. An unavailable
medication feed produced **unknown**, with the existing unverified-local-draft label;
it did not claim no medication. No cloud-provider usage was recorded. This verifies
the app's inference path, not clinical accuracy or live-provider acceptance.

## Source checks and bounded fixes

| Check | Result |
| --- | --- |
| Full source suite on Windows | 472 passed; 0 failed/cancelled/skipped |
| Linux test registration | 471; genuine PowerShell 5.1 interoperability test is Windows-only |
| Overlapping hardening suite | 25 passed |
| JS syntax | 178 files passed |
| Repository policy | 292 tracked files passed at the code checkpoint; final docs checked separately |
| Production dependency audit | 0 vulnerabilities; dependency/lockfile versions unchanged |
| General Edge UI | 29 checks passed, Edge 154.0.4258.53 |
| Restricted-development hardening UI | Passed, including actual empty-store Today metrics |
| Synthetic WhatsApp UI/DOM | Passed independent read/write/override controls and verified DOM delivery |
| Actual Windows release evidence gate | Passed application, installer, runtime inference and artifact/test hashes |
| ZIP package | 570 files hash/size verified, 415 PE structures passed; actual extracted app acceptance passed |

Two reproduced problems were fixed without changing clinical/provider architecture:

- **Installer evidence compatibility:** `build/Test-CleanWindowsInstall.ps1` writes
  BOM-free UTF-8. `tests/release-evidence.test.cjs` executes only the shipped finalizer
  in real Windows PowerShell 5.1 against synthetic fixtures, verifies Unicode and
  parses its output through the unchanged gate. The unit fixture is not release proof.
- **Unknown Today metrics:** `source/ui/snf/today.mjs` uses explicit unavailable
  census/occupancy/HPPD labels and neutral HPPD styling, preserving numeric zero.
  `tests/hardening-ui-check.cjs` verifies asynchronous output and computed color using
  an actual empty Core/server. A green unmeasured HPPD and `Unknown%` are no longer shown.

Validation staging is ignored via `.gitignore`; `source/build-info.json` records the
tested build stamp/source digest. This report/status/guide update is supplemental.
Provider/PCC/messaging/Android functionality, permissions, data formats and the
release evidence gate remain intact.

## Remaining acceptance and use

- Representative existing-data upgrade, Windows restart and interactive installer
  wizard/SmartScreen experience: unperformed.
- Live WhatsApp unattended replies/notifications, real provider/Outlook/Bitwarden and
  installed native browser connections: unperformed. No real messages were sent.
- Physical Android/LAN/Tailscale/certificate pairing: unperformed; the separately
  developed Android app must implement the desktop contract.
- Representative de-identified clinical/PCC review and consenting microphone/speaker
  trials: unperformed. Synthetic unknown-state checks are not clinical validation.
- Comprehensive human visual/keyboard/accessibility and sustained workload tests:
  incomplete. Signing/automatic-update infrastructure remains unavailable.

The fresh live application needs local-model setup in **AI Processing**. The installer
contains the runtime, not GGUF weights or acceptance-test configuration. Start with
Small/Local Only and use the [standalone guide](INTEGRATED_STANDALONE_GUIDE.md).
WhatsApp and the optional Android gateway need their own connection/permission setup;
offline AI does not make those remote transports work offline.

The [sanitized machine-readable summary](WINDOWS_VALIDATION_2026-10-02.json) is
tracked alongside this report and included with the candidate. Detailed raw logs,
per-file manifests and screenshots remain with local evidence outside Git. These
tracked summaries contain immutable artifact/model hashes, not databases, vaults,
credentials, accounts or recovery material.
