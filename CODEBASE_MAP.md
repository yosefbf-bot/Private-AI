# CODEBASE_MAP.md: Private AI 3.0 Architecture & Module Index

---

## 1. Directory Layout

```
/
├── .env.example              # Template for server-side environment variables
├── AI_HANDOFF.md             # Common engineering handoff & guidelines for AI assistants
├── CODEBASE_MAP.md           # Exhaustive codebase and module reference (this file)
├── README.md                 # Original project overview and feature brief
├── package.json              # Node.js project manifest, dependencies, and test scripts
├── metadata.json             # AI Studio applet metadata and runtime capabilities
├── server.cjs                # Express HTTP/SSE server bridging web container to Core
├── server/
│   └── unified-client.cjs    # Hybrid multi-provider AI client (Gemini + OpenAI)
├── source/                   # Core application logic, security, and database modules
│   ├── ui/                   # Frontend SPA (HTML5, CSS3, Vanilla ES Modules)
│   └── ...                   # Backend CommonJS modules
├── desktop-helper/           # C# .NET standalone helper for Windows automation & Outlook
├── chrome_extension/         # Manifest V3 browser companion extension
├── docs/                     # Comprehensive architecture, security, and release docs
├── tests/                    # Node.js built-in test suite (225+ tests)
├── app-data/                 # Local data directory for encrypted DB, vault key, and models
├── workspace/                # Local user workspace for file imports/exports
└── uploads/                  # Temporary staging directory for file ingestion
```

---

## 2. Core Backend Modules (`/source/`)

| File | Primary Exports / Classes | Responsibility & Key Methods |
| :--- | :--- | :--- |
| `core.cjs` | `Core`, `DEFAULTS` | Central application controller. Manages chat sessions, projects, agents, schedules, memories, settings, HIPAA policies, exports, and background jobs. Methods: `createChat`, `chat`, `send`, `stop`, `exportChat`, `remember`, `saveAgent`, `saveSchedule`, `diagnostics`. |
| `database.cjs` | `Store` | Encrypted SQLite storage engine using `node:sqlite`. Provides transparent table-level AES-256-GCM encryption, schema initialization, atomic transactions, backups, and retention purging. Methods: `get`, `put`, `delete`, `list`, `backup`, `purgeOldRecords`. |
| `security.cjs` | `Cipher`, `fail`, `safeError`, `isId`, `text`, `safePath`, `auditLog` | Cryptographic utilities and security assertions. Implements AES-256-GCM encryption/decryption, PBKDF2/scrypt key derivation, path traversal prevention, and sanitized error mapping. |
| `hybrid-router.cjs`| `HybridRouter` | Orchestrates query distribution between deterministic local tools, the local `llama.cpp` brain, and cloud models (Gemini / OpenAI). Analyzes prompt tokens, task type, and user tier preferences. |
| `hybrid-settings.cjs`| `HYBRID_DEFAULTS`, `validateHybrid`, `cloudAllowed` | Validates hybrid routing configuration, model paths, RAM allocations, escalation thresholds, and cloud execution permissions. |
| `local-brain.cjs` | `LocalBrain` | Lifecycle manager for the local `llama-server` process. Spawns child process on loopback, handles mutual authentication tokens, monitors memory limits, and handles auto-sleep. |
| `local-tiers.cjs` | `Tiers`, `detectHardware` | Classifies host hardware (CPU cores, available RAM) into model tiers: `small` (1B–2B), `medium` (3B–4B), `high` (7B–8B), and `extra` (14B+). |
| `model-manager.cjs`| `ModelManager` | Manages downloading, verification (SHA-256), and storage of local GGUF model files from Hugging Face or direct endpoints. |
| `local-tools.cjs` | `createTools`, `range`, `formatCalendar`, `diagnose` | Deterministic local tool execution: calculator (`/calc`), calendar lookups, diagnostic self-tests, and system status reports. Operates with 0 token overhead. |
| `files.cjs` | `FileManager` | Interface for document management, attachment linking, OCR preparation, and export document generation. Coordinates with worker thread. |
| `files-worker.cjs` | Worker thread entry | Worker thread parsing extracted text from PDF, DOCX, XLSX, CSV, TXT, MD, EML, MSG, and ICS files without freezing the main event loop. |
| `access.cjs` | `AccessManager` | Manages file folder permissions (grant, read, write, export) and IPC bridge to the Windows Desktop Helper (`PrivateAI.Access.exe`). |
| `schedules.cjs` | `ScheduleManager` | Task automation scheduler handling daily, weekday, weekly, monthly, and custom recurrence intervals with catch-up logic. |
| `worker.cjs` | `TaskWorker` | Executes scheduled background tasks, sectioned reports, and autonomous agent loops. Implements machine-level mutual exclusion to prevent duplicate execution across machines. |
| `browser-worker.cjs`| `BrowserWorker`, `validateRecipe` | Headless Playwright automation worker for executing structured browser recipes (automated report downloading, form navigation). |
| `browser-hosts.cjs`| `ALLOWED_HOSTS`, `validateHost` | Whitelist configuration and security validation for external URLs loaded by browser automation tasks. |
| `messaging.cjs` | `MessagingBridge`, `DEFAULT` | Manages external messaging bridge connections, security validation codes, trusted senders, and remote command execution. |
| `whatsapp-web.cjs` | `WhatsAppWebAdapter` | Web-based WhatsApp session adapter using headless browser automation. |
| `whatsapp-windows.cjs`| `WhatsAppWindowsAdapter` | Windows native desktop WhatsApp UI automation bridge via Desktop Helper. |
| `whatsapp-account.cjs`| `WhatsAppAccount` | Manages user authorization tokens, linked phone numbers, and encryption state for WhatsApp integrations. |
| `messaging-policy.cjs`| `validatePolicy` | Access control rules governing which remote commands (e.g. status, summary, run-task) can be received over chat. |
| `sectioned-report.cjs`| `generateSectionedReport` | Multi-phase report generation pipeline: outlines sections, drafts content per section, and compiles final deliverables. |
| `report-format.cjs`| `formatReport` | Renders structured reports into markdown, styled HTML, and document export streams. |
| `usage-meter.cjs` | `UsageMeter` | Tracks input, output, and cached token consumption for local and cloud models. Computes estimated API costs based on model pricing tables. |
| `deterministic.cjs`| `evalMath`, `formatTable` | Safe AST-based mathematical expression evaluator and ASCII/Markdown table generator. Avoids `eval()` or `new Function()`. |
| `self-check.cjs` | `runSelfCheck` | System integrity diagnostics verifying database encryption, IPC channels, document extractors, and model endpoints. |
| `stability.cjs` | `StabilityTracker` | Monitors unhandled exceptions, child process crashes, and memory leaks; generates automatic recovery checkpoints. |
| `startup-storage.cjs`| `ensureStorageDirectories`| Bootstraps directory structures, permission flags, and initial configuration on first launch. |
| `windows-acl.cjs` | `setFolderPermissions` | Windows-specific ACL management for securing local vault directories against unauthorized user accounts. |
| `windows-validation.cjs`| `validateWindowsPath` | Windows path canonicalization, UNC share blocking, and device name filtering (CON, PRN, AUX, NUL). |
| `api.cjs` | `OpenAIClient`, `makeRequest`, `parseSSE` | Low-level client for OpenAI-compatible REST API endpoints supporting streaming Server-Sent Events. |
| `preload.cjs` | Electron Preload | Context bridge exposing `window.privateAI` to the Electron renderer via `contextBridge.exposeInMainWorld`. |
| `main.cjs` | Electron Main | Desktop Electron main process entrypoint. Configures BrowserWindow, system tray, native menus, and IPC handlers. |
| `app-guide.json` | 24 Guide Chapters | Embedded offline user documentation database rendered inside the User Guide drawer. |

---

## 3. Frontend Architecture (`/source/ui/`)

| File | Purpose & Responsibilities |
| :--- | :--- |
| `index.html` | Single-page application shell. Contains sidebar navigation, chat view, composer bar, modal dialogs, and slide-over drawers for settings, guides, and management tools. |
| `app.mjs` | Primary UI controller and state manager. Coordinates view switching (`chat`, `projects`, `agents`, `schedules`, `files`, `apps`, `processing`, `usage`, `messaging`, `browser`, `guide`, `worker`, `health`, `settings`), handles message rendering, file uploads, and user interactions. |
| `style.css` | High-contrast, accessibility-focused CSS with CSS custom variables for light and dark themes, responsive typography, and mobile breakpoints. |
| `web-bridge.js` | Web-container bridge providing `window.privateAI`. Translates desktop Electron IPC calls to HTTP POST `/api/call`, file uploads to `/api/drop`, and listens for streaming tokens over `/api/events`. |
| `access.mjs` | UI component for managing folder permissions, Classic Outlook authorizations, and UI automation selectors. |
| `browser-recipes.mjs`| UI builder for browser automation tasks: defining target URLs, login credentials, element selectors, and scheduled runs. |
| `hybrid.mjs` | UI component for configuring AI execution modes (`Smart Hybrid`, `Local First`, `Cloud First`, `Local Only`), setting RAM limits, and monitoring local model downloads. |
| `messaging.mjs` | UI component for pairing WhatsApp bridges, managing authorization codes, and defining trusted phone numbers. |
| `response-layout.mjs`| Formats assistant output blocks, code snippets, copy buttons, model usage footnotes, and token metrics. |
| `vendor/marked.mjs` | Markdown rendering engine for assistant responses. |
| `vendor/purify.min.js`| DOMPurify library for sanitizing HTML output before injecting into the DOM. |

---

## 4. Web Server & Hybrid AI Integration (`/server.cjs`, `/server/`)

### `server.cjs`
The server entrypoint running on port 3000 in cloud web containers (Google AI Studio / Cloud Run):
- **Endpoints**:
  - `GET /api/health`: Health probe returning `{ ok: true, status: 'ready' }`.
  - `GET /api/events`: Server-Sent Events stream delivering real-time tokens (`type: 'delta'`) and background job events.
  - `POST /api/call`: Unified RPC dispatch executing operations against `Core` and returning standardized JSON.
  - `POST /api/drop`: Multi-file upload endpoint decoding base64 attachments and running file extraction via `Core.importFile`.
  - `GET /api/download?file=...`: Secure download endpoint for exported documents (DOCX, PDF, XLSX, CSV, MD).
  - `GET *`: Static file server serving `source/ui/` assets.

### `server/unified-client.cjs`
A provider-agnostic AI client implementing the `client.generate(...)` contract expected by `Core`:
- **Google Gemini Integration**: Uses `@google/genai` with `gemini-3.6-flash` as the default server-side model when `GEMINI_API_KEY` is available. Formats multimodal user messages and streams chunks through `options.onDelta`.
- **OpenAI Integration**: Falls back to `source/api.cjs` (`OpenAIClient`) when using OpenAI models (`gpt-4o`, `gpt-4o-mini`, `o1-mini`) and an OpenAI key is configured.
- **HIPAA Guard**: Enforces `cloudAllowed(settings)` and refuses transmission if restricted by policy.

---

## 5. Desktop Helper (`/desktop-helper/`)

- **`Program.cs`**: C# .NET console application communicating with `access.cjs` via stdio JSON-RPC.
  - **Outlook Integration**: Connects to running Classic Outlook process via COM to retrieve unread emails (`outlook.messages`), specific message bodies (`outlook.message`), and calendar events (`outlook.calendar`).
  - **UI Automation**: Inspects foreground desktop application windows (`System.Windows.Automation`) to assist user with automated draft injection.
  - **Security Constraints**: Read-only access by default; write access requires explicit folder grant; never executes terminal commands.

---

## 6. Chrome Extension (`/chrome_extension/`)

- **`manifest.json`**: Manifest V3 extension configuration with `activeTab` and `nativeMessaging` permissions.
- **`background.mjs`**: Service worker routing messages between the side panel and native messaging host.
- **`panel.html` & `panel.mjs`**: Side panel UI allowing users to clip selected text, summarize the active page, or send page excerpts directly to Private AI without tracking or telemetry.
- **`capture.mjs`**: Content script executing on-demand text extraction only when initiated by user action.

---

## 7. Supported API Operations (`dispatch` in `server.cjs` & `source/main.cjs`)

All UI and client calls route through `api(operation, data)`:

| Operation (`op`) | Description |
| :--- | :--- |
| `summary` | Retrieves overall workspace state, active chats, projects, agents, and system status. |
| `createChat` | Initializes a new persistent or temporary chat session. |
| `chat` | Loads full history and file attachment records for a specific chat ID. |
| `send` | Streams user prompt to model; triggers tools or hybrid escalation; writes assistant response. |
| `stop` | Aborts an in-flight AI generation stream or background job. |
| `exportChat` | Compiles chat history into DOCX, PDF, XLSX, CSV, TXT, or Markdown. |
| `renameChat` | Updates the title of an existing chat session. |
| `archiveChat` | Archives or unarchives a chat session. |
| `deleteChat` | Permanently deletes a chat and purges associated temporary recovery files. |
| `endTemporary` | Discards temporary chat and purges all attached scratch files. |
| `saveTemporary` | Converts a temporary chat into a permanent encrypted conversation. |
| `saveDraft` | Saves unsent composer draft text for a chat. |
| `memorySave` | Stores or updates an explicit memory item in the encrypted vault. |
| `projectSave` | Creates or updates a project container with custom instructions. |
| `agentSave` | Saves an autonomous agent definition with role instructions and tool access. |
| `scheduleSave` | Saves a recurring cron task. |
| `scheduleDuplicate` | Clones an existing scheduled task configuration. |
| `deleteItem` | Deletes an entity by kind (`memory`, `file`, `project`, `agent`, `schedule`, `app`). |
| `settings` | Updates application settings (HIPAA mode, routing mode, workspace folder). |
| `saveKey` / `deleteKey` | Stores or wipes cloud API keys from the encrypted vault. |
| `models` | Queries available models (local tiers and cloud endpoints). |
| `testConnection` | Validates connectivity and authentication against active AI providers. |
| `diagnostics` | Runs complete system integrity audit and exports diagnostic report. |
| `usageSummary` | Returns token consumption and cost breakdown from `UsageMeter`. |
| `localStatus` | Reports local brain state, download status, and hardware tier. |
| `downloadModel` | Initiates background download of a GGUF model via `ModelManager`. |
| `cancelDownload` | Cancels an active model download. |
| `messagingStatus` | Returns WhatsApp bridge connectivity and policy state. |
| `messagingSave` | Updates messaging settings, trusted numbers, and command permissions. |
| `browserRecipes` | Lists all defined browser automation recipes. |
| `browserSave` / `browserDelete` | Creates, updates, or removes browser automation recipes. |
| `browserRun` | Executes a browser recipe via `BrowserWorker`. |
| `grantFolder` | Grants directory read/write access to a specific local folder. |
| `folderList` | Lists directory contents inside an authorized folder. |
| `folderImport` | Imports a document from an authorized folder into chat context. |
| `folderReadText` / `folderWriteText` | Reads or updates text files inside authorized folders. |
| `importReference` | Imports a virtual reference document directly from memory. |
| `lock` / `unlock` | Locks or unlocks the session using a master passphrase. |
| `setPassphrase` | Configures or updates the session encryption passphrase. |
| `backup` | Creates an encrypted point-in-time snapshot of the database. |
| `selfCheck` | Performs fast verification of all subsystems. |
| `userGuide` | Returns the 24-chapter documentation JSON. |

---

## 8. Database Tables (`Store` in `source/database.cjs`)

The database file is `app-data/privateai.db` (SQLite in WAL mode). Every record's `data` payload is encrypted with AES-256-GCM.

| Table Name | Primary Key | Stored Content & Entity Schema |
| :--- | :--- | :--- |
| `chat` | `id` (UUID) | Chat title, project ID, HIPAA flag, temporary flag, timestamps, message list. |
| `message` | `id` (UUID) | Individual message role, text, file attachment IDs, timestamps, token usage. |
| `memory` | `id` (UUID) | Explicit user memories, notes, and key-value preferences. |
| `project` | `id` (UUID) | Project containers, custom instructions, attached knowledge file IDs. |
| `agent` | `id` (UUID) | Autonomous agent definitions, assigned personas, tool permissions. |
| `schedule` | `id` (UUID) | Recurrence schedules, prompt templates, target projects, catch-up rules. |
| `file` | `id` (UUID) | Ingested document metadata, mime-type, original filename, extracted text chunks. |
| `folder` | `id` (UUID) | Authorized workspace directories, read/write permission grants. |
| `settings` | `'main'` | Global configuration: `hipaa`, `processingMode`, `workspace`, `model`, `ramReserveMB`. |
| `secret` | `'openai'`, `'applock'` | Encrypted API keys and scrypt passphrase verification hashes. |
| `browserRecipe` | `id` (UUID) | Saved browser automation steps, target URLs, selectors, and credentials. |
| `audit` | Autoincrement | Timestamped security events with SHA-256 integrity chaining. |
