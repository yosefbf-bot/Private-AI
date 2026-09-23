> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 2.1.5 — automatic local brain tiers

This extends 2.1.4. Existing Windows runtimes, security/retention behavior, manual Chrome capture, task coordination, interference warnings, ShareSync outputs, and model downloads are retained.

## Model lineup

| Tier | Model | Download size | Estimated free RAM before load at 2048 context |
| --- | --- | --- | --- |
| Small / Low | Qwen3 1.7B Q4_K_M | 1.28 GB | 2.7 GiB |
| Medium | Llama 3.2 3B Instruct Q4_K_M | 2.02 GB | 3.4 GiB |
| High | Qwen3 4B Q4_K_M | 2.50 GB | 3.8 GiB |
| Extra High | Qwen3 8B Q4_K_M | 5.03 GB | 6.2 GiB |

Medium and High are the same pinned models already included in the prior downloader. Existing files are discovered and verified, not redownloaded. Small and Extra High are additional optional downloads inside the app, not weights bundled in the application ZIP. Only one model is loaded at a time; download sizes do not add together as running RAM. At 4096 context, add roughly 0.5 GiB to the table's conservative app estimate. Windows workload, context, engine buffers, and paging can change actual memory use.

For this primary PC, the recommended default is Automatic with a High cap. Extra High can be enabled after downloading it and when sufficient RAM is available. Tier names describe the app's size/capacity ladder; they are not benchmark rankings or guaranteed accuracy. Keeping the already-used model families avoids a runtime architecture change. A newer model is not automatically a better fit for this CPU/RAM configuration.

Sources for new models (metadata checked September 14, 2026):
- Original Small model: https://huggingface.co/Qwen/Qwen3-1.7B
- Small Q4_K_M conversion: https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF — immutable revision dcb19155b962dbb6389f4691a982043a8e651022, SHA256 72c5c3cb38fa32d5256e2fe30d03e7a64c6c79e668ad84057e3bd66e250b24fb.
- Extra High official GGUF: https://huggingface.co/Qwen/Qwen3-8B-GGUF — immutable revision 7c41481f57cb95916b40956ab2f0b139b296d974, SHA256 d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785.

## Upgrade and enable

1. Quit Private AI through its tray icon, including any active tasks.
2. Extract `PrivateAI-2.1.5-Upgrade.zip`. Run `APPLY_UPGRADE.cmd` and select your existing `PrivateAI.exe` in the installed/portable application folder. It accepts the verified 2.1.3 or 2.1.4 code archive. It verifies the payload and saves a versioned code-only backup before replacing `resources/app.asar`.
3. Reopen Private AI. Go to **AI Processing**. Under **Small / Low — 1.7B**, click **Download model**. Downloading requires internet, but sends no prompts. Wait for completion.
4. Check that Medium and High say **Found on this PC**. If necessary use **Locate existing file** to select the exact previously downloaded model. The model is checksum-verified before use.
5. Select **Automatic — Small assesses first** and **Maximum automatic tier → High**, then save. Defaults use those values; existing processing mode and cloud permissions stay unchanged.
6. To allow Extra High automatically, download it, set the automatic cap to **Extra High — 8B**, and save. A direct manual Extra High selection also requires its download and available RAM.

Local First/Local Only/Smart Hybrid use the local tiers. Cloud First bypasses local inference. Existing web/image/high-stakes routing rules can bypass local models too. **Local Only and Allow OpenAI remain enforced**; model choice cannot authorize an API request. Existing validation thresholds may still send an insufficiently verified local answer to OpenAI when allowed. For entirely offline answers choose Local Only.

If PowerShell is blocked by organizational policy, do not change policy: use the full Portable ZIP in a new folder, or ask IT to perform the checked archive replacement. Launch only one copy under the same Windows user. Existing autostart and shortcuts keep their previous targets. There is no rebuilt setup EXE; Windows Installed apps may continue to list the older installer version. Model files and personal data are never installed into the source/program upgrade archive.

Rollback: quit the app, retain the new archive separately, and restore the updater's versioned `app.asar.<old version>.backup` as `app.asar`. Existing model files, chats, and settings remain. The portable alternative can be rolled back by quitting the new copy and opening the retained prior folder. Do not run both copies.

## How automatic selection works

- Ordinary deterministic commands, polling, and scheduling still use local code with no model call.
- For a simple local request, Small can produce an answer plus a bounded tier recommendation in one call. If no escalation is needed, that answer is reused.
- For a more complex or oversized request, Small receives a bounded task excerpt and size metadata for classification only. The final answering model receives the original complete input. Truncated assessment input is never treated as a complete source for answering.
- Local task rules and evidence/uncertainty checks prevent the Small model's recommendation from being the sole decision. It can jump directly to Medium, High, or permitted Extra High; there is no automatic run through every model. At most two local inference attempts are made per request.
- A missing Small model uses local routing rules until installed. Missing or memory-constrained larger models can cause a smaller-model fallback, with a visible limitation. Background work waits for RAM if no viable candidate fits. Overlarge final input is rejected instead of silently shortened; larger parameter count does not expand your configured context window.
- The old engine is stopped and its actual exit is awaited before loading a different model. RAM is checked after releasing the old model. The next foreground chat can take priority between assessment and answering. Downloads and verification reuse pinned files; unchanged hashes are cached per session and invalidated if file metadata changes.
- The answer displays the actual model. **Why this route?** shows the recommended/used tier, completed/skipped stages, and limitations. Only those bounded decisions are recorded; no separate chain-of-thought analysis is requested or stored.
- Switching models takes time. Small-first routing can be slower than keeping one model loaded. Manual Small/Medium/High/Extra High choices skip the Small assessment. A selected custom GGUF remains available as a separate manual option.

## Validation and limits

The release packaging step runs the full automated test suite and records its exact results in `Validation/tests-2.1.5.txt`. Coverage includes tier selection/caps, jumping directly to High, memory fallback, missing/corrupt models, checksum cache invalidation, complete-source handling, cancellation, cloud blocking, engine-exit ordering, foreground priority between phases, and interface controls. Existing security/retention, document handling, worker, messaging, and model-startup tests are retained.

Windows application/updater execution and actual Small/Extra High model inference were not run here. Routing tests use synthetic model responses, so they verify orchestration rather than real-model judgment quality. The Windows engine/dependency files are reused byte-for-byte from 2.1.3; prior Windows validation records are historical. Model compatibility is based on the existing Qwen3 runtime architecture, not a new Windows inference claim.

The 2.1.4 interference gate is unchanged: unattended browser actions, Outlook session access, desktop writes/launches, and WhatsApp replies remain deferred for manual approval. This upgrade does not add arbitrary autonomous desktop control or change permissions.

