# Optional Advanced 9B model

Private AI can use Qwen3.5-9B in addition to the existing model choices. This
integration accepts text; adding it does not enable image or audio inference.
It is optional, is not bundled in the installer, and does not raise the saved
automatic model ceiling when downloaded.

Upstream model: [Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B).
GGUF publisher: [unsloth/Qwen3.5-9B-GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF).
The model card identifies Apache-2.0 licensing. Preserve the upstream license
and notices when redistributing model files. Private AI's restricted application
license is unchanged; this does not relicense the application or its other models.

Pinned download:

- Publisher revision: `3885219b6810b007914f3a7950a8d1b469d598a5`
- File: `Qwen3.5-9B-Q4_K_M.gguf`
- Bytes: `5680522464`
- SHA-256: `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`

The existing streaming downloader verifies the full checksum before publishing
the file. The existing llama.cpp runtime uses the model's chat template with
thinking explicitly disabled; the Qwen3 `/no_think` suffix is not sent to Qwen3.5.
Existing Small, Medium, High and Extra High model identities remain compatible.

Allow roughly 7–8 GiB of available RAM before loading, with additional room for
longer context, measured peaks and other programs. Installed RAM is not available
RAM. The normal reserve, memory watchdog and one-model-at-a-time rules remain.
When a selected brain does not fit, wait or free memory instead of silently
substituting a smaller brain or granting cloud access.

A larger model is not a correctness guarantee. See the dated audit report for
actual native inference and quality-test results; a download or unit-test pass
alone does not establish model quality or release readiness.
