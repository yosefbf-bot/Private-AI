# Private AI 2.1.6 — stability, recovery, diagnostics

Built on the released 2.1.5 code and Windows runtime. This is an application-code upgrade, not a rebuilt Windows installer. No model weights are included or downloaded automatically.

## Upgrade your existing installation

1. Quit Private AI using its tray icon. Finish active tasks first when possible.
2. Extract **PrivateAI-2.1.6-Upgrade.zip** into a new folder.
3. Run **APPLY_UPGRADE.cmd** and select your existing **PrivateAI.exe**, not an installer.
4. Reopen Private AI using your usual shortcut. Open **Health & recovery** in the top bar.
5. Run **local checks**, review the results, and test a short chat before enabling background jobs.

The updater accepts the exact released 2.1.3, 2.1.4, or 2.1.5 application archives. It verifies the new archive, stages it beside the old archive, and atomically replaces code while retaining a uniquely named backup. Reapplying the same upgrade is a no-op. Unknown/modified archives and running applications are refused. Neither admin elevation nor changes to PowerShell execution policy are requested. If organizational policy blocks the script, use your normal IT process; do not disable protections.

Chats, settings, downloaded models, existing engine files, Windows runtime support, Chrome companion, and approved output folders are not replaced. Installed-app listings can retain the original installer version; Diagnostics reports the actual code version.

The Portable ZIP includes the existing 2.1.5 Windows runtime and 2.1.6 code. Extract the full package into a new program folder. Use the same Windows profile to access existing encrypted data. Do not move the private database, vault, or browser profiles into ShareSync.

## Recovery and smoother operation

- **Safe startup:** an unclean previous exit leaves background work paused. Nothing auto-loads the model or replays interrupted work. Acknowledge the notice separately from resuming work.
- **Interface recovery:** one automatic interface reload per app session after renderer termination, without requesting focus. Temporary chats are cleared. Further recovery requires reopening through the tray or restarting. A hung interface is recorded and background work pauses; the app does not repeatedly kill/relaunch itself.
- **Drafts:** text typed in an existing saved chat is saved after a 700 ms typing pause in its encrypted chat record. Reopen that chat to recover it. The last unsaved keystrokes, unsent attachment selection, editing state, and Temporary Chat drafts are not recoverable. Drafts follow chat deletion/retention.
- **RAM:** keep the existing 2.1.3 estimate and critical-pressure protection. Default reserve is 1024 MB. A background phase waits for five seconds of recovered headroom after memory pressure. Settings can increase the reserve and recovery delay.
- **Observed Windows memory:** when a model runs, a bounded, read-only Windows query samples its peak working set at the existing 15-second service interval. Per-session observations can increase the next admission budget for the same tier/context; they never reduce the existing estimate. A working-set peak is not a guarantee of future total memory use. If the query is blocked/unavailable, the existing estimate remains in force.
- **Failure cooldown:** after three recorded local engine failures in five minutes, new automatic tier calls/manual loads are blocked for one minute and background work pauses. There is no automatic restart loop. User cancellation, missing files, and ordinary memory deferrals are not counted as engine crashes.
- **Timeouts:** existing loading, browser/file/helper and API deadlines remain. A timed-out local inference now stops the model process instead of leaving that inference running. Stopped local processes remain tracked until actual exit before another model or browser phase starts. Active requests are not blindly resent.
- **Sleep/wake:** suspend aborts current requests, stops the local model, and pauses background work. On wake, review and resume manually. Existing interference preflight remains mandatory.
- **Work/Away:** Work enforces balanced local CPU settings. Away permits your configured CPU setting. Neither profile grants new tool permissions, enables workers, permits cloud use, or authorizes desktop automation.
- **Optional warm brain:** set follow-up minutes above zero to reuse a ready model when local task rules judge it sufficient. Zero preserves Small-first behavior. The automatic tier cap and single-model limit remain in effect.

## Report checkpoints and duplicate protection

Local report jobs save original inputs, extracted documents, completed section results, and completed answers inside encrypted job records. This data follows job retention and is removed on successful completion. Health & recovery offers **Review & resume report** for failed local reports. The original saved inputs are reused; the current source files are not reread. Remote/ShareSync jobs are not automatically replayed or offered this local resume action.

If a request was sent but its answer was not saved, resuming may repeat inference and incur another API charge. The confirmation names that uncertainty. Completed answers are reused without another model call. Before a report file is published, the app saves its intended relative filename and SHA-256; a matching existing output is reused after interruption. Changed output is not overwritten. This protection covers report publication; it does not promise exactly-once delivery in external apps.

Use **Discard saved recovery data** to remove failed-job snapshots and saved answers. Deleting a referenced source also removes those recoverable local copies; stop related active jobs before deleting their sources. Normal output files remain under your control in your approved output folder.

## Sectioned reports and answer reliability

Optional **section-by-section processing** handles oversized text-document report jobs in up to 12 sections. It validates the section plan before calling a model, retains all section text, labels document/section identifiers, checkpoints completed sections, freezes section boundaries across recovery even if context settings change, and assembles separate findings. Each section can use up to two local model calls plus a cloud fallback when already permitted. It can therefore cost more and take longer. It is off by default. Images and requests exceeding the bounded section plan are rejected rather than silently truncated. This mode produces section findings, not a claimed independently verified whole-document synthesis. Original context/size protections remain for normal chats.

The answer UI now says **Evidence checks**, rather than presenting a score as an accuracy percentage. Existing checks match quotations/numbers and flag missing context and uncertainty. A matching quotation does not prove a conclusion, and cloud output is not independently verified. No self-reported model confidence is treated as proof. Critical decisions still require review of original sources. Existing local-only blocking remains in force; a failed local check never authorizes an API call.

## Diagnostics and data integrity

**Health & recovery** shows actual app version, RAM availability, main app memory, model state, cooldown, background state, and saved report step. **Run local checks** uses the existing synthetic checks for Windows encryption, private permissions, database backup, supported file formats, and approved output-folder access. Database opening now checks SQLite page integrity as well as the existing transactional migration/version guard.

**Export diagnostics** saves technical JSON for your review. It contains no prompts, document text, credentials, model paths, usernames, machine names, or raw exception messages/stacks. Technical incidents use fixed event names, bounded to 50 entries; previous events are loaded only within seven days or a shorter configured retention. Local-model working-set observations are per-session. No telemetry is uploaded automatically. Credentials are never included in backup/export diagnostics.

Unexpected promise failures are recorded and pause background work rather than being silently ignored. The existing core chat service remains usable when optional worker activity fails.

## Rollback and future upgrades

Keep the extracted upgrade folder. Quit Private AI, run **ROLLBACK_UPGRADE.cmd**, and select your existing executable. It only replaces the exact 2.1.6 archive with a checksum-verified retained 2.1.3/2.1.4/2.1.5 code backup, retaining the 2.1.6 code separately. It does not restore or overwrite user data. Database schema remains version 3, compatible with these versions; old code will not expose the new recovery UI. Complete or discard interrupted recovery work before intentionally downgrading. Use this procedure only with these verified versions; compatibility with unknown future schemas is not promised.

Package checksums detect damaged transfers; they are not publisher signatures. Keep a trusted copy of your downloads. New engine/dependency upgrades should be separately reviewed and tested on Windows rather than silently mixed into a code update.

## Validation limits

Automated Linux tests cover original regressions plus safe startup, cooldown, diagnostic privacy, encrypted drafts, memory admission/recovery, output interruption/reuse, changed-file protection, report sections, and settings permissions. See the bundled Validation report for exact counts and hashes.

**Not validated here:** executing the Windows application, PowerShell updater/rollback or memory sampler on Windows; real model inference; real sleep/wake; renderer crash behavior in Electron; and rendered browser UI. A browser test runtime was unavailable and its download timed out. Updated browser test code is included for a provisioned environment. Windows runtime/dependency files are preserved byte-for-byte; this does not establish Windows execution success or crash-free operation.
