# Application health and performance check — 2026-09-28

Base: merged PR #6, `a897ba7a6f7ea0d79ec4e3593cc1260396e03a7e` on `main`.
Review branch: `chatgpt/application-checkup-2026-09-28`.
Environment: Windows, Node 24.19.0, Edge controlled by Playwright. The GitHub Desktop checkout was clean at the same base; work used a separate checkout. Installed application data was not opened or changed.

## Findings and changes

1. **Clinical Surveillance Center failed to render.** `snfDashboard` returned metrics and the global production alert summary, but omitted the selected workspace's `alerts` field consumed by the renderer. A real-browser test reproduced `Cannot read properties of undefined (reading 'totalUnresolved')` and a stuck loading screen. The existing dispatcher now returns `alerts` from the selected workspace. Production alerts still feed the universal alert bar, including in demo mode. A Core/SQLite regression checks both workspaces; the browser verifies the demo surveillance page renders.
2. **Workflow navigation decrypted entire documents to list their names.** `workflowSummary` now uses the existing encrypted metadata table, maintained transactionally with each file change. No new cache or migration is introduced. Job summaries use the Store's existing row projection to avoid retaining all decrypted recovery inputs and completed answers simultaneously. Failed drafts, legacy playbook references, ordering and output fields are retained.
3. **Review comparison repeatedly scanned every action for every previous action.** A set of current source keys replaces that quadratic membership scan. Deleted/expired sources remain unavailable, completed sources remain resolved, and stale review tokens are rejected.
4. **The browser smoke harness no longer matched the current application.** Forced single-process Chromium flags prevented Edge page creation; default Playwright launch works. The follow-up modal is now scoped specifically, assertions wait for rendered content and saved notes, and all five workflow pages are exercised. Browser errors are printed on failure. No application permissions or security settings were relaxed.

## Performance evidence

An encrypted temporary synthetic database contained 400 documents, 80 playbook jobs and 1,500 actions, plus an established review baseline. Each measurement used two warm-up calls and nine timed calls with explicit GC before each. Same PC and Node version; this measures the server-side `workflowSummary` call, not end-to-end UI latency or model inference.

| Measurement | Base | Initial optimized run |
| --- | ---: | ---: |
| Median refresh | 416.69 ms | 216.09 ms |
| Min–max | 355.68–444.32 ms | 205.73–254.17 ms |
| Encrypted payload bytes decrypted per refresh | 87,560,481 | 34,366,771 |
| Records decrypted | 1,981 | 1,981 |
| Returned files / jobs / actions | 400 / 80 / 1,500 | 400 / 80 / 1,500 |

The initial comparison measured about **48% lower latency** and **61% fewer decrypted bytes**. The committed benchmark's verification run measured a 187.62 ms median (182–198.81 ms), demonstrating normal timing variation. No universal speedup or peak-memory measurement is claimed. Existing job bodies still need decryption; only their returned projections are retained.

Reproduce with `node --expose-gc tests/workflow-benchmark.cjs`. To compare the base, run the same benchmark file in a disposable checkout of the base commit with its dependencies installed. The benchmark uses temporary synthetic fixtures and cleans them up. Timing thresholds are deliberately not CI assertions.

## Verification

- Baseline `npm test`: 367 passed, zero failed/cancelled/skipped.
- Updated `npm test`: **370 passed**, zero failed/cancelled/skipped, including real Core/SQLite, desktop IPC and authenticated HTTP regression coverage.
- `npm run test:hardening`: **23 passed**, zero failed/cancelled/skipped.
- `npm ci --ignore-scripts`: passed with the unchanged lockfile.
- `npm audit --omit=dev --audit-level=high`: **zero vulnerabilities**.
- `npm run lint` and `npm run check:repository`: passed; syntax-only checks do not establish runtime readiness.
- `npm run test:hardening-ui` with `PRIVATE_AI_TEST_CHROMIUM` pointing to Edge: passed. Covers authentication, missing-data state, Today/demo isolation, evidence and saved follow-up, Clinical Surveillance Center, PCC navigation, SBAR edit persistence, Automation and all five administrator workflow pages with development restrictions. The completed Today screenshot was visually inspected at 1280×900.
- `npm run check:release`: **blocked locally** by absent generated `build/desktop-helper/PrivateAI.Access.exe` and `build/local-runtime/llama-server.exe`. The workflow builds these; source inputs and lockfile remain unchanged.
- Authoritative base GitHub Actions [run 36465145722](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36465145722) passed. Branch CI is recorded in the review PR after publication; base success is not evidence for the new commit.

## Remaining acceptance

This is a bounded source health/performance review and a development-browser smoke test. Actual packaged Windows install/upgrade/restore, installed vault behavior, local inference, real microphone/speaker accuracy, live external providers and independent clinical validation were not performed. No comprehensive accessibility or every-screen visual acceptance claim is made. Historical credential/vault exposure remediation remains the owner's separate task recorded in PROJECT_STATUS.json. No dependencies, clinical rule logic, native permissions, cloud budgets or installed user data were changed.
