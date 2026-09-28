# Workflow and speaker review — 2026-09-28

Base: `21969ff21a5ab51bdb12900aea2d618eb96a3466` (main, merged PR #4).
Branch: `chatgpt/workflow-voice-improvements-2026-09-28`.

## Scope and findings

This change implements the six defects reproduced in the overall app review and the immediate dashboard/briefing/evidence-label cleanup. The user asked to retain and develop speaker recognition rather than hide it. Larger navigation consolidation, staffing imports, document retrieval, and versioned playbooks remain follow-on work, not completed features.

- Admissions/transfers/falls and related import paths no longer substitute hospital names, diagnoses, injury absence, notification status or other unsupported event details. Explicit CSV false values remain false; absent booleans remain unknown. Existing imported records are not silently rewritten. This is not independent validation of every clinical parser or rule.
- Resident timeline name collisions return a choice of stable IDs. An exact ID wins; active sections exclude discontinued orders/resolved alerts.
- Shift handoff returns all followups and monitoring items rather than truncating to 10/8 and misreporting totals.
- Completing/reopening a linked To-Do updates its meeting action. Meeting reads reconcile existing convertedTodoId links; a task remains authoritative for its linked completion state. No clinical alert is automatically resolved. Machine-suggested names do not become action owners, and transcript heuristics no longer invent a 24-hour deadline.
- Bounded source extraction/listing can take the local path even when a prompt contains medication terminology. Open-ended advice still follows conservative routing and cloud policy. No network permission or provider approval was relaxed.
- Non-OpenAI cloud usage is counted as cloud with real returned token counts and unknown price, not free/local. Historical incorrectly recorded tokens cannot be reconstructed by this patch.
- Unavailable staffing/payer/survey cards become a compact setup explanation. Implementing those imports/scoring still requires separate work. Voice Profiles and Protocols have separate tabs.
- Morning huddles use actual recorded followups/actions. General department guidance is available only through the clearly labeled optional checklist.
- Answers show source/input/review flags. Numeric internal routing scores are not displayed as accuracy.

## Speaker feature: what now works in code

1. Open Operations & Meetings → Voice Profiles; create a person.
2. Choose Add Verified Sample. Record three separate passages per person. Each ten-second capture starts with two quiet seconds, then eight seconds of solo speech.
3. Explicitly confirm the person and single-speaker recording, and enter the reviewer's name. Capture consent is confirmed in this enrollment form.
4. In a live meeting, enter a statement and choose Record speaker for this statement. Confirm that only one person spoke, then use the measurement. It applies only to the next statement and expires after two minutes.
5. A supported match displays a suggested name; otherwise it stays Unknown Speaker. Confirm or correct each entry before relying on identity. Manual speaker selection remains available. Post-meeting corrections regenerate minutes and update linked findings while preserving the meeting completion time.
6. Review/remove individual samples or delete the profile. Deletion uses the existing backup-purge behavior. Demo profile changes remain isolated.

The local Web Audio collector computes pitch and 16 spectral bands, estimated signal-to-noise ratio and clipping from bounded microphone samples. Raw audio is not saved or transmitted by this path. Confirmed acoustic summaries are stored in the existing encrypted workspace. This is an experimental acoustic signature, not a trained speaker-embedding model or calibrated biometric identity system.

A suggestion requires three separate confirmed captures, quality gates, similarity >= 0.96 and a >= 0.10 lead over other profiles. These are conservative engineering thresholds, NOT 96% accuracy or a measured false-match rate. The expected meeting roster cannot boost a score. Similar voices, microphones, accents, recording conditions and different speech content can still cause false matches or abstention. Low-quality/ambiguous measurements abstain. Automatic suggestions never mark identity verified and never automatically train a profile.

Continuous speaker diarization, automatic overlap detection, offline transcription and validated acoustic noise filtering are NOT implemented. The operator must confirm single-speaker audio. Browser speech transcription remains a separate feature: it may use remote services and remains blocked in HIPAA/Local Only or when settings are unavailable. Its text alone never supplies speaker identity. Microphone capture is stopped on cancellation/navigation/meeting completion/policy change, including a delayed permission grant.

## Verification and acceptance

See PROJECT_STATUS.json for final counts and scope. Automated checks use synthetic fixtures and real Core/SQLite/dispatch where applicable. They cover rejected samples, independent enrollment, ambiguous profiles, identity confirmation, no automatic task attribution, manual correction, revoked samples, source extraction, cloud accounting, imports, complete handoffs, and linked completion.

Supplementary DOM checks exercise all eight Operations tabs, the setup area, enrollment/cancel controls, statement persistence, unknown attribution and capture cleanup. They do not establish layout correctness. Full Chromium smoke testing was attempted but the browser exited before page creation in this environment.

Windows hardware microphone behavior, real-speaker false-match/abstention rates, clean installation, upgrade, restore and clinical acceptance remain unverified. Before relying on speaker suggestions, test different people, unknown guests, similar voices, noisy rooms, overlapping speech and changed microphones on the actual Windows PC. Do not lower thresholds just to produce labels or interpret synthetic tests as identity accuracy.

Main's earlier repair commit passed regression/dependencies/release-files in GitHub run 36363249305. That is historical base evidence. This branch's CI must be checked separately; source tests and release-file checks do not prove installer acceptance.

Final local results: 352 tests passed; 23 hardening tests passed; 141 files syntax-checked; repository policy passed; clean lockfile install passed; production dependency audit reported zero vulnerabilities. The latest post-meeting-correction change additionally passed the 15-test workflow/voice suite. Local release gate remains blocked by the two unbuilt Windows executables listed in PROJECT_STATUS.
