# Speed, resource, reliability and security program — status 2026-10-25

## Current Codex increment

The owner now requests Codex to coordinate directly. On isolated branch
`chatgpt/desktop-efficiency-20261025`, based on48377dd and current main587e8dd,
this increment implements per-run clinical feed indexes, encrypted job status
summaries with older-writer invalidation, intermediate context admission, smaller
cold classification context, less idle Windows peak sampling and visible blocking
status. It preserves the earlier A/B/dependency work below. Full local831/831,
hardening30/30, policy/syntax/guides/audit/secrets and affected browser flows pass.
Real Small inference with a3GiB admission cap selected3072context and passed.
See current AI_HANDOFF.md for measured scope and unperformed release acceptance.
Companion PR16 polling timing repair3ec416c is in hosted validation. The existing
Library warning assertion in hardening-ui-check is corrected and that flow passes.
Other unchecked historical review proposals below remain proposals; they are not
silently included or declared fixed by this focused increment.

## Earlier program record

Coordinator: Claude Code. Implementer: Codex CLI (`codex exec`, owner's ChatGPT sign-in).
Branch: `claude/perf-reliability-2026-10` in both repositories, delivered as draft PRs.
Nothing is merged to `main` without the owner.

## Verified baseline (2026-10-25)

| Repository | origin/main | Version |
|---|---|---|
| yosefbf-bot/Private-AI | `faa367d8c0ec21217edb5a977c61ce3c4a4b3bc3` | 3.0.9-dev |
| yosefbf-bot/AI-Mobile-companion-app | `0ebbbd4994723ff5a8ce4c409065b07a22b4f34c` | 1.2.7-dev (code 10) |

No other remote branches existed. As of this commit, no source code has changed in either repository.
Two earlier review attempts on 2026-10-23/24 stopped at the coordinator's usage limit and produced no findings.

## Owner goals (priority order)

1. Speed: startup, chat, document and automation latency.
2. Low resource use: run well with low or tight RAM, with less CPU and disk churn.
3. Reliability, especially browser automations (report download and sign-in, WhatsApp).
4. Security, with no weakening of existing privacy, HIPAA/Local Only, credential or release gates.
5. Simplicity and convenience: remove confusing or cumbersome steps, keep the UI clear.
6. The desktop and the Android companion keep working together after all changes.

Scope split: mostly the desktop app; the companion app gets a smaller share.

## Local toolchain on the owner PC

- Portable Node v24.22.1 (matches CI `node-version: '24'`) at `%LOCALAPPDATA%\Temp\private-ai-tools\node-v24.22.1-win-x64`. It is not on the system PATH; prefix PATH for a single command.
- `npm ci --ignore-scripts` done in Private-AI (same as CI; no Electron or Puppeteer binary download).
- Microsoft Edge 156 is installed (the report browser gate requires 155 or newer). Firefox is not installed.
- No JDK or Android SDK. Android compile and tests run through GitHub Actions `android-validation`.

## Plan and progress

- [x] Verify latest GitHub state for both repositories.
- [x] Set up Codex delegation with a read-only smoke test and same-session follow-up.
- [x] Codex read-only reviews R1–R9: desktop speed/RAM, browser automation, security/simplicity, companion and interop, clinical engines, UI simplicity, documents/OCR/speech, extension/helper/packaging, idle CPU/wakeups. Reports are on the owner PC at `%USERPROFILE%\.claude\codex-delegate\runs\*-R<n>-*\last_message.md`.
- [x] Desktop Batch A, `20147c2`: dev-server `/API` casing auth bypass; deleteKey validation; approval re-binding after a key change; cloud-backed Ollama refused under HIPAA/Local Only; SSE session/backlog limits; send latch; truncation and usage accounting.
- [x] Desktop Batch B, `74d2e88`: lazy Playwright (startup probe 194→10 ms, 72→2 MiB); bounded streaming Markdown cache; cleanup checks timestamps before decrypting; separate encrypted drafts with no rewrite of whole chats; PDF text extracted before OCR; async model writes; model hash-cache flake.
- [x] Desktop security deps, `0be755b`: `npm audit --omit=dev` 9 → 0. DOMPurify 3.4.17 (critical) including vendored copies; mailparser 3.12.4; puppeteer override 25.16.0 (zod 4.6.7); body-parser 2.4.0.
- [x] Companion `a3db738` + `0f21b1b` + `f58fbe1`: metadata-only document lists; SQL-filtered migration; revision-based refresh with 429 backoff; lease-aware sync; BUSY retry; one evidence validator; meeting outbox isolation; honest alert coverage. Also fixed the CI hang (a runBlocking/paused-dispatcher test deadlock), added fail-fast test logging and a 15-minute timeout, and stabilized five racing tests. PR yosefbf-bot/AI-Mobile-companion-app#16.
- [ ] Remaining desktop batches, in priority order. Briefs were drafted from the review reports:
  - C, fewer repeated decryptions and less idle work: R1-04 job summaries; R4-05 gateway status/tasks; R1-08 speech/drafts polling; R5-01 clinical evidence (2.37M decryptions / 30.5 s for 200 residents → one snapshot per pass); R9-06/07/08/10/11; R7-01 speech/AI-slot deadlock.
  - G, clinical/operations safety: R5-02 meeting lost updates; R5-03 SBAR incident codes; R5-04 Demo isolation in slash commands; R6-01 render after lock; R6-02 review filter hides alerts; R6-03 reference protocol marked verified; R6-04 hardcoded "Dr. Robert Smith"/"Nurse Clinician"; R6-05 copy safeguard.
  - D, browser automation and resources: measured low-RAM browser budget (R1-01/R2-01); R2-04/05/07/08/09/11/12/13; WhatsApp resource tracking/cleanup (R2-02/R2-10, R9-02); R9-01/03/04/05/09; Ollama reservation plus native /api/chat (R3-04/R3-05).
  - E, features and simplicity: R3-08 microphone permission (local recording is currently blocked); R3-11 provider capabilities; R1-11 lazy UI modules; phase-specific LOW_MEMORY messages; remove dead UI branches; R6 convenience items.
  - H: the remaining R7 (documents) and R8 (extension/packaging/CI) items.
- [ ] Known pre-existing issue: `node tests/hardening-ui-check.cjs` fails identically on main `faa367d` (waits for "Document search is available in the production desktop workspace."). CI does not run it.
- [ ] Strain measurement: a safe isolated harness exists on the owner PC (it launches Electron from source with redirected LOCALAPPDATA/APPDATA/TEMP and verifies that real data and the registry are untouched). Before/after numbers have not been taken yet.
- [ ] Update `AI_HANDOFF.md` / `PROJECT_STATUS.json` with actual tested scope. Open the desktop PR when the batches are ready (CI runs only on PRs and main).

## Constraints carried from repository policy

AGENTS.md, GEMINI.md and docs/GOOGLE_AI_STUDIO_GUARDRAILS.md apply. Preserve `package-lock.json` and every tracked `build/` file. Do not change dependency versions unless a batch explicitly requires it. Do not invent data or remove assertions. Do not replace the owner's installed app or data. Record failures honestly; source tests do not establish installer or release readiness.

## How to continue

Pick up the first unchecked item above. Verification for each desktop batch: `npm run lint`, `npm run check:repository`, `npm run guide:check`, `npm audit --omit=dev --audit-level=high`, `npm run test:hardening`, the full `npm test` (820/820 at `0be755b`), and `ui-check` / `assistant-ui-check` / `browser-e2e-check` against the installed Edge (`PRIVATE_AI_TEST_CHROMIUM` / `PRIVATE_AI_TEST_BROWSERS=edge,chrome`). Wrap `npm test` in a timeout: a test that leaves a timer open hangs the runner indefinitely.
