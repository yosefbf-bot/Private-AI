For the current packaging repair, follow [BUILD_REPAIR_2.1.6.md](BUILD_REPAIR_2.1.6.md). The older build notes below are retained for reference.

# Reproducible build notes (developers / IT)

End users do not need these tools. The delivered application bundles its runtimes.

1. Use the provided package lock with Node 24 and npm: `npm ci`.
2. Use .NET SDK 10.0.401 or a reviewed compatible SDK: `npm run build:helper`. The C# project targets `net10.0-windows`, Win x64, self-contained WPF/UI Automation; the published helper is under `build/desktop-helper`.
3. Run `npm test`. Run `npm run test:ui` with `PRIVATE_AI_TEST_CHROMIUM` pointing to a local supported Chromium executable. UI tests use synthetic IPC and data; they never access an account.
4. Prepare the pinned CPU inference runtime with `node build/setup-runtime.cjs` (verified SHA-256 download). Model weights are optional and are not packaged. On Windows x64, `npm run build:win`. `npm run build:dir` produces the extracted portable directory. Do not omit the helper output or the Windows optional canvas package.
5. Review dependencies, sign reviewed binaries using your organization's process if appropriate, and perform the Windows acceptance checklist in TEST_REPORT before production deployment.

Cross-building from Linux: install packages with scripts disabled if necessary, download official Electron Windows x64 using `@electron/get`, and publish the helper with Windows targeting enabled. npm on Linux may omit the Windows optional canvas module; the build must contain `@napi-rs/canvas-win32-x64-msvc@1.0.9`, including its native module and `icudtl.dat`. Extract the official npm package into its node_modules directory before packaging. It is explicitly unpacked outside ASAR for native loading. Do not package the Linux SDK, test browser, Node tests' temporary data, caches, or node_modules in the source archive.

Installer: per-user NSIS, no required elevation, selectable directory, application data kept on uninstall. `signAndEditExecutable:false` is deliberate in this unsigned cross-build. `after-pack.cjs` hardens supported Electron fuses. Embedded ASAR integrity is not enabled without authenticated metadata support. Reproducible source does not imply byte-for-byte reproducibility of externally timestamped runtime/installer assets.

The Chrome manifest contains a public key solely to keep the extension ID stable. It is not a credential. Synthetic keys under tests are not real credentials. The OpenAI endpoint is fixed to `https://api.openai.com/v1`; do not add plaintext endpoints, certificate exceptions, or arbitrary proxy URLs in UI configuration.

The project is supplied for the user's evaluation and modification; third-party components retain their own licenses. Distributed runtime license files and dependency notices accompany the package. No claim of affiliation with OpenAI, Microsoft, Google, Meta, or ShareSync is made.

On this Linux host, Wine's socket facility is unavailable. `build/windows-build.cjs` uses electron-builder's own binary `UninstallerReader` with its standard NSIS templates to embed the compiled uninstaller without executing Windows code. It replaces one build-time method in memory, not installed libraries or runtime code. It supports unsigned Linux builds; Windows retains the normal builder flow. Compilation and binary extraction are not a Windows installation test. Regenerate HTML/help notices with `node build/prepare-docs.cjs` before packaging.
