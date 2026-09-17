# Upgrade from 2.0.0 to 2.0.1

See [startup-fix instructions](STARTUP_FIX_2.0.1.md). Install over the existing application under the same Windows account. The data folder remains `%LOCALAPPDATA%\PrivateAI2`; the database format and encryption key are unchanged. Never delete that folder to resolve a launch error.

---

# Previous failures and safe upgrade behavior

The reference package and prior-failure material were used as regression requirements, not copied as a runtime dependency.

| Previous issue | Change in this implementation | Validation |
| --- | --- | --- |
| Microsoft Store Python alias mistaken for a usable Python runtime | No Python executable discovery or Python runtime dependency | Source/runtime packaging inspection; actual Windows clean-profile test still required |
| Incompatible Gradio Chatbot `type` argument | No Gradio; fixed dependency versions and lockfile | Node tests and browser UI checks |
| Windows blocked unsigned PowerShell setup | No PowerShell install scripts; normal self-contained NSIS and portable paths | Installer cross-built; it is still unsigned and may need IT approval |
| SQLite backup reader left open, causing WinError 32 during cleanup | Reader handles closed in `finally`; backup copies isolated; locked deletions deferred without aborting a successful backup | Backup/delete regression tests; real Windows lock behavior still requires local checks |
| PDF library API cleanup changed | Destroy the loading task; isolate extraction/export in a separate child process | PDF export/readback and format tests |
| Chosen work folder discarded unsaved settings | Preserve form draft while selecting a folder | Real Chromium UI check |
| Potential duplicate Worker execution after restart/replay | Receiver-bound encrypted signed jobs and durable claims before generation; no automatic uncertain retry | Multiple-Worker and replay regression tests |
| Large history refresh decoded entire documents | Small encrypted chat/file metadata index; transactional schema v3 migration | Metadata-only and migration regression tests |
| Page capture permission could remain selected after failure | Reset the one-shot choice before attempting extraction | Browser failure-path regression check |
| App lock could leave preview text in a dialog | Clear/close previews, prompt and attachments on lock; recheck permission after reads | Source review and regression coverage of revoked reads |

## Existing users

The new application keeps data in `%LOCALAPPDATA%\PrivateAI2`. Older Python/v0.x directories are not modified or automatically imported. Keep the old version and its data until you have verified this build with synthetic work and exported any history you need. Import only approved documents into the new app. Do not solve an upgrade by deleting an old database.

Within v2, schema migrations run transactionally and preserve settings/history. A future unknown schema fails closed. For an upgrade, quit Private AI from the tray, make an organization-approved backup that preserves the original Windows profile/key, install the reviewed release, and run local checks. Local app backups preserve encrypted database records but require the original DPAPI master file. They are not a turnkey cross-PC restore procedure.

Installer and portable variants share the same local profile. Do not run both to create independent workers. If moving the portable application, reconnect Chrome afterward and update Chrome's loaded extension location. Keep the entire runtime folder together.

Disable redundant old scheduled jobs/Workers only after verifying the replacement. Private AI does not modify or turn off your previous installation. Each new Worker gets its own identity and explicit peer trust. Never sync or clone the PrivateAI2 private directory between active PCs.
