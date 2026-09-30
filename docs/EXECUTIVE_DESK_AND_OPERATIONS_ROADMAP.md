# Executive Desk, Operations Analytics & AI Assistant Roadmap

**Verification correction (2026-09-29):** This feature roadmap is not acceptance evidence. Read `GOOGLE_MAIN_REPAIR_2026-09-29.md`: the initial integration deleted release inputs and introduced Production sample seeding, Demo leakage and invented draft facts. The repair addresses those regressions with real database and Edge checks. Assistant functions currently use deterministic templates/heuristics; they do not demonstrate live provider execution or independently validated clinical/regulatory conclusions. Existing seeded data requires reviewed disposition.

**Document Date**: 2026-09-28  
**Scope**: Day-to-Day Facility Operations, Administrator Desk, Staffing & Overtime Analytics (OnShift + Universal), Regulatory & License Sentinel, and AI Chief-of-Staff Assistance.

---

## 1. Master Architecture Overview

The system is organized into two primary operational views with an ambient AI Assistant suite available throughout:

1. **Tab 1: Executive Desk** — Daily execution, communication triage, delegation, facility walk-throughs, and staff management.
2. **Tab 2: Operations Analytics & Compliance** — Deep-dive staffing/overtime optimization, OnShift report digestion, and regulatory license renewal protection.
3. **Ambient AI Assistant Suite** — Context-aware ghostwriting, voice memo auto-routing, meeting prep dossiers, commute audio briefings, and contract fine-print analysis.

---

## 2. Core Functional Modules

### Module 1: Daily Executive Rhythm & Priority Focus
- **Top 3 Non-Negotiables**: Pinned daily priorities established each morning that stay visible above reactive operational alerts.
- **End-of-Day Loop Closure (4:30 PM)**: Automated audit of outgoing commitments, overdue department tasks, and callbacks.
- **Standup Carryover**: Unresolved high-priority items automatically roll into the next morning's briefing.

### Module 2: Inbound Communications & Action Item Triage
- **Direct 1-Click Capture**: Integrated capture from email (Outlook/Gmail) and WhatsApp Web.
- **Controlled HIPAA Environment**: Operates with full operational context (resident names, room numbers, clinical specifics) without artificial redaction barriers.
- **Two-Way Triage**:
  - *My Commitments*: What the Administrator promised to families, staff, corporate, or state.
  - *Waiting On*: Items requested from MDs, pharmacies, labs, contractors, or department heads with auto-escalation when past due.

### Module 3: Department Head Delegation & Accountability Board
- **"Ball in Their Court" Matrix**: Real-time breakdown of open tasks by department head (DON, Maintenance, Dietary, Housekeeping, Social Work, Business Office).
- **Morning Standup Review**: 1-click summary showing completed items, overdue tasks, and pending approvals per leader.
- **Task Timeline & Audit Trail**: Exact timestamps of delegation, updates, and closure.

### Module 4: Administrator Executive Rounds & Punch List Logger
- **Rapid Issue Capture**: Quick entry while walking units and hallways (e.g., Room 114 dripping faucet, corridor scuff, loose call light).
- **Auto-Dispatch Work Tickets**: Categorizes and dispatches directly to Maintenance or Housekeeping queues.
- **Admission Room Readiness Board**: Step-by-step progress tracking for vacant rooms (Discharge → Deep Clean → Maintenance Check → Bed Made → Ready for Admission).

### Module 5: Staff Supervision, Attendance & HR Milestones
- **Attendance & Reliability Point Tracker**: Fast logging of tardies, call-offs, and no-call-no-shows with threshold alerts (e.g., 3rd weekend call-off in 60 days).
- **30 / 60 / 90-Day New Hire Milestones**: Check-in and evaluation reminders to protect new hire retention.
- **Coaching & Disciplinary Trail**: Chronological record of verbal warnings, written notices, and commendations.

### Module 6: Regulatory Compliance & License Renewal Sentinel
- **Facility Certifications**:
  - *CLIA Waiver*: CMS Form 116 biennial renewals, test menu tracking, Lab Director credentials.
  - *BNE / State CDS (Narcotics)*: Controlled substance handling registration, safe combo changes, biennial physical inventory schedules, destruction logs.
  - *DOH Operating Certificate*: State operating license renewals and bed allocations.
- **Life Safety & Physical Plant**: Annual fire alarm, sprinkler hydro tests, boiler inspections, weekly generator load tests, kitchen hood suppression.
- **Staff & Physician Credentialing**: Medical Director/Attending MD licenses, DEA, malpractice insurance face sheets, OIG/SAM exclusion checks, and nursing licenses.

### Module 7: Staffing & Overtime Analytics (OnShift-Tailored + Multi-Platform Engine)
- **OnShift Native Ingestion**: Direct support for *Schedule vs. Actual*, *Overtime Watch*, and *Open Shifts* exports, alongside a universal CSV adapter.
- **Pre-Shift "Approaching OT" Warning**: Flags staff at 32–36 hours mid-week to prevent overtime before shifts begin.
- **Smart Replacement Matcher**: Recommends PRN or part-time staff under hours threshold before incurring overtime or agency fees.
- **Incidental Punch Leakage Audit**: Identifies chronic 15-minute early punches, late clock-outs, and unworked meal deduction anomalies.
- **FTE Deficit & Hiring Gap Calculator**: Identifies recurring overtime clusters by shift and unit, calculating exact FTE positions needed to eliminate agency spend.

---

## 3. The Executive AI Assistant Suite

### AI-1: Context-Aware Ghostwriter
- Drafts responses in the Administrator's voice for family inquiries, corporate staffing explanations (referencing OnShift metrics), and physician order follow-ups.

### AI-2: Meeting Prep Dossiers ("Cheat Sheets")
- Instant 1-page briefings prior to 1-on-1s with Department Heads, Attending Physicians, Vendors, or Regional Corporate Leaders.

### AI-3: Stream-of-Consciousness Voice Memo Parser
- User speaks a single 30-second audio memo while walking or driving; system splits and dispatches work orders, dietary notes, HR recognitions, and follow-up tasks.

### AI-4: 5-Minute Commute Audio Briefing
- Personalized morning voice summary on the commute covering census, overnight call-offs, incoming admissions, and daily top 3 priorities.

### AI-5: Vendor Contract & Quote "Gotcha" Scanner
- Analyzes PDF proposals/contracts (agency rates, linen, pharmacy) for auto-renewal windows, cancellation penalties, and hidden price escalators.

### AI-6: Difficult Conversation & HR Scripting Coach
- Prepares structured talking points, legal safety boundaries, and de-escalation scripts for terminations, disciplinary meetings, and irate family conferences.

### AI-7: 14-Day Proactive Operational Conflict Radar
- Scans upcoming fortnight for collisions between regulatory drills, corporate deadlines, payroll cutoff times, and key staff PTO.

---

## 4. Phased Implementation Plan & Consolidation Status

1. **Phase 1: Executive Desk Foundation (Completed & Consolidated)**
   - Data models and store for Daily Rhythm ("Top 3"), Action Queue ("My Commitments" vs. "Waiting On"), and Dept Head Delegation.
   - UI views for Executive Desk top bar and accountability board.
   - Consolidated with canonical Action Center: uses underlying `todo` and `wf_action_meta` records.

2. **Phase 2: Rounds Punch List & HR Milestones (Completed & Consolidated)**
   - Room readiness board and rapid ticket logger.
   - Attendance points and new hire milestone alerts.
   - Executive walk findings create canonical actions linked by `source: 'rounds'`.

3. **Phase 3: Operations Analytics & Compliance (Completed & Consolidated)**
   - OnShift CSV parser and multi-platform staffing schema.
   - Overtime reduction intelligence and FTE deficit calculator (deterministic formulas with explicit assumptions).
   - Regulatory license and credentialing sentinel (linked to canonical Action Center renewals).
   - Embedded directly within Operations & Meetings (`operationsCopilotUI`) to prevent navigation duplication.

4. **Phase 4: AI Assistant Intelligence Layer (Completed & Consolidated)**
   - Voice memo parser and multi-action dispatcher.
   - Ghostwriter templates and meeting dossier generator.
   - Contract PDF scanner and 14-day conflict radar.
   - Strictly routed through local/hybrid provider and privacy boundaries; no external cloud PHI exposure.

