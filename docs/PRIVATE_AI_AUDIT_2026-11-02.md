# Desktop audit and optional 9B brain — source checks complete

Owner request: resume Private AI, test the application and processing modes,
fix confirmed defects, simplify wasteful model choices and add an optional 9B
brain. The earlier AnythingLLM handoff is preserved as a separate option.

Base: origin/main `8212d79b631f3057e6b23ae091bc8e471f3919ad`, verified by
GitHub and fetch on November 2. Worktree: `private-ai-audit-20261102`, branch
`chatgpt/full-audit-9b-20261102`, source version `3.0.9-dev`.

## Plan and acceptance

1. Establish a valid serial automated baseline; distinguish sandbox/dependency
   setup failures from app defects. Inspect basic workflows and existing gates.
2. Fix confirmed settings/routing errors. Add a true API Only choice that never
   invokes local inference, with unchanged cloud authorization. Preserve local
   deterministic tools, Local Only isolation and Smart Hybrid behavior.
3. Add a pinned, optional Qwen3.5-9B tier without replacing existing IDs, files,
   settings or automatic ceilings. Simplify primary model choices; preserve old
   choices. Verify model-specific request formatting and low-memory refusal.
4. Correct report-tracker retention: 100 days refers to saved raw files, not a
   ceiling on historical facts or trend queries. Preserve evidence and make
   missing original files explicit. Do not delete user files during this audit.
5. Run focused regressions, complete automated/security/repository checks and
   applicable UI/basic workflow checks. Review substantive changes independently.
6. Exercise actual local inference serially when available memory permits, plus
   an approved configured API using synthetic inputs only. Keep mocked tests,
   real inference, installed-app tests and release acceptance distinct.

## Risks / gates

- This PC currently has about 16 GiB installed and 2.6 GiB free; the proposed
  32 GiB upgrade is not present. Do not lower RAM reserves to force tests.
- Initial baseline started before its dependency junction was available and in
  a restricted sandbox. It is diagnostic, not final acceptance evidence.
- Do not dump settings, keys, private chats, patient data or browser sessions.
- Do not modify the installed app/profile or run real report/email actions
  while validating an isolated source candidate.
- No automatic model downloads, cap increases, cloud fallback permission or
  cleanup of original report files. No runtime/dependency bump without evidence.
- A build/test pass does not establish Windows installer, phone or live PCC
  account acceptance. Report any unavailable checks explicitly.

## Confirmed findings under implementation

- Engine selector submits an unused setting.
- Cloud First permits local fallback; it is not API Only.
- RAM UI promises automatic tier/cache behavior that the implementation lacks.
- Report-history cleanup and queries impose a 100-day history cutoff.
- New 9B support needs family-specific template handling, catalog integrity,
  persisted tier/path support, resource accounting and evaluation coverage.

## Implemented behavior

- Optional Advanced Qwen3.5-9B uses an immutable publisher revision, exact byte
  count and SHA-256. Qwen3.5 uses its own template controls; it does not receive
  Qwen3's `/no_think` suffix. The default cap remains High, and no installed
  selection, saved context, output allowance or RAM reserve is lowered.
- Small, High and Advanced are the primary model cards. Existing 3B/8B models
  remain under alternate models; their IDs, paths and saved choices survive.
  Removed the ineffective engine selector and inaccurate RAM/cache promises.
- API Only refuses missing credentials or denied providers and never falls back
  to the built-in brain. Automatic local-only note drafts wait in this mode;
  explicitly local requests are refused rather than silently sent elsewhere.
- Memory waiting can select the next installed larger tier within the approved
  cap when a legacy tier is absent, matching ordinary automatic routing. The
  full request and completed assessment checkpoints are preserved.
- Report observations, comparisons and provenance have no automatic 100-day
  history cutoff. All-history/365-day queries work independently of the UI's
  1,000-report picker limit. Result limits and cancellation remain enforced.
- Normalized clinical facts, resident chronology, resolved/snoozed alerts,
  evaluations and referenced evidence survive working-file cleanup. Only
  unreferenced import staging can expire under that clinical cleanup. General
  chat/working-copy retention remains separate. No owner files were deleted.
- UI test infrastructure now closes HTTP resources reliably and isolates the
  unrelated periodic note-drafting worker from exact cancellation call counts.
  Production scheduling and all cancellation assertions remain unchanged.

## Verification checkpoint — November 3

- Final complete serial Windows source suite: **1,050 passed, 0 failed, 0 skipped**.
  This includes the missing-legacy-tier waiting regression. The earlier 1,049-test
  run and **57/57** focused routing/wait checks are retained as separate evidence.
  Exact-head hosted release verification is still required before release.
- Focused feature/data tests before that final follow-up: **123/123**, no skips.
- Hardening: **31/31**; syntax: **322 tracked files**; repository policy:
  **510 tracked files**; generated guide consistency and whitespace passed.
- Real Edge assistant UI: **25 checks**, **14 draft checks**, **117 contrast
  checks** and **7 dark-visibility checks** passed. Development hardening UI
  also passed. The general Edge UI rerun passed **46/46 checks**, including API
  Only/9B settings persistence, stop/regenerate, exports and exact RAM-wait
  cancellation/archive call counts after isolating unrelated fixture work.
- Actual Windows DPAPI restart and synthetic Edge sign-in/download passed all
  three cycles in the complete source suite. Real Edge date/option selection,
  non-overwriting report download and source-linked indexing also passed.
  These are synthetic browser pages, not live PCC/Power BI accounts.
- Browser workflow acceptance passed on Edge and Chrome. Chrome's first launch
  returned `BROWSER_SETUP`; an isolated launch with unchanged production options
  and then the full Chrome workflow passed on 156.0.8078.80. The first failure is
  retained; no cause requiring an application change was confirmed. Firefox is
  not installed on this PC and was not tested here.
- Gitleaks 8.30.1: **0 current-source and 0 history findings**.
- Production npm audit: **9 moderate package findings, 0 high, 0 critical**.
  Dependencies and lockfile were not changed. See the assessment below.
- Independent bounded Astra reviews covered model/routing boundaries, retained
  clinical history/provenance and the concrete UI fixture failure. No unresolved
  substantive finding was reported in those reviewed changes.

## Actual local-model evidence

The laptop still has approximately 16 GB installed. Tests use synthetic sources,
the existing native Windows CPU runtime, 2,048 context tokens and unchanged
admission/watchdog protections. No production profile was opened by the harness.

Small completed **30 checks: 28 passed**. Of those, **25 actually used the model
and 23 passed**; five were deterministic calculator checks. Two model answers
missed a supplied citation or planned/not-completed status. This is not a
general accuracy percentage or a clinical validation result.

Medium, High and Advanced were refused in that run: about 4.39 GiB was available,
versus conservative admission requirements of 4.46, 5.33 and 6.79 GiB at this
context. They were not counted as executed or passed. The Advanced download's
5,680,522,464 bytes and full pinned SHA-256 were separately verified. Download
verification is not inference acceptance. No speedup or new RAM saving is claimed.

With recovered RAM, Medium subsequently completed an eight-case subset and
passed **4/8**. The four misses concerned a citation, quoted malicious instruction,
planned/not-completed status, and document fact extraction. This is not enough
to recalibrate every task, but it does not support treating this older 3B model
as an accuracy upgrade. It remains available for compatibility; no model was
deleted and no untested quality-based routing policy was introduced.

High was tried again after available RAM rose to 5.36 GiB. The native watchdog
stopped it before the first answer when free RAM reached 0.94 GiB. No High answer
was counted as tested or passed. Do not reduce the safety reserve to get a result.

Sanitized counts, failures, hashes and sampled resource metrics are in
[PRIVATE_AI_NATIVE_MODEL_CHECKS_2026-11-03.json](PRIVATE_AI_NATIVE_MODEL_CHECKS_2026-11-03.json).
Raw synthetic local evidence is kept outside Git under `Validation/PrivateAI-Audit-20261102`.
The new optional model license/source and immutable identity are documented in
[OPTIONAL_9B_MODEL.md](OPTIONAL_9B_MODEL.md).

## Dependency advisory assessment

The nine affected packages trace to two moderate advisories:
[glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
[minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).
No reachable exploit was confirmed: ExcelJS's used XLSX load/write path uses
JSZip, and WhatsApp uses LocalAuth rather than RemoteAuth's archive traversal.
Application input does not reach the vulnerable glob pattern/cancellation paths.

Do not run blind `npm audit fix --force`: its suggested ExcelJS/WhatsApp downgrades
are not a verified remedy. Blanket glob/minimatch major overrides break legacy
callback and pattern APIs in rimraf/ASAR and other consumers. Any scoped upgrade
needs isolated dependency and packaging validation. Keep these findings visible.

## Remaining acceptance / limits

- Finish exact-head hosted CI/release gates; preserve failed and
  incomplete earlier logs rather than replacing them with a success claim.
- Further native High/9B acceptance needs adequate actual available RAM. Do not
  lower reserves, change brains or omit source material merely to force a pass.
- The desktop control tool currently returns no Windows windows. A live approved
  provider conversation through the installed app has not been tested; API
  Only/Hybrid/Local Only policy and transport behavior have automated coverage.
- No updated installer has been accepted or installed on the owner's PC. Source
  test results cannot be transferred to an older binary with the same dev label.
- Companion source/install, actual phone, live Outlook/PCC/Power BI accounts and
  the separate AnythingLLM handoff remain unchanged. No credentials or private
  records were copied into test fixtures or this report.
- Indefinite tracking uses disk space. Referenced evidence remains protected;
  this change does not implement deletion of arbitrary external report files
  or reconstruct history that an older installation already removed.
