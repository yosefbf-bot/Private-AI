# Desktop 3.0.5 appearance correction

Base: desktop main `bdf73af43453a19abf3c9845cf667554de388fbb`.
Review branch: `chatgpt/dark-surface-contrast-2026-10-15`.

The report-folder path in Settings inherited near-white dark-mode text while
retaining a fixed pale background. Attachment chips, guide notes, several
optional clinical/review cards, hover states and inline output/transcript
panels had the same mismatch. Guide headings and transcript text also retained
fixed dark foregrounds on themed dark surfaces.

These surfaces now use the existing paired background/text tokens. Light
fallback colors are preserved; one small clinical summary label is slightly
darker to maintain contrast against its pale highlighted background. Existing
severity borders and readable status badges retain their meaning. Navigation,
data, permissions, encryption, model routing and workflows are unchanged.
Android source and its accepted 1.2-dev build are unchanged.

## Verification

`tests/assistant-ui-check.cjs` exercises the actual synthetic Core/SQLite app in
Edge. It checks the real Settings path and User guide, assistant responses and
representative shared card/hover states in both themes. It measures computed
foreground/background colors, composites translucent layers, examines gradient
stops and rejects nonfinite results. All 106 new surface measurements pass
4.5:1: minimum dark 6.8599:1; minimum light 4.5176:1. Its existing 25 workflow
checks also pass. Both report-folder screenshots were visually inspected.

The UI-only fixture uses fixed synthetic available RAM. An initial run under
actual host memory below 1 GiB reached the existing low-memory protection before
the help reply; this is not a model or production memory acceptance test. The
normal application resource checks were not changed. Intermediate test failures
and corrected transparency/navigation assertions remain in local validation
evidence. The version consistency regression caught the separate in-app guide
label; both labels now identify 3.0.5-dev.

The complete local Windows source suite passed 716/716 with no failures,
cancellations or skips. Syntax and repository checks passed; current/history
Gitleaks findings were zero. Exact-head GitHub results are recorded in the handoff
and CI. Packaged installation/inference/retention/portable acceptance is kept
separate and must refer to the actual 3.0.5 artifact hashes. The previous
accepted 3.0.4 binaries do not contain this correction. Installing a new build is
required to change an existing installed app; source edits do not update it.

## Accepted previous release

The earlier desktop 3.0.4 private preview completed both 716-test Windows runs,
all actual release execution gates, isolated Windows 11 portable acceptance and
the merged-main workflow. Android completed 95 local tests and six emulator
cases in both review runs, and its main is green. Older handoff sections saying
those earlier gates are pending are historical. The published immutable previews
and their final completion receipt remain references; this appearance correction
has its own source/build identity.
