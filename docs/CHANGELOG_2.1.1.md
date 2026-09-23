> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# 2.1.1 — Llama model option

Adds Llama 3.2 3B Instruct Q4_K_M alongside the existing Qwen choice. Both optional downloads use pinned revisions and SHA-256 checks. Downloaded models can be selected again without another download; existing files are reverified. Corrupt files remain preserved and unselected. Interrupted downloads clean up their partial files.

Adds Llama license/acceptable-use documents, attribution, and a cancelable license prompt. Switching models unloads the old idle model and refreshes the selected path. In-flight inference is not replaced automatically. Qwen thinking controls are not sent to a Llama-named file.

The existing encrypted data format, settings, startup fix, cloud policy, retention, and Windows runtimes remain unchanged. No new WhatsApp functionality. Windows evaluation limitations from 2.1.0 still apply.

