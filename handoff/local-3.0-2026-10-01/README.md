# Historical local work preserved during GitHub integration

These are byte-for-byte copies of the earlier local **3.0.0** source and cumulative
handoff archives. They are historical inputs, not the combined application or a new
installer. `archives.json` records their SHA-256 checksums and contents counts.
Both archives were inspected for runtime databases, models, recordings, private
keys and credential-shaped strings before being copied here.

The running source in this repository is **3.0.1-dev**, based on GitHub main
`0a7ec92fa18c52ed8983aa06803977e3a220cf02`. Its newer clinical engine, provider
security, workflows, voice work, browser support and build gates were retained.
The useful local standalone and WhatsApp changes were adapted to that architecture.
Do not extract either archive over the current checkout.

Historical validation reports inside these archives apply only to the executables
and source hashes recorded there. In particular, an old statement that a checkout
contains no clinical/PCC engine describes the older local source, not current GitHub.
Old Windows application/inference results do not validate this combined build or
establish successful installer execution.

## Continue this work in ChatGPT Work or another coding tool

Use the repository and branch/PR, not an older uploaded source ZIP. Suggested prompt:

> Work in https://github.com/yosefbf-bot/Private-AI-OG-google-version. Fetch GitHub
> first and verify the latest main SHA, active branch, version and local changes.
> Read AGENTS.md, AI_HANDOFF.md, PROJECT_STATUS.json and the required guardrails.
> Continue the integrated 3.0.1-dev source. If the local-hardening PR has not merged,
> use branch chatgpt/import-local-hardening-2026-10-01 and reconcile newer main
> changes without overwriting either side. Preserve optional PCC, general clinical
> imports/rules, provider approval and budgets, independent WhatsApp read/write
> permissions, job-status alerts, the optional authenticated Android HTTPS gateway
> and its certificate-verification contract, and all newer GitHub features. The archives under
> handoff/local-3.0-2026-10-01 are historical reference only. Work on a separate
> branch and provide a PR for me to merge. A source test pass is not Windows
> installer acceptance; verify the actual final artifacts before declaring a release.

See [the integration report](../../docs/LOCAL_HARDENING_INTEGRATION_2026-10-01.md)
and [the usage supplement](../../docs/INTEGRATED_STANDALONE_GUIDE.md).
