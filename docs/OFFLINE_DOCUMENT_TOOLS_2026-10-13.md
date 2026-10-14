# Offline document tools — 3.0.3 development candidate

Windows acceptance is now complete; [the final hash-bound report](OFFLINE_TOOLS_WINDOWS_VALIDATION_2026-10-13.md)
supersedes the pending packaging status in the historical checkpoint below.

Base: verified GitHub main `421370ecf0570989417ce17ee747c81debcdbc27`.
Review branch: `chatgpt/offline-knowledge-tools-2026-10-13`. The owner merges main
under the current workspace instructions. Android production code is unchanged.

## Added without a second workflow

1. **sqlite-vec 0.1.9:** Library adds **Meaning · local** beside existing word
   search. It uses a checksum-pinned BGE Small English model through the existing
   authenticated loopback local runtime and resource manager. Results cite the
   exact file, section/page and source character span. Ranking suggests passages;
   it is not clinical confidence, whole-document review or evidence of currency.
   Search uses an in-memory SQLite vector table, a bounded RAM vector cache and
   sequential encrypted document reads. No plaintext/vector index is persisted.
   Stop, navigation, lock, deletion, retention and shutdown invalidate work/cache.
   At most 2,048 passages are searched; incomplete coverage is explicitly disclosed.
2. **Tesseract.js 7:** The existing importer can read photographs and image-only
   PDF pages using local English OCR. Original images/text PDF pages remain intact.
   Machine text is marked unverified and must be checked against originals,
   especially names, doses, dates and handwriting. Existing page citations remain.
   Workers are isolated, bounded and retired before the resource lane is released.
   Local Only chat can use OCR photo text without uploading the image. The OCR
   worker blocks network access; it cannot fall back to a CDN or browser speech.
3. **Mozilla Readability 0.6:** Explicit full-page browser capture parses a filtered
   visible article clone. Hidden text, inputs, editable fields and password-manager
   overlays remain excluded. Source URL query/fragment/credentials are omitted.
   Selection capture remains exact. Tables and portals retain visible-text capture.
   No new website permission, automatic capture or live-page mutation is added.
   Shared Chromium and Firefox assets are generated from the same source.
4. **Gitleaks 8.30.1:** `npm run check:secrets` scans the current Git source and full
   history using verified scanner archives/executables. A separate CI gate retains
   all prior checks. Output contains counts/locations only, with redacted reports
   removed from the temporary check directory. This developer tool is not installed
   in the application and does not read user app data.

Library → **Set up local search & English OCR** downloads approximately 68 MiB
of public, hash-pinned assets once. No document, prompt or query is sent in setup.
Search and OCR then run offline without an API key or generative chat model.
Word search and existing text extraction still work if optional assets are absent.
No new database schema, cloud approval, automatic message permission or clinical
inference from missing data is introduced. A reproduced tray Quit cleanup defect
was also fixed; pending tasks now cancel and the existing Core shutdown runs.

## Deferred from the ten-project list

- **Sherpa-ONNX:** automatic diarization needs separate segmentation/embedding
  assets and real overlapping-speaker/identity acceptance. Existing local meeting
  transcription and reviewed speaker profiles are retained; no diarization claim.
- **Chokidar:** existing file-change schedules/intake already cover this concept.
  Avoid adding a competing watcher or duplicate imports.
- **DuckDB:** existing bounded spreadsheet/CSV and clinical analytics remain.
  Another native database is deferred until a concrete large-dataset workflow needs it.
- **Microsoft Graph SDK:** requires cloud accounts/consent and approved endpoints.
  Classic Outlook integration and ask-before-send/delete boundaries remain.
- **MCP SDK:** no specific trusted MCP server was selected. Adding a new broad
  external tool boundary would not improve these existing offline workflows.
- **Presidio:** adds NLP/model/runtime overhead and cannot guarantee PHI detection.
  Existing provider/HIPAA fail-closed controls and human review remain authoritative.

## Validation checkpoint

Forty-two focused automated regressions passed, including real Core/SQLite/IPC,
source revisions, project scope, cancellation, malformed vectors, full-context
validation, pre-spawn worker cancellation/actual retirement and tray Quit.
Real Windows source acceptance passed English photo OCR, mixed scanned/text PDF
OCR, BGE embeddings and sqlite-vec paraphrase ranking, with zero cloud inference.
Five real Edge UI checks passed Library meaning/word search, navigation cancel,
filtered article/selection capture and portal fallback. Gitleaks found zero
current-source and full-history secrets. All 552 automated tests, 25 explicit
hardening tests, 208 syntax checks, repository policy and the general/hardening
Edge UI checks passed. Clean locked installation passed; production dependencies
have zero advisories. Nine existing development-tool advisories remain outside
the shipped runtime. These source checks do not establish installer acceptance.
Exact-head hosted checks, packaged/installed execution and new-binary evidence
remain pending at this checkpoint.

The first actual package passed photo OCR but failed scanned-PDF rasterization.
PDF.js treats Electron utility processes as a browser; its default DOM canvas
factory cannot render there. An explicit bounded local canvas factory and local
raster types corrected this, verified in the real utility environment with the
same security fuses. Failed evidence is retained. Hosted Linux regression also
exposed a scanner path check accepting Windows absolute paths; it now rejects
both platform formats. The secret/dependency/native-build hosted gates passed
the first head; inspect the corrected exact head before accepting publication.

The main PC processes Library uploads. This batch does not add background OCR
of companion Notes evidence or alter the Android pairing/upload protocol.
