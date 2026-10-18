# GitHub Actions cost controls

Application behavior and release acceptance remain unchanged. These controls reduce
duplicate work and temporary storage; they are not permission to treat a skipped
runtime test as executed.

- Pull requests targeting main run validation. Push runs are limited to main, so
  a feature-branch push does not duplicate its PR run. Manual dispatch always
  forces full validation, including actual Windows/emulator execution.
- Superseded PR runs are cancelled. Main/manual acceptance is not interrupted by
  a new PR. There is no scheduled build or separately billed AI service.
- A full-history, NUL-delimited Git diff compares the event base with the checked
  out commit, including every PR commit and both sides of renames/deletions.
- Only the exact administrative paths in .github/ci-policy.json use lightweight
  checks. Source, dependencies, workflows, scope policy, build/test files, app-facing
  guides, wire contracts and unknown files still require the full path. Invalid or
  unavailable range detection falls back to full validation. Status JSON is parsed.
- The always-running ci-gate requires successful scope/security jobs and every
  full-path job when applicable. Failed, cancelled, missing and unexpected skips
  fail the gate. Deliberate docs-only skips are reported as skips, never executions.
  Configure branch protection to require ci-gate where the account supports it;
  existing named jobs remain present. No branch protection was weakened here.
- Future PR artifacts expire after 3 days, main artifacts after 7, and manual
  acceptance after 14. Intermediate same-run Windows native inputs expire after
  1 day. Preserve accepted release payloads and sanitized evidence in the private
  release/local validation archive before temporary Actions artifacts expire.
  Existing release artifacts and historical evidence are not deleted by this change.

The Android workflow reuses Gradle's official pinned setup action with the basic
open-source GitHub-cache provider. Only dependency downloads and wrapper
distributions are cached; workspace build outputs, test results, configuration
cache and local task-output build-cache are not restored. Only trusted main writes
the shared cache. Build Scan publication/dependency submission are disabled.
Actual OS authentication, IME/keyboard, unit/lint and emulator commands remain.

This normally reduces a branch-push + PR + main cycle from three full workflow runs
to two; it is a run-count reduction, not a promised dollar percentage. Administrative
updates avoid the expensive installer/compiler/emulator work. GitHub cache/artifact
storage has its own allowance; this does not change billing budgets or buy capacity.
Do not make the private repositories public to obtain free runner minutes.

After changing this policy or its helpers, run their Python regression suite and
workflow lint, obtain independent review, and require full exact-head GitHub
validation before merging. Manual/release acceptance must not reuse a stale test
receipt or claim current owner-PC/physical-phone/live-account acceptance.
