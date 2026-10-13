# Small-model RAM fitting and readable replies — October 13, 2026

Base: GitHub main `dbdf4709fcae67e1b5355e1f99d39ab06ff54a22`.
Review branch: `chatgpt/local-ram-and-chat-contrast-2026-10-13`.
Desktop candidate version: **3.0.2-dev**. First interim package code:
`4f118fe98b02aea05873e97b716bbafc756f42e6`.
Android source and protocol are unchanged.

Final source also corrects background recovery: after a RAM pause it waits for
the context that actually fits the complete request, including the configured
reserve and learned peak protection. A bounded regression reproduced waiting
forever at 3 GiB under the old 4,096-token threshold. All **535 final source tests**
pass after the fix. Final frozen code is
`2cf3f397fd2128060c82d95c28ed6d1b616687fc`. Its genuine installer built and its
packaged startup passed 14 checks, 12 diagnostics and 19 views. Real source
background recovery/inference and a second foreground request passed with a
2.5→3 GiB admission ceiling, always bounded by actual available memory. Saved
4,096-token context remained intact; actual inference used 2,048 tokens.
Installer execution/upgrade and final packaged inference are still pending owner
app exit and memory headroom. See [the final-source receipt](local-ram-chat-contrast-final-2026-10-13.json).
Interim Windows receipts below remain tied to 4f118fe and do not establish final-binary acceptance.

## Reported problems and changes

The installed Small model is 1,282,439,584 bytes. The unchanged conservative
cold-load estimate needs about 3.19 GiB at a 4,096-token context and 2.69 GiB
at 2,048 tokens, including the existing buffers/reserve. A simple message could
therefore fail at 3 GiB despite having Small installed and Automatic selected.

Automatic mode can now use 2,048 tokens when the configured context cannot fit
available RAM **and the complete input plus output budget fits the smaller
context**. It retains the saved context, RAM reserve and observed peak safeguards.
It reuses a compatible loaded smaller-context engine instead of budgeting its
resident weights as a second cold allocation. The answer discloses the fitted
context in its compact notice. Both chat inference and the desktop Load model
action use the effective settings. Manual tier/context choices remain explicit.

Automatic still starts with installed Small and jumps to a recommended permitted
tier when needed; it does not load every intermediate tier for every message.
The existing maximum of two inference calls, verified model hashes, cancellation,
browser exclusion, tier caps and cloud authorization remain unchanged. Truly
insufficient RAM still blocks loading. Long input is never silently truncated.

Assistant replies previously inherited pale dark-theme text over a fixed light
panel. Their panel and text now follow the same theme: navy text on a light panel
in light mode, light text on a dark panel in dark mode. The AI label and response
footnotes use the theme's accent/muted colors.

Packaging also exposed stale sidebar build-version metadata. The existing asset
preparer now keeps that version aligned with package.json; Chrome/Firefox
extension manifests are regenerated at 3.0.2. No extension behavior changed.

## Verification

- Reproduced the 3 GiB rejection before the fix. Seven regressions cover fitted
  input retention, unchanged saved settings, ample RAM, warm reuse, oversized
  input, configured reserve, learned peak protection and manual selection.
- Complete final Windows source suite: **535 passed, zero failures/skips/cancellations**.
  This includes two added real encrypted Core chat / desktop IPC regressions,
  checking the full structured message and Automatic/manual Load model behavior.
- Focused local routing/resources/startup/stability/hybrid: **80 passed**.
- Explicit security hardening: **25 passed** outside the Windows sandbox.
  The restricted attempt had 23 passes and two sandbox folder/junction failures;
  both passed unchanged in the unrestricted rerun.
- Real synthetic Core/SQLite and Edge UI: **25 checks passed**, including an
  actual keyless `/help` reply and paragraph/list/link/strong contrast of at least
  4.5:1 in both themes. Screenshots were visually inspected.
- Production dependency audit: **zero vulnerabilities**. Isolated clean locked
  dependency installation passed with lifecycle scripts deliberately disabled;
  no runtime dependency versions changed.

## Interim Windows candidate acceptance (4f118fe)

The genuine new NSIS installer built successfully. All 589 staged files were
hashed, 415 PE binaries validated, and packaged changed source/style/guide/build
metadata verified against the frozen checkout. Native inputs were independently
verified against all 411 retained manifest entries; their 406 input binaries
passed the unchanged release-file check. No native source or dependency changed.

The new packaged app actually executed on Windows and passed 14 acceptance checks,
12 built-in diagnostics, 19 views, DPAPI/SQLite synthetic persistence and restore,
lock/permission checks, optional PCC controls and shared companion HTTPS/IPC
acceptance. No real account message or production record was used.

Real Small inference passed twice through source Core/SQLite/router at a 3 GiB
admission ceiling, with 2,048-token context and the saved 4,096-token context
unchanged. Earlier attempts blocked by actual low RAM are retained. A packaged
Automatic inference attempt passed its startup checks but was blocked at Load
model by actual LOW_MEMORY; it did **not** execute inference.

Still pending: installer execution/upgrade and packaged Automatic real inference.
The old installed app is still running. Preserve its current data and wait for
the owner to exit it and free RAM. The unchanged release evidence gate has **not**
passed for this candidate. Do not publish it as Windows accepted or reuse older
3.0.1 execution flags. See [the sanitized receipt](local-ram-chat-contrast-2026-10-13.json).

The packaged synthetic hook can optionally exercise Automatic Load model and
real Small inference with a 3 GiB admission ceiling, always capped further by
actual system memory. This is a constrained-memory test, not qualification of a
different physical PC. It runs only in the existing isolated acceptance store;
no production chats, credentials or external account messages are test input.

The old preview remains historical and does not contain this fix. Current
installation data, DPAPI vault, downloaded models and Android pairing must be
preserved during any update. The owner merges the review PR into main.
