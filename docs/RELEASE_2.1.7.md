> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 2.1.7 — install and upgrade

This is a full Windows x64 release: a regular installer and a complete portable app. Both work for first-time setup or an existing Private AI installation. The 2.1.4 code-only upgrade script is not required.

## What changed

- Assistant answers appear in a light-grey bubble. The app's model-routing and local-draft notices appear as small, tightly spaced footnotes below the answer. Saved/copied text retains those notices.
- Your new logo and icon are included, with navy, cyan, blue and violet app accents.
- **User guide** in the sidebar provides 24 searchable, offline topics. A printable `USER_GUIDE.html` and Markdown guide are included under `resources/docs`.
- Common how-to questions and `/help` retrieve bundled instructions with local code: no brain load, no OpenAI request and no token cost. Try “Do you have a user guide?”, “How do I change my local brain?” or `/help ShareSync`.
- The assistant receives only small relevant documentation excerpts for other app-specific questions. `ASSISTANT_GUIDE.md` documents the help rules. Unsupported procedures are acknowledged; help never grants permissions or runs a task.
- Preserves the repaired 2.1.6 startup order and complete Windows runtimes, Small/Medium/High/Extra High routing, resource coordination, interference warnings, security and retention controls, manual Chrome reading, ShareSync output handling, diagnostics, and the 2.1.3 loading-timer and RAM fixes.

## Recommended: regular installer

1. Quit Private AI, including its tray icon. Finish or stop any active task first.
2. Extract `PrivateAI-2.1.7-Installer.zip` into a new folder.
3. Run `Installer/PrivateAI-Setup-2.1.7-x64.exe` under the same Windows account used for Private AI. Use the existing installation location for an upgrade.
4. Open Private AI and select **User guide** in the sidebar.

The installer is per-user and needs no administrator or separate Microsoft runtime installation. Existing downloaded models, chats, settings, keys and granted permissions remain in your local app-data location (`%LOCALAPPDATA%\PrivateAI2`), outside the program folder. Do not delete that data folder. If you customized the model folder, keep that folder too.

## Permanent portable setup

1. Quit all running Private AI instances.
2. Extract `PrivateAI-2.1.7-Portable.zip` into a new, permanent local folder, such as a Private AI folder under your Windows user profile. Do not run inside the ZIP.
3. Keep the entire `Portable` folder together. Run `Portable/PrivateAI.exe`; optionally create your own shortcut to it.
4. For an upgrade, launch this new folder after closing the older copy. The same Windows account uses its existing local app data and models. Keep the previous program folder until you have checked the new version.

“Portable” describes the program packaging: app data is still protected on that PC, not carried inside the executable folder. Do not put the app database, encrypted keys or model cache in ShareSync. Select your approved ShareSync **Work folder** in Settings for reports and supported Worker handoffs.

## If startup fails

Record the version and exact error code. If the app opens, use **Health & recovery → Run local checks / Export diagnostics**. Review a diagnostics report before sharing it. If the app cannot open, send the startup error text or a screenshot. Do not delete your model downloads or app data to troubleshoot a packaging problem.

## Validation limits

Linux automated tests and Chromium UI checks cover the app logic and presentation. The complete Windows executables, bundled dependencies, security fuses, installer payload and ZIP contents are checked structurally and against known baseline bytes. The launcher receives only icon-resource changes; executable code sections remain unchanged. Windows application, installer and uninstaller execution have not been tested here. This release is unsigned. No new actual model-inference tests were needed for these UI and documentation changes.

