# Speed and memory Batch 5 — browser and transport ownership

Base accepted main `2f9449c` (Batch 4 PR #41). Implementation branch
`chatgpt/batch5-browser-transport-20261026`. Version remains 3.0.9-dev.

## Implemented

- Protected sign-in responses are disposed only after fulfillment, including
  redirects, rejected requests and failed fulfillment. Origin/action/credential,
  redirect, TLS and cookie behavior stays on the existing Playwright transport.
- Fresh report contexts reuse an available blank page. Existing approved-origin
  and password-manager tabs remain intact. Native fixtures instrument initial
  pages as well as newly created pages.
- Downloads use a protected per-context transfer directory. While transferring,
  a one-second watchdog checks cancellation, current approval, size and actual
  bytes received. Two minutes without byte progress cancels the transfer; there
  is no total duration limit for a transfer that keeps making progress. Browser
  cancellation/write settlement precedes partial-file removal. The existing
  100 MiB maximum and no-overwrite publication remain unchanged.
- Report scheduler request/busy ownership is released even when claim or final
  persistence fails. Uncertain website work is not replayed automatically.
- Disabled messaging has no polling timer. Disabling/changing intake retires
  obsolete adapters. WhatsApp initialization has generation fences, and retirement
  waits for old initialization/destruction before profile reuse. Failure closes
  the old client; late QR/ready/error events cannot revive it. The auth-strategy
  hook handles close during launch before the library's unbounded page load.
- Browser startup retains exclusive admission until residency is established.
  A resident WhatsApp account is tracked separately, with its physical memory
  included in the existing actual-free-RAM admission. It does not block the AI
  lane while waiting for local reasoning. Send/delete approvals remain intact.
- Ollama calls now exclude report-browser ownership and release only the app's
  own idle GGUF process. The external daemon is never killed or reconfigured.
- Pipe/native-output writers keep ordered whole frames, honor drain, and fail
  closed above 3,600,016 queued/stream-owned bytes or 128 queued frames. A blocked
  writer disconnects after 30 seconds. The bridge admits at most 32 simultaneous
  RPCs. Existing authentication, sequence and 900,000-byte frame limits remain.
- Native relay exits on desktop disconnect. Extension requests cap at 32, reject
  on disconnect/reconnect and have deadlines (30 minutes for send, 2 minutes for
  ordinary RPCs). Controls recover through the existing finally path. No operation
  is automatically replayed. Late old-port events cannot disconnect a new port.

## Quantification and limits

Disabled messaging: 720 scheduled polling opportunities/hour -> 0.
Fresh browser launch: previously an initial blank page plus a new page; now one
initial page reused. Response-buffer release is deterministic after each request.
Transport retention is bounded as above; this is not a measured reduction in
whole-app RAM or battery consumption. Slow-progress/cancellation/storage-failure
regressions exercise the real cleanup paths with synthetic inputs.

## Deliberate plan adjustments

Two replacements remain deferred rather than being shipped without the plan's
required parity evidence:

1. Replacing Playwright guarded fetch with a new streaming HTTP transport would
   change TLS, browser cookies, proxy/credential behavior and redirects. Existing
   header/body checks still do not bound an unknown-length/compressed response
   before allocation. Response disposal is fixed, but bounded streaming requires
   separate native parity work. No existing security check was removed.
2. Ollama native `/api/chat` and guaranteed effective context/thread/retention
   controls need a real supported daemon and complete-input behavior checks.
   No Ollama executable/process/loopback daemon is available here. Current upstream
   supports native options and newer no-truncation fields, but older versions can
   ignore unknown fields. This batch fixes ownership only; it does not claim
   improved Ollama RAM sizing, working vision, or effective native options. Existing
   unsupported-capability rejection and provenance warnings remain.

References: https://docs.ollama.com/api/chat and
https://docs.ollama.com/api/openai-compatibility (checked 2026-10-26).

## Verification checkpoint

Full local suite 917/917, zero skips. Two additional panel tests and the added
native-relay entry-point test passed in focused runs after the full-suite start.
Hardening30/30; syntax283; repository458; bundled guides passed; production audit0;
Gitleaks current/history0. Native Edge date/options/download/history fixture
passed. Independent review found two WhatsApp lifecycle races; deferred-reopen and library-logout regressions reproduced both, and the fixes passed45/45 account/messaging tests. Final UI and hosted candidate acceptance pending.
No owner app installation, account login, WhatsApp send or physical-phone test.

## Accepted previous batch

Batch4 PR41 exact head9b20ff0 passed all8 gates in run40406474216, including899
Windows tests, installer/app/restart, real Small inference, retained reinstall
and portable acceptance. Merged main2f9449c. Candidate source d523e174.
Artifact12690393804 (545,330,522 bytes) remains on GitHub, above connector512MiB cap.
Installer SHA256495639dfa95b04333f9ba6c2c58114184bb6d52b22770e20a2749ea753d5a797;
ASAR SHA25693022c4abd953810ce0f0bf25fe954c06728e2783619b1944b7745290854404b.
Batch3 main follow-up run40405262718 also passed.

General UI first run stopped at the unchanged LOW_MEMORY gate while expecting a
missing-model setup message; no renderer exception occurred. This environmental
failure is not a UI pass. Recheck after other local verification processes finish.

Final focused review of the two material fixes found no remaining issue. Tests
45/45 messaging/account,22/22 startup including native relay,2/2 panel transport.
General actual Edge UI42/42 passed after preceding verification processes ended.
Native Edge report fixture again passed with zero application-created extra pages;
Edge's own downloads-hub tab is outside the workflow-page count. Final combined
Batch5+6 full/Windows gate will run once after packaging changes to save CI usage.
