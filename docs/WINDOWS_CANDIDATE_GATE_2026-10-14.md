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

## October 15 native ACL correction

Both e8bd52c hosted source suites passed705/705, froze real candidate hashes and
executed the genuine installer successfully (exit0). The installed executable
and ASAR matched those hashes. Actual application startup then failed closed at
`permission_check`/`STORAGE`, before vault access, inference, restart, retention
or portable acceptance. These failed receipts remain preserved; neither build
is an accepted release.

The new native regression reproduced the failure in both hosted01cc6a7 jobs.
The protected DACL retained an explicit Administrators grant after the previous
`icacls /inheritance:r /grant:r` operation. Windows also rendered the current
local Administrator trustee as `LA`; matching that alias by account RID alone
would not establish its identity safely. The strict rejection was retained.

Protection now constructs only the current numeric user SID and SYSTEM grants
in memory and applies the protected root DACL through one native .NET operation.
Verification checks numeric trustees, effective raw/typed ACE counts, exact
Allow/FullControl/inheritance flags and absence of extra grants or deny entries.
There is no Administrators whitelist, alias guess, inheritance reset or owner/
group/audit change. Native errors stay suppressed and bounded. This is root ACL
protection, not a recursive forensic repair of pre-existing protected children.

Actual synthetic Windows tests cover seeded Administrators and Everyone grants,
owner/group/file-byte preservation, repeated protection, inheritance and junction
denial. Final local Windows full suite passed708/708 with0failures/cancellations/
skips (69.715s); syntax237 and repository390 passed. The corrected exact-head
hosted source suite, installer/application,
real inference and immutable release-gate results remain pending. No installer
or permission operation was performed on the owner's application/data.


## Subsequent236bd23 execution

Both hosted Windows suites passed708/708 and three genuine ACL cases. The PR
candidate passed real installation, packaged app17checks/12diagnostics/20views,
same-store restart and Small inference at3GiB with effective2048/saved4096.
Uninstall acceptance then failed because the wrapper assumed a display-name
filename. The pinned builder derives productFilename from executableName:
Uninstall PrivateAI.exe. The correction derives that contract and rejects
missing, ambiguous, escaping or linked uninstallers; it does not rename the app.

The push candidate passed initial installation/application, but its restart's
shared-chat successful-HTTP assertion failed without retained status/cause.
A real Core/SQLite/HTTPS probe did not reproduce it across three clean restarts.
Safe validation-only diagnostics and persisted pause/resume coverage are added;
production gateway/pause/resource behavior remains unchanged. This failure is
unexplained until actual diagnostic evidence establishes the condition. Fresh
complete exact-head acceptance, retention and portable gates remain mandatory.


##56bb69d retained safety pause

The push passed712/712 source tests, real installation/application/restart and
Small inference; corrected uninstaller resolution executed successfully. During
reinstalled-app acceptance the shared-chat route returned409 COMPANION_PAUSED.
The cause of the persisted pause is not established. Safe read-only diagnostics
now retain paused/safeStartup flags and at most20 allowlisted event names since
startup time.26 focused tests passed, including redaction, zero writes, actual
Core/SQLite/HTTPS pause/resume/replay/revocation across restart. No test-only
automatic resume or production gateway change masks the failure. Fresh complete
actual Windows acceptance remains mandatory before merge or distribution.
