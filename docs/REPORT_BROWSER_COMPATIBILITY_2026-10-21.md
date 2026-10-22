# Windows report-browser compatibility

Candidate3.0.9-dev, based on main783534b2df6247badff53d7272ddf1e1b2e76fc5.

The merged-main Windows run39702271511 passed760 of761 source tests. The
synthetic persistent-profile download failed after a real Edge process exited
with3221225477(0xC0000005), before worker cleanup. Installer/application/model
acceptance was not executed in that failed run. The failed job's immutable
[runner image](https://github.com/actions/runner-images/blob/win25-vs2026/20261007.264/images/windows/Windows2025-VS2026-Readme.md)
lists Edge154.0.4258.62. The passing PR32 job's UI step records155.0.4283.62.
The native failing process did not record its version or a symbolized crash
stack, so its exact upstream callsite remains inferred.

[Microsoft Edge's issue](https://github.com/MicrosoftEdge/DevTools/issues/461)
and [Playwright's upstream investigation](https://github.com/microsoft/playwright/issues/42506)
describe the matching Windows persistent download-history crash and the shared
Chromium history-loading fix in engine155. The latter also documents Chrome154
failures and successful repeated launches with patched bundled Chromium155.
This evidence supports covering Windows Chromium engines, including Chrome,
Brave, Vivaldi and managed Chromium, rather than only Edge.

## Behavior

- Report execution checks the actual launched engine version before explicit
  workflow navigation or application credential use, including a reused manual
  setup session. Unknown, malformed or pre155 Windows Chromium versions stop
  with update guidance. Existing scheduled-failure handling pauses linked
  schedules and revokes unattended approval, preventing automatic retries.
- Close the report browser, update through its normal controls or administrator,
  test the workflow, approve it again, and re-enable paused schedules. Browser
  profiles, download history, reports and protected credentials are retained.
- Firefox, non-Windows paths and general chat retain their existing behavior.
  Manual browser setup remains available. A crash during browser launch can
  still produce the existing startup error before a version can be inspected;
  the postlaunch guard cannot guarantee prevention or update guidance then.
- The pinned Playwright and core packages advance together from1.63 to1.64.
  The official1.64 browser manifest supplies patched Chromium156.0.8078.4,
  preserving the managed runtime option. No new integration is added.
- Disposable hosted Windows CI checks the actual Edge executable before source
  tests. Only if it is old, the job upgrades using Microsoft's current Stable
  x64 MSI, verifies catalog SHA256/size and Microsoft Authenticode, requires
  successful installation, and rechecks the installed version. This script
  rejects an ordinary owner-PC environment. No downgrade or browser substitution.

No profile-history edits, download transport workaround, authentication bypass,
credential export, resource relaxation, longer retry or skipped test is used.

## Validation boundary

New tests cover version parsing, old/unknown engine rejection, resource cleanup,
reused sessions, and linked schedule/credential protection. The actual native
fixture now records bounded numeric engine versions alongside existing process
exit telemetry. Its three fresh DPAPI save/restart pairs remain mandatory.
The UI regression checks update guidance in both themes.

Fresh full exact-head PR/main Windows installer, packaged application, Small
inference, retention/reinstall and portable acceptance are required before
installation. Check current PR/raw receipts for results; this source note alone
does not establish release readiness. Existing owner3.0.8 data/recovery and the
accepted Android1.2.7 APK remain intact. Live PCC/Power BI, physical-phone and
physical Windows-lock acceptance remain separately unperformed.
