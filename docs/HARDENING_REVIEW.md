# 3.0.1 hardening verification and independent review

Date: 2026-09-23. Branch: `chatgpt/3.0.1-hardening`.
Base: `baa2deeb32d10ec1b4b28c1626dc81198ecb514d`.
Verified application source: `e85b2b3c416d737dfe33bed44f03625ffd7935c3`.
Subsequent changes correct the browser test disclosure action and documentation; they do not change application behavior.

This is a development review candidate, **not a Windows release**. Do not merge automatically.

## Evidence

| Check | Result and limits |
|---|---|
| Baseline with dependencies installed | 253 tests: 251 passed, 0 failed, 2 release tests skipped by the old code |
| `npm test` | 280 passed, 0 failed, 0 cancelled, 0 skipped; Node 24.19.0 on Linux |
| `npm run lint` | 121 tracked JS/CJS/MJS files passed syntax checking; this is not a semantic linter |
| `npm run check:repository` | Passed tracked-path and credential-pattern checks; no runtime database or vault key in the branch tip |
| Real development HTTP server | Tested startup, authentication, session/CSRF enforcement, denied privilege/cloud approval/live import operations, demo activation/reset, and empty live Psych Watch |
| Clinical export | Created a real synthetic demo PDF and extracted its visible DEMO DATA / NOT FOR CLINICAL USE labels; separate Demo-Reports output folder |
| Legacy migration | Synthetic schema-2 encrypted chat/settings migrated to schema 3; content and encrypted metadata preserved; legacy approval rejected |
| `npm run check:release` / `npm run build` | Blocked; required packaging inputs listed below are absent |
| `npm audit --omit=dev --audit-level=high` | Failed: five high-severity affected packages in the WhatsApp/Puppeteer/extract-zip chain |
| `npm run test:hardening-ui` | Blocked before page execution: bundled Chromium crashes with SIGSEGV in this environment. No screenshot or visual acceptance is claimed |
| Windows application/installer | Not produced or executed; no Windows artifact hashes or acceptance evidence exist for this branch |
| Live OpenAI/Ollama/other providers | No live account/inference acceptance performed; provider tests use synthetic transports |

The local test log SHA-256 is `dbc22858c5506ed1bccb12df0a1edbd0ef557b7373b16f1aaf684f13eaaf901f`. This is a reproducibility record, not signed release evidence. GitHub Actions run [35857211998](https://github.com/yosefbf-bot/Private-AI-OG-google-version/actions/runs/35857211998), on the verified source SHA above, completed with regression success (including repository/syntax checks and hardening tests), release-files failure, and dependencies failure. The overall workflow is not green.

Source was retrieved through the authorized GitHub connector into a local Git snapshot and published as ordered GitHub commits. Changed text blob IDs were compared with the tested local source. Unchanged retrieved text differs only by one extra trailing newline in the local materialization; original remote blobs were preserved. The successful GitHub regression job independently tested the authoritative remote tree. Large original branding PNGs and generated manuals were preserved remotely but could not be materialized by the connector. They were not replaced or deleted. The local missing-file check additionally reports `source/ui/logo.png` and `source/ui/icon.png`; the remote tree confirms both exist. Runtime database/key contents were never fetched.

## Implemented changes

- Removed the four tracked app-data database/key artifacts from this branch; added ignore rules, a custom repository policy scanner, CI, and exposure-response guidance.
- Isolated provider credentials and deletion. HIPAA approval binds provider, endpoint, organization/project, model/realtime configuration, hashed credential identity, and policy version. Legacy booleans fail closed; changing a material setting requires a later approval action.
- Unified server and desktop transport and provider metadata. UI/default/RAM model suggestions use the registry; model inventory requests contact the selected provider and surface failures. Availability of historical suggestions is not assumed.
- Restricted web mode to authenticated 127.0.0.1 development use with host/origin validation, HttpOnly/SameSite sessions, CSRF checks, denied privileged operations, no cloud auto-approval, and storage outside the source tree, including symlink checks.
- Removed production sample seeding. Explicit Demo Mode uses encrypted `demo:` record namespaces; live import is blocked in demo, reset deletes only demo records, and exports are marked. Background production surveillance continues to use the live namespace.
- Added PCC batches, operator/report/date/hash metadata, original-row provenance, per-report rollback, duplicate detection, stable-ID matching, validation failures, and stale/missing-feed warnings. The Import Center accepts mapped CSV and JSON; reviewed PDF/spreadsheet conversion remains necessary.
- Extracted medication definitions, rule execution/registry/evidence, import governance, alert lifecycle, retention, demo workspaces, and Today summary into domain modules. Existing orchestrator methods and established features remain available.
- Preserved AP-001 through AP-004 and related surveillance. Added explicit medication-change, psychiatry follow-up, and pharmacist recommendation checks. Alerts preserve immutable versioned evaluations and source evidence, reopen on changed evidence, and retain unresolved critical findings through omissions and snoozes.
- Added operational owner/status/due date/notes/evidence/resolution history, Today, PCC Data Health, follow-up, and compact response Details. Production critical counts remain global even in Demo Mode or when clinical navigation is disabled.
- Removed automatic plaintext chat/voice history copies from browser storage. Recoverable legacy entries move into the encrypted backend; transcript retention/deletion and temporary-chat exclusions are tested. Browser speech recognition is blocked for HIPAA/Local Only; protected speech output requires an OS voice marked local.
- Consolidated architecture/status/handoff/roadmap and task/PR templates. Historical documents are labeled. Missing release modules no longer cause tests to skip silently.

## Security and HIPAA review notes

1. Historical vault/database exposure remains in `main`, other refs, and Git history. An authorized owner must assess the exposed data, rotate affected credentials, plan vault re-encryption, and separately authorize any history rewrite. See EXPOSED_RUNTIME_DATA.md. This branch does not revoke credentials or erase past copies.
2. An old installation may contain mirrored keys or previously auto-seeded residents. It is unsafe to infer which records are genuine from names/IDs alone. Require controlled reconciliation of old clinical data and re-entry/verification of provider credentials before production use; nothing is silently deleted from installed databases.
3. HIPAA Mode is a technical routing policy. Organizational/contractual approval, BAAs, endpoint retention settings, device access, backup policies, and clinical workflow approval remain separate. Only explicitly approved OpenAI chat is enabled for HIPAA cloud transmission. Other cloud adapters and realtime PHI remain blocked.
4. The development vault is file-protected, not DPAPI. Production network hosting is unsupported; setting NODE_ENV=production does not grant approval or change this boundary. Never import PHI into web mode.
5. Audit findings affect extract-zip and four dependents: @puppeteer/browsers, puppeteer, puppeteer-core, whatsapp-web.js. Advisories: GHSA-jmr9-qjv8-65gv and GHSA-7pqw-9j4j-h8q3. npm proposes an older WhatsApp package; no unreviewed downgrade or audit suppression was applied. A compatible fix and messaging/browser regression validation remain release blockers.
6. The repository scanner covers common credential patterns and runtime paths, not arbitrary PHI or every secret format. Independent review remains required. No new provider credential or PHI fixture was committed.
7. Default retention is application policy, not a regulatory exemption. Unresolved alert evidence is pinned; resolved evidence ages out under configured retention. The organization must determine legal holds and retention before deployment. Explicit exports remain in the approved workspace until managed there.

## Clinical review notes

- Every registered rule has a version, source/review metadata, required feeds, condition description, and review-required flag. Execution functions remain code, not a user-editable regulatory language.
- 42 CFR 483.45 was checked on 2026-09-23: https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-B/section-483.45. Publication dates and clinical review owners remain unset where not verified. The registry's effective date is an application date, not an assertion of regulatory adoption.
- Missing imported documentation is not proof that the full PCC chart lacks documentation. Diagnosis matching, behavior lookback, GDR timing, psych follow-up, and medication/documentation mismatches are review prompts. The legacy 180-day GDR fallback is a facility heuristic, not a complete regulatory schedule.
- PRN antipsychotic review uses the distinct antipsychotic renewal context; clinicians must review evaluation, orders, and exceptions. No rule authorizes prescribing or discontinuation.
- The displayed QM ratio is exploratory. It is not a validated implementation of current CMS exclusions, denominator, MDS logic, or survey tags. Independent clinical/regulatory validation is mandatory.
- Feed dates come from source reports; absent/rejected/stale feeds prevent an all-clear state. Reports from a newly imported old period do not become current merely because they were uploaded today. Users must review mapping and feed completeness.
- Duplicate detection is best-effort without stable event/order IDs. Re-exports with changed content/date can require reconciliation. Large-facility volume and real PCC layout coverage remain unverified. No real resident data was used in testing.
- Legacy alerts without versioned evidence are retained as legacy; the system does not invent their missing provenance. Historical seeded data needs separate reconciliation before upgrading a live facility.

## Release blockers and required next review

Remote source is missing:

```
build/prepare-browser-assets.cjs
build/windows-build.cjs
build/after-pack.cjs
build/installer.nsh
build/icon.ico
build/desktop-helper/PrivateAI.Access.exe
build/local-runtime/llama-server.exe
```

The two structural PE/evidence helpers were reconstructed and tested against synthetic cases. They do not restore the missing Windows toolchain. No build-folder history was available in the inspected repository history. Do not invent installer/runtime binaries or treat old release claims as current evidence.

Before release: restore reviewed tooling; remediate dependency findings; complete independent security/clinical review and browser visual QA; build on Windows; record source SHA and immutable EXE/ASAR/installer/runtime hashes. Execute clean install, launch, database/vault initialization, OpenAI and local/Ollama connection, chat/upload, SNF import/alert, restart/persistence, temporary cleanup, export, browser companion, Worker start/stop, known-working 2.1.x upgrade, and uninstall/reinstall. Synthetic schema migration is not that upgrade test.

The requested broad decomposition of all remaining clinical/UI monoliths is intentionally incomplete; targeted extraction is implemented. Further restructuring and clinical rule expansion should follow representative-data and independent review, not delay the emergency safeguards already in this branch.
