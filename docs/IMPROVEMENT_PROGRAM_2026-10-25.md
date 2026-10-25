# Speed, resource, reliability and security program — status 2026-10-25

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
- [ ] Codex read-only reviews (findings go below):
  - R1 desktop speed and RAM: startup, main-process blocking, renderer weight, SQLite, local model/RAM admission
  - R2 desktop browser automation: launch and memory, leaks, download/save races, sign-in flow reliability, tests
  - R3 desktop security, reliability and simplicity: IPC, dev server, companion gateway, providers, confusing UX
  - R4 companion app and desktop interoperability: Android perf/memory/security, gateway contract compatibility
- [ ] Triage into small sequential implementation batches. Each batch: Codex implements in workspace-write; the coordinator reviews the diff and reruns tests.
- [ ] Verification: `npm run lint`, `npm test`, `npm run test:hardening`, `npm run check:repository`, browser automation tests (`tests/browser-*.test.cjs`, `npm run test:browsers`, native report sign-in with Edge), companion interop (`.github/scripts/desktop_interop.py`), Android CI.
- [ ] Update `AI_HANDOFF.md` / `PROJECT_STATUS.json` with actual tested scope. Open draft PRs.

## Constraints carried from repository policy

AGENTS.md, GEMINI.md and docs/GOOGLE_AI_STUDIO_GUARDRAILS.md apply. Preserve `package-lock.json` and every tracked `build/` file. Do not change dependency versions unless a batch explicitly requires it. Do not invent data or remove assertions. Do not replace the owner's installed app or data. Record failures honestly; source tests do not establish installer or release readiness.

## How to continue

Pick up the first unchecked item above. Review findings and batch results are appended to this file as they land.
