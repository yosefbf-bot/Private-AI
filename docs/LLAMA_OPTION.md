> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Private AI 2.1.1 — additional local brain

Built with Llama.

This update adds **Llama 3.2 3B Instruct Q4_K_M** alongside Qwen3-4B Q4_K_M. This is a pretrained Meta model converted to GGUF by bartowski, not a newly trained model. The optional download is 2,019,377,696 bytes (about 2.02 GB). It is pinned to a specific revision and SHA-256 checksum.

## Use it

1. Quit Private AI, including the tray icon, and run the new 2.1.1 installer over the existing installation. Do not delete the app's data folder. Portable users should extract the new portable download into a separate folder and run only one copy.
2. Open **AI Processing → Local Brain**.
3. Click **Use / download Llama 3.2 3B Q4_K_M**. Review the included license and Acceptable Use Policy, then accept if appropriate. You can cancel and continue using Qwen.
4. Wait for downloading/verification. The model becomes the selected model automatically when no inference is running. Its path appears on the page. If a task is running, wait for it and choose the downloaded GGUF afterward.
5. For zero OpenAI calls, select **Local Only**. Try a short document summary with synthetic text.

You may keep both models downloaded. Use either model button to verify and select that model without downloading it again, or use **Choose a GGUF file**. Normal model downloads live under `%LOCALAPPDATA%\PrivateAIModels`. Switching does not delete either model, your chats, or your settings. Only one model runs at a time; existing memory protections and five-minute idle unloading still apply.

The app uses the GGUF's chat template. Qwen-specific thinking controls are applied only to a Qwen-named file, so Llama does not receive the Qwen /no_think marker. Changing models changes reasoning behavior, not computer permissions or tools. No new WhatsApp capabilities are part of this update.

## Download failures

A truncated or incorrect download is rejected and the partial file is removed. An already-existing file is rechecked before selection. A damaged existing file is preserved; move that model file aside and retry the download, or select a known-good GGUF. Do not delete PrivateAI2 or its encrypted data to fix a model download.

## Source and terms

- GGUF conversion: https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
- Original model: https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct
- Revision: `5ab33fa94d1d04e903623ae72c95d1696f09f9e8`
- SHA-256: `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff`
- Read `LLAMA_TERMS.html`, `LLAMA_LICENSE.txt`, `LLAMA_USE_POLICY.md`, and `LLAMA_NOTICE.txt` included here.

Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.

This remains an unsigned Windows evaluation build. Live Windows use and the earlier documented integration limitations still require on-PC verification. Model weights are optional downloads, not included in the application ZIPs.

