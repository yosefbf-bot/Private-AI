> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 3.0.0 — candidate status, not an accepted official release

The user has authorized work toward 3.0. The current candidate contains the implemented desktop changes, browser variants, updated documentation, and local troubleshooting. The Healthcare Knowledge Engine remains specification/design only; it is NOT present in this executable. Release scope clarification is pending. Other pending capabilities are recorded in IMPLEMENTATION_TRACKER.md; do not assume every earlier requested feature is included.

Verified for this candidate:

- 229 regression tests passed, with no failures or skips.
- Actual packaged Windows application execution passed using isolated test data, including renderer IPC and real DPAPI/SQLite startup. Exact EXE/ASAR hashes are in application-evidence.json.
- The Windows executable resource version is 3.0.0.
- Actual local-model inference passed using the packaged Windows runtime and an existing Qwen3-1.7B model, with two synthetic source questions. Runtime/model hashes and actual responses are in inference-3.0-candidate.json. This is engine inference, not a clinician-reviewed healthcare evaluation or a full model-install test on a new PC.

Still required for official acceptance:

- Confirm whether the Healthcare Knowledge Engine must be implemented before this release or is explicitly deferred. No deferral has been inferred.
- Execute the real installer on a clean Windows VM/test PC. The installer has been built, not executed. Do not overwrite an existing Private AI installation just to run validation.
- Complete live integration acceptance or explicitly document agreed limitations. Live WhatsApp and Firefox integration remain unverified.
- Check the current actual-model-inference report when present; earlier engine results do not substitute for current evidence.

The installer is unsigned. No signing certificate/service or release hosting has been provided. There is no completed automatic-update service.

Use build/Test-CleanWindowsInstall.ps1 on a clean Windows test environment with the expected installer, executable, and ASAR hashes. It runs the installer, validates the installed payload and application, and creates installer-evidence.json. It refuses existing Private AI installations/data. Leave the test environment available for subsequent checks. The release-evidence gate rejects missing or mismatched installer execution evidence.

Do not describe a candidate ZIP, generated guide, or passing synthetic test suite as proof that the official release is finished.

