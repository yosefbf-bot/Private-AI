> Historical/pre-hardening document. Read ../ARCHITECTURE.md and ../PROJECT_STATUS.json for current status; procedures and release claims below require revalidation.

# Healthcare Knowledge Engine — next major upgrade

Status: accepted development scope and implementation plan; the engine is not implemented yet. The complete user specification is preserved verbatim in [HEALTHCARE_KNOWLEDGE_REQUIREMENTS.txt](HEALTHCARE_KNOWLEDGE_REQUIREMENTS.txt). All 38 sections remain requirements; this plan does not replace or narrow them.

The official 3.0 build remains on hold until the user explicitly requests it. Add this engine to the existing application, preserving current features and preferences. Do not restart the app or create a separate clinical application. Mobile implementation remains deferred. WhatsApp remains the primary remote interface and must use the same retrieval and disclosure permissions as other entry points.

## Intended behavior

Question and authorized task context → choose relevant domains → search installed references → retrieve a bounded set of passages → existing local/cloud routing and reasoning → answer with source evidence, version information, and processing disclosure.

Keep knowledge retrieval separate from model training and user memory. A new category or an empty source catalog is not a populated knowledge library. Do not claim authoritative coverage until actual permitted references have been imported, indexed, and checked.

The categories, subcategories, metadata fields, clinical/medication workflows, example questions, and agent presets in the full specification are included. Medication/pharmacology, clinical medicine, CMS/federal regulation, New York, MDS/reimbursement, infection prevention, and facility policies are first-class domains rather than generic document tags alone.

## Existing code and required extensions

| Existing component | Reuse | Required extension |
| --- | --- | --- |
| `source/database.cjs` | Encrypted records, metadata, cleanup | Versioned knowledge-source/chunk records, persistent protected index, migrations, explicit reference retention |
| `source/files.cjs`, `source/files-worker.cjs` | Isolated extraction and export | Structured sections, page/sheet/table locators, resumable large-document processing, HTML, XLS, OCR dependency work |
| `source/core.cjs` | Chat, projects, files, task creation and prompt assembly | Authorized retrieval context, evidence budget, citation records, common integration for chat and report tasks |
| `source/hybrid-router.cjs` | Local Only, Local First, Smart Hybrid, Cloud First | Preserve routing/privacy checks; provide retrieved evidence to either model; avoid displaying internal heuristic scores as clinical confidence |
| `source/worker.cjs`, `source/resources.cjs` | Worker states, pause, cancellation, memory safeguards | Indexing/update job types with checkpoints and foreground priority |
| `source/main.cjs`, `source/preload.cjs`, `source/ui` | Existing IPC boundary, sidebar and UI | Healthcare Knowledge navigation, library/source manager, passage viewer, settings and response evidence footer |
| `source/app-guide.json`, offline help and diagnostics | Model-independent instructions | New knowledge-engine guide and troubleshooting: missing/stale sources, indexing errors, exclusions, permissions, citation and update problems |
| Messaging and browser companions | Existing chat/task paths and send boundaries | Same retrieval permissions, appropriate source summaries, no unrelated resident disclosures or bypass of write controls |

Current extraction returns mostly text, existing file privacy is represented largely by the HIPAA flag, and saved agents are report prompts. None of these alone satisfies structured RAG, resident isolation, or tool-using healthcare agents. Existing functionality must remain available during migration.

## Data and permission boundaries

- **Classification and confidentiality are separate.** Reference knowledge is not automatically public: facility policies and licensed references may still be restricted. A HIPAA-mode flag is not a substitute for document classification.
- **Reference knowledge** requires an explicit import/classification decision and an allowed scope: global, facility/company, or project. Never promote ordinary attachments into reusable knowledge automatically.
- **Resident-specific content** remains bound to its authorized chat, resident task, file context, or explicitly selected project/resident context. Do not use a broad project match alone to infer permission to retrieve another resident's record. Source IDs supplied by a model or renderer cannot grant access.
- Existing files migrate without being silently relabeled as reusable references. Unknown classification stays out of global retrieval until reviewed. Classification changes and scope expansions must be explicit and auditable.
- Apply permission, resident/context, effective-date, and source-status filters before retrieval candidates enter the model context or citation viewer. Recheck access when opening a citation and before cloud disclosure. Do not rely on the prompt to prevent leakage.
- Temporary chats do not create persistent resident indexes, memory, or retained evidence outside existing temporary-chat behavior. Expiration/deletion must remove associated private chunks, index entries, embeddings, recoverable task snapshots, and unauthorized citation access.
- Keep credentials, unrelated PHI, and confidential queries out of public-source update requests. Existing cloud/provider approval and Local Only restrictions remain authoritative. No silent external embedding requests.

## Source and evidence model

Use stable source, version, and chunk identities. Preserve every metadata field requested in section 6, including authority, jurisdiction, dates, effective period, status, tags, facility affiliation, regulation identifiers, drug identifiers, notes, and original URL. Store import time and last-checked time separately from publication/effective dates.

Replacement creates a new version and retains the earlier one. Do not infer an effective date from download time or declare a reference current just because it is the newest local copy. Historical questions use an explicit as-of date and report coverage gaps. Current/superseded/archived labels and temporary exclusion are separate from effective-date filtering.

Chunk around document structure: sections, headings, F-tags, drug entries, and table rows. Split oversized sections within the model budget while preserving their parent locator and table headers. Unknown page/section information stays unknown; never fabricate a PDF page number.

Rank applicable sources using domain, jurisdiction, authority, effective date, and relevance. Authority ranks are retrieval preferences, not an automatic adjudication of conflicting legal or clinical requirements. Present differing source requirements separately with their provenance.

Persist the exact evidence identity supplied for an answer: source/version/chunk, section/page when available, passage hash, filters, included file IDs, and model/provider used. Opening a citation shows the relevant passage and metadata, subject to current access rights. Distinguish retrieved passages from passages actually cited; do not label every search hit as a source used. Unsupported citation IDs are rejected or visibly flagged.

Resident analysis separates record facts, reference statements, and AI possibilities. Source-quality labels describe observable support, currency, and conflicts; do not invent numerical medical confidence or assert that an interaction review is exhaustive. No autonomous diagnosis, medication changes, orders, or other clinical actions.

## Index and performance design gate

The current store encrypts payloads. A conventional persistent FTS5 table containing decrypted document text would change that protection. Do not introduce one silently. Prototype a persistent protected keyword index and bounded encrypted-shard/FTS strategy, or evaluate an appropriately encrypted SQLite implementation, before selecting the final storage approach. Document leakage characteristics of searchable metadata as well as content.

Do not solve this by decrypting the whole library into RAM at every query. Measure cold-start and query/indexing memory with large libraries. Keep originals and embeddings protected, restrict retrieval to relevant chunks, and use resource checkpoints between indexing batches. Index changes must recover safely from pause, cancellation, crash, source removal, and version replacement.

Optional embeddings and reranking follow a working keyword/metadata baseline. Persist indexes with schema/model versions so an embedding-model change can trigger a controlled rebuild. Selecting an embedding provider must not bypass existing cloud restrictions.

## Implementation phases and completion gates

### Phase 1 — working retrieval foundation

Deliver categories and custom categories, classification/scope metadata, source CRUD, structured imports, protected indexing, keyword/metadata search, bounded RAG context, citation validation, and a passage viewer. Integrate the same service into chat and report tasks rather than implementing separate retrieval rules per interface.

First end-to-end acceptance: explicitly import a synthetic reference → index it → ask a matching question → retrieve the correct passage → answer through the existing router → open the exact cited passage. An unrelated resident record must never enter those candidates. Demonstrate Local Only with networking blocked, and verify original chat/file behavior still works.

Implement missing XLS/HTML/OCR capabilities through the existing extraction worker; until each is verified, display its actual support status. Do not advertise every requested format as working merely because it appears in a file picker.

### Phase 2 — healthcare routing and version awareness

Add automatic domain selection with user overrides, medication identifiers and terminology, clinical/reference versus resident-analysis modes, domain-specific source preferences, facility context, version replacement, current/effective filtering, and historical retrieval. Retain advanced source selection without making it mandatory for each question.

Acceptance: the specification's regulatory, medication, clinical, MDS, and facility-policy examples select appropriate domains and known fixture versions. Historical/current questions differ correctly. Ambiguous medication names and unavailable current references produce explicit uncertainty rather than fabricated support.

### Phase 3 — updates and review workflows

Add approved public-source checks, visible update candidates and provenance, review/import/ignore actions, practical diffs, and atomic approved replacement. Downloading a newer document never silently supersedes the current approved reference.

Integrate healthcare presets with the planned tool-using agent framework and scheduler. Add facility/regulatory/clinical comparison and medication-review workflows. They analyze, draft, and report; they do not perform clinical actions. Source-check tasks must use public source identifiers, not resident prompts.

Acceptance: detect a changed fixture source, show old/new metadata, ignore or approve it, retain historical access, and recover from failed imports. Demonstrate a scheduled review with source evidence and correct permissions.

### Phase 4 — retrieval quality and release readiness

Add measured reranking/optional semantic retrieval, source-quality labels, performance improvements, and UI polish. Evaluate recall, version correctness, source selection, and citation accuracy using the supplied question set and independently reviewed reference answers. Validate all prior application features and all knowledge entry points.

Update the in-app and separate user guide, troubleshooting help, release notes, source handoff, and fresh-PC dependency/setup instructions. Only after the user requests the official build: create release artifacts and run the existing actual Windows installer/application/local-inference acceptance gates against those exact artifacts.

## Starter pack and future interfaces

The starter pack begins as an authoritative source catalog and import workflow, with verified URLs, dates, provenance, and usage rights. Categories alone must display as empty. Verify actual current CMS, NYSDOH, CDC, FDA, DailyMed, NIH, and professional sources when importing them; do not populate medical or regulatory answers from unverified model recall. Commercial references require appropriate authorization/licensing.

Keep adapters for source discovery, extraction, indexes/embeddings, reranking, and terminology replaceable. This supports later licensed databases, formularies, interaction databases, regulatory feeds, policy scanning, and longitudinal resident analysis without replacing the existing app. A general label collection is not a validated drug-interaction database.

## Required tests throughout

- Cross-resident, cross-project, excluded-source, deleted-source and temporary-chat isolation, including citation access and guessed IDs.
- No silent promotion of attachments or resident information into reference knowledge or memory.
- Accurate locators/quotes/version IDs; unknown dates and missing support remain visible; adversarial source instructions remain untrusted.
- Correct Local Only/cloud boundaries, minimum necessary evidence, and no external PHI-bearing update queries.
- Current versus historical retrieval, future effective dates, missing historical versions, contradictory sources and facility scope.
- Interrupted/resumed indexing, protected storage, retention/deletion, memory limits, foreground priority and recovery.
- No clinical confidence percentages, no invented citations, and separation of record facts from model possibilities.
- Existing chat/streaming/projects/files/exports/ShareSync/scheduler/Worker/browser/WhatsApp/model behavior remains intact.

Use synthetic resident fixtures for automated tests. Actual clinical/regulatory answer quality needs authoritative source checks and review; passing software tests alone does not establish clinical validity.

