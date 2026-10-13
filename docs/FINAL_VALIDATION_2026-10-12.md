# Final validation checkpoint - October 12, 2026

This records completed checks, superseding the earlier pending Android status.
Application binaries are unchanged. Later documentation commits require their own
GitHub checks; this report does not transfer a result to a different commit.

## Windows

Frozen binary code `6e915aafee2ee8cd94870f1c521e7b1788d77085` passed all 525
Windows source tests, 22 focused Core/SQLite/Edge checks, real NSIS installation,
packaged/installed application execution, actual Small local inference without an
API key or PCC, uninstall/reinstall data retention, installed restart and the
583-file portable roundtrip/extracted-app check. The hash-bound release gate passed.
Exact binary hashes and detailed scope are in the desktop repository's
`docs/WINDOWS_VALIDATION_2026-10-12.md`.

## Android

Tested head `47e3b4af55fa3034ae4349eca0956c7bd7fc4061` passed all 51 local
tests with zero failures/errors/skips, including real isolated desktop Core/SQLite
pinned-HTTPS interoperability. Lint: zero errors, 73 warnings. App/test APKs built.
Both hosted runs passed all four instrumented tests, including three actual OS
PIN/Keystore unlock/Dashboard/Notes/relock cycles per run and framework cleanup.

The intermittent failures were in the Compose test dispatcher and teardown. The
test-only correction queues composition and explicitly destroys the real activity,
then drains canceled lifecycle effects on Android main. No production code,
runtime version, authentication boundary or assertion was changed or removed.
Earlier failed attempts remain part of the history. Production APK source is
`28a6fe12605a128aa5be8554a5f8d7c6461d348b`, SHA-256
`4b3ea024d6d748a382682587834f1d5bf7168c7f83812b2c786828c79fb91425`.

## Exact-head hosted results

Every run below passed functional build/test steps, but its overall result was
**failure**, solely because GitHub rejected mandatory artifact uploads on account
storage quota. These are not fully green runs. See the companion JSON for exact
heads, step names and downloaded-log hashes.

- [Private-AI-OG-google-version pull_request 38307898924](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/38307898924): functional checks passed; artifact retention failed.
- [Private-AI-OG-google-version push 38307891274](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/38307891274): functional checks passed; artifact retention failed.
- [AI-Mobile-companion-app pull_request 38310131979](https://github.com/yosefbf-bot/AI-Mobile-companion-app/actions/runs/38310131979): functional checks passed; artifact retention failed.
- [AI-Mobile-companion-app push 38310126915](https://github.com/yosefbf-bot/AI-Mobile-companion-app/actions/runs/38310126915): functional checks passed; artifact retention failed.

The 26 authorized obsolete CI archives (1,438,994,870 bytes) were backed up,
SHA-256/ZIP-CRC verified, then deleted remotely. No source branch, release asset or
app data was deleted. Keep artifact retention mandatory; inspect the latest PR
checks for a subsequent result rather than treating this historical quota failure
as evidence of the account's present status.

## Publication and remaining limits

Both review branches contain the latest work. Main merges remain with the owner:
- Desktop: `chatgpt/assistant-first-workflows-2026-10-07`, PR #15.
- Android: `chatgpt/assistant-first-2026-10-07`, PR #2.

Do not delete review branches before integration. Verified local Git bundles retain
historical branch work. Source exports, guides and accepted Windows installer,
portable and Android development APK are available in the owner's local delivery
folder; this report is not a claim that binaries were uploaded to GitHub Releases.

Physical-phone microphone/LAN/notifications/signer-compatible upgrade, live
Outlook/WhatsApp/PCC, representative clinical review, Windows reboot and interactive
installer wizard acceptance remain unperformed. Windows signing is absent; Android
uses development signing. Automatic speaker identity/diarization, SMS and automatic
correspondence importance classification are not implemented. Photos need human
review; sending/deleting messages requires PC approval. Emulator acceptance does not
establish these separate capabilities or HIPAA certification.
