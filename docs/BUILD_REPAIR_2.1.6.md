> Historical/pre-hardening document. Read ../../ARCHITECTURE.md and ../../PROJECT_STATUS.json from this repository root for current status; procedures and release claims below require revalidation.

# Build 2.1.6 Repair 2

Use Node 24 and the pinned build tools in `build/packaging-tools/package-lock.json`. Install with `npm ci --prefix build/packaging-tools --ignore-scripts`; set NODE_PATH to that tool directory's node_modules when running the following commands.

1. Extract the complete working 2.1.3 portable ZIP. Its SHA-256 is `e21185f0f9a7100de4809b3eeda53fd39796089badde11d1ae92b08f6e229955`.
2. Recover unchanged application dependencies: `node build/preserve-asar.cjs dependencies BASELINE_PORTABLE/resources/app.asar .`.
3. Run `node --test tests/*.test.cjs` and retain its complete TAP report as `Validation/Repair2/tests.txt`.
4. Build the corrected application archive from that baseline and this source: `node build/preserve-asar.cjs repack BASELINE_PORTABLE/resources/app.asar . build/repaired-app.asar`.
5. Stage the full verified Windows runtime: `node build/prepare-repair.cjs BASELINE_PORTABLE build/repaired-app.asar`. This pins the trusted launcher and archive hashes, verifies the packaged source with the official ASAR reader, and checks complete copies. Use fresh `dist/win-unpacked` staging.
6. Run `node build/windows-build.cjs --prepackaged`, then `node build/package-check.cjs`.
7. Run `python3 build/deliver-repair.py --sevenzip PATH_TO_7ZZ`. It extracts and verifies the actual NSIS payload before producing installer, portable and source ZIPs, checksums and a validation report.

The complete runtime is a build input, not embedded in the small source ZIP. The pinned NSIS tools may need network access on their first build. No models are downloaded or rebuilt. Keep generated archives outside the source tree; the source deliverable excludes node_modules, dist and temporary files.

The normal application source change is confined to moving approval-handler initialization after Core construction in `source/main.cjs`. Windows native files and runtime dependencies stay unchanged. The three entry-point regression tests use real services with mocked OS/Electron boundaries; they are not Windows execution evidence.

