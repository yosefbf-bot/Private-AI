# Notes admission follow-up - October 19, 2026 UTC

Before final acceptance, independent review confirmed a pending-response edge:
New/Open chat rejected by the sending guard could first deactivate the Notes form.
The guard now returns before stopping Notes/voice. A real Core/Edge regression
reproduced the issue before the fix and now passes, including both rejected chat
switches and exactly-one successful Notes save. Final UI25/Notes14/text117/dark7
and syntax passed; fresh hosted full acceptance remains required for this commit.
This continues the unreleased3.0.6-dev candidate, without relabeling any previous
accepted binary or changing dependencies/schema/provider/privacy/owner installs.

---

# Active usability and dark-mode source update - October 19, 2026 UTC

Desktop 3.0.6-dev: protected unsaved Notes/navigation and save/refresh race; lighter
Windows dark text, controls, borders and focus. Companion 1.2.3-dev/code 6: active
chat feedback, durable saved-note receipt, connection badge and safe Ask again.
See docs/FIVE_USABILITY_FIXES_2026-10-19.md for scope and verification status.
Local UI25/Notes13/text117/dark7 and focused Node36/36 passed; independent
code review found no remaining blocker. Final current-source hosted gates pending. Historical
accepted 3.0.5/1.2.2 receipts below do not validate this changed runtime. No owner
installation/data/pairing/signer was changed; independent mobile API remains cancelled.

---

# Accepted private preview checkpoint - October 18, 2026

This checkpoint supersedes historical pending/budget/failure notes below for the
specified release. Preserve those notes as history; do not restart completed work.

- Desktop binary/source commit: 81e7e5c9472d181f8fe661c5f7c1fec84d927050,
  version 3.0.5-dev; accepted merge main: 6e0b46955103d35c905c81e6f0a0f85aa48200af.
- All 12 exact-source review/push checks and all 6 merged-main checks passed.
  Accepted push run 39083246093; merged-main run 39106431690.
- Hosted Windows source tests: 718/718, zero failures, cancellations or skips.
  Genuine installer, installed application, bounded Small local inference,
  retained synthetic-data uninstall/reinstall and relocated portable execution
  passed. All 775 portable baseline files matched. Local focused packaging 2/2,
  hardening 25/25, syntax/policy passed; RAM-constrained local full run is NOT a pass.
- Android companion is 1.2.2-dev/code 5, source
  163398051f72b943fb74242462e5ee5a83ac8be1; merge main
  2ca8ffc887a3ade5928b793a5ccca6d1277a5c74. Its 8/8 actual emulator cases passed.
- Immutable private previews and validation/checksum assets:
  https://github.com/yosefbf-bot/Private-AI-OG-google-version/releases/tag/private-preview-3.0.5-2026.10.18
  https://github.com/yosefbf-bot/AI-Mobile-companion-app/releases/tag/private-preview-1.2.2-2026.10.18
- The accepted installer remains unsigned. Current owner-PC/Windows 11 install,
  physical-phone upgrade/OEM keyboard/Keystore, live account/LAN/mic/notification
  and representative clinical acceptance remain unperformed unless separately
  recorded. Earlier Windows 11/106-contrast evidence belongs to the October 15 build.
  No owner application/data/model/pairing/signing key was replaced in this task.

These are accepted-release results, not claims about a subsequent changed runtime.
This documentation-only correction changes no package/runtime/protocol/schema,
provider, security or clinical behavior. It still requires its own GitHub checks.
The original source archives intentionally retain the exact tested source commit;
later documentation does not relabel those binaries or rewrite their receipts.

---
Historical handoff follows.

# Windows packaging validation fix - October 17, 2026

Base/main9cf3b99; same WhatsApp setup PR23 branch. Confirmed64fe hosted build completed NSIS then tried implicit GitHub publishing and failed for missing GH_TOKEN, before actual app acceptance. Explicit publish:"never" makes this packaging-only helper independent of publishing credentials; separately authorized private-release uploads remain unchanged. No token/permission expansion or release gate bypass.

Both normal and prepackaged build wrapper regressions passed2/2, preserving NSIS/x64/staging/PE validation. Local hardening25/25, syntax and policy passed. Full local718 suite:712pass/5fail/1cancel under measured1.35GiB free RAM; failures show LOW_MEMORY/downstream no-provider-call assertions and resource-blocked watcher timeout. This is not a passing full local suite. Preserve firstlogs. Hosted full718 and genuine Windows acceptance are required before merge. No installed app, keys or data changed. Android unlock PR5 separately accepted/merged with7OS cases perrun and verified existing signing identity.

---

# WhatsApp setup wording - October 16, 2026

Base/main9cf3b99, branchchatgpt/whatsapp-setup-copy-2026-10-16. Text-only corrections: Open Web does not enable/save; Step3 controls named; obsolete open-conversation toast removed; Windows app/PID fields unnecessary for Web; bridge state labeled. No permission, privacy, version, protocol, or sending behavior changes. Full716/716, hardening25/25, syntax and repository policy passed with zero skips. No browser/live-account/installer acceptance claimed. No production installation changed. Actions budget remains blocked; exact-head CI must pass before merge or release. AndroidPR5 remains separate.

---

## October 15 desktop 3.0.5 appearance correction

Read docs/DARK_SURFACE_CONTRAST_2026-10-15.md. Base is accepted desktop main
bdf73af43453a19abf3c9845cf667554de388fbb; review branch
chatgpt/dark-surface-contrast-2026-10-15. Paired theme surfaces/text correct the
report-folder, attachment/help/review/hover and inline transcript/output panels.
Light fallbacks and status meanings remain; no behavior/storage/security change.
Android source is unchanged. Full Windows source suite716/716 passed with no
failures/cancellations/skips. Real Core/SQLite+Edge passed existing25 workflows
and106 contrast measurements (53 per theme; minimumdark6.8599/light4.5176).
The UI-only RAM fixture is synthetic; production memory admission is unchanged.
New-source Windows release evidence must match exact CI/artifact hashes. The
previous3.0.4 binaries do not contain this change.

Previous four-phase private preview IS ACCEPTED with documented limits:
desktopmainbdf73af/exactd08412checks/both716Windowsruns/all5actualreleasegates;
matchingWin11portable774hashes/20views/12diagnostics; merged-main38766739108green.
Androidmainffa762a/treee51:95local including2actualinterops,6/6emulatorcases in
bothreviews andmaingreen. Bothpreviews published,11serverassetsverified. Older
pending paragraphs below are historical, not requests to repeat accepted work.
Physicalphone/liveaccount/longsession/concurrentenrichment limits remain.

## October 15 controlled Windows acceptance lifecycle

Ae0 PR passed713 source tests and real install/app/restart/Small inference,
then reinstall returned409 COMPANION_PAUSED with safeStartup=true and
unclean-start. A deterministic realCore/SQLite case reproduces how an active
optional assistant draft at synchronous close retains the dirty marker; the
production recovery pause is correct. The specific ae0 request kind is unproved.
The opt-in validation fixture now holds its optional speech/draft timer at entry
and requires zero tracked requests before success. No automatic resume, requests
map deletion, clean-marker override or normal production timer change. Targeted
28/28 passed; new actual hash-bound installer/retention/portable gates are pending.
Two native PowerShell tests now allow30s rather than15s after measured hosted
ETIMEDOUT; all assertions and outer60s bound remain. Actual focused3/3 passed.
Owner installation/data/keys/models/pairings remain untouched. Android mainffa762a
and its reviewed95-local/6-device results are accepted; do not repeat those tests.

## October 15 current retained pause � NOT a completed release

Android mainffa762a passes its merged-main GitHub job and both reviewed source
runs passed6/6 real device cases. Desktop56bb69d push passed712 Windows tests,
real installation/application/restart/Small inference and actual uninstallation.
Reinstalled-app shared chat returned409 COMPANION_PAUSED. The uninstaller fix
works; the event that persisted the pause remains unproved. Read-only bounded
health diagnostics now include paused/safeStartup flags and allowlisted event
names since startup time. Targeted26/26 passed. NO automatic resume, permission
change or production gateway change was introduced to make acceptance pass.
Success uses normal app.quit/before-quit/Core.close; a dirty-marker/renderer/
model/sleep cause must be established from actual evidence, never guessed.
Fresh exact-head complete Windows gates are pending; keep PR21 draft/unmerged.
Owner installation/data remain intact. At1% remaining save/report/pause.

## October 15 Windows retention and shared-chat acceptance follow-up

Both236bd23 Windows suites passed708/708 and all3 actual ACL cases. The PR
candidate genuinely passed installation, app17checks/12diagnostics/20views,
restart and Small inference at3GiB (effective2048/saved4096) before the wrapper
looked for the display-name uninstaller rather than pinned NSIS productFilename.
The wrapper now derives/validates its exact single direct nonlinked uninstaller;
five focused tests and real PowerShell5.1 name lookup passed. No build rename.
The push candidate passed initial install/app, but restart rejected one shared
chat HTTPS request. Its precise status/cause was not retained; safe validation
operation/status/error diagnostics and targeted restart/pause checks are being
added. Do not call that unexplained rejection fixed or merge pending checks.
Android PR4 merged exact-green to mainffa762a after6/6 real cases in both runs;
local95/95 includes both real HTTPS fixtures. Owner installation/data untouched.

## October 15 Windows ACL startup correction

Read [the current Windows gate](docs/WINDOWS_CANDIDATE_GATE_2026-10-14.md).
Both e8bd52c hosted suites passed705 tests and actual NSIS installation exit0;
installed executable/ASAR hashes matched. Actual app startup failed closed at
permission_check/STORAGE before vault/inference/restart/retention/portable.
01cc6a7 native diagnostics proved a retained explicit Administrators grant and
the local-owner LA display alias. Both original run logs/receipts are retained.

Root protection now applies one protected .NET DACL with only exact numeric
current-user/SYSTEM grants. Independent numeric/raw/typed checks reject extra,
inherited, deny or unsupported effective grant entries; no BA whitelist, RID
alias guessing or permissive reset. Owner/group/audit/file data stay unchanged.
Native synthetic regressions cover seeded broad grants, retention/idempotence,
inheritance and redirected paths. Final local Windows full suite708/708 passed
with0failure/cancel/skip; syntax237 and repository390 passed. Fresh exact-head
hosted Windows and actual changed binary acceptance remain mandatory/pending. Installed owner3.0.3 is untouched.

## October 14 real Windows candidate gate correction

Both e9550ce hosted Windows source suites passed705/705 with0failure/cancel/skip,
and both genuine NSIS installers built. Candidate freezing rejected checkout
changes before any installer/application/inference execution. Exact recovered
payload passes416 PE checks; packaged build-info equals committed metadata.
Isolated clean Git checkouts reproduced six generated browser assets becoming
modified during preparation despite identical LF blob bytes and canonical hash.
Explicit LF checkout attributes for ONLY those six generated manifest/Readability
files proved clean before/after/twice with both autocrlf settings. Strict source
cleanliness and unchanged release evidence gates remain enforced. Safe freeze
phase/code diagnostics now retain a non-sensitive failure receipt if needed.
Fresh exact-head complete gates are required before PR21 can merge or ship.

Android test-only347a128 retains production APK/signing/crypto and all security
assertions, replacing only unbounded test scroll actions. Fresh six-case actual
checks pending. Earlier e67 app/rawOS expiry passed twice on softwareKeyInfo0;
physical TEE/phone acceptance is unperformed. No owner app/data/key changes.

## October 14 Windows candidate acceptance in progress

Desktop Phase4 PR20 is merged after all8 exact661b6e8 checks passed; main is
5f81cb5a0cf4aa055d06b719c24234a19bd2dfaf. Read
[the current Windows gate](docs/WINDOWS_CANDIDATE_GATE_2026-10-14.md).
The new release-validation branch runs actual clean hosted Windows installation,
packaged app, genuine Small inference, restart/reinstall/portable and unchanged
release gates. Original local low-RAM failure remains retained. Exact-head hosted
results and release acceptance are pending; no installed owner app/data changed.
Android corrected e67b323 source passed93 full local tests plus14 focused tests;
PR4 remains unmerged until fresh six-case actual device checks pass.

## October 14 current Phase 4 source checkpoint

Read [Local companion pairing](docs/COMPANION_PAIRING_2026-10-14.md) and
[the four-phase tracker](docs/FOUR_PHASE_PROGRESS_2026-10-13.md) first.
Phases1/2/3 are merged: desktopmain1c1389d and Androidmain7e817069, both
passing main checks. Earlier pending/failure entries below are historical and
superseded by the saved actual completion evidence.

Phase4 adds local expiring QR bootstrap, preserves existing pairings/manual
links and notification-only boundaries, and retains five-minute OS-authenticated
Keystore sessions without an owner key migration. Desktop complete suite699pass,
zero failures/skips; actual Edge36checks, nativeIPC/HTTPS and development denial
pass. Final27caseguide/native/UI checks pass with explicit deterministicfixture
RAM input after ownedGradle contention exposed unrelated LOW_MEMORY failures;
failedreceipts retained and productionresourceguards unchanged. New source candidate3.0.4-dev is distinct from installed3.0.3-dev.
Android/source exact-head CI and changed-binary/device acceptance are still
pending. Do not claim a complete release from these source results.

Owner permits reviewed PR merge only after exact-head checks pass, then safe
main synchronization and verified obsolete cleanup. Do not replace production
apps/data, keys or pairings. At1% five-hour remaining save/report thenpause;
the previous one-time resume already fired. No new schedule or reset redemption
is authorized. Future additions first consider trustworthy free GitHub components
and reuse existing features.

---

## October 14 1% pause — current working source

Read the final pause section in docs/FOUR_PHASE_PROGRESS_2026-10-13.md first.
Desktop3d348f4 is onPR18, all exact-head CI jobs passed. UncommittedPhase3
backends/notices pass642 full tests; UI/transport integration remains unfinished.
Android13694876PR3 still fails one actual devicecase: systemcredentialfield
missing attestline154; newcauseundetermined. Preserve sanitized logs and all
working files. Both mains/installedapps/data/keys/signer untouched. One-time
resumealreadyfired; no subsequent resume was scheduled. Pause at1% now.

## October 14 Phase 2 source checkpoint

Read [the grouped evidence matrix](docs/FOUR_PHASE_LIBRARY_AUDIT_2026-10-14.md)
and [the phase tracker](docs/FOUR_PHASE_PROGRESS_2026-10-13.md). Watcher stability,
nullable reviewed staffing comparisons, all-day calendar contract and voice labels
are corrected. All595 desktop tests and bothEdge UI checks pass; Gitleaks zero.
No new dependency/schema/installed app/data change. Native helper compilation is
pending exact-new-head CI because local dotnet has no SDK. Android13694876 fixes
system-cancellation test action only; fresh hosted device acceptance pending.
Continue Phase3 onexistingrecords/permissions; Phase4 QR/session/release work follows.
Owner merges main. The prior one-time resume fired October14 at3:25 Eastern.

## October 13 four-phase source checkpoint

Read [the four-phase tracker](docs/FOUR_PHASE_PROGRESS_2026-10-13.md) first.
New review branch contains calendar, shutdown, worker recovery, staffing and
browser authorization fixes plus companion authentication/privacy/polling changes.
Desktop 577/577 tests, 25 hardening checks and both actual Edge UI checks pass.
Android combined 65 local cases pass; device tests compiled but are not executed.
Hosted checks and fresh changed-binary acceptance remain pending. Installed 3.0.3
and owner data/keys/signer remain untouched. The owner merges main.
Pause at 1% after saving a status summary; one-time thread resume is scheduled
for October 14 at 3:25 a.m. America/New_York. Fetch both mains on resumption.

## October 13 offline tools accepted on Windows

Read [the actual Windows acceptance report](docs/OFFLINE_TOOLS_WINDOWS_VALIDATION_2026-10-13.md).
Frozen binary code 0eb4313 passed genuine 3.0.2→3.0.3 installer upgrade, installed
app, real English image/scanned-PDF OCR, BGE/sqlite-vec search and Automatic Small
inference at min(actual RAM, 3 GiB), using 2048 while preserving saved 4096.
All 25 owner data files stayed byte-identical; private recovery remains outside Git.
Both exact-code CI runs passed all four jobs. All 552 tests/25 hardening/208 syntax,
clean install, production audit zero and real Edge UI passed. Portable CRC/all
767 file hashes/actual relocated execution passed; unchanged release gate passed.
Public OCR/search assets are provisioned on the owner PC. Android is unchanged.
This is a supplemental report commit, not a new binary. Preserve the failed first
receipts and current native inputs. Current instructions reserve main to the owner.

## October 13 offline document tools

Read [the offline tools checkpoint](docs/OFFLINE_DOCUMENT_TOOLS_2026-10-13.md).
Based on fetched main 421370e, branch chatgpt/offline-knowledge-tools-2026-10-13
adds optional local semantic Library search, offline English image/scanned-PDF OCR,
filtered Readability article capture and a redacted Gitleaks current-source/history
CI gate. Version 3.0.3-dev. Existing workflows and Android production code remain.
Source real BGE/sqlite-vec/image/PDF execution and five Edge acceptance checks passed;
42 focused regressions and all 552 automated tests passed, along with 25 explicit
hardening, 208 syntax, repository policy, clean locked installation and general/
hardening Edge UI checks. Production audit is zero. Fresh packaging/installer/
exact-head CI are pending. Do not transfer 3.0.2 acceptance to this changed source.
Current workspace instructions reserve main merging to the owner.

## October 13 local RAM and assistant response contrast

Read [the current repair checkpoint](docs/LOCAL_RAM_CHAT_CONTRAST_2026-10-13.md).
Based on fetched main dbdf470, review branch chatgpt/local-ram-and-chat-contrast-2026-10-13
adds Automatic context fitting without changing saved settings or reserves and
corrects light/dark reply contrast. Desktop version is 3.0.2-dev; Android is unchanged.
All 535 source tests passed after also aligning background RAM recovery with the
safe fitted-context requirement. Earlier 25 explicit hardening and 25 real Core/Edge UI checks passed;
production audit is zero. Source real Small inference passed twice. Frozen Windows
interim code 4f118fe built and its packaged startup/14 checks/12 diagnostics/19 views passed.
That package is superseded by final frozen code 2cf3f39: its installer built and
packaged 14 checks/12 diagnostics/19 views passed. Source real background recovery
and foreground inference passed at actual bounded 2.5→3 GiB admission. Preserve
interim failed/low-memory receipts. The genuine 3.0.2 installer upgrade now passed
with exit 0, exact installed EXE/ASAR hashes and all 25 existing owner data files
byte-identical. A private verified local recovery copy was retained outside Git.
Installed startup passed 14 checks/12 diagnostics/19 views. Actual installed
Automatic Small inference passed through renderer IPC/Core at a 3 GiB admission
ceiling, using 2,048 tokens while retaining the saved 4,096-token setting; no cloud
key/call or production test input. The unchanged release evidence gate passed.
Portable extraction, all 590 files/CRC and actual portable startup also passed.
This is constrained admission on the actual host, not qualification of a 3 GiB PC.
Keep the older 3.0.1 preview separate. The owner merges PR #16 into main.

## October 12 final hosted validation result

Read [the completed validation checkpoint](docs/FINAL_VALIDATION_2026-10-12.md)
and its [sanitized exact-head receipt](docs/final-validation-2026-10-12.json).
Both Android `47e3b4a` hosted runs passed all four instrumented tests, including
three real OS PIN/Keystore unlock/Notes/relock cycles and lifecycle cleanup.
All 51 local Android tests passed. Desktop `f7777a5` functional checks passed;
accepted Windows binary code remains `6e915aa`. Production binaries are unchanged.
All four hosted runs failed only their mandatory artifact uploads on GitHub quota.
Earlier sections are historical checkpoints; their pending Android status is
superseded by this result. Check current PR checks for later documentation heads.
The owner merges main. Keep review branches until successful integration.

## October 12 final local validation and cleanup checkpoint

Windows candidate code 6e915aa remains accepted with the same installer, portable,
runtime and evidence hashes in docs/WINDOWS_VALIDATION_2026-10-12.md. This checkpoint
changes documentation only; do not repeat binary acceptance without a relevant change.

Android review head ca1d6ea12e7686cf5067a4cd349a35e96ed07bfc corrects the test
scheduler only. Diagnostic run 38274513926 captured the original wrong-thread UI
exception before the secondary SlotTable teardown error. Compose's unconfined test
dispatcher resumed UI work on a repository IO emitter. The supported queued test
dispatcher and bounded transition waits preserve actual OS PIN/Keystore authentication,
three unlock/Dashboard/Notes/relock cycles and all assertions. No production code,
runtime dependency or authentication boundary changed. The new Notes regression
also checks ten draft-preserving disposal/restoration cycles with background state
emission. All 51 local tests pass with zero failures/errors/skips, including real
synthetic Node Core/SQLite pinned-HTTPS interoperability. Lint: zero errors/73 warnings;
app and test APKs build. The app APK hash remains unchanged at 4b3ea024d6d748a382682587834f1d5bf7168c7f83812b2c786828c79fb91425.
Evidence is in ignored Validation/assistant-first-2026-10-07/android-dispatcher-final-2.log
and Gradle XML. Hosted push 38307718223 and PR 38307723181 are running; their
actual device results must be checked before calling acceptance complete.

All 26 approved old CI archives were SHA-256/ZIP-CRC verified in local recovery and
deleted remotely (1,438,994,870 bytes). No app data, release asset or source branch
was deleted. Before this checkpoint, desktop c245f44 passed regression/dependencies
and built/validated release inputs; artifact retention failed on GitHub storage quota.
The quota gate remains mandatory. Check the latest exact-head runs, not old results.

Current workspace instructions reserve main merging to the owner. Both review branches
contain origin/main. Preserve them until review and integration; verified recovery
bundles retain superseded and divergent history outside Git. Physical-phone microphone,
LAN, notifications, signing-compatible upgrade and live Outlook/WhatsApp/PCC acceptance
remain unperformed. Automatic speaker identification is not implemented. See the dated
Windows report and each user guide for the complete practical limits.

## October 12 Windows candidate accepted; hosted checks pending

Read [the actual Windows report](docs/WINDOWS_VALIDATION_2026-10-12.md). Frozen code 6e915aa passed real installer/application/Small inference, uninstall/reinstall retention, installed restart, 583-file portable roundtrip/execution and the unchanged release gate. All 525 Windows tests passed. Source and deliverables remain development candidates; Android hosted device tests and GitHub artifact quota are still open. The owner authorized both-main merges and superseded-branch cleanup after completion; no failing-head merge is authorized by this checkpoint.

## October 12 final acceptance in progress

The owner explicitly authorized merging both reviewed main branches and deleting superseded branches after completion. Preserve unique branch work first. Final Windows validation is correcting a reproduced PowerShell 5.1 redirected-process null ExitCode issue by retaining the process handle; actual zero exit remains required. Dark Settings contrast is corrected and its real-browser regression passes. Android CI compiled and ran four device tests, but two UI tests failed before finding a Compose hierarchy; investigation remains open. GitHub artifact storage is full. Do not mark final acceptance complete until the new exact-binary evidence and CI have passed.

# In-progress assistant-first redesign

Read [the October 11 checkpoint](docs/ASSISTANT_FIRST_PROGRESS_2026-10-08.md) before continuing. It includes both apps, dark mode, offline meetings, explicit messaging approval, report schedules, tests and remaining acceptance. The owner revoked the old 1% stop rule. Older installer evidence does not cover this source.

# Shared AI development handoff

## Audit follow-up — 2026-10-07

Read [the follow-up](docs/AUDIT_FOLLOWUP_2026-10-07.md). Completed Worker results now survive temporary status-publication failure, and unavailable speech recognition no longer requests microphone access. A third confirmed fix prevents window-close callbacks from reading SQLite after shutdown. All 509 Windows tests passed after this correction; rebuild and acceptance remain required. Earlier repairs are preserved. Fresh native inputs were obtained from exact-head CI 37568590549 and are being manifest-verified for a new Windows package. Until a new dated execution report exists, older installer flags do not establish acceptance of these fixes.

## Pre-use audit repairs — 2026-10-06

Read [the repair report](docs/PRE_USE_AUDIT_FIXES_2026-10-06.md). Based on main `1527da64ba667ee862e2e71221f51063e4c06fa1`, this branch fixes indefinite retention, voice stop/privacy (including the duplicate sidebar toggle), interrupted Worker status publication, the regulatory exemption claim and Mammoth's production dependency advisory. Android/protocol/schema are unchanged. See `PROJECT_STATUS.json` and the review PR for current source checks. The older installer below does not contain these repairs; its Windows execution flags must not be transferred to this branch. A new hash-bound package acceptance is still required; the local generated native build inputs are currently absent.

## Current Windows candidate — 2026-10-06

The tested **3.0.1-dev** binary is frozen code `46a385d2a8d1b14acf3e960f2b4c601159ba3d04`, based on main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`; later reports/handoffs/source exports are supplemental. Read [the dated report](docs/WINDOWS_VALIDATION_2026-10-06.md) and [sanitized machine summary](docs/windows-validation-2026-10-06.json). Actual package/install/uninstall/reinstall, synthetic default-path DPAPI/SQLite retention, installed restart, Small local inference and 575-file portable roundtrip/extracted-app acceptance passed the unchanged hash gate. Current packaged shared capture/evidence/actions/internal drafts/selected-chat/lock/restricted reminders were exercised through IPC and pinned loopback HTTPS. No real message or mailbox dispatch occurred.

Exact-code checks: 500 Windows tests, 499 Linux CI tests, 25 hardening, 184 syntax; both code CI workflows 37441844506/37441839760 passed all three jobs. Production audit is **3 moderate, 0 high, 0 critical** through mammoth/argparse/sprintf-js, not zero findings; see [the primary advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). Current model acceptance is **Small**; Medium/High remain historical October 2 bc964e09 evidence. Physical Android/LAN/notifications, live WhatsApp/Outlook/native browser, representative data upgrade, reboot/wizard, clinical human review and signing/updater remain separate. This is an unsigned development candidate, not production readiness or HIPAA certification.

The failed 11a9114 TLS-client and 34f9d3e IPC-unlock/Notes harness attempts remain retained. Corrections were validation-only; no production TLS relaxation or established production UI defect. Preserve the prior deliverables. Do not transfer any binary's flags by version label, and fetch main before future work/publication. Supplemental documentation commits require their own exact-head CI; they do not rebuild this installer.

Android review head 85db208 also passed 4 hosted emulator instrumentation tests. Hosted unit tests passed 44 with 1 explicitly skipped external desktop fixture; local tests passed 45 with 0 skips. Local lint has 0 errors/72 warnings, hosted lint 0/74. These are separate debug/hosted checkpoints, not physical-phone or existing-signer upgrade acceptance; production APK inputs remain the separately documented local checkpoint.

## Shared captures and native Android integration — 2026-10-05

Fresh base: desktop main `c269a18eec4ea5b4e347e3520be1cd4e9bd88876`, Android main `7028ec6d131ffaaf9e03d2f22b3550d7a38ddf3c`. Both use `chatgpt/shared-companion-workflows-2026-10-05`. Read `docs/SHARED_CAPTURE_IMPLEMENTATION_PLAN_2026-10-05.md`, `docs/SHARED_COMPANION_UPDATE_2026-10-05.md`, `docs/NOTES_ROUNDS_COMPANION_GUIDE.md` and the extended Android contract. Desktop draft review is [PR #13](https://github.com/yosefbf-bot/Private-AI-OG-google-version/pull/13); the matching Android source `56e6796` is [PR #1](https://github.com/yosefbf-bot/AI-Mobile-companion-app/pull/1). The user merges both mains.

Shared encrypted source notes/evidence produce idempotent canonical review todos and internal drafts. Exact source spans and unknown fields remain; no AI/clinical conclusion or external send is inferred. Rounds edits reuse delegations and preserve confirmed deadlines. New unknown deadlines are no longer guessed from urgency. Remote inference excludes unrelated global context; optional phone local/HIPAA constraints cannot weaken desktop safeguards.

HTTPS adds scoped captures/actions/drafts/evidence, explicitly selected PC conversation history/continuation and generic reminder metadata. Full pairing remains lock-denied; a separate notification-only credential is accepted only for notification list/receipt. Explicit desktop pairing can allow that metadata while locked without changing Core's general lock. Revocation removes both credentials. WhatsApp capture commands retain verified sender/conversation gates, independent read-all/global-write controls and uncertain-delivery tombstones. AutoReminders is now actually saved/validated.

Final isolated complete Windows source run: 500 tests passed, with zero failures or skips. Focused shared safety runs, desktop IPC/development HTTP and 30 synthetic Edge UI checks passed; the bounded captures component additionally passed three real Core/Edge checks. Hardening 25 and production dependency audit zero. Exact initial head `80fde3f` passed all three GitHub jobs in run `37319044402`; later fixes require their own exact-head check. The frozen Android source passed 45 unit tests with zero failures/errors/skips, including actual Node Core pinned-HTTPS interoperability; lint passed with zero errors and 72 warnings. Debug app/test APKs built and the app signature verified using portable hash-verified JDK/SDK; source digest and APK hashes are in Android's validation report. No physical phone, real LAN, real account message or mailbox write occurred. Source checks do not establish packaged release readiness. Local release-file gate remains blocked until native helper/runtime inputs are prepared; earlier CI built and validated genuine inputs without weakening that gate.

Final review fixed opted-in locked WhatsApp reminders, preserved explicitly disabled reminders through follow-up edits, rejected unrepresentable dates, and made byte-bounded list labels accurate. One full-suite attempt while Gradle consumed RAM hit normal LOW_MEMORY protections (472 passed, 27 failed, one timed out); the isolated final 500-test run passed after the owned build exited. An additional general UI retry hit the same protection; the previously completed 30 checks and the isolated three changed-component checks are the actual passing UI scope.

Android full credentials/records require real device authentication and Keystore encryption, additive Room/content migration, separate demo data, real pinned HTTPS responses and encrypted stable pending requests. Known old simulated phone data must be retained but clearly labeled unverified. Full phone background credentials must never be decrypted by a generic notification worker; use only the restricted key/certificate. Physical OS-authentication/Keystore, migration, camera/local dictation, notification delivery and signing compatibility still require acceptance.

Later desktop head `2354815` run `37359845980` ended before any steps: GitHub annotations report that no hosted runner was acquired after multiple attempts. It is not an executed test failure/pass; inspect the final published head separately. Android handoff and actual final local results are in its own repository. Preserved source exports are transfer snapshots; GitHub remains authoritative.

The earlier validated installer/package below belongs to its exact earlier code checkpoint. It does not contain this source update. Preserve recovery/models outside Git and keep the existing release/privacy/resource gates. The former 1% stop rule was subsequently revoked by the owner. The prior one-time 3:35 AM wakeup was superseded and paused after the user resumed manually.

## Historical Windows validation — 2026-10-02

PR #11 is merged. Latest GitHub main was fetched and verified as
`114e0838fac230d33a9deb2996b7dfc736ce9d90`, matching the 10/1 integration tree.
Validation branch: `chatgpt/windows-validation-2026-10-02`.
The tested **3.0.1-dev** binary is built from code checkpoint
`bc964e09c28e996178196661bfccdcef6d3fac41`; later handoff/guide commits are supplemental
and do not change its hashes. Read [the dated Windows report](docs/WINDOWS_VALIDATION_2026-10-02.md)
and `PROJECT_STATUS.json` before making release claims.

Actual Windows application, installer and local-model execution now passed the
unchanged hash-bound release evidence gate. The NSIS installer exited 0 and its
installed EXE/ASAR match the tested package. Fresh/restart packaged runs passed
real DPAPI/SQLite synthetic persistence/restore, 12 built-in diagnostics, 21 views,
IPC lock, optional PCC and independent WhatsApp controls. No live messages were sent.
With no API key and PCC off, real renderer/IPC/Core inference through Small and
the installed High model kept synthetic unavailable medication status **unknown**.

Small 1.7B, Medium 3B and High 4B passed two real inference rounds, including model
checksums, cancellation and browser-lane guards. Initially available RAM was about
5.9–6.5 GiB; High used about 4.6 GiB at context 4096. High remains conditional on
available RAM/workload; no protection was weakened. Extra 8B is absent and untested.
The earlier High low-memory failure is historical evidence, not this candidate's result.

Source checks: **472 Windows tests**, **25 overlapping hardening tests**, **178 JS
syntax checks**, repository policy and zero-vulnerability production audit; **29 Edge
general UI checks**, updated restricted hardening UI and synthetic WhatsApp UI passed.
Linux registers 471 tests because the added interoperability test genuinely requires
Windows PowerShell 5.1. Merged-main CI run 37050270590 supplied hash-verified release
inputs. Exact code-checkpoint CI run 37055284317 passed all three jobs, including
471 Linux tests, 25 hardening, 178 syntax checks, zero audit findings and 406 PE inputs.
Later supplemental-documentation publication CI is checked separately on the PR.

Two bounded fixes are included: the installer validator writes BOM-free UTF-8 that
the existing evidence gate can parse in PowerShell 5.1, and Today renders unavailable
census/occupancy/HPPD explicitly with neutral styling while preserving confirmed zero.

The owner authorized replacement of the unused old app/data; a recovery copy was
preserved outside Git and was not used as clinical/test input. This is clean-app-state
installation acceptance, not representative existing-data upgrade acceptance.
The actual candidate uninstaller exited 0, preserved synthetic standard-path
database/vault bytes and removed its folder/registry/shortcuts; same-hash reinstall
and installed second-process restart passed with the original synthetic vault/records.
The post-NSIS final stage has 570 files/415 PE binaries; its standard helper addition
matched the pinned builder cache and every ZIP roundtrip file hash was verified.
The actual ZIP-extracted application passed 13 acceptance checks, 12 diagnostics
and 21 navigation views with the same EXE/ASAR hashes.
Windows restart, interactive wizard, representative clinical/PCC, real speakers,
live WhatsApp/accounts/native browser connections and physical Android acceptance
remain pending. The installer is unsigned and the development candidate is not a
production or HIPAA compliance certification. The fresh live app still requires
local-model configuration; GGUF weights are not bundled.

Use [the standalone guide](docs/INTEGRATED_STANDALONE_GUIDE.md) for local setup, optional
PCC and Messaging. Android must implement the certificate and pairing contract in
`docs/ANDROID_COMPANION_CONTRACT.md`; no phone acceptance or automatic firewall change
is inferred. Keep the current GitHub architecture, earlier preserved functionality,
all vault/security boundaries and the unchanged release gate.

## Historical 10/1 standalone integration checkpoint

GitHub main `0a7ec92fa18c52ed8983aa06803977e3a220cf02` was fetched/verified before
integration and again before publication. Active branch:
`chatgpt/import-local-hardening-2026-10-01`, version **3.0.1-dev**.
Local 3.0.0 standalone work has been adapted into the newer clinical/provider/
workflow architecture; the exact old archives are historical references under
`handoff/local-3.0-2026-10-01`, never replacements for the current checkout.

Read `docs/LOCAL_HARDENING_INTEGRATION_2026-10-01.md` and
`docs/INTEGRATED_STANDALONE_GUIDE.md`. General clinical imports/rules remain available
with PCC off. One capability service controls PCC manual import/monitoring.
Optional cloud/local text routing retains newer privacy approvals and budgets.
WhatsApp gains opt-in status-only report-job notifications and retains independent
read/write permissions. Existing data is preserved. DOMPurify is patched to 3.4.16.

Current local verification: 471 full-suite tests; 25 overlapping hardening tests;
29 general Edge UI checks; restricted-development and synthetic WhatsApp UI passed;
production audit zero vulnerabilities. Generated Windows helper/runtime inputs are
absent in this fresh clone; exact-head Actions must build/check them. The combined
artifact has not undergone actual installer, packaged application, local inference,
installed-data or live-account acceptance. Earlier Windows results below are historical.
The Android companion is developed separately. The desktop now implements the four
authenticated HTTPS endpoints, explicit interface binding and per-phone pairing in
`docs/ANDROID_COMPANION_CONTRACT.md`. Android must verify the paired certificate and
implement the documented URI/error/null handling. Phone/LAN acceptance is pending.
No firewall rule or development IPC exposure was added. Main is for the user to merge after review.


Read `AGENTS.md`, `GEMINI.md`, `PROJECT_STATUS.json`, `ARCHITECTURE.md`, and `docs/AI_STUDIO_REVIEW_2026-09-25.md` before changes. GitHub is authoritative; record the exact base SHA and inspect the latest source/history. Roadmap entries, old manuals and UI mockups are not implemented-feature evidence.

## Historical workstreams and preserved implementation details

PR #9 is merged at `a4127e09472b03337346c47be8fee964330854cf`; its main CI passed (36587165573). Latest main fetched on 2026-09-29 is `a5d22b623c5c49fccd36b41bd4488d2a64fac346`, whose Google update deleted the lockfile/build inputs and failed all three CI jobs (36640248873). Current repair branch: `chatgpt/google-main-ci-repair-2026-09-29`. Verified code checkpoint `ec0ae9c74123eb74c410e8865609ddcf8aeacbe5`: 414 tests, 25 hardening tests, Edge hardening UI, syntax/policy, zero-finding audit and 406 PE release inputs passed. Read `docs/GOOGLE_MAIN_REPAIR_2026-09-29.md` and the mandatory `docs/GOOGLE_AI_STUDIO_GUARDRAILS.md`. Previous packaged Windows evidence is historical; installer and human acceptance remain blocked. Existing faulty-version executive samples/tasks need reviewed disposition, not silent deletion.

PR #4 was merged into main at `21969ff21a5ab51bdb12900aea2d618eb96a3466`; its regression, dependency and release-file CI checks passed (run 36363249305). Do not repeat that merge or treat its old branch notes as current status.

PR #5 is merged into main at `6e3f85b3faffb1688f34d7681c5765e5be04cf82`. Its six high-priority repairs, dashboard cleanup and experimental voice improvements are the base for this work.

PR #6 is merged into main at `a897ba7a6f7ea0d79ec4e3593cc1260396e03a7e`; regression, dependencies and release-file CI passed (run 36465145722). Read `docs/ADMINISTRATOR_WORKFLOWS_2026-09-28.md` for the implementation matrix and remaining physical acceptance.

PR #7 is merged at `f0b6d88e274a77e38fb7ee67a686b5e1b81251b2`. Its checkup findings remain in `docs/APPLICATION_CHECKUP_2026-09-28.md`.

PR #8 is merged at `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a`, the main checkpoint fetched on 2026-09-28. Main CI run [36499532128](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36499532128) passed. Read `docs/BROWSER_PASSWORDS_2026-09-28.md` for browser choices, Bitwarden handoff and acceptance limits. PRs #6–#8 no longer require merging.

Executive Desk, Operations Analytics & Assistant Consolidation (2026-09-29):
Implemented the Administrator Executive Desk (`source/executive-desk-engine.cjs`, `source/ui/executive-desk.mjs`), Operations Analytics & Regulatory Sentinel (`source/operations-analytics-engine.cjs`, `source/ui/operations-analytics.mjs`), and Executive AI Assistant Suite (`source/executive-assistant-engine.cjs`). Read `docs/EXECUTIVE_DESK_AND_OPERATIONS_ROADMAP.md`.
Consolidation and architecture review enforces strict adherence to single canonical systems:
- Executive Desk rhythm, inbound triage ("My Commitments" vs. "Waiting On"), Department Head delegation, and Executive Rounds punch list findings synchronize bidirectionally with canonical Action Center `todo` and `wf_action_meta` records. Edits, completions, and closures propagate across views without duplicating task stores.
- Scheduled 4:30 PM unclosed-loop audit reuses existing scheduler infrastructure without spawning independent daemons or background execution engines.
- Operations Analytics ingests OnShift/universal staffing schedules and evaluates deterministic formulas for approaching overtime, incidental punch leakage, and FTE deficits. All outputs explicitly declare source coverage, assumptions, and disclaimers as staffing planning estimates (not automatic hiring directives or employee evaluations).
- Regulatory Compliance Sentinel tracks license and certification renewal windows (CLIA, BNE/CDS narcotics, DOH operating certificate, Life Safety fire/generator, Medical Director credentials) and creates linked canonical Action Center tasks within active renewal windows.
- AI Assistant features (context ghostwriter, meeting prep dossiers, voice memo multi-parser, commute audio briefing, contract scanner, difficult conversation coach, 14-day conflict radar) currently use deterministic templates and heuristics, not demonstrated local/hybrid provider execution. The repair removes invented facts, isolates Demo and restricts commute speech to explicitly local voices. Human review and existing microphone policy remain required.
- Navigation remains consolidated: sidebar links to `Today`, `Action Center`, and `Operations & Meetings` without top-level bloat. Executive Desk is reachable from the Today command header, and Operations Analytics is integrated directly within Operations & Meetings.
- Original module verification covered 27 mock-based subtests. The repair adds three real Core/SQLite safety tests; current full-suite and Edge results are recorded above. Do not treat the original module tests as complete integration acceptance.

Historical PR #9 validation branch: `codex/release-validation-2026-09-28` (explicit user-requested naming), based on that main SHA, re-fetched unchanged on 2026-09-29. Preserve dated earlier reports as historical evidence. Release validation passed 384 regression tests and 25 hardening tests (overlapping subset), syntax, repository policy, zero-finding production audit and four-browser synthetic checks. The real Windows package passed isolated DPAPI startup/restart/restore and its 12 built-in checks after fixing the PDF utility-process worker. An unsigned NSIS installer was built, not installed. Read `docs/WINDOWS_RELEASE_VALIDATION_2026-09-28.md` and `docs/HUMAN_ACCEPTANCE_2026-09-29.md` for artifact hashes, exact coverage and blockers. This is not production readiness.

Small/Medium local inference passed repeated actual-runtime tests. High passed once but later triggered low-memory protection; Extra High is absent. Existing installed data/vaults were not opened, upgraded or replaced. Real installer/upgrade/uninstall, representative PCC, microphones/speakers, account/Bitwarden/native-companion and full UI acceptance remain pending. Historical vault/database objects and credential-shaped test strings require authorized owner investigation; do not rewrite history or rotate active material without explicit authorization. Next-stage product enhancements remain deferred until acceptance is stable.

## Non-negotiable implementation rules

- Never commit secrets, PHI, runtime databases, vault keys, credentials or browser sessions. Preserve installed `%LOCALAPPDATA%\PrivateAI2` data/vaults and the Store/Core/IPC contracts.
- Keep `package-lock.json` and tracked Windows `build/` inputs. Web preview exports can omit required desktop files; absence in the preview is not authorization to delete them. Use `npm ci --ignore-scripts` with the lockfile.
- Desktop renderer calls go through `window.privateAI`; no Node access in UI. Wire new features in both desktop IPC and the restricted development adapter, retaining their separate allowlists and unlock/origin checks.
- For editable UI, verify edit → save → reload → downstream/copy output. Review/finalization must apply to the saved revision. Test the actual call path through Core/SQLite/IPC/HTTP where relevant, not only mock module methods or source strings.
- Never invent clinical or operational measurements, source citations/dates, diagnoses, medication, code status, staff identities, audio samples or facility approval. Missing data is unknown; incomplete imports are not an all-clear. Built-in protocols are unapproved references.
- Demo content belongs in the selected isolated encrypted namespace; generated/copied output must say DEMO DATA. Do not seed production. Legacy SBARs predating evidenceVersion 2 are retained for inspection but cannot be signed off; recreate from verified sources.
- Browser speech recognition may send audio off the device. Meeting and chat microphone policies must block it in HIPAA/Local Only and when policy is unavailable; stop capture on navigation, completion and policy changes. No simulated audio measurement can be labeled as verified training.
- Keep clinician review gates, immutable evidence, pending callbacks and unresolved critical alerts. Clinical source changes are supplemental and require independent clinical acceptance.
- Do not weaken security or tests to make a preview green. Keep changes bounded, review diffs and document limitations. Do not claim Windows readiness from source tests.

## Development preview authentication

Development mode is `Development / Demo Mode — Not for PHI` and binds to `127.0.0.1:3000`. Data stays outside the repository; the development vault is not Windows DPAPI. No production LAN/cloud hosting is supported.

The server loads or generates a random token in the git-ignored local `.env`. `PRIVATE_AI_DEV_TOKEN` must be at least 32 characters. The UI uses a DOM token form compatible with iframes, then POST `/api/session` and session/CSRF headers. Token injection into HTML and the unauthenticated `/api/dev-token` endpoint were removed because they defeated token possession. Do not restore them.

By default accept exact localhost/loopback host and origin/port combinations only. An optional `PRIVATE_AI_DEV_PREVIEW_ORIGIN` accepts one exact HTTPS preview origin, e.g. the project's own run.app origin. Wildcard cloud host trust and untrusted `X-Forwarded-Host` are prohibited. Session headers support restricted-cookie previews; session query credentials are accepted only on `/api/events`. A parent frame's origin is not the API's origin. Keep filesystem, import/export and background automation restrictions.

## Verification commands and evidence

Use Node 24. Run:

```
npm ci --ignore-scripts
npm test
npm run test:hardening
npm run check:repository
npm run lint
npm audit --omit=dev --audit-level=high
npm run check:release
```

Run `npm run test:hardening-ui` where Chromium is available, providing `PRIVATE_AI_TEST_CHROMIUM` when necessary. It covers the login form, Today/demo/evidence/follow-up navigation, Surveillance, Operations SBAR edits, Automation and all five workflow pages. The current checkup passed in Windows Edge after removing forced single-process launch flags and correcting the modal scope; the completed Today screenshot was visually inspected. Earlier supplemental DOM checks remain historical evidence. Full packaged-desktop, visual and keyboard acceptance is still pending.

Current browser verification: `npm run test:browsers` passed synthetic download/sign-in, filtered page/selection capture and browser choice save/edit/reload/use in installed Chrome/Edge and managed Firefox/Chromium. The general Edge UI suite passed 27 synthetic UI/keyboard checks; hardening and messaging UI checks also passed. Real Bitwarden vault/autofill, Brave/Vivaldi, and packaged native companion connectivity remain on-PC acceptance. `npm run setup:browsers` installs optional matching Firefox/Chromium runtimes into Playwright's per-user cache; it does not import a regular browser profile. Local release-file verification now passes with genuine CI-built inputs: 406 helper/runtime PE files. These ignored generated inputs are not committed; retain their hash manifest and CI provenance.

Browser passwords stay in browser/manager-controlled profiles. Do not add password getters, vault/clipboard extraction, cookie export or automatic manager unlock. The new login step waits for a post-login control, and users handle unlock/MFA. Manual browser setup permits network access; an automated report run reinstalls its reviewed-origin filter before navigating. Native companion permissions and the development-browser denylist remain unchanged.

`npm run build` and `lint` are syntax checks only. `check:release` is the Windows input gate. Restored build scripts/icon are present; Windows helper/runtime binaries must be built by the documented workflow. Actual install, existing-data upgrade, vault, local inference and feature execution at the artifact SHA remain release requirements. Record exact passing/failing counts and all unperformed tests in PROJECT_STATUS; do not reuse historical claims as current evidence.

## Speaker recognition contract

Keep the speaker feature available. Local recordings produce experimental suggestions only after three confirmed recordings, quality checks, a strict similarity threshold and separation from competing profiles. These thresholds are not probabilities. Automatic suggestions are never verified identity or task ownership; a person must confirm each attribution. Do not substitute browser transcript confidence for speaker identity. Do not fabricate acoustic samples, add roster score bonuses, or silently train on corrections. Keep local capture separate from policy-gated browser transcription, and preserve capture cancellation and raw-audio non-retention.

## October 14 current assistant workflow checkpoint

Desktop Phase 1/2 PR #18 is merged at c11c1afb. Android reliability PR #3 is merged at 7e817069; both exact-head 5a2fe0f device runs passed all four cases (three actual PIN cycles, both Home returns, cancellation/rotation). Hosted units64 passed/one external fixture skip; lint zero errors/75 warnings. Keep physical-device acceptance separate.

Desktop Phase 3 is implemented on `chatgpt/assistant-workflows-2026-10-14`: saved-source word search, source review/local-calendar freshness, selected redacted copies, opt-in cached correspondence and one Dashboard's source-linked notices. Final suite671 passed, zero failures/skips/cancellations; syntax230; full-app and isolated Edge flows passed; Gitleaks current/history findings zero. See `docs/ASSISTANT_WORKFLOWS_2026-10-14.md` and the primary four-phase progress file for exact scope and remaining release/device gates. Preserve owner permissions, source revisions and normal provider/privacy safeguards. Installed applications/data remain unchanged; the accepted delivery is still3.0.3-dev. Publication checks are required before merging this new branch.
