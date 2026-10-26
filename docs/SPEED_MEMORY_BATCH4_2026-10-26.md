# Speed and memory Batch 4 — document intake and report recovery

Base: accepted main `0b5e227a2887dff13fd4217023fddb1d9b246e90` (Batch3 PR40).
Branch: `chatgpt/batch4-document-intake-20261026`, version3.0.9-dev.
Owner installations, data, models and companion pairing remain untouched.

## Changes and measured scope

- Playbook selection uses encrypted metadata to reject existing 28M/35M
  base64-character input limits before reading original bodies. Accepted files
  are hashed sequentially with identical preview fingerprints. Selected legacy
  metadata backfills once without resetting content/retention timestamps.
- Capture evidence keeps encrypted chunk records plus small hashes/byte totals,
  assembling once at completion. Actor binding, exact replay, atomic rollback,
  legacy partial migration and rolling24-hour expiry are tested.
- Section completeness is persisted; legacy saved sections explicitly remain
  unknown. Recovery honors the frozen plan and does not readmit finished sections.
  Saved answers export without another model call after settings changes.
- Large sectioned output uses bounded parts and a final Markdown index. Complete
  text parts concatenate byte-for-byte to the saved Unicode report. PDF/DOCX and
  CSV/XLSX views accompany complete text; tabular parts retain provenance warnings.
  Per-part intent/hash is saved before publication. Retry checks published bytes,
  preserves prepared paths, refuses edits and publishes the index last. Ordinary
  exports keep their350,000-character limit.
- Report-history recovery opens only interrupted analysis bodies. Encrypted
  pending-candidate rollups invalidate transactionally, including legacy SQL writes.
  Warm idle scans of200 completed reports/analyses perform zero individual report
  metadata decryptions or report lookups (two small encrypted rollups instead).
- Folder intake hashes a new source once instead of twice. Handle/path identity
  checks bind reuse to that operation; indexing verifies the actual imported bytes.
  Duplicate-row existence checks no longer decrypt the rows twice.
- Trends yield every256 source rows and128 output groups, preserve all counts,
  conflicts, source identity and limits, and reject source edits across yields.
  Unrelated reminder/chat writes do not cancel the comparison. No plaintext index.
- Mixed PDFs carry exact embedded page text forward: the three-page regression's
  second pass makes zero text-extraction calls and loads only the two OCR pages.
  OCR uses pre-ownership RAM admission with the unchanged floor/reserve.
- Extension capture bounds normalization to240,000 input characters,50,000 nodes
  and128 levels, stops exhausted sibling loops, retains visible-source ordering
  and password/hidden exclusions, and discloses all truncation including headers.
  Firefox assets regenerated from the same source.

## Matched synthetic probes (not whole-app benchmarks)

One5MiB/64-chunk encrypted upload on this PC:
- Serialized encrypted record writes:227,228,796 ->14,158,472 bytes (93.77% less).
- Elapsed:5,077 ->339ms in this single run (93.32% less; about15x faster).
  These are serialized record bytes, not measured physical disk writes or peak RAM.

One100,000-row trend comparison, identical complete result:
- Elapsed256 ->190ms in this single run (25.8% less).
- SHA-256 calls100,009 ->1,587 including existing settings/privacy checks.
- Main-loop heartbeat opportunities during comparison0 ->392.
  Absolute timings vary with load; no battery or total app RAM saving is claimed.

## Deliberate scope adjustment

Keep each report's derived rows self-contained. Shared-row references would make
older binaries silently read no observations, and require a retention/rollback
migration. Original downloads and existing rows remain intact. Trend comparisons
still examine retained relevant observations; they now yield and avoid repeated
per-row source hashing. A persistent incremental aggregate cache is not added:
it would add encrypted write amplification and a new invalidation contract.
New upload chunks are temporary encrypted staging; complete an in-flight upload
with this version before rolling back to an older binary. Completed evidence is
unchanged and remains readable by older releases.

## Verification

Focused regressions cover real Core/SQLite, legacy staging, rollback, expiry,
changed-source guards, exact report reconstruction and recovery, source notices,
PDF page selection, actual Edge/Chrome capture bounds and native Edge report
parameters/download/indexing. One independent review found two defects: omitted
multipart tabular provenance and an undisclosed header-induced capture truncation;
both fixed with regressions.

First full run897/898,0skips: sole failure actual Windows DPAPI/Edge sign-in
LOW_MEMORY under owner-PC pressure. Final verification and hosted acceptance are
recorded in PROJECT_STATUS.json; do not treat this source checkpoint as installed.
Expanded multi-browser workflow UI also reached the unchanged LOW_MEMORY guard
while two test browsers were resident (~1.9GiB free). Standalone actual Edge/Chrome
capture bounds and separate native Edge report download/indexing passed. No memory
floor, assertion, security policy or CI gate was lowered. Native Windows candidate
acceptance remains required before merge.
