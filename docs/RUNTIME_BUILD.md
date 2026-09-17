# Windows local engine build

Private AI 2.1.3 uses llama.cpp b10809 source from:
https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/b10809

Source archive SHA-256: 097848e79245e784c3bd4fcf2d6e1b46ad24553f3840e65a678131825504a8d2

Build on Linux using MinGW-w64 POSIX GCC 13, MinGW headers 11, CMake 3.28 and Ninja. Run `node build/setup-runtime.cjs`; optionally set PRIVATEAI_MINGW_PREFIX (defaults to /usr) and PRIVATEAI_BUILD_JOBS. The script verifies the source archive before extraction and records the two source adjustments inline: guard an optional thread power hint absent from older MinGW headers, and build baseline x64 plus Haswell/AVX2 CPU backends. Runtime CPU feature selection remains upstream code.

Compiler, C++ and OpenMP runtime support is linked statically. Shared model-engine DLLs remain app-local. Their imported DLLs must be either included files or standard Windows components; `node build/runtime-check.cjs` checks this and verifies all imports from included DLLs against their exports. No DLLs are downloaded from third-party DLL sites. Preserve all engine files together.

OpenSSL and the engine's web UI are disabled: inference uses the app's authenticated loopback-only connection. OpenAI TLS and model-download HTTPS are handled by the desktop app as before. The app remains responsible for exposing only 127.0.0.1 and never logging prompts or engine output.

See RUNTIME_NOTICES.txt for llama.cpp, MinGW and GCC runtime licenses, including the GCC Runtime Library Exception. Windows execution on a real PC remains an acceptance requirement.
