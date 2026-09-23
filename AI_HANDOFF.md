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
