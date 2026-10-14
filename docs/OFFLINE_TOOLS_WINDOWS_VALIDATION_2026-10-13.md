# Private AI 3.0.3 — actual Windows acceptance

Frozen application code: `0eb431398e785d9ae4fb36a2c78e9cf51eafe8e4`.
This report is a supplemental documentation checkpoint; it does not change the
accepted application binaries. [Sanitized hash-bound evidence](offline-tools-windows-validation-2026-10-13.json)
records the actual execution, and [the feature report](OFFLINE_DOCUMENT_TOOLS_2026-10-13.md)
explains selected and deferred projects. Main remains for the owner to merge.

The genuine Windows x64 installer upgraded the installed 3.0.2 app to 3.0.3 with
exit 0, exact EXE/ASAR hashes and all 25 existing owner data files byte-identical.
A verified private recovery copy remains outside Git. The test did not open the
owner's database or credentials for AI inference. Only the two verified public
search/OCR assets were subsequently added to app storage, so Library tools are
already ready on this PC.

The packaged, installed and relocated portable apps actually executed English
photo OCR, mixed scanned/text PDF OCR and real BGE/sqlite-vec meaning search.
The installed app also executed real Automatic Small inference through renderer
IPC/Core/router under a ceiling of min(actual available RAM, 3 GiB). It used 2,048
tokens while preserving the saved 4,096 setting, and the synthetic unavailable
medication feed remained unknown. No cloud key/inference was used. This is an
admission regression on this host, not qualification of a physical 3 GiB PC.

Installed acceptance passed 18 checks, 12 diagnostics and 19 navigation views,
including encrypted persistence/DPAPI restore, lock/revocation, optional PCC,
shared companion HTTPS/capture/internal drafts and dark appearance. Portable
ZIP CRC and all 767 extracted file hashes matched; actual relocated startup and
OCR/search passed. The unchanged `build/release-evidence-gate.cjs` passed.

All 552 Windows automated tests, 25 explicit hardening tests, 208 syntax checks,
repository policy, clean locked installation, real general/hardening Edge UI
and five new offline-tools Edge checks passed. Production audit is zero. Gitleaks
fresh Windows setup/current-source/full-history scans passed with zero findings.
Both exact-code hosted runs, 38485688240 and 38485692566, passed all four jobs,
including Linux regression/secret scanning and genuine Windows native inputs.
Existing nine development-tool advisories are outside the shipped runtime.

Failed first-package and first-head CI receipts are retained. The package failure
was the PDF.js DOM canvas default in an Electron utility process; explicit bounded
local rasterization fixed it without weakening Electron fuses. The CI failure
was a Windows absolute path check on Linux; the scanner now rejects both formats.

Android source/APK/protocol remain unchanged at main
`cdf64d1214927237bb49bb24cb23a3b69a12eb0a`, version 1.1-dev code 2, with the same
development signer. Its prior 51 local/four hosted emulator tests remain separate.
This batch adds no background OCR of companion Notes evidence.

The installer remains unsigned. Real mailbox/WhatsApp/PCC accounts, physical-phone
microphone/LAN/notifications, reboot and representative clinical data remain
unperformed and are not newly claimed. OCR is English print initially and may
misread handwriting or poor scans; originals and human verification remain
necessary. Meaning ranking is not clinical confidence or evidence of currency.
