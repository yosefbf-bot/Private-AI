# Private AI 2.1.3 — validation status

Evaluation build, 11 September 2026. Windows binaries were cross-packaged on Linux and have not been executed on a real Windows PC here.

## Completed evidence

- 128 automated regression checks passed, zero failures. They cover prior startup/file-handle and key-preservation bugs, encrypted records, permissions, retention, document processing, API behavior, Worker handoffs, four processing modes, Local Only network guards, memory refusal/unloading, usage estimates, messaging authorization/deduplication/uncertain delivery, background permission isolation, calendar overlaps, and per-task forwarding.
- 22 Chromium UI checks passed with synthetic IPC and data. These include manual Chrome page capture, untrusted HTML stripping, small-window navigation, AI Processing, Usage, Messaging, and Browser reports.
- The pinned Qwen3-4B Q4_K_M GGUF completed real CPU inference through the local runtime on Linux with zero OpenAI calls. Runtime and model downloads were verified against pinned SHA-256 checksums. This is not a laptop speed benchmark.
- The .NET Windows helper compiled successfully as a self-contained x64 application.
- Packaging checks compare bundled code and extension files against source, inspect PE architecture, native dependencies, inference runtime, and Electron security fuses. Installer integrity and ZIP checks accompany the final downloads.

Validation logs are included in each download's Validation folder. Tests use synthetic content; no live mailbox, WhatsApp account, or reporting site was accessed.

## Required on-PC acceptance

1. With synthetic data and your usual Windows account, close all Private AI processes and run the new installer over the existing installation. Confirm prior settings and chat history remain, and run Settings → Run local checks. Do not delete the encrypted data folder to troubleshoot.
2. Download/select the optional model. Try local arithmetic and a short attached-text summary in Local Only. Confirm no OpenAI calls appear. Test loading/unloading on the laptop and normal responsiveness.
3. If cloud use is authorized, verify your existing key, approved settings, and a synthetic API call. Check actual token counts and configured price estimates.
4. Check permission-controlled classic Outlook reads and calendar output. Confirm overlapping appointments against Outlook.
5. Pair your own WhatsApp group with synthetic content, verified sender IDs, and the PC command code. Test new-message intake, a completion reply, conversation changes, sign-out, and Disable. Windows intake may expose insufficient stable identifiers; replies require the Web fallback. Native-only sending and attachments are not implemented.
6. Configure and validate each website's exact report workflow. Confirm downloads reach the chosen ShareSync report folder. Test temporary ShareSync unavailability.
7. Leave Worker running through a full workday, including scheduled tasks, model idle unloading, messaging interruptions, and recovery after Windows sign-in.
8. Evaluate portable operation separately using the same account; run only one app copy at a time.

Until these checks succeed, the full upgrade plan is not fully accepted. This package does not certify HIPAA compliance. See HYBRID_UPGRADE.md for the precise implemented behavior and remaining feature limits.

## 2.1.2 checks

Six additional download/catalog checks cover both catalog entries, verified reuse, corrupt existing files, truncated downloads, unknown IDs, and concurrent/cancelled downloads. The added UI check confirms that each model button requests its own catalog ID. Validation/llama-smoke.json records the real Linux inference result separately. No API calls were made by this model test.

## 2.1.2 repair validation

The recorded model-selection event is now exercised in Chromium. A simulated startup failure remains visible without clearing unsaved settings. Four new regression checks cover Microsoft DLL presence detection, Windows exit-code classification, safe diagnostics, and repeated Load clicks. These checks do not prove that the Microsoft prerequisite is missing on any particular user PC. See STARTUP_FIX_2.1.2.md.

## 2.1.3 loading and runtime fix

See STARTUP_FIX_2.1.3.md. The 128-test suite includes loading through maintenance, memory-pressure error preservation, cancellation before spawn, late health responses, and the recorded RAM budget. The Windows engine now includes its compiler runtime and passes transitive DLL/symbol checks. Both models passed actual inference and manual-load maintenance on Linux (startup-inference.json). Windows execution is still pending; Wine could not run because this environment disallows Unix sockets.
