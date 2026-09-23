# 3.0.1 hardening baseline — 2026-09-23

Before edits: main, ChatGPT, and Google were identical at
`baa2deeb32d10ec1b4b28c1626dc81198ecb514d`.
Work branch: `chatgpt/3.0.1-hardening`, created from that commit.
Package version: 3.0.0. README describes 2.1.7. Build-info contains only a timestamp and source hash, not a release version.

All repository paths were inventoried through the recursive Git tree. Source, tests, manifests, and relevant documentation were retrieved at the pinned commit. Runtime database/key contents were deliberately not retrieved. Binary branding assets and large generated manuals remain unchanged upstream.

Confirmed blockers:
- app-data/privateai.db, its WAL/SHM, and vault.key are tracked.
- Provider credential aliasing uses the sk- prefix; approval is an unbound boolean.
- Core automatically seeds synthetic residents on an empty production store.
- Development HTTP server binds 0.0.0.0, automatically approves resources/cloud, and exposes broad RPC operations without request authentication.
- No build directory exists. Package scripts reference missing browser preparation, Windows packaging, after-pack, NSIS include, icon, helper/runtime assets.
- Release tests skip when their modules are absent. npm run build is a success-printing placeholder.
- Initial Linux Node 24 test invocation did not yield a complete aggregate result; document import/export tests failed with absent dependencies. After dependency installation, the pinned baseline was rerun with bounded concurrency: 253 total, 251 passed, 0 failed, 2 release tests skipped by existing logic. See HARDENING_REVIEW.md for final results and limits.

No Windows application, installer, uninstaller, or actual model-inference execution has been performed. No release readiness is claimed.
