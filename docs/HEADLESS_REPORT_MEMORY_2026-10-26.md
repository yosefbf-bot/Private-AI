# Headless report RAM decision

**Keep the existing 1.5 GiB browser floor.** A lower candidate passed once under
pressure but failed the repeat safety check. No lower production budget was kept.

Five synthetic protected-login/download runs used the app's native Electron/DPAPI
path and actual headless Edge 156.0.4314.42. Each save was followed by a restarted
report run. A native Windows sampler polled the fixture and descendants every 100ms.

| Restarted run | Peak summed working set (bytes) |
| --- | ---: |
| 1 | 1,013,690,368 |
| 2 | 1,019,150,336 |
| 3 | 1,016,004,608 |
| 4 | 1,027,653,632 |
| 5 | 1,020,743,680 |

Maximum private bytes across these runs: 560,394,240 (about 534 MiB).
Maximum working set: about 980 MiB; maximum observed tree size: 14 processes.
The separate setup/save phase reached 1,254,539,264 working-set bytes and
672,591,872 private bytes across 19 processes. Setup is not the lower-budget profile.

A candidate restricted to scheduled, protected-login, headless Windows Edge with
extensions disabled used 1.375 GiB, exceeding the measured restart working set by
30%. Headed/unmeasured profiles, exclusivity and per-step pressure checks were
unchanged. Unit checks passed, but measurements alone were insufficient:

- One bounded-allocation run launched at 1,542,553,600 available bytes, completed
  the real synthetic download, and stayed above the 1 GiB abort boundary.
- A repeat launched at 1,522,298,880 available bytes and crossed that boundary.
  The controller released its allocation and stopped only its owned fixture tree.
  The exact minimum was not persisted on the abort path and is not claimed here.
- All experimental resource/fixture changes were reverted. Available RAM recovered
  above 5 GB after the aborted trial. The owner approved and was present for testing.

Working-set sums count shared pages per process; they are not unique physical RAM.
Polling can miss very short-lived children or sub-100ms peaks. This is one Windows
PC, one Edge version and synthetic reports, not a guarantee for live PCC pages.
The failed repeat is why a lower floor is not justified, despite the initial margin.
Existing report functionality, model selection, privacy and pressure cancellation
remain unchanged. Raw local evidence is retained outside Git.
