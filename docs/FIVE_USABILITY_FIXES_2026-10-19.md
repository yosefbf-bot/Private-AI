# Five usability fixes and Windows dark visibility - October 19, 2026 UTC

Owner-approved source updates: Desktop 3.0.6-dev and companion 1.2.3-dev/code 6.
Desktop base main: 1dec8a34c226f52f93e441c40456207bd6a17153.
Companion base main: 55c09a414f30cd7641f103b2c3a86d8836a1245d.

## Behavior

- Android chat displays operation feedback within the active chat.
- An attachment saved from Android chat is acknowledged as a saved note after its
  encrypted local commit. It is not falsely presented as an attachment sent to the
  AI chat. Matching submitted fields clear; newer edits survive; repeated taps are
  guarded. Desktop transfer still uses the existing queue and scoped connection.
- Android chat uses the existing connection badge with check time, refreshing
  state and manual refresh. No direct cloud/API or independent relay was added.
- Android Ask again uses the completed original phone question linked to that
  answer, retaining/rechecking privacy and pairing requirements. Imported history
  without a verified original request does not offer this action.
- Desktop Notes warn before navigating away from unsaved input. Cancel leaves
  Notes and chat history unchanged. Reviewing saved items preserves text, optional
  fields and selected evidence. Review refresh cannot create a second enabled
  submission while Save is outstanding. Acknowledged saves clear only the original
  submitted input; newer text/evidence remains unsaved for the next Save.
- Windows dark appearance uses lighter control/panel boundaries and focus rings;
  microphone, danger, voice labels, duration, stale-source and priority text use
  existing theme colors. Disabled controls stay readable and disabled. The light
  palette and automatic system appearance are retained.

## Privacy and limits

No new dependency, database migration, RPC, gateway permission or provider path.
No plaintext browser storage for Notes and no new persistent draft cache. Save
Notes before lock, close or restart: the warning guards in-app navigation, not OS
termination. Forced security locking clears the form without a blocking prompt.
The companion remains desktop-mediated. Existing vault/OS-auth/TLS/privacy and
outgoing-message approval boundaries remain in force. No owner installation,
pairing, signing identity, model or data is replaced by these source changes.

## Verification

Final actual synthetic Core/encrypted-SQLite + Windows Edge 155.0.4283.62 run
passed 25 existing workflows, 13 Notes scenarios, 117 light/dark text-contrast
observations and seven dark-control visibility checks. Notes coverage includes
both save/list-refresh start orderings, pre-ack response after durable save,
repeat submission, newer input/evidence, failed save, Cancel New chat and forced
lock. Rendered text targets meet 4.5:1; control boundaries exceed 4.4:1,
placeholders 7.8:1 and focus 7.2:1. Synthetic screenshots were inspected.

Focused local Node security/guide/build identity/packaging tests passed 36/36 with
zero failures or skips; syntax (241 files), repository policy (400 tracked files),
Gitleaks (zero current/history findings), and 16 real-Git CI scope/gate tests passed.
Independent read-only review found no remaining code blocker after save-ordering
and dark-visibility corrections. Full suites and genuine hosted Windows/Android
acceptance are still required for the exact PR/main heads; no prior-release result
is claimed for this source. Physical owner-device/account acceptance remains separate.

The existing Windows acceptance job now runs this actual Core/Edge UI harness
serially before packaging and retains synthetic JSON/screenshots and its log. It
adds no runner/job/trigger and leaves installer/inference/portable/reinstall gates
unchanged. Source/browser checks do not establish physical-phone, current owner-PC,
live account/LAN/microphone/notification or clinical acceptance.
