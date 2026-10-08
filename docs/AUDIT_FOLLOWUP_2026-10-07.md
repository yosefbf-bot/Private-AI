# Audit follow-up â€” 2026-10-07

Based on GitHub main `1527da64ba667ee862e2e71221f51063e4c06fa1`, on `chatgpt/pre-use-audit-fixes-2026-10-06`. This preserves the [earlier audit repairs](PRE_USE_AUDIT_FIXES_2026-10-06.md), application version 3.0.1-dev, Android contract, databases and security boundaries.

Three additional defects were reproduced before these fixes:

- A completed remote Worker report was incorrectly marked failed when publication of its signed completion status encountered a temporary shared-folder write failure. Publication now queues for retry without changing the persisted outcome, rerunning inference, or refreshing the job's retention timestamp. Restart reconstructs the same pending queue from stored outcomes. Initial job claiming remains fail-closed.
- Voice mode could request microphone access and display listening when browser speech recognition was unavailable. It now reports that recognition is unavailable and requests no microphone stream. Typed chat remains available; this does not add offline speech recognition or relax HIPAA/Local Only restrictions.
- Actual installed-app validation exposed a shutdown race: after `before-quit` closes SQLite, `window-all-closed` can read settings from the closed store and cause a crash exit. The window handler now respects the existing quitting state, and duplicate quit events do not run cleanup twice. `tests/main-startup.test.cjs` reproduced the closed-database exception using the shipped main entry point and real SQLite before the fix. Background Worker/WhatsApp/companion window-close behavior before shutdown is preserved.

Both regressions are covered in `tests/pre-use-audit.test.cjs`. The initial focused run reproduced both failures; the corrected Worker/voice/audit run passed 33 tests. Clean locked install, 508 Windows source tests, 25 overlapping hardening tests, 185 syntax checks and the zero-finding production audit passed. The first current Edge UI attempt hit actual low-memory protection; retry and package acceptance remain pending. An older installer with the same version is not evidence for this source.

No schema migration, provider change, autonomous sending, Android modification or new clinical conclusion is introduced. Native release inputs are from successful exact-head CI for `7ebebd6a08a24a4ea67695596895931df921f652`; native build sources are unchanged by this follow-up. Packaging must verify their manifest and every packaged source byte against the frozen source commit. Existing deliverables and validation evidence remain preserved.

See the final dated Windows validation report when available. Physical Android notification/LAN acceptance, live WhatsApp/Outlook accounts, representative clinical-data upgrades, reboot and interactive installer acceptance remain separate from synthetic automated checks.

After the shutdown correction, all **509 Windows tests passed**, with zero failures/cancellations/skips. The first candidate installer exited 0, but installed-app shutdown/restart acceptance did not pass; its evidence is retained and cannot be used as release proof. The corrected source requires a fresh package. Limited available RAM also blocked the current general UI attempt and has not yet permitted fresh local inference.
