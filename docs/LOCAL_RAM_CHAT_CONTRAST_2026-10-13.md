# Small-model RAM fitting and readable replies — October 13, 2026

Base: GitHub main `dbdf4709fcae67e1b5355e1f99d39ab06ff54a22`.
Review branch: `chatgpt/local-ram-and-chat-contrast-2026-10-13`.
Desktop candidate version: **3.0.2-dev**. Android source and protocol are unchanged.

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

## Verification

- Reproduced the 3 GiB rejection before the fix. Seven regressions cover fitted
  input retention, unchanged saved settings, ample RAM, warm reuse, oversized
  input, configured reserve, learned peak protection and manual selection.
- Complete Windows source suite: **532 passed, zero failures/skips/cancellations**.
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

## Windows candidate acceptance

Pending: a new package, installer and actual inference acceptance for these exact
new binaries. Earlier 3.0.1 execution flags must not be reused. A source Core
inference attempt was blocked by real available RAM below the unchanged Small
2,048-token requirement; its failed evidence is retained in ignored Validation.

The packaged synthetic hook can optionally exercise Automatic Load model and
real Small inference with a 3 GiB admission ceiling, always capped further by
actual system memory. This is a constrained-memory test, not qualification of a
different physical PC. It runs only in the existing isolated acceptance store;
no production chats, credentials or external account messages are test input.

The old preview remains historical and does not contain this fix. Current
installation data, DPAPI vault, downloaded models and Android pairing must be
preserved during any update. The owner merges the review PR into main.
