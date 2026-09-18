'use strict';

/**
 * Clinical and Nursing Home Operations & Regulatory Reference Engine
 * 
 * Provides grounded clinical depth and regulatory precision to both local
 * and cloud brains without external API dependencies.
 * 
 * Domains:
 * 1. MD (Physician) Level: Geriatric differentials, workups, Beers Criteria, polypharmacy, certifications
 * 2. Nurse (RN/LPN) Level: SBAR, triage, NPUAP wound staging, CAUTI/McGeer criteria, care planning
 * 3. CNA Knowledge & Daily Tasks: ADLs, transfer assistance levels, skin inspection, Q2H turning, I&O, restorative nursing
 * 4. Rehab (PT, OT, ST): Gait/mobility, weight-bearing, adaptive equipment, contracture/splints, IDDSI dysphagia, aspiration precautions
 * 5. Leadership & Governance: LNHA (Administrator), DON (Director of Nursing), Medical Director
 * 6. CMS Regulations: 42 CFR Part 483, F-Tags (F684, F689, F757, F758, F880, F656, F841)
 * 7. NYS DOH Regulations: 10 NYCRR Part 415, 3.5 HPRD staffing mandate, HCS reporting (2h/24h), FHCDA surrogate hierarchy
 * 8. MDS 3.0 & PDPM: ARD lookbacks, Section GG functional scoring, PDPM case-mix classification
 */

const CLINICAL_DOMAINS = {
  md: {
    title: "Geriatric Physician (MD) Clinical Guidelines",
    keywords: [
      "physician", "doctor", "md", "differential", "diagnosis", "workup", "lab", "labs",
      "bmp", "cmp", "cbc", "chest x-ray", "ekg", "delirium", "dementia", "sepsis",
      "aki", "dehydration", "pneumonia", "syncope", "beers", "polypharmacy", "deprescribing",
      "anticholinergic", "recertification", "physician visit", "orders",
      "hypertension", "bp", "blood pressure", "ketoacidosis", "dka", "diabetes"
    ],
    content: `### Geriatric Physician (MD) Reasoning & Guidelines
- **Geriatric Differentials & Management**:
  * Hypertension (HTN): Primary goal in long-term care geriatrics is SBP 130-139 mmHg without orthostasis or fall precipitations. First-line agents: ACE inhibitors / ARBs, dihydropyridine CCBs (amlodipine), or thiazide-like diuretics. Avoid aggressive reductions that induce postural hypotension, syncope, or cerebral hypoperfusion.
  * Diabetic Ketoacidosis (DKA) & Hyperosmolar Hyperglycemic State (HHS): Medical emergencies presenting with hyperglycemia, dehydration, altered mental status, and electrolyte shifts. DKA features metabolic acidosis with elevated anion gap and ketonuria/ketonemia; immediately notify MD/provider for emergency transfer, IV isotonic fluid resuscitation, electrolyte repletion (potassium monitoring), and intravenous regular insulin protocol.
  * Acute Confusion: Prioritize Delirium vs. Dementia vs. Depression (3 D's). Delirium is acute, fluctuating, with inattention; always investigate underlying triggers (infection/UTI, pneumonia, medications/anticholinergics, electrolyte imbalance, fecal impaction, urinary retention, pain, hypoxia).
  * Sepsis in Elders: Often lacks high fever; look for hypothermia (<96.8°F / 36°C), acute functional decline, tachypnea (>22 bpm), acute encephalopathy/altered mental status, hypotension (SBP <100 mmHg), or hypoglycemia.
  * Atypical Presentations: Myocardial infarction often presents as shortness of breath, unexplained falls, or fatigue rather than classic substernal chest pain.
- **Diagnostic Workup Standards**:
  * Complete Blood Count (CBC with diff), Basic/Comprehensive Metabolic Panel (BMP/CMP for BUN/Cr ratio, eGFR, potassium, sodium).
  * Urinalysis with reflex culture ONLY if symptomatic (dysuria, fever, costovertebral tenderness, acute delirium without other source). Do NOT treat asymptomatic bacteriuria (ASB) with antibiotics.
  * Chest X-ray (PA & lateral or portable AP) for suspected pneumonia, congestive heart failure exacerbation, or aspiration.
  * Venous blood gas/lactate if sepsis suspected; 12-lead EKG for syncopal episodes, palpitations, or acute dyspnea.
- **Geriatric Pharmacology & AGS Beers Criteria (2023 Update)**:
  * Avoid first-generation antihistamines (diphenhydramine, hydroxyzine) due to severe anticholinergic burden and fall risk.
  * Avoid long-acting benzodiazepines and sedative-hypnotic Z-drugs (zolpidem, eszopiclone) due to delirium and hip fracture risk.
  * Antipsychotics: Black-box warning for increased mortality in elderly dementia patients. Use only for severe psychosis or behaviors posing direct danger after non-pharmacologic interventions fail.
  * Sliding scale insulin alone: Avoid; preferred regimen is basal insulin with mealtime dosing.
  * Prolonged PPIs: Evaluate risk of C. diff, bone loss, and hypomagnesemia.
  * Renal Dosing: Always calculate creatinine clearance using Cockcroft-Gault equation with actual or ideal body weight.
- **Mandatory Physician Visits (42 CFR 483.30)**:
  * Must occur within first 30 days after admission.
  * Every 30 days for the first 90 days, then at least once every 60 days thereafter.
  * At each visit, write progress notes, review the total program of care (including medications), and sign/date orders.`
  },

  nursing: {
    title: "Nursing (RN/LPN) Standards, Triage & Wound Protocols",
    keywords: [
      "nurse", "nursing", "rn", "lpn", "sbar", "triage", "wound", "pressure injury",
      "stage 1", "stage 2", "stage 3", "stage 4", "unstageable", "dti", "cauti", "mcgeer",
      "fall assessment", "post-fall", "neuro checks", "care plan", "f656", "f684", "interact",
      "stop and watch", "infection surveillance", "catheter"
    ],
    content: `### Nursing (RN/LPN) Clinical Practice Standards
- **SBAR Standardized Communication Format**:
  * **S (Situation)**: Current resident status, vital signs, and immediate reason for call.
  * **B (Background)**: Admission diagnosis, medical history, baseline mental status, current medications, allergies.
  * **A (Assessment)**: Clinical findings, pain level, objective exam, changes from baseline, recent lab/imaging.
  * **R (Recommendation)**: Specific request (e.g., in-person MD evaluation, lab orders, medication adjustment, transfer to ED).
- **Post-Fall Protocol & Neurological Checks**:
  * Immediate head-to-toe assessment before moving resident; check for deformity, external rotation/shortening of lower extremity, head trauma, lacerations, or C-spine tenderness.
  * Vital signs & neurological checks schedule: Q15min x 1 hr, Q30min x 2 hrs, Q1hr x 4 hrs, then Q4hr x 24 hrs.
  * Notify MD/provider and family/responsible party promptly; document environmental factors and update care plan interventions.
- **NPUAP Pressure Injury Staging Guidelines**:
  * **Stage 1**: Intact skin with non-blanchable erythema of a localized area (usually over bony prominence).
  * **Stage 2**: Partial-thickness loss of skin with exposed dermis (wound bed viable, pink/red, moist; may present as intact or ruptured serum-filled blister).
  * **Stage 3**: Full-thickness skin loss; adipose (fat) is visible, granulation tissue and epibole often present; slough/eschar may be present but does not obscure depth; bone/tendon/muscle NOT exposed.
  * **Stage 4**: Full-thickness skin and tissue loss with exposed or directly palpable fascia, muscle, tendon, ligament, cartilage, or bone.
  * **Unstageable**: Full-thickness skin and tissue loss obscured by slough or eschar. Once slough is removed, Stage 3 or 4 will be revealed. (Stable eschar on heels serves as body's natural cover and should not be removed).
  * **Deep Tissue Pressure Injury (DTPI)**: Persistent non-blanchable deep red, maroon, or purple discoloration, or epidermal separation revealing dark wound bed.
- **Infection Surveillance & CAUTI (McGeer Criteria)**:
  * Catheter-Associated Urinary Tract Infection: Requires indwelling catheter in place >2 calendar days AND at least one of: fever (>38°C / 100.4°F), rigors, new costovertebral angle pain/tenderness, acute hematuria, or purulent discharge; plus positive urine culture (≥10^5 CFU/mL with no more than 2 species).
  * Odorous or cloudy urine alone is NOT an indication for antibiotic therapy.`
  },

  cna: {
    title: "CNA Tasks, ADLs & Restorative Nursing Protocols",
    keywords: [
      "cna", "aide", "nurse aide", "adl", "adls", "transfer", "hoyer", "mechanical lift",
      "sit to stand", "bathing", "dressing", "toileting", "grooming", "bed mobility",
      "skin check", "turning", "q2h", "intake", "output", "i&o", "restorative",
      "prom", "arom", "vital signs", "wandering", "wanderguard", "meal intake"
    ],
    content: `### Certified Nursing Assistant (CNA) Core Tasks & Procedures
- **ADL (Activities of Daily Living) Assessment & Assistance Levels**:
  * **Independent**: Resident completes activity without staff help, oversight, or cueing.
  * **Supervision / Setup**: Staff provides cueing, setup, or oversight without physical touch.
  * **Limited Assist**: Resident highly involved, staff provides guided physical maneuvering or non-weight-bearing steadying.
  * **Extensive Assist**: Resident performs part of activity, but staff provides weight-bearing support (1 or 2 staff).
  * **Total Dependence**: Full staff performance of activity across the entire duration (no resident participation).
- **Safe Transfers & Mechanical Lifts**:
  * 1-Person Assist: For residents who can bear partial/full weight and follow 2-step verbal directions.
  * 2-Person Assist: For residents with unsteady balance, fluctuating weakness, or unpredictability.
  * Mechanical Full-Body Lift (Hoyer / Ceiling): MANDATORY 2 staff members present at all times. Check sling size, weight capacity, and straps before lifting. Never leave resident unattended in sling.
  * Sit-to-Stand Lift: For residents who can bear weight through both lower extremities, support upper body, and follow commands.
- **Skin Observation & Pressure Relief Schedules**:
  * Reposition bed-bound residents at least every 2 hours (Q2H turning schedule). 30-degree lateral tilt with pillow supports.
  * Reposition chair/wheelchair-bound residents at least every 1 hour (or independent weight shifts every 15 minutes).
  * Float heels completely off the mattress using pillows under calves or specialized suspension boots.
  * Inspect skin during every peri-care, bathing, and repositioning: check sacrum, coccyx, heels, elbows, ears, and between skin folds. Report any new redness, skin breakdown, or blisters immediately to charge nurse.
- **Intake, Output (I&O) & Hydration Monitoring**:
  * Meal consumption documented in percentages (0%, 25%, 50%, 75%, 100%). Report intake ≤50% across 2 consecutive meals.
  * Document fluid intake in mL/cc (8 oz cup = 240 mL; 4 oz juice = 120 mL; 6 oz coffee = 180 mL; soup bowl = 150-180 mL).
  * Promptly report signs of dehydration: dark concentrated urine, dry mucous membranes, sudden decline in alertness.
- **Restorative Nursing Protocols**:
  * Active/Passive Range of Motion (AROM/PROM): Minimum 3-5 repetitions per joint, 2 times daily. Never force past pain or resistance.
  * Ambulation program: Follow prescribed distance, assistive device, and gait belt rules.
  * Splint application/removal: Adhere strictly to schedule (e.g., 2 hours on / 2 hours off); inspect underlying skin for redness.`
  },

  rehab: {
    title: "Rehabilitation Services: PT, OT & ST (SLP) Clinical Practice",
    keywords: [
      "rehab", "therapy", "physical therapy", "pt", "occupational therapy", "ot",
      "speech therapy", "speech", "st", "slp", "dysphagia", "iddsi", "aspiration",
      "swallow", "thin liquid", "nectar", "honey", "pureed", "mechanical soft",
      "walker", "rollator", "cane", "gait", "ambulation", "weight bearing", "nwb",
      "ttwb", "pwb", "wbat", "fwb", "splint", "contracture", "adaptive equipment",
      "aphasia", "dysarthria", "wheelchair", "tilt in space"
    ],
    content: `### Rehabilitation Interdisciplinary Standards (PT, OT, ST)
- **Physical Therapy (PT) — Mobility, Gait & Safety**:
  * Weight-Bearing Statuses:
    - **NWB (Non-Weight Bearing)**: 0% weight; extremity must not touch the ground.
    - **TTWB (Toe-Touch Weight Bearing)**: Toe can rest for balance only (<10-20% weight; imagine an egg under the foot).
    - **PWB (Partial Weight Bearing)**: Prescribed percentage (commonly 50% body weight).
    - **WBAT (Weight Bearing As Tolerated)**: Up to 100% as comfort permits.
    - **FWB (Full Weight Bearing)**: 100% unconstrained.
  * Assistive Device Progression: Parallel bars → Standard walker (unstable gait/NWB/PWB) → Front-wheeled walker (FWW) → 4-wheeled rollator (requires adequate cognitive & brake control) → Hemi-walker/Quad cane → Single point cane (SPC).
  * Wheelchair Ergonomics: 90-90-90 hip-knee-ankle positioning; pressure relief cushion selection (gel/foam hybrid, high-profile Roho for skin breakdown risk); anti-tippers and footrest adjustments.
- **Occupational Therapy (OT) — ADLs & Upper Extremity Management**:
  * ADL Retraining: Dressing, bathing, grooming, and feeding techniques using compensatory strategies.
  * Adaptive Equipment: Built-up handles for arthritic/weak grasp, rocker knives for hemiparesis, plate guards/scoop plates, reachers, sock aids, long-handled shoehorns, button hooks.
  * Contracture Prevention & Splinting:
    - Resting hand splints / palm protectors to prevent finger contractures and skin excoriation.
    - Wear schedules: Typically 2-4 hours on, 1-2 hours off during daytime, or nocturnal wear.
    - Skin inspection: Redness lasting >20 minutes after splint removal requires therapist re-fitting/adjustment.
- **Speech-Language Pathology (ST/SLP) — Dysphagia & IDDSI Framework**:
  * International Dysphagia Diet Standardisation Initiative (IDDSI):
    - **Liquids**: Level 0 (Thin), Level 1 (Slightly Thick), Level 2 (Mildly Thick / Nectar), Level 3 (Moderately Thick / Honey), Level 4 (Extremely Thick / Pudding).
    - **Foods**: Level 3 (Liquidised), Level 4 (Pureed - smooth, no lumps), Level 5 (Minced & Moist - 4mm lump size max), Level 6 (Soft & Bite-Sized - 15mm piece size max), Level 7 (Regular).
  * Aspiration Precautions & Swallowing Safety:
    - Seated upright at 90 degrees for all meals and medications; maintain upright position for 30–45 minutes post-prandial.
    - Small bites, single sips, alternating liquids and solids.
    - Compensatory strategies: Chin-tuck maneuver (narrows airway entrance), head turn toward weak side (closes weak pharyngeal channel).
    - Monitor for signs of aspiration: Coughing/choking during meals, wet/gurgly vocal quality, watery eyes, temperature spikes within 24-48 hours.
  * Cognitive-Communication: Multi-modal communication boards, memory books for dementia, visual schedules.`
  },

  leadership: {
    title: "Facility Leadership: Administrator, DON & Medical Director",
    keywords: [
      "administrator", "lnha", "don", "director of nursing", "medical director",
      "cmd", "leadership", "qapi", "quality assurance", "survey", "inspection",
      "5-star", "five star", "five-star", "incident", "grievance", "compliance",
      "root cause", "plan of correction", "poc", "antibiotic stewardship", "credentialing",
      "standing orders", "immediate jeopardy", "ij"
    ],
    content: `### Nursing Home Leadership, Governance & Operational Viewpoints
- **Licensed Nursing Home Administrator (LNHA) — Operational & Executive Oversight**:
  * Overall responsibility for regulatory compliance, Life Safety Code (NFPA 101), fiscal operations, and survey readiness.
  * CMS Five-Star Quality Rating Strategy: Managing the 3 domain stars (Annual Health Inspections, Staffing Ratios / PBJ, Quality Measures).
  * Survey Management: Command center operations during standard annual surveys or complaint investigations; escorting surveyors; organizing requested sample records, QAPI minutes, and employee files.
  * Risk Management & Governance: Incident disclosure, managing family grievances, tracking civil liability, ensuring whistleblower protections.
- **Director of Nursing (DON) — Clinical Operations & Nursing Leadership**:
  * Direct oversight of 24/7 nursing schedules, charge nurse delegation, nurse educator training, and clinical competencies.
  * QAPI (Quality Assurance & Performance Improvement) Committee: Monthly tracking of falls, in-house acquired pressure injuries, weight loss trends, antibiotic starts, psychotropic medications, and restraint avoidance.
  * Root Cause Analysis (RCA): Leading multi-disciplinary investigation into critical adverse events (e.g., sentinel falls, elopements, medication errors).
  * Deficiency Plan of Correction (POC): Developing mandatory response within 10 calendar days of CMS 2567 issuance:
    1. Corrective action for residents affected.
    2. Identification of other residents with potential to be affected.
    3. Systemic measures and policy changes to prevent recurrence.
    4. Quality assurance monitoring plan (who, how often, for how long).
- **Medical Director (CMD) — Clinical Governance & Regulatory Duties**:
  * Implementation of resident care policies and coordination of medical care in the facility (42 CFR 483.85 / 10 NYCRR 415.15).
  * Attending Physician Oversight: Monitoring credentialing, performance, timeliness of visits, and documentation quality. Addressing non-responsive attending physicians.
  * Antibiotic Stewardship Program (ASP): Co-leading surveillance, reviewing facility antibiograms, enforcing diagnostic criteria before antimicrobial initiation, and promoting de-escalation.
  * Pharmacy Review: Reviewing Consultant Pharmacist monthly Drug Regimen Review (DRR/MRR) reports; resolving physician response disagreements regarding gradual dose reductions (GDR).
  * Infection Control Committee: Active role in facility outbreak protocols and pandemic prevention plans.`
  },

  regulations: {
    title: "CMS Federal Regulations (42 CFR Part 483) & Key F-Tags",
    keywords: [
      "cms", "f-tag", "ftag", "42 cfr", "483", "f684", "f689", "f757", "f758",
      "f880", "f656", "f657", "f812", "f841", "f550", "f578", "unnecessary drugs",
      "psychotropic", "gdr", "gradual dose reduction", "prn psychotropic", "accident",
      "hazard", "supervision", "immediate jeopardy"
    ],
    content: `### Federal CMS Requirements (42 CFR Part 483) & Core F-Tags
- **F684 (Quality of Care)**: Facility must ensure each resident receives treatment and care in accordance with professional standards of practice, the comprehensive person-centered care plan, and residents' choices.
- **F689 (Free of Accident Hazards / Adequate Supervision)**:
  * Facility must ensure resident environment remains as free of accident hazards as possible.
  * Each resident must receive adequate supervision and assistive devices to prevent accidents (falls, burns, elopements).
- **F757 (Drug Regimen is Free From Unnecessary Drugs)**:
  * Each resident's drug regimen must be free from unnecessary drugs (excessive dose, excessive duration, without adequate monitoring, without adequate indication, or presence of adverse consequences).
- **F758 (Free From Unnecessary Psychotropic Meds / PRN Limitations)**:
  * Resident who has not used psychotropic drugs cannot be given them unless necessary to treat a specific diagnosed condition in the medical record.
  * Gradual Dose Reduction (GDR): Required within the first year (two attempts in two separate quarters), and annually thereafter unless clinically contraindicated by the physician with explicit justification.
  * PRN Psychotropic Orders: Limited to 14 days maximum. Cannot be renewed without new in-person evaluation by the prescriber. PRN antipsychotics cannot be renewed without written rationale by the attending physician.
- **F880 (Infection Prevention & Control)**:
  * Facility must establish and maintain an infection prevention and control program (IPCP) designed to provide a safe, sanitary environment.
  * Must designate at least one qualified individual as the Infection Preventionist (IP).
  * Routine hand hygiene audits, PPE compliance, and environmental cleaning.
- **F656 / F657 (Comprehensive Person-Centered Care Plans)**:
  * Baseline care plan completed within 48 hours of admission.
  * Comprehensive care plan developed within 7 days after completion of comprehensive MDS assessment (within 21 days of admission).
  * Must include measurable objectives and timeframes to meet physical, mental, and psychosocial needs.`
  },

  nys: {
    title: "New York State Regulations (10 NYCRR Part 415) — Stricter than CMS",
    keywords: [
      "nys", "new york", "doh", "10 nycrr", "part 415", "415", "hprd", "staffing mandate",
      "3.5", "2.2", "1.1", "hcs", "health commerce system", "fhcda", "family health care decisions",
      "surrogate", "health care proxy", "2 hours", "24 hours", "abuse reporting"
    ],
    content: `### New York State (10 NYCRR Part 415) Specific Mandates — Differences vs. CMS
- **Direct Care Nursing Staffing Hours Mandate (10 NYCRR 415.13)**:
  * **Stricter than federal baseline**: NYS requires facilities to maintain a daily minimum of **3.5 hours of direct care nursing service per resident day (HPRD)**.
  * Minimum Breakdown:
    - At least **2.2 HPRD** provided by Certified Nursing Assistants (CNAs).
    - At least **1.1 HPRD** provided by Licensed Nurses (Registered Nurses and Licensed Practical Nurses).
  * Non-compliance triggers severe state civil monetary penalties ($2,000 per day) unless specific hardship/emergency waiver criteria are met.
- **Mandatory Incident Reporting via Health Commerce System (HCS) (10 NYCRR 415.4 / 415.5)**:
  * **2-Hour Reporting Rule**: Allegations of resident abuse, mistreatment, neglect, or misappropriation of resident property MUST be reported to NYSDOH via the HCS Electronic Incident Reporting System within **2 hours**.
  * **24-Hour Reporting Rule**: Other reportable incidents (injuries of unknown source, fires, utility failures, unauthorized absences/elopements, physical assaults between residents) must be reported within **24 hours**.
- **Family Health Care Decisions Act (FHCDA) (NYS Public Health Law Article 29-CC)**:
  * When a resident lacks decision-making capacity and has NOT signed a valid NYS Health Care Proxy, statutory surrogate hierarchy applies in strict order:
    1. Court-appointed Guardian under Mental Hygiene Law (MHL) Article 81 with healthcare powers.
    2. Spouse (if not legally separated) or domestic partner.
    3. Adult child (age 18+).
    4. Parent.
    5. Adult sibling.
    6. Close adult friend or other relative.
  * Decisions to withhold or withdraw life-sustaining treatment (e.g., DNR/DNI, artificial hydration/nutrition) require meeting specific clinical criteria (terminal condition, permanent unconsciousness, or irreversible condition with extreme pain and severe burden) and often require concurrence of a second physician.
- **Medical Director Statutory Requirements (10 NYCRR 415.15)**:
  * Medical Director must personally review the quality of care rendered by each attending physician quarterly, report findings to the QA Committee, and ensure physician compliance with state and federal rules.`
  },

  mds_pdpm: {
    title: "MDS 3.0 (v1.18.1+) & PDPM Reimbursement Mechanics",
    keywords: [
      "mds", "rai", "pdpm", "ard", "assessment reference date", "lookback", "section gg",
      "section c", "bims", "phq", "phq-9", "case mix", "case-mix", "nta", "nursing component",
      "therapy component", "ipa", "interim payment", "caa", "care area assessment"
    ],
    content: `### MDS 3.0 (v1.18.1+) & CMS Patient-Driven Payment Model (PDPM)
- **Assessment Reference Date (ARD) & Lookback Windows**:
  * ARD (Item A2300) defines the ending point of the observation period (midnight of the ARD).
  * Standard clinical lookback window is **7 calendar days** (days 1 through 7 ending on ARD) for most items (e.g., Section GG functional performance, mood/behavior, treatments, falls).
  * 14-day lookback applies to specific sections (e.g., Section J health conditions, Section K swallowing/nutritional status).
- **Section GG (Functional Abilities and Goals)**:
  * Uses 6-point scoring scale based on usual performance:
    - 06: Independent (no setup or assistance).
    - 05: Setup or clean-up assistance.
    - 04: Supervision or touching assistance.
    - 03: Partial / moderate assistance (helper does <50% of effort).
    - 02: Substantial / maximal assistance (helper does 50-99% of effort).
    - 01: Dependent (helper does 100% of effort, or 2+ helpers).
    - Activity Not Attempted codes: 07 (Resident refused), 09 (Not applicable), 10 (Not attempted due to environmental limitations), 88 (Not attempted due to medical condition or safety concerns).
- **PDPM 5 Case-Mix Classification Components**:
  1. **PT (Physical Therapy)**: Determined by primary clinical category and Section GG functional score.
  2. **OT (Occupational Therapy)**: Determined by primary clinical category and Section GG functional score.
  3. **SLP (Speech-Language Pathology)**: Determined by clinical category, swallowing disorder, SLP-related comorbidities, and cognitive impairment (BIMS score ≤12).
  4. **Nursing**: Based on clinical conditions, extensive services (trach, vent, suctioning), depression score (PHQ-9-OV), and Section GG score.
  5. **NTA (Non-Therapy Ancillary)**: Point system based on extensive comorbidities (e.g., HIV/AIDS, IV meds, ventilator, diabetes with complications, wound stages).`
  }
};

/**
 * Scans a user or system prompt for relevant clinical, operational, or regulatory terms.
 * Returns targeted reference text bounded within prompt budgets.
 */
function findMatchingContext(query, maxDomains = 3) {
  const q = ' ' + String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (q.trim().length < 3) return '';

  const matches = Object.entries(CLINICAL_DOMAINS).map(([id, domain]) => {
    let score = 0;
    for (const kw of domain.keywords) {
      if (q.includes(' ' + kw + ' ')) {
        score += kw.length > 5 ? 3 : 2;
      } else if (kw.includes(' ') && q.includes(kw)) {
        score += 5;
      }
    }
    return { id, domain, score };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);

  if (!matches.length) return '';

  const selected = matches.slice(0, maxDomains);
  let contextText = '\n--- LOCAL HEALTHCARE & REGULATORY REFERENCE (OFFLINE EMBEDDED KNOWLEDGE) ---\n';
  contextText += 'Use the following grounded clinical standards, regulatory requirements, and operational viewpoints when reasoning about this query:\n\n';
  contextText += selected.map(s => s.domain.content).join('\n\n');
  contextText += '\n--- END HEALTHCARE REFERENCE ---\n';
  return contextText;
}

/**
 * Pre-configured healthcare and nursing home agents for Private AI.
 * Built into the application and available in the Agent dropdowns.
 */
const CLINICAL_AGENTS = [
  {
    id: "md-geriatrician",
    name: "Geriatric Attending Physician (MD)",
    prompt: `You are a Board-Certified Geriatrician and Attending Physician at a skilled nursing facility.
Your role is to analyze clinical data, formulate evidence-based differential diagnoses (distinguishing delirium vs. dementia vs. depression), recommend targeted laboratory and imaging workups, and evaluate medications for polypharmacy using the 2023 AGS Beers Criteria.
Format communications using structured medical summaries and provide clear physician orders with rationale. Adhere to HIPAA standards. You advise and formulate recommendations for licensed providers to review.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "don-leadership",
    name: "Director of Nursing (DON) & Clinical Ops",
    prompt: `You are the Director of Nursing (DON) leading clinical operations and nursing care in a skilled nursing facility.
Your focus is clinical standards, 24/7 nursing schedules, infection prevention, QAPI metrics, root cause analysis for clinical incidents, and survey preparedness.
When reviewing cases, evaluate nursing documentation completeness, SBAR accuracy, wound staging, fall precautions, and draft comprehensive Plans of Correction (POC) for F-Tag deficiencies.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "medical-director",
    name: "Medical Director (CMD) & Clinical Governance",
    prompt: `You are the Certified Medical Director (CMD) responsible for clinical governance under 42 CFR 483.85 and 10 NYCRR 415.15.
Your responsibilities include facility-wide clinical care policies, attending physician monitoring and credentialing, antibiotic stewardship oversight, pharmacy review coordination, and infection control leadership.
Review resident care from a system governance and quality assurance perspective.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "lnha-administrator",
    name: "Nursing Home Administrator (LNHA)",
    prompt: `You are the Licensed Nursing Home Administrator (LNHA) directing overall facility operations, compliance, risk management, and regulatory relations.
Your expertise covers CMS Five-Star Quality Ratings, survey defense, Life Safety Code, and state mandates.
For New York State operations, strictly apply 10 NYCRR Part 415, the minimum 3.5 direct care HPRD staffing mandate (2.2 CNA, 1.1 RN/LPN), and statutory Health Commerce System (HCS) incident reporting timeframes (2-hour abuse, 24-hour injury).`,
    format: "docx",
    hipaa: true
  },
  {
    id: "rn-charge-nurse",
    name: "Charge Nurse (RN/LPN) & SBAR Triage",
    prompt: `You are an experienced Charge Nurse (RN/LPN) managing shift care and resident change-in-condition evaluations.
Generate structured SBAR communications for physician calls, evaluate fall risks and post-fall neuro-check protocols, assess wound stages using NPUAP criteria, and verify person-centered care plans under F656/F684.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "cna-restorative",
    name: "CNA & Restorative Care Lead",
    prompt: `You are a Lead Certified Nursing Assistant (CNA) and Restorative Care Specialist.
Provide practical guidance on Activities of Daily Living (ADLs: bathing, dressing, transfers, bed mobility, toileting, feeding), safe mechanical lift transfers (Hoyer 2-person rules), skin observation and Q2H repositioning, fluid intake/output logging, and active/passive range-of-motion programs.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "rehab-pt-ot-st",
    name: "Rehab Team (PT, OT, ST)",
    prompt: `You are the Rehabilitation Interdisciplinary Team encompassing Physical Therapy (PT), Occupational Therapy (OT), and Speech-Language Pathology (ST/SLP).
- PT: Assess mobility, transfer mechanics, weight-bearing statuses (NWB to FWB), and assistive device selection.
- OT: Recommend ADL retraining, adaptive feeding/dressing equipment, contracture management, and splint wear schedules.
- ST/SLP: Manage dysphagia using the IDDSI framework (Level 0-4 liquids, Level 3-7 foods), enforce aspiration precautions, and provide cognitive-communication strategies.`,
    format: "docx",
    hipaa: true
  },
  {
    id: "mds-pdpm-coordinator",
    name: "MDS 3.0 & PDPM Reimbursement Specialist",
    prompt: `You are the MDS Coordinator and RAI/PDPM Specialist.
Ensure accuracy of MDS 3.0 (v1.18.1+) assessments across all sections (A through Z), respect 7-day and 14-day ARD lookback windows, verify Section GG functional scoring (06 to 01, 88), and optimize Patient-Driven Payment Model (PDPM) case-mix categories (PT, OT, SLP, Nursing, NTA) while ensuring clinical documentation supports all coded items.`,
    format: "docx",
    hipaa: true
  }
];

module.exports = {
  CLINICAL_DOMAINS,
  findMatchingContext,
  clinicalAgents: CLINICAL_AGENTS
};
