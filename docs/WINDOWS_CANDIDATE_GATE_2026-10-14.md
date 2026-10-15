# Windows candidate acceptance — October 14

Source 3.0.4-dev includes the completed four-phase desktop work on main
`5f81cb5a0cf4aa055d06b719c24234a19bd2dfaf`. The current review branch adds
actual hosted Windows acceptance rather than transferring historical installer
flags to this changed build. Installed owner version 3.0.3-dev remains intact.

The new Windows job receives source-built native helper/runtime inputs from the
same workflow, verifies every manifest entry and rejects missing, extra or linked
files. It runs the full Windows source suite, builds the real NSIS installer,
freezes executable/ASAR/runtime/installer hashes, and downloads the existing
checksum-pinned public Small model. A fresh Windows runner/profile is required.
The existing clean installer guard remains authoritative and unchanged.

Acceptance executes clean installation, packaged renderer/IPC/DPAPI/SQLite and
shared companion checks, same-store restart, actual Small inference under
min(actual available RAM, 3 GiB), uninstall/reinstall retention, and portable
extraction/hash/CRC/execution. The unchanged release-evidence gate verifies
actual Windows/installer/local-inference receipts and genuine passing TAP.
Only binaries and sanitized synthetic JSON/TAP are retained; encrypted stores,
vault files, models, credentials and personal data are excluded.

A preliminary local Windows installer built successfully, but its isolated
packaged smoke failed at the deterministic chat assertion while this PC had
about 0.8 GB free during controlled validation. That was below the unchanged
1 GiB admission reserve. The original failed receipt is retained. The packaged
validator now records actual admission memory and checks the returned safe error
code before checking answer text. No production RAM guard was relaxed, and this
preliminary worktree build is not the final frozen CI candidate.

Current production dependency audit: zero advisories. Final exact-head Windows
source/job results, immutable release-gate acceptance and actual artifact hashes
remain pending and must be recorded before shipping. Hosted Windows execution
qualifies its recorded Windows runner environment; it does not establish physical
phone/account/network/OEM acceptance or every upgrade from a prior installation.
No installer is run on the owner's existing account by this assignment.


## First exact-head hosted result and correction

On e9550ce, both actual Windows source suites passed705/705 (0fail/cancel/skip)
and the genuine installer built. Freezing failed before candidate/baseline
receipts, model setup or installation. The recovered push installer SHA-256 is
157cb6633ca995ba4f905d9c1249137832beea88b30aa7e909f20ce7b5c5fe4a;
its inert extracted payload passes416 PE checks and packaged metadata matches
committed source exactly. It is not an accepted release artifact.

Clean isolated checkouts proved that preparing six generated browser manifests/
Readability files caused checkout-line-ending status changes despite final bytes
matching Git's LF blobs. Explicit LF attributes on those six paths kept both
Git autocrlf configurations clean before/after repeated preparation. No file
content, permissions, source hash or security gate was relaxed. New safe build
failure receipts report phase/code and bounded relative tracked paths only.
Fresh exact-head actual Windows acceptance remains required.
