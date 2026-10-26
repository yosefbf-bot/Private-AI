# Idle resources and report workflows — validation checkpoint

Desktop base `77ca24a`; companion base `c5ef833`. Implementation branch:
`chatgpt/report-history-idle-20261026`; companion PR17. Existing installed apps,
owner data, pairings, signer and live website sessions have not been replaced.

## Behavior

- Unloaded local brains have no five-second maintenance timer (12 fewer scheduled
  maintenance callbacks/minute). Loaded idle models retain the configured warm
  interval, but release under the configured RAM reserve. Active-answer emergency
  protection is unchanged. This is not a measured whole-app RAM/CPU percentage.
- Closing the window retains scheduling/queued work on a Primary PC even when
  Worker is disabled. The hidden renderer is intentionally retained to protect
  unfinished forms. Explicit Quit exits; sleep/lock/pause restrictions still apply.
- Existing Playwright workflows accept calendar-relative periods, date formats,
  approved named choices, native selects/checkboxes and contained relative output
  folders. Daily folders use the download date. Filenames remain unique.
- Parameter definitions participate in existing tested-workflow approvals.
  Scheduled runs use saved defaults; manual overrides are presented in the native
  preflight. Existing trusted-origin, credential, rate-limit and five-minute
  spacing controls remain. PCC-off blocks PCC retrieval; demo cannot feed history.
- Encrypted history separates collection/requested/source dates. CSV/XLSX mapping
  requires exact headers and identifiers. Snapshots compare values; events
  deduplicate stable event IDs. Source workflow revisions stay separate. Missing
  data remains unknown, conflicting points are excluded, comparisons require review.
- History is limited to 100 days or shorter owner retention. Originals are not
  removed by catalogue cleanup. Folder intake is flat and excludes unsupported
  entries explicitly. Structured input is bounded to 350k characters, 10k rows and
  200 columns per file; a query stops at 100k observations/points and 20k groups.
  Report selection is bounded to 1,000 records; parser input is capped at 20 MB.
- Report chats and imported working copies remain protected even in public mode.
  Files receive protection on their first write. A catalogue over 1,000 records
  does not stall background indexing or selected-report jobs; broad user queries
  still fail visibly at their limit instead of silently dropping evidence.
- Date/folder analysis can run manually or daily/weekdays/weekly/monthly via the
  existing scheduler. It processes each report separately, with available structured
  comparisons; it does not claim one consolidated all-files model synthesis.
  The queue preserves workspace and read-only tool restrictions, including at the
  actual resource boundary. Interrupted model requests require review.
- Analysis scheduling is bound to its original workspace. Pause/edit/delete during
  folder intake invalidates the claim. Run-now validates the stored schedule on the
  server. Editing/switching workspaces cannot silently redirect the selection.

## Verification

Initial targeted regressions failed before their implementation. Independent
read-only review found workspace, source-version, row-citation, bounded-memory and
schedule-claim defects; all were corrected with focused regressions. Android's two
reviewed lock/pairing races were also corrected independently.

Windows Edge synthetic acceptance exercised date/select/checkbox values, unique
daily-folder downloads, encrypted indexing/deduplication, actual analysis/export
through the existing job pipeline (synthetic provider), and history/trend/monthly
schedule controls in light and dark themes. It passed. No real PCC/Power BI
credentials or patient data were used. The sign-in UI acceptance also passed.

Full-source and exact-head CI counts are recorded in PROJECT_STATUS.json and the
handoff after completion. A first full local run passed 849/851: the old immediate
analysis test needed the new explicit queue stages, and build identity metadata
needed regeneration after source changes. The final failure assertions were
preserved; queued parent jobs now reflect their eventual analysis failure/success.

## Limitations requiring honest acceptance

Live PCC/Power BI report names, selectors, available selections and account/MFA
policies must be configured and tested for the owner's authorized site. Synthetic
browser acceptance does not establish live account compatibility. No CAPTCHA/MFA
bypass, hidden send/delete permission or guaranteed sleeping-PC wake is provided.

Arbitrary PDF/narrative output is analyzed as documents, not silently transformed
into verified clinical measurements. Numeric unit/staff aggregates must be supplied
as reviewed source values; incompatible same-entity/day values remain conflicts.
Comparisons are evidence-review prompts, not diagnoses, causal conclusions or
staff-performance scores. Real-phone idle/battery/upgrade acceptance and whole-app
before/after benchmarks remain unperformed.
