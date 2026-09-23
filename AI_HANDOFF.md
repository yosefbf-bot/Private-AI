# AI_HANDOFF.md: Private AI 3.0 Engineering Handoff Protocol
**Standard Communication & Continuity Interface**
*Google AI Studio ↔ GitHub ↔ OpenAI Codex / ChatGPT ↔ Local Developers*

---

## 1. Project Overview & Philosophy

**Private AI 3.0** is an enterprise-grade, privacy-first AI desktop and web assistant engineered for healthcare, legal, and confidential enterprise settings. It was originally authored with ChatGPT / Codex and expanded to run both as a native Windows Electron desktop application and as a cloud/web container applet (Google AI Studio).

### Core Directives
1. **Source Code is Authoritative**: Do not rewrite or replace existing architecture. Continue building on established patterns, naming conventions, and file structures.
2. **Zero-Knowledge Privacy by Default**:
   - All disk-persisted data is encrypted at rest using AES-256-GCM.
   - Master key is secured by Windows DPAPI on Windows desktop, or a permission-gated vault key (`0600`) in containerized environments.
   - When **HIPAA Mode** is active (`hipaa: true`), web search is hard-blocked, telemetry is forbidden, external cloud persistence is disabled (`store: false`), and 90-day retention policies are strictly enforced.
3. **Deterministic Over LLM Where Possible**:
   - Deterministic tools (`/calc`, `/status`, `/extract`, `/help`, `/report`) execute instantly on-device without LLM token cost.
4. **Dual-Environment Architecture**:
   - **Desktop Environment**: Native Electron shell (`source/main.cjs` + `source/preload.cjs`), communicating over IPC (`ipcRenderer`). Windows UI automation and Classic Outlook integration via C# .NET helper (`desktop-helper/Program.cs`).
   - **Web Container Environment**: Express server (`server.cjs` on port 3000), communicating via HTTP RPC (`/api/call`), Server-Sent Events (`/api/events`), and the web bridge adapter (`source/ui/web-bridge.js`).

---

## 2. Shared AI Context: Working Rules for All AI Assistants

Whether you are **Google AI Studio / Gemini**, **Codex / ChatGPT**, or a human engineer, adhere to the following rules when interacting with this codebase:

| Principle | Guideline |
| :--- | :--- |
| **Preserve Core Contracts** | Keep `Core` (`source/core.cjs`), `Store` (`source/database.cjs`), `Security` (`source/security.cjs`), and UI modules backwards-compatible. |
| **Do Not Break Tests** | Always run `node --test tests/*.test.cjs` before committing changes. All 225+ existing tests must pass. |
| **Handle Web & Desktop Gracefully** | Any UI interaction must use `window.privateAI.call(op, data)`. Never call Electron-specific `require('electron')` directly in `source/ui/` files. |
| **Strict Scoping** | Implement only what the user requests. Avoid adding unsolicited libraries, framework overhauls, or marketing bloat. |
| **Respect SQLite WAL Constraints** | The database uses Node.js built-in `node:sqlite` in WAL mode. Keep transactions short and close statements appropriately. |

---

## 3. Environment & Runtime Specifications

### Web Container (Google AI Studio / Cloud Run)
- **Node Version**: v22.23.2+ (native `node:sqlite` enabled).
- **Entrypoint**: `node server.cjs` (mapped to `npm start` and `npm run dev`).
- **Bound Port**: Strictly port `3000` (external proxy mapping).
- **Environment Variables**:
  - `GEMINI_API_KEY`: Managed server-side for Gemini model family (`gemini-3.6-flash`, etc.).
  - `OPENAI_API_KEY`: Optional; can also be provided dynamically through the UI Settings drawer.
- **Client Bridge**: `source/ui/web-bridge.js` exposes `window.privateAI` with:
  - `call(op, data)`: POST `/api/call` with standard response envelope `{ ok: true, result }` or `{ ok: false, error }`.
  - `dropFiles(files, chatId, temporary)`: POST `/api/drop` with base64 file payloads.
  - `onEvent(cb)`: Subscribes to Server-Sent Events (`/api/events`) for streaming generation deltas and system notifications.

### Desktop Environment (Windows x64 Electron)
- **Entrypoint**: `electron .`
- **Native Helper**: `desktop-helper/bin/Release/net8.0/win-x64/publish/PrivateAI.Access.exe`
- **Native Messaging**: Chrome / Firefox extension connects via manifest `org.privateai.companion`.
- **Preload Script**: `source/preload.cjs` exposes `window.privateAI` via `contextBridge.exposeInMainWorld`.

---

## 4. Subsystem Reference

### 1. Security & Storage
- **File**: `source/security.cjs`, `source/database.cjs`
- **Algorithm**: AES-256-GCM with 12-byte random IV and 16-byte auth tag.
- **Tables**: `chats`, `messages`, `memories`, `projects`, `agents`, `schedules`, `files`, `settings`, `secrets`, `browserRecipes`.
- **Access Control**: Passphrase hashing via `scrypt` (16-byte salt, 32-byte key length). Passphrase lock blocks memory decryption.

### 2. Model Routing & AI Client
- **Files**: `source/hybrid-router.cjs`, `server/unified-client.cjs`, `source/api.cjs`
- **Modes**:
  - `smart-hybrid`: Checks context size, complexity, and local availability; routes to local brain or cloud.
  - `local-first`: Prefers local GGUF model; escalates to cloud only if model capability is exceeded.
  - `cloud-first`: Directs to cloud endpoints immediately unless offline or HIPAA restrictions apply.
  - `local-only`: Hard barrier preventing any external network connection.
- **Provider Fallback**: Uses `server/unified-client.cjs` to transparently route between `@google/genai` (Gemini 3.6/3.8) and OpenAI GPT-4o based on model name and key presence.

### 3. File Processing & Document Analysis
- **Files**: `source/files.cjs`, `source/files-worker.cjs`
- **Worker Isolation**: Ingestion runs inside `node:worker_threads` to prevent CPU lockups during heavy PDF/spreadsheet parsing.
- **Supported Formats**:
  - Document/Text: `.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt`, `.md`
  - Communications: `.eml`, `.msg`, `.ics`
  - Visual: `.png`, `.jpg`, `.jpeg`, `.webp` (base64 inline data)
- **Safety**: Formula sanitization for CSV/XLSX (`=`, `@`, `+`, `-` prefixes escaped), path-traversal prevention, and symlink escape checks.

### 4. Local Brain & Hardware Tiers
- **Files**: `source/local-brain.cjs`, `source/local-tiers.cjs`, `source/model-manager.cjs`
- **Tiers**:
  - `small` (1B–2B): Low-memory triage, classification, summarization.
  - `medium` (3B–4B): General instructions, drafting, basic coding (e.g. Qwen3-4B Q4_K_M).
  - `high` (7B–8B): Deep reasoning, long-context extraction, advanced synthesis.
  - `extra` (14B+): Enterprise workstations with 32GB+ RAM.
- **Lifecycle**: Automatically unloads inactive models after 5 minutes to release system RAM.

### 5. Windows Desktop Helper & Browser Companion
- **Helper (`desktop-helper/Program.cs`)**:
  - C# .NET standalone executable.
  - Safe, audited actions only: `outlook.messages`, `outlook.message`, `outlook.calendar`, `app.active`, `app.read`, `app.draft`.
  - Non-destructive: Does not execute terminal commands or run arbitrary scripts.
- **Chrome Companion (`chrome_extension/`)**:
  - Native messaging companion for passive side-panel interaction.
  - Zero analytics, zero cookies, zero autonomous background scrapers.

---

## 5. Standard Test & Verification Procedures

Before pushing changes or completing an AI turn, run the automated verification suite:

```bash
# 1. Run full unit and integration test suite (225+ tests)
npm test

# 2. Test specific modules
node --test tests/core.test.cjs
node --test tests/hybrid.test.cjs
node --test tests/files-worker.test.cjs
node --test tests/schedules.test.cjs
node --test tests/security-api.test.cjs

# 3. Verify server starts and responds
node -e "
const http = require('http');
http.get('http://127.0.0.1:3000/api/health', res => {
  res.on('data', d => console.log('Health:', d.toString()));
});
"
```

---

## 6. Checklist for Incoming AI Agents

When receiving a new prompt from the user in this repository:
1. **Check `AI_HANDOFF.md` and `CODEBASE_MAP.md`** to verify module responsibilities.
2. **Inspect existing patterns** before adding any new function or file.
3. **Maintain dual desktop/web compatibility**: Ensure any client-side calls route through `api(op, data)` or `window.privateAI.call(op, data)`.
4. **Never bypass encryption or HIPAA constraints**: Any persistent entity must go through `this.store.put(kind, id, record)`.
5. **Run tests** and verify zero regressions.

---

## 7. Web Container & Cross-AI Handshake Protocol (ChatGPT & Google Gemini)

### Incident & Bug History (Why the Dev Server Failed):
1. **Binary Vault Key Git Corruption**:
   - `app-data/vault.key` was checked in under `* text=auto` in `.gitattributes`. Git converted binary bytes into UTF-8 replacement characters (`\uFFFD`), expanding the key to 54 bytes.
   - `Cipher` strictly requires a 32-byte buffer (`crypto.randomBytes(32)`). Any other length throws `fail("ENCRYPTION")`, killing `server.cjs` on startup.
   - **Fix Applied**: `server.cjs` now validates that `vault.key` is exactly 32 bytes (regenerating a fresh 32-byte key if corrupted or missing), and safely handles old database rotation if a database was encrypted under an unrecoverable key. `.gitattributes` now locks `*.key`, `*.db`, `*.db-*` as `binary`.
2. **Broken Desktop Lifecycle Scripts in `package.json`**:
   - `package.json` had `"prestart": "node build/prepare-browser-assets.cjs"`, but `build/` was not in git, causing `npm start` to immediately fail with `MODULE_NOT_FOUND`.
   - **Fix Applied**: Removed missing build hooks and Windows-only optional native dependencies (`@napi-rs/canvas-win32-x64-msvc`).
3. **Retention Timestamp Boundary in `source/database.cjs`**:
   - `cleanup()` used strict inequality `r.updated < targetCutoff`, causing records at the boundary timestamp to be skipped in sub-millisecond test runs.
   - **Fix Applied**: Updated to `r.updated <= targetCutoff`.

### System Instructions for ChatGPT (OpenAI):
```markdown
You are working on Private AI 3.0 (yosefbf-bot/Private-AI-OG-google-version).
1. RUNTIME: Node.js 22 with native `node:sqlite`. Express server runs on port 3000 via `node server.cjs`.
2. NEVER commit raw binary files (`vault.key`, `*.db`) as text. In `.gitattributes`, `*.key` and `*.db*` must remain `binary`.
3. NEVER assume Windows DPAPI is available when in web mode (`server.cjs`). `server.cjs` uses a local 32-byte `vault.key` with AES-256-GCM.
4. DO NOT add `prestart` or `build` scripts that depend on local desktop files or dotnet (`desktop-helper/`).
5. DUAL CLIENT: Maintain compatibility with both `@google/genai` (via `GEMINI_API_KEY`) and OpenAI (via `OPENAI_API_KEY`) in `server/unified-client.cjs`.
6. VERIFICATION: Always run `npm test` (`node --test tests/*.test.cjs`). All 235+ tests must pass.
```

### System Instructions for Google (Gemini / AI Studio):
```markdown
You are working on Private AI 3.0 (yosefbf-bot/Private-AI-OG-google-version).
1. SERVER ENTRYPOINT: AI Studio must run `npm run dev` (`node server.cjs`) on `0.0.0.0:3000`.
2. DATABASE: Uses Node 22 built-in `node:sqlite` (synchronous WAL mode). Do not swap for external ORMs or SQLite packages.
3. VAULT KEY & ENCRYPTION: `source/security.cjs` requires a 32-byte buffer. If `vault.key` is missing or invalid, generate with `crypto.randomBytes(32)` with mode `0o600`.
4. API CALLS: Frontend routes through `/api/call` (RPC) and `/api/events` (SSE). Do not write direct backend calls in `source/ui/app.mjs`.
5. MODEL FALLBACK: Server-side Gemini calls use `@google/genai` (`GoogleGenAI`) with streaming `ai.models.generateContentStream`.
6. CLEANUP & HEALTH: Always verify `GET /api/health` returns `{ ok: true, status: 'ready' }` after code changes.
```
