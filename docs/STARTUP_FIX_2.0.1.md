> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Private AI 2.0.1 — Windows startup fix

## Install the fix

1. Close Private AI, including its system-tray icon if present.
2. Extract the complete new ZIP. Run `Installer/PrivateAI-Setup-2.0.1-x64.exe` under the same Windows account and choose your existing installation folder. You do not need to uninstall first.
3. Open Private AI. In Settings, run **Run local checks**.

For portable use, extract to a new local folder and run its `Portable/PrivateAI.exe`. Keep all neighboring files. Use only one installed or portable copy at a time.

Both versions use the existing `%LOCALAPPDATA%\PrivateAI2` data folder. Do not delete, rename, or move this folder or `vault.dpapi` as a troubleshooting step. The upgrade keeps the same database format and key location; no reset or data migration is needed. Your chosen report folder and 90-day retention setting remain as saved.

If startup still fails, send a screenshot of the new diagnostic code. It identifies the startup stage without displaying paths, account names, keys, or chat content. A missing encryption key with an existing database now stops safely instead of creating a replacement key.

## What was corrected

Version 2.0.0 wrote a temporary file, reopened it with read-only access, and called `fsyncSync`. On Windows, the underlying `FlushFileBuffers` operation requires a writable file handle. First-run creation of `vault.dpapi` could therefore produce the reported generic storage error. The same utility is used for some other saved files.

The utility now creates the temporary file with exclusive write access, writes and flushes through that handle, closes it, and then replaces the destination. Write, flush, or replacement failures leave the existing destination intact and attempt temporary-file cleanup. Encryption and folder permission checks remain enabled.

Reference: [Microsoft FlushFileBuffers documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).

## Validation and limits

The original code failed the new first-run and replacement regression cases under simulated Windows file-handle rules. The corrected code passes those cases, failure-injection checks, encrypted-key lifecycle checks, and the existing regression suite. Tests use synthetic data. See `Validation/test-results.txt` and `Validation/startup-before-fix.txt` for results.

The executable and bundled runtimes come from the original 2.0.0 release; application code and installer are repackaged as 2.0.1. Packaged source is checked against the corrected source. This environment cannot execute the application on your actual Windows profile, so Windows launch, DPAPI, and organization-specific policies still need the local check above. The package remains unsigned.

This release fixes startup in the released 2.0.0 package. It does not include the separate, unfinished remote-command additions discussed later.

