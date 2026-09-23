# Private AI 3.0.1-dev — Hardening & Clinical Reliability

Development source on `chatgpt/3.0.1-hardening`; **Windows release blocked**. See [PROJECT_STATUS.json](PROJECT_STATUS.json), [ARCHITECTURE.md](ARCHITECTURE.md), and [AI_HANDOFF.md](AI_HANDOFF.md).

The existing Windows Electron app retains encrypted local storage, DPAPI vault protection, local inference, hybrid routing, OpenAI, Ollama, Worker/ShareSync, browser companion and automation, Outlook, messaging, projects/files/memory, and SNF/PCC surveillance. Presence in source is not proof of release validation.

## Development
Use Node 24 and `npm ci --ignore-scripts`. `npm test` runs unit/integration tests; `npm run check:repository`, `npm run lint`, and `npm run check:release` provide separate gates. The release gate intentionally fails while required packaging inputs are missing. `npm run build` runs that gate; it does not claim to create an installer.

The development web adapter requires `PRIVATE_AI_DEV_TOKEN` (random, at least 32 characters, supplied outside Git) and binds only `127.0.0.1:3000`. Start with `npm start`. It is **Development / Demo Mode — Not for PHI**. Broad filesystem/automation RPCs and uploads are blocked. Production LAN/cloud deployment is unsupported. Use a supported Windows desktop release for the intended production target, subject to organizational approval.

Do not delete installed `%LOCALAPPDATA%\PrivateAI2` data or vaults. No installed-data rotation, history rewriting, or production merge occurs automatically. See [exposure remediation](docs/EXPOSED_RUNTIME_DATA.md).

Historical release notes and manuals are not current release evidence. Future work is in [ROADMAP.md](ROADMAP.md).

See [hardening verification and review notes](docs/HARDENING_REVIEW.md) for the 280-test result, security/clinical limits, dependency findings, missing build inputs and unverified Windows/UI acceptance.
