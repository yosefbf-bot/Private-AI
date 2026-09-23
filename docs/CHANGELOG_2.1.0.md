> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Changes in 2.1.0

Built on 2.0.1; no database reset or schema-format change. The writable-handle startup fix remains.

Added Smart Hybrid, Local First, Cloud First, and hard Local Only enforcement; deterministic commands; on-demand GGUF CPU inference; five-minute idle unloading; memory checks and one-inference-at-a-time control; actual token recording and optional price estimates; heuristic evidence checks; AI Processing and Usage screens; reviewed browser report recipes; optional WhatsApp Web control; capability-gated Windows intake with Web reply fallback; encrypted message records, deduplication, scoped background access, per-task forwarding choices, started/completion notifications, and uncertain-delivery shutdown. Calendar tools now sort appointments and flag overlapping times.

Fixed settings changes being unnecessarily blocked when an already-selected ShareSync folder is temporarily unavailable. Existing Chrome page capture remains explicit.

Known gaps: Windows-only WhatsApp sending, attachments, continuous progress updates, automatic calendar rescheduling, broad autonomous tool planning, and site-specific workflow setup are not complete. Full live-PC acceptance remains pending. See HYBRID_UPGRADE.md for exact behavior.

