# Mandatory AI Development Rules

Before making changes:
1. Read `AI_HANDOFF.md`.
2. Read `PROJECT_STATUS.json`.
3. Read relevant architecture documentation.
4. Fetch/pull and review latest `main`; record the actual base SHA.
5. Never assume roadmap items are implemented.
6. Never expose secrets, PHI, credentials, runtime databases, or encryption keys.
7. Never weaken a security control just to make a test pass.
8. Never weaken a test just to make a build pass.
9. Never commit directly to `main`.
10. Use a feature branch (`chatgpt/*` or `studio/*`).
11. Keep changes within the assigned task scope.
12. Run relevant tests.
13. Document exactly what changed.
14. Document known limitations.
15. Update project status when appropriate.
16. Do not mark work complete without evidence.

## Collaboration
GitHub is authoritative. `main` is stable integration; `chatgpt/3.0.1-hardening` is this development task. Never have two AI systems edit the same feature branch simultaneously. ChatGPT generally handles security, architecture, clinical design, debugging, refactoring and release review. Google AI Studio generally handles isolated UI/components, implementation and prototypes. These are guidelines. Prefer review by the system that did not implement the PR. Use the issue and PR templates. Do not merge this hardening PR automatically.

## Before each phase
Inspect code/history, implement a bounded change, run tests, review the diff, commit logically, update status, continue. Preserve Windows installation/data paths and the Store/Core/IPC contracts. Renderer calls go through `window.privateAI`; no Node access in UI. Persist sensitive records through encrypted Store. Clinical output is supplemental and requires human review; do not silently claim missing imported documentation is absent in PCC.

## Verification
`npm ci --ignore-scripts`; `npm test`; `npm run test:hardening`; `npm run check:repository`; `npm run lint`; `npm run check:release`. Report every failure. Required Windows packaging assets are missing; no test may skip that problem. Actual Windows install/upgrade, vault, local inference and feature execution evidence at the artifact SHA are required before release readiness. Consult `docs/HARDENING_BASELINE.md` and the final verification notes.

## Current hardening evidence
Read docs/HARDENING_REVIEW.md before assessing this PR. The verified source passed 280 Linux tests; Windows release, dependency remediation, browser visual acceptance, and independent clinical review remain blocked or pending. Do not infer readiness from a source feature or a historical manual. The feature branch is the ChatGPT workstream; review from an independent branch/tool and leave main unchanged until integration is explicitly approved.

## Development Server Guidelines (ChatGPT & Google AI Studio)

### Development Policy & Token Lifecycle
1. **Dev Server Token Bootstrapping:**
   - The development server (`server.cjs`) is restricted to local/demo use (`Development / Demo Mode — Not for PHI`).
   - `server/development-policy.cjs` mandates `PRIVATE_AI_DEV_TOKEN` (>= 32 chars) and an external directory for `PRIVATE_AI_DEV_DATA`.
   - In development, `server.cjs` checks `process.env.PRIVATE_AI_DEV_TOKEN`. If missing or too short, it auto-generates a secure 32-byte (64 hex character) token and saves it to `.env` (which is git-ignored with 0600 permissions), setting `process.env.PRIVATE_AI_DEV_TOKEN` and `process.env.PRIVATE_AI_DEV_DATA` (`~/.privateai-development`).
   - `devPolicy.configuration({})` remains strictly guarded and throws when empty configurations are passed in unit tests (`tests/server-hardening.test.cjs`).

2. **Web Bridge & IFrame Compatibility:**
   - The development server serves `index.html` by injecting `window.__PRIVATE_AI_DEV_TOKEN__` into the `<head>` and exposes `GET /api/dev-token` for allowed same-origin/cloud hosts.
   - `source/ui/web-bridge.js` reads `window.__PRIVATE_AI_DEV_TOKEN__`, `/api/dev-token`, URL param `?token=...`, or `sessionStorage`.
   - This prevents iframe execution halts from `window.prompt()` while preserving mandatory token-based POST `/api/session` handshakes and subsequent CSRF token validation (`X-Private-AI-CSRF`).
   - `server/development-policy.cjs` boundary allows `127.0.0.1`, `localhost`, `::1` loopback hosts as well as authorized development cloud domains (`*.run.app`, `*.google.com`, `*.google.dev`, `*.aistudio.google.com`) via `isAllowedHost()` and `isAllowedOrigin()`. Do not restrict this back to loopback-only string sets, as cloud preview iframes route through `*.run.app`.
   - CSP header sets `frame-ancestors 'self' https://*.google.com https://*.google.dev https://*.aistudio.google.com https://*.run.app` for preview embedding while rejecting external/unauthorized hosts.
   - For sandboxed iframes where cookies may be restricted, `web-bridge.js` passes `X-Private-AI-Session` along with `X-Private-AI-CSRF`, which the boundary middleware verifies alongside cookie authentication, and SSE `/api/events` supports `?session=...` query token.

3. **Build & Release Gates:**
   - `package.json` `"build"` executes `node scripts/check-syntax.cjs` to validate syntax of all application code for web/dev compilation.
   - `npm run check:release` remains the authoritative Windows packaging gate that blocks release until required Windows binaries/scripts exist.

