# Codebase map

Read ARCHITECTURE.md and PROJECT_STATUS.json first. The pre-hardening detailed map is retained in docs/history and contains outdated claims.

| Area | Authoritative entry points |
|---|---|
| Desktop, IPC, vault | source/main.cjs, preload.cjs, startup-storage.cjs, security.cjs |
| Storage/migrations | source/database.cjs |
| Core orchestration | source/core.cjs |
| Providers/policy | source/providers.cjs, provider-policy.cjs, api.cjs |
| Reasoning/resources | source/hybrid-router.cjs, local-brain.cjs, local-tiers.cjs, resources.cjs |
| Worker/ShareSync | source/worker.cjs, schedules.cjs |
| Apps/browser/messaging | source/access.cjs, browser-worker.cjs, messaging.cjs, whatsapp-*.cjs |
| Clinical | source/snf-command-center.cjs, source/snf/ |
| UI | source/ui/app.mjs, snf-ui.mjs and extracted feature modules |
| Development server | server.cjs, server/development-policy.cjs |
| Release/repository checks | scripts/, build/pe-integrity.cjs, build/release-evidence-gate.cjs |
| Tests and automation | tests/, .github/workflows/ci.yml |
