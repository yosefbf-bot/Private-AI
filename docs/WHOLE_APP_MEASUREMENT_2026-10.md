# Whole-app comparison status — October 26, 2026

**No whole-app performance improvement percentage is established yet.** The
prepared comparison is frozen pre-speed source `80f4352` versus `74283cb`, using
the same pinned Electron/dependencies, a fresh isolated profile and three runs
per revision. Neither the installed application nor its data is used for timing.

| Requested measurement | Before | After |
| --- | --- | --- |
| Startup to visible window | Not measured | Not measured |
| Idle / minimized / post-synthetic-chat CPU | Not measured | Not measured |
| Main / renderer / GPU / utility RAM | Not measured | Not measured |
| Process count / short-lived children / I/O | Not measured | Not measured |

The harness/startup audit checks source/dependency fingerprints, redirected
Local/Roaming/Temp, unique pipe/instance identity, reparse points, before/after
owner-profile metadata and relevant HKCU registration/startup values. It retains
owned process handles and verifies cleanup. Raw registry values stay local.
The fixed synthetic chat is `/help`, not model inference or an external service.

The first launch was blocked by PowerShell execution policy. The owner approved
a temporary process-only execution-policy allowance. That attempt then failed
with Windows Access denied before launching any application process; the saved
receipt confirms unchanged owner-profile metadata/registry and an empty owned
tree. The owner approved a UAC elevation attempt, but Windows consent remained
pending at this checkpoint. Source and safety checks were not bypassed.

Once Windows consent succeeds, run the six alternating before/after trials
sequentially with no competing builds, inference or browser tests, then replace
this status table with verified medians. Do not reuse failed/preflight receipts
as measurements. Each phase must disclose incomplete counters as lower bounds.
Working-set sums include shared pages per process and are sampled, not continuous.
Battery and real-model inference are outside this comparison. The separately
verified installed Small inference is functional evidence, not a speed benchmark.
