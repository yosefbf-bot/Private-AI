# Speed and memory Batch 6 — installed payload

Base main `2f9449c`; Batch5 local checkpoint `9efc56b`. Version remains3.0.9-dev.
Combined publication branch `chatgpt/batch6-package-size-20261026` keeps the two
batches as separate commits and uses one final review/build cycle.

## Changes and measured savings

Removed unused `@google/genai` and32 now-unneeded lockfile entries. Readability
is a build dependency; generated parser/license files remain in both extensions.
All remaining dependency versions and integrity hashes are unchanged. Scoped
packaging exclusions remove JavaScript source maps, unused Excel/PDF browser
bundles, Tesseract browser bundles/docs/scripts and embedded-WASM JS duplicates.
The Node OCR loader now resolves `.js`; all six external WASM/JS CPU variants remain.
No tracked build asset, runtime module, native binary or license was deleted.

Matched fresh locked Windows directory builds, same Electron44.3.0/native inputs:

| Measurement | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Installed payload bytes |842,227,038|728,291,317|113,935,721 fewer (13.53%)|
| ASAR bytes |194,869,584|108,025,005|86,844,579 fewer (44.57%)|
| ASAR entries including directories/unpacked files |11,651|9,929|1,722 fewer|
| OCR core bytes, included in totals above |45,257,404|19,479,578|25,777,826 fewer (24.58MiB)|
| Fresh npm installation package count |627|595|32 fewer|

These measurements are disk/package savings, not whole-app RAM, battery-life or
AI inference speed claims. Final documentation changes can move payload bytes
slightly. Do not add the component savings to the total a second time.

## Acceptance

A post-pack archive check validates real OCR files/unpacked sizes, all CPU
fallbacks, PDF resources and extension parser/license files. Missing required
files and unwanted duplicate/debug payloads fail the build. Regression fixtures
exercise actual ASAR creation, missing unpacked files and rejected duplicates.
The Windows candidate gate now downloads only pinned public OCR/embedding assets
into its isolated synthetic store, and requires real installed image/scanned-PDF
OCR and BGE/sqlite-vec search, alongside existing installer/restart/inference/
retained-data reinstall/portable checks. No workflow check was removed.

Initial focused checks13/13; Windows wrapper checks5/5; hardening30/30; production
audit0; guides matched; current/history secret scans0. Actual fresh directory
build passed the24-file runtime check. Independent review found no material issue.
Initial local packaged baseline attempt failed the unchanged LOW_MEMORY guard at
about1GB available. After packaging completed and memory recovered, both baseline
and reduced candidate passed actual packaged image/scanned-PDF OCR and local
BGE/sqlite-vec search, with zero cloud calls and originals retained. Final fresh
locked Windows suite925/925,0skips (211.2s). Hosted installer candidate results
will be recorded in the publication handoff.

## Existing main-run investigation

Batch4 PR41 exact-head acceptance passed, but subsequent main run40408908032 failed
one synthetic native sign-in startup with STORAGE (898/899). The roughly25s run
could indicate an existing20s ACL subprocess timeout; the old trace cannot prove
that. Synthetic fixture diagnostics now distinguish startup stages and report
only elapsed time/allowlisted process outcomes. No paths, SIDs, commands, output
or credentials are logged. Removed its redundant startup ACL verification because
protectPrivateFolder already persists and fully verifies the same descriptor;
credential-time and standalone verification remain. No retry or timeout/security
relaxation was introduced. The revised actual DPAPI/Edge test passed all three
save/restart cycles locally (1test,63.5s). Current exact-head/main gates still must pass.

## Across the six batches

- Idle store/messaging work reduced; unchanged-message rewrites eliminated.
- Initial renderer JS799,149 ->235,297 bytes (70.6% less); display-image payload
  3,502,602 ->115,181 bytes (96.7% less), with originals retained.
- Resource ownership waits no longer poll; idle status avoids repeated decryptions.
- A5MiB/64-chunk synthetic upload writes227.2MB ->14.2MB serialized data (~94%
  less) and took5.077s ->0.339s in that probe. A100k-row trend probe retained results
  and changed256ms ->190ms; these are fixture results, not whole-app guarantees.
- Disabled WhatsApp polling720 opportunities/hour ->0; browser/download/pipe
  lifetimes are bounded with existing approvals and output limits preserved.
- This batch removes113.9MB from the matched installed package.

Deliberate deferrals remain documented in Batch3–5: native WhatsApp monitor did
not prove savings; report derived rows remain backwards-compatible; protected
HTTP streaming and native Ollama options require transport/real-daemon parity.
No local-model RAM floor, evidence coverage, retention or privacy guard was lowered.
Owner installation/data and Android source remain unchanged. Live PCC/PowerBI,
owner WhatsApp and physical-phone acceptance were not performed.

Local matched packaged acceptance archive SHA256:
- baseline: `576661f12d3d88037c84d27f0e9591132a767ad04e5ee8d670322bfa16eed958`
- candidate: `bdbdde5347daab79c604e74acc708cf41a6174b194a070eb2c434002547c0486`
