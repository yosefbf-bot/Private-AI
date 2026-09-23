> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Private AI 2.1.2 — local brain startup repair

The recording exposed a real screen-refresh bug: the model-selection event called `render` instead of `renderPage`. This update fixes that event and tests the actual callback.

The previous package also omitted a prerequisite check. The Windows llama.cpp engine imports Microsoft Visual C++ x64 runtime DLLs. These are not bundled in the model runtime and may not be installed on every PC. That is a plausible cause of the observed startup failure, not a remotely confirmed diagnosis of the user's computer.

## Install and retry

1. Quit Private AI completely. Extract the new installer download and run the 2.1.2 setup over the current installation. Keep your existing data and downloaded models.
2. Open AI Processing and click Load model.
3. If the app reports Microsoft runtime missing/outdated, click **Microsoft runtime setup**. This opens Microsoft's official x64 Redistributable download in your browser. Run it and choose Install or Repair. Windows may require your administrator. Restart Windows if Microsoft requests it; otherwise restart Private AI and retry Load model.
4. **Ready** means the model is loaded. **Selected** only means the file was chosen. If startup still fails, the error remains visible below the model controls. Share its error code and exit code, or export Diagnostics from Settings.

Microsoft documentation and official download:
https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist
https://aka.ms/vc14/vc_redist.x64.exe

No DLLs are downloaded from third-party DLL sites. The app does not silently elevate privileges or install system software. The runtime setup is a separate Microsoft prerequisite; the app ZIP does not include that installer. Both portable and installed editions require it when using this engine.

## Other fixes

- Specific messages distinguish missing model files, missing engine files, runtime dependency failures, unsupported CPU instructions, launch denial, and startup timeouts.
- Startup diagnostics contain only fixed error descriptions, numeric exit codes, and approved signal names. No raw engine output, model paths, prompts, keys, or document contents are recorded.
- Repeated Load clicks share a single startup instead of launching competing engine processes.
- Loading/failed/ready status updates without discarding unsaved processing settings.
- Agent and scheduler help text now accurately says that jobs follow AI Processing settings; Local Only blocks OpenAI.

This is an unsigned evaluation update. Windows-specific error handling is tested with simulated Windows exit codes. Actual Windows execution and the repair outcome on the user's PC remain to be verified. Fixing the refresh bug does not prove that all possible engine-startup failures are resolved.

