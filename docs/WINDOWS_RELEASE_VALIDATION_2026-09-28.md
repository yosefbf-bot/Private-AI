# Windows release validation — 2026-09-28

## Checkpoint and environment

Base main fetched through GitHub: `1bca55ca7eafcfd6d34aa53945ca47b1a6082f8a` (PR #8); PR #7 is already merged at `f0b6d88e274a77e38fb7ee67a686b5e1b81251b2`. Main [CI 36499532128](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/36499532128) passed. Work uses isolated `codex/release-validation-2026-09-28`, not the desktop main checkout. No pre-existing uncommitted work was discarded.

Windows 11 Pro 10.0.26200, x64; Intel Core 5 120U, 10 cores/12 logical processors; 16,335,120 KiB visible RAM. Initial free memory approximately 5.7 GiB; disk free approximately 237 GiB. Node 24.19.0. No .NET SDK or native C++ build toolchain installed. CI cross-builds the checksum-pinned Windows runtime and .NET helper; the validation branch retains those outputs and their hashes for Windows packaging.

Existing `%LOCALAPPDATA%\PrivateAI2` database/vault presence was checked by metadata only. Neither contents nor secrets were read or modified. Three installed GGUF models were identified by filename/size (Small 1.7B, Medium 3B, High 4B); this is not inference evidence. Extra High 8B is absent.

## Baseline before application changes

Source is unchanged from base; status-only checkpoint `814f044`, packaging-input retention `fc5d0e6`. Raw synthetic test logs are outside the checkout in the chat workspace (`work/release-baseline-*.log`).

| Command | Observed result |
| --- | --- |
| `npm ci --ignore-scripts` | Pass; 603 packages added, 604 audited. Deprecation warnings: fstream 1.0.12, node-domexception 1.0.0, glob 10.5.0, fluent-ffmpeg 2.1.3. |
| `npm test` (TAP reporter) | 380 pass, 0 fail/cancelled/skipped/todo; 326 top-level tests; 11.381 seconds. |
| `npm run test:hardening` | 23 pass, 0 fail/cancelled/skipped/todo; 1.638 seconds. |
| `npm run lint` | Pass; 154 source files syntax checked. |
| `npm run check:repository` | Pass; 250 tracked files. |
| `npm audit --omit=dev --audit-level=high` | Exit 0; 2 moderate findings, no high/critical. Nodemailer GHSA-6vj9-mwq6-2f5v through mailparser 3.9.23. |
| `npm run check:release` | Exit 1: missing `build/desktop-helper/PrivateAI.Access.exe` and `build/local-runtime/llama-server.exe`. |
| `npm run test:hardening-ui` (installed Edge) | Failed: PCC assertion read transient `Loading…`; final diagnostic page already showed blocked development imports. Investigate/wait for the real ready state, retain the policy assertion. |
| `npm run test:ui` (installed Edge) | Failed: old harness waits for chat welcome on startup; current application starts at Today. Adapter/navigation assumptions need updating without weakening assertions. |
| `npm run test:messaging-ui` | Passed synthetic UI permission save/remove and synthetic message DOM send observation; no external messages sent. |
| `npm run test:browsers` | Passed Edge, Chrome, managed Firefox and Chromium: synthetic login/download, sensitive-field capture exclusions and browser selection persistence. No real password manager or native extension connection tested. |
| `node --expose-gc tests/workflow-benchmark.cjs` | 400 documents, 80 jobs, 1,500 actions; 9 samples, median 220.43 ms, range 193.86–276.00 ms; 1,981 decryptions / 34,366,771 bytes. Synthetic, hardware-specific observation. |

## Release status

Blocked pending actual artifact, packaged application, install/upgrade/restore and acceptance evidence. Source tests and successful main CI are insufficient. Clinical rules remain experimental; representative de-identified PCC acceptance and real-speaker validation have not occurred. No next-stage product enhancement is approved as complete by this document.
