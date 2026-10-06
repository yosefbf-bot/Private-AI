# Windows candidate validation — 2026-10-06

The unsigned **3.0.1-dev development candidate** passed actual Windows application, installer, current Small local inference and portable acceptance. It remains subject to the separate acceptance limits below. All execution flags derive from this artifact's evidence; October 2 results were not transferred.

## Exact source and hashes

Tested frozen code: `46a385d2a8d1b14acf3e960f2b4c601159ba3d04`. GitHub base: `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`. Later report/handoff commits are supplemental and do not change the tested payload. Version and filename alone do not identify this binary.

| Artifact | SHA256 |
| --- | --- |
| Installer | `194d1ab493507f1695d135b1b92f341b28220f2ca3ec2afddfe7c8f6a96df453` |
| PrivateAI.exe | `13da4a79000ce604e8b4b202be3e794c764d1eb433eb9bd750c6f0213eaf1aa5` |
| resources/app.asar | `755c348965f2190ded238956890f4d7f41f9f712c4e2829daa6d934b874caa5b` |
| llama-server.exe | `a9a88ca88ef1f3c320c07afe38cf4ab7759cfdef1c692e430c2d32e33f4bcc15` |
| Complete Windows program ZIP | `41ddcf31c031a6d0ffa46963eb45fb31d77a9a57eca41ffd9e599e6ab8ec8d36` |

Verified unchanged native inputs: 411 files / 406 PE binaries. Final post-NSIS payload: **575 files / 415 PE binaries**. The standard elevate.exe matches the pinned NSIS cache, SHA256 `9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37`. ZIP extraction matched every file hash. Portable describes the Windows program; encrypted data remains tied to its Windows account. No GGUF weights are included.

## Actual Windows acceptance

Fresh packaged startup passed 14 checks; packaged restart with real Small renderer/Core inference passed 15. Each passed 12 built-in diagnostics and 21 navigation views. DPAPI/SQLite synthetic persistence and same-account backup/restore passed. Startup was no-key, Local Only and PCC off. Installed and ZIP-extracted application acceptance also passed with matching EXE/ASAR hashes.

Actual clean install, current uninstall and same-hash reinstall exited 0. Uninstall preserved synthetic standard-path database/vault bytes, removed installation/registration/shortcuts, and restored the isolated fixture; installed restart verified the synthetic shared checkpoint. The clean-install guards remained intact. This is not representative user-data upgrade or reboot/wizard acceptance.

The new companion checks exercised protected IPC and pinned loopback HTTPS, two-chunk 96 KiB text evidence, replay/isolation, exact action revisions/source metadata, internal drafts, selected chat/history grants, global/per-action reminders, ordinary lock versus the restricted notification key, revocation and Notes form saving. Restart checked canonical wf_action_meta as well as notes/evidence/drafts/todos. No real account dispatch occurred. The validation client uses the supplied certificate as a trust anchor with partial-chain trust while preserving date/host validation and exact peer pinning; production gateway policy is unchanged.

## Current local inference and source checks

Small returned a real READY response from the packaged runtime; cancellation and browser-lane protections passed. Observed peak working set: 2.18 GiB; initial free RAM: 5.05 GiB. Renderer/IPC/Core/local-model execution used context 2048, output 128, no API key and PCC off. Unavailable medication remained unknown with the unverified-draft label. This is not clinical accuracy or sustained performance validation. Medium/High results remain historical October 2 evidence only.

Windows source suite: **500/500**, zero failures/cancelled/skips. Linux CI regression: 499; hardening: 25; syntax: 184; repository policy passed. Production audit found **3 moderate, 0 high, 0 critical** via mammoth → argparse → sprintf-js. The high-severity gate passed, not a zero-finding audit. See [the primary advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Exact-code CI: [37441844506](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/37441844506): completed/success; [37441839760](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/37441839760): completed/success. A pending duplicate workflow is not claimed passed.

## Retained failed attempts

Candidate `11a9114` executed and failed the validation TLS client with UNABLE_TO_VERIFY_LEAF_SIGNATURE; a separate diagnostic established trust-anchor handling. Wrong CA, pin, hostname and expired-certificate checks remained explicit. Candidate `34f9d3e` failed Notes navigation because direct IPC unlock omitted the UI button's init(), leaving renderer state null. Moving the independent Notes check before lock corrected validation ordering; no production defect was established. Both failed reports and distributions remain retained; neither supplies final passed flags.

## Remaining limits

Physical Android/LAN/firewall, Android notification delivery, camera/dictation, packaged maximum-size/image/PDF evidence, live WhatsApp/Outlook/native browser/provider accounts, representative existing-data upgrade, reboot/interactive wizard, clinical human review, accessibility/microphone/speaker and sustained workloads remain separate. HTTPS chat used deterministic /calc; model inference above used the packaged renderer/Core path. Draft storage does not establish sending, and reminder acknowledgment does not complete work or resolve a clinical alert. Code signing and updater infrastructure are unavailable.

See [the machine summary](windows-validation-2026-10-06.json), [standalone guide](INTEGRATED_STANDALONE_GUIDE.md), [Notes and rounds](NOTES_ROUNDS_COMPANION_GUIDE.md) and [historical October 2 evidence](WINDOWS_VALIDATION_2026-10-02.md). Sanitized summaries contain immutable hashes and technical counts. Raw logs/screenshots, synthetic profiles/databases/vaults, pairing/private keys, model weights and recovery material stay outside the export.
