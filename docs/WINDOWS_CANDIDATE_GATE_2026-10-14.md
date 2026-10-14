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
