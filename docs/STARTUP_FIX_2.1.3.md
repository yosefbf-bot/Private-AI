> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Private AI 2.1.3 — local model loading fix

The newer recording shows Qwen refused with LOW_MEMORY at about 4.8 GB available, and Llama changing from loading to CANCELLED. These are separate issues from the screen-refresh error fixed in 2.1.2. A Microsoft runtime installation would not resolve either recorded error.

## What changed

- **Startup no longer counts as idle.** The old maintenance timer could stop a manually loaded model before it became ready because its last-use timestamp was still zero. Idle cleanup now applies only to a ready, unused model.
- **Corrected RAM estimate.** At the default 4096-token context, both included model choices pass the estimate with the 4.8 GB available shown in the recording. The budget includes model size, working headroom, and a conservative context-cache allowance. It remains an estimate; the app still stops the model if available RAM falls below 1 GiB.
- **Honest cancellation and memory errors.** A memory-pressure stop stays a LOW_MEMORY error. Unload cancels startup; a late health response cannot make a stopped model appear ready. Changing the selected model clears an old model's error.
- **No Microsoft setup step.** The Windows engine is rebuilt from the same pinned llama.cpp source with compiler-runtime support linked into its files. The package includes both a baseline x64 CPU backend and an AVX2 backend, selected automatically. It needs no separate Visual C++ Redistributable installation. The old Microsoft runtime setup button is removed.

## Upgrade

1. Quit Private AI, including its tray icon.
2. Extract the installer ZIP into a new folder. Run **Installer/PrivateAI-Setup-2.1.3-x64.exe** under your usual Windows account. The installer is configured for your account without elevation. For portable use, extract the separate portable ZIP into a new local folder and open **Portable/PrivateAI.exe**.
3. Open **AI Processing**. Select either existing model, then click **Load model** once and wait for **ready**. Loading may take a few minutes. Selecting a model does not itself load it.
4. For an initial test without API credits, select **Local Only**, save processing settings, and ask a short question in a new chat.

Keep your downloaded model files and PrivateAI2 data folder. No model redownload or Microsoft runtime repair is required for this update. Run only one app copy at a time. The installer and portable app share the current Windows account's existing data.

If RAM is lower because other programs are open, close heavy programs, set **Local context tokens** to **2048**, save, and retry. Llama is the smaller model. The app cannot create additional RAM or override your organization's application-control policy.

## Validation and limits

128 regression tests and 22 Chromium UI checks passed. Real Qwen and Llama inference at context 4096 passed on Linux with the corrected manual-load lifecycle, including remaining ready through the maintenance timer, with zero OpenAI requests. Windows engine inspection verifies x64 architecture, every bundled DLL dependency and imported symbol, baseline/AVX2 backends, and absence of external compiler-runtime DLL requirements. Installer archive and delivery ZIP integrity are checked separately.

The Windows executable could not be run in this environment: the available Wine runtime requires Unix sockets that this environment does not permit. Linux inference and static Windows checks do not replace execution on your PC. See Validation/startup-inference.json and Validation/runtime-check.json for the exact evidence.

