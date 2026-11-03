# Three built-in brains and test-only memory experiment — 2026-11-03

Base main: `794bc50c7e83ddf1cd59ba99a56fa60f7b5868aa`. Version remains 3.0.9-dev.

## Application changes

The built-in catalog, downloads, automatic routing and settings now offer Small
Qwen3 1.7B, High Qwen3 4B and Advanced Qwen3.5 9B. Retired 3B/8B download and
Locate actions are rejected. Custom GGUF support remains for unrelated models.
Known retired saved paths are cleared, including renamed files identified by the
old tier path settings. Arbitrarily renamed custom weights cannot be identified
by their filename alone; supported tier files still require their pinned checksum.

A one-time encrypted-settings migration maps Medium/3B selection and ceiling to
High/4B, and Extra/8B to Advanced/9B, with a visible notice. Existing supported
ceilings, settings, chats and history remain intact. Retired file paths are never
copied into replacement slots. Missing replacements require an explicit download;
RAM checks and cloud permissions remain unchanged. Settings reads do not write.
Automatic manual loading now requires an installed eligible catalog row instead
of falling through to an unverified old saved path.

Routing keeps the same complete answer input, two-call ceiling, hash checks,
cancellation and RAM-wait checkpoints. Drafting and comparisons now use High;
difficult synthesis can recommend Advanced within the saved ceiling. Installing
9B alone does not raise that ceiling. The offline guide explains these changes.

## Optional developer experiment

The synthetic evaluation CLI accepts `--watchdog-floor-mib 512` or `256` only
with explicit `--idle-pc-confirmed true`, one named non-tool case, one tier,
one context, one repetition and the normal condition with no artificial pressure
or process memory cap. The default remains 1024 MiB. A private evaluator adapter
coordinates its maintenance and both sampled watchdogs without modifying the
production LocalBrain class or feeding false memory measurements. Startup
admission, complete input, native process containment, cancellation and timeouts
are unchanged. The installed app cannot enable this option. Unknown memory
readings still stop the test. Safe failure codes improve diagnostics without
saving raw errors, prompts, paths or credentials.

High 4B passed one synthetic fact/calculation/source case at context 2048:
load 3.05 seconds, first token 20.73 seconds, complete response 28.92 seconds,
16 output tokens, minimum free RAM 2.25 GiB. The earlier attempt failed with a
generic evaluation error while 1.96 GiB was still free; its cause is unproven and
its evidence is retained. Neither attempt established a benefit from the lower
floor. No 256 MiB run, 9B inference, throughput improvement or RAM saving is claimed.
See `HIGH_TEST_ONLY_2026-11-03.json` for sanitized measurements and exact identities.

## Owner-PC cleanup

Explicitly authorized deletion removed the checksum-verified, unused 3B weights
(2,019,377,696 bytes). No 8B file existed. Four obsolete extracted installer/portable
copies were byte/hash-matched to retained accepted archives, then deleted
(999,651,222 bytes). Total reclaimed: 3,019,028,918 bytes (3.02 GB / 2.81 GiB).
Small/High/9B weights, source, current installer, accepted rollback archives,
failure evidence, chats, credentials and installed application were retained.
Cleanup receipts are local, outside Git. This code does not delete model files
from other installations.

## Verification and remaining acceptance

The first full local suite passed 1,059/1,060; the sole stale build-fingerprint
failure passed after the normal metadata regeneration. The final complete run passed **1,061/1,061**, zero failures or skips. Security hardening:
31/31; startup/native dispatch: 25/25; real Edge UI: 46 checks, including the three
choices, save/reload, download requests and light/dark RAM-wait behavior. Focused
migration/routing: 49/49. Independent read-only review found an obsolete UI-test
click; it was replaced with absence and exact-choice assertions, then Edge passed.
Secret scan: zero current/history findings. Production dependencies: nine moderate,
zero high/critical; unchanged from the previous audit. No dependency versions,
security boundaries, third-party notices or release gates were changed.

Exact-head hosted Windows installer/portable/restart/retained synthetic-data and
packaged Small inference acceptance is still required before merge/release.
Owner installation is unchanged. Live account/API, real phone and 9B quality
checks remain outside this batch. One passing High case does not establish
clinical accuracy or production readiness of the new candidate.
