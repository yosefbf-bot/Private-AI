> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Private AI 2.1.6 — Repair 2

Repair 2 fixes the application startup error **PAI-201-SERVICES-UNKNOWN**. The automation approval handler was assigned before the core services existed. It now attaches immediately after their initialization. Repair 1's complete Windows runtime and executable integrity checks are retained.

## Install or update

1. Quit Private AI, including **Quit** from its tray icon if it is running.
2. Extract **PrivateAI-2.1.6-Installer-Repair2.zip** completely.
3. Run **Installer\PrivateAI-Setup-2.1.6-x64.exe**. Use the existing installation location when updating.
4. Open the installed **Private AI** shortcut.

This is a regular per-user installer for existing installations and first-time setup. No PowerShell upgrade script or administrator rights are required. Do not uninstall the old version first or delete `%LOCALAPPDATA%\PrivateAI2`. Existing models, chats, settings and protected credentials use their existing locations. No model redownload is needed.

Old shortcuts to other extracted portable copies still open those copies. Use the newly installed shortcut when testing this repair.

## Portable alternative

Extract **PrivateAI-2.1.6-Portable-Repair2.zip** into a new permanent folder. Keep the entire **Portable** folder together, then run **Portable\PrivateAI.exe**. Do not run it inside the ZIP or copy the EXE by itself.

Portable means no setup wizard. The application still stores protected data under the current Windows user's `%LOCALAPPDATA%\PrivateAI2`. Copying the program folder to another PC does not automatically transfer models, chats or protected credentials.

## What remains

All 2.1.6 features remain: local model tiers and automatic selection; foreground chat priority; RAM checks; background pause; automation interference warnings; safe deferral; recovery and diagnostics; retention and encrypted storage; manual Chrome reading; local-only API blocking; and approved output folders.

The approval handler's checks are unchanged: an unattended, hidden, unfocused or locked application does not open a permission dialog or take focus to request approval.

## Validation

187 automated tests passed, including three new tests that execute the application entry point with the real core services and encrypted SQLite database. They cover normal startup, background startup, saved data, deterministic chat, and approval/deferral behavior. The old entry point reproduced the screenshot's exact diagnostic; the corrected entry point passed.

Those startup tests replace Electron, Windows ACL/DPAPI calls and the named pipe transport with test doubles. They do not execute Windows binaries or display a real Electron window. Windows installation/application execution and actual local-model inference remain unverified in this Linux environment.

The included Validation/Repair2 reports cover the packaged source, complete Windows binaries, installer payload and archive checks. Reports in older Validation folders are historical. The installer remains unsigned.

