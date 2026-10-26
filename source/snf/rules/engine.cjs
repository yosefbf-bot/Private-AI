'use strict';
const {NON_PHARM_INTERVENTIONS}=require('../medications/dictionary.cjs');
async function runRulesEngine(user = 'System') {
    const settings = this.getSettings();
    const residents = this.store.list('snf_resident');
    const orders = this.store.list('snf_med_order');
    const orderChanges = this.store.list('snf_med_change');
    const diagnoses = this.store.list('snf_diagnosis');
    const behaviors = this.store.list('snf_behavior');
    const notes = this.store.list('snf_progress_note');
    const gdrs = this.store.list('snf_gdr');
    const admissions = this.store.list('snf_admission');
    const feedStatus = this.getFeedStatus();
    const evidenceContext = require('./evidence.cjs').createContext(this.store,feedStatus,{
      snf_resident:residents,snf_med_order:orders,snf_med_change:orderChanges,
      snf_diagnosis:diagnoses,snf_behavior:behaviors,snf_progress_note:notes,snf_gdr:gdrs
    });
    const createAlert = data => this._createAlert(data,evidenceContext);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const lookbackMs = (settings.behaviorLookbackDays || 10) * 24 * 60 * 60 * 1000;

    this._tx(() => {
      // RULE 0: FAIL-SAFE SURVEILLANCE INTEGRITY
      if (feedStatus.monitoringEnabled && !feedStatus.isSurveillanceComplete) {
      if (feedStatus.isStale) {
        createAlert({
          code: 'STALE-001',
          severity: 'critical',
          title: 'PCC MONITORING DATA IS STALE',
          message: feedStatus.staleMessage || 'PCC report feeds have exceeded the freshness threshold.',
          residentId: null,
          residentName: 'FACILITY-WIDE',
          sources: [{ sourceReport: 'Feed Monitor', reportDateTime: new Date().toISOString(), originalRow: 'Cycle Check' }],
          whyFlagged: [
            'Private AI fail-safe rules mandate: Missing or unverified data = ALERT, never GREEN.',
            `Freshness limit configured at ${settings.staleThresholdHours} hours.`,
            `Oldest received PCC report: ${feedStatus.monitoringCurrentThroughFormatted}. Missing feeds remain unknown.`
          ]
        });
      }
      for (const missing of feedStatus.missingCriticalFeeds) {
        createAlert({
          code: `SURV-${missing.id.toUpperCase()}`,
          severity: 'critical',
          title: 'SURVEILLANCE INCOMPLETE',
          message: `${missing.name} has not been received or processed today. Surveillance is incomplete.`,
          residentId: null,
          residentName: 'FACILITY-WIDE',
          sources: [{ sourceReport: missing.name, reportDateTime: new Date().toISOString(), originalRow: 'Feed Ingestion' }],
          whyFlagged: [
            `Required daily feed "${missing.name}" is marked missing or encountered parser errors.`,
            'Private AI must never conclude "No critical issues detected" when monitoring feeds are missing.',
            'Verify PointClickCare report export scheduler or download folder.'
          ]
        });
      }
    }

    // Index data by resident for instant deterministic correlation
    const resOrders = new Map();
    for (const ord of orders) {
      if (!resOrders.has(ord.residentId)) resOrders.set(ord.residentId, []);
      resOrders.get(ord.residentId).push(ord);
    }

    const resDiagnoses = new Map();
    for (const d of diagnoses) {
      if (!resDiagnoses.has(d.residentId)) resDiagnoses.set(d.residentId, []);
      resDiagnoses.get(d.residentId).push(d);
    }

    const resBehaviors = new Map();
    for (const b of behaviors) {
      if (!resBehaviors.has(b.residentId)) resBehaviors.set(b.residentId, []);
      resBehaviors.get(b.residentId).push(b);
    }

    const resNotes = new Map();
    for (const n of notes) {
      if (!resNotes.has(n.residentId)) resNotes.set(n.residentId, []);
      resNotes.get(n.residentId).push(n);
    }

    const resGDRs = new Map();
    for (const g of gdrs) {
      if (!resGDRs.has(g.residentId)) resGDRs.set(g.residentId, []);
      resGDRs.get(g.residentId).push(g);
    }

    // RULE: NEW MEDICATION WATCH (Last 24 Hours)
    for (const chg of orderChanges) {
      const orderTime = Date.parse(chg.originalData ? chg.originalData.orderDate : chg.orderDate);
      const dateKnown = Number.isFinite(orderTime);
      const isRecent = dateKnown && orderTime <= now && (now - orderTime) <= (36 * 60 * 60 * 1000);
      if (chg.changeType === 'New Order' && (isRecent || !dateKnown)) {
        const isHighAlert = chg.isHighAlert;
        createAlert({
          code: 'MED-NEW',
          severity: isHighAlert ? 'high' : 'review',
          title: isHighAlert ? `HIGH-ALERT NEW-ORDER REVIEW: ${chg.drugName.toUpperCase()}` : `NEW-ORDER REVIEW: ${chg.drugName}`,
          message: `Imported new-order entry for ${chg.drugName} (${chg.newDose || 'dose not present in imported evidence'}; ${chg.frequency || 'frequency not present in imported evidence'}). ${dateKnown ? 'Recent order date is present in imported evidence.' : 'Order date is not present in imported evidence; start recency is unknown.'} Review indication and clinical monitoring.`,
          residentId: chg.residentId,
          residentName: chg.residentName,
          drug: chg.drugName,
          sources: [{ sourceReport: chg.sourceReport || 'Medication Order Changes', reportDateTime: this._safeISO(chg.reportDate), originalRow: chg.originalRow || 1 }],
          whyFlagged: [
            `Source labels this entry as a new order; confirm actual start date in the complete clinical record.`,
            `Drug class classified as: ${chg.drugClass}.`,
            isHighAlert ? `Potential high-alert medication; review against the facility's approved policy.` : `New-order evidence requires human review.`
          ]
        });
      }
    }

    for (const change of orderChanges.filter(c=>c.isAntipsychotic && ['Dose Increase','Dose Decrease','Changed','Restart','New PRN','New Order'].includes(c.changeType))) {
      const changedAt=Date.parse(change.orderDate);
      if (!Number.isFinite(changedAt) || changedAt>now || now-changedAt>7*86400000) continue;
      if(change.changeType==='New Order'&&!change.isPRN)continue;
      createAlert({code:'AP-CHANGE',severity:'high',title:change.isPRN?'ANTIPSYCHOTIC PRN ORDER REVIEW':'ANTIPSYCHOTIC DOSE / ORDER CHANGE',message:`${change.drugName}: ${change.changeType}; previous dose ${change.previousDose||'not imported'}, new dose ${change.newDose||'not imported'}. Review clinical rationale and supporting documentation.`,residentId:change.residentId,residentName:change.residentName,drug:change.drugName,whyFlagged:['Imported antipsychotic order change; human review required.']});
    }
    for(const review of this.store.list('snf_psych_review')) {
      const due=Date.parse(review.nextReviewDate||review.followUpDue||'');
      if(Number.isFinite(due)&&due<=now&&review.status!=='completed')createAlert({code:'PSYCH-DUE',severity:'high',title:'PSYCHIATRY FOLLOW-UP DUE',message:'Imported psychiatry follow-up date is due. Verify whether follow-up occurred in the clinical record.',residentId:review.residentId,residentName:review.residentName,whyFlagged:['Explicit due date in imported report.']});
    }
    for(const review of this.store.list('snf_pharmacist_review')) {
      if(review.recommendation&&!['completed','resolved'].includes(String(review.status||'').toLowerCase()))createAlert({code:'PHARM-PENDING',severity:'high',title:'PHARMACIST RECOMMENDATION PENDING REVIEW',message:'Resolution of the imported pharmacist recommendation was not found in imported data.',residentId:review.residentId,residentName:review.residentName,whyFlagged:['Imported recommendation with no documented resolved status.']});
    }

    // ITERATE THROUGH ALL RESIDENTS TO RUN PSYCH WATCH & CLINICAL SURVEILLANCE
    for (const res of residents) {
      const residentId = res.id;
      const residentName = res.name;
      const residentRoom = res.room;
      const residentOrders = resOrders.get(residentId) || [];
      const residentDiags = resDiagnoses.get(residentId) || [];
      const residentBehs = resBehaviors.get(residentId) || [];
      const residentNotesList = resNotes.get(residentId) || [];
      const residentGDRList = resGDRs.get(residentId) || [];

      // Find active antipsychotics
      const activeAPs = residentOrders.filter(o => o.status === 'Active' && o.isAntipsychotic);

      for (const ap of activeAPs) {
        const drugName = ap.drugName;
        const startDateMs = Date.parse(ap.startDate); 
        const daysOnDrug = Number.isFinite(startDateMs) && startDateMs <= now ? Math.floor((now - startDateMs) / 86400000) : null;

        // RULE AP-001: NEW ANTIPSYCHOTIC (Within last 48 hours)
        if (daysOnDrug !== null && daysOnDrug <= 2) {
          createAlert({
            code: 'AP-001',
            severity: 'critical',
            title: 'NEW ANTIPSYCHOTIC STARTED',
            message: `Newly started antipsychotic order: ${drugName} (${ap.dose}, ${ap.frequency}). Prescriber: ${ap.prescriber}.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [{ sourceReport: ap.sourceReport || 'Medication Order Changes', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }],
            whyFlagged: [
              `Newly ordered antipsychotic detected on active medication snapshot.`,
              `Start Date: ${ap.startDate} (Prescribed by: ${ap.prescriber}).`,
              `Immediate cross-check required for indication, consent, and non-pharmacological care plan.`
            ]
          });
        }

        // RULE AP-002: NO SUPPORTING DIAGNOSIS FOUND
        // CMS & NY regulations require a supported clinical diagnosis
        const hasSupportingDiag = residentDiags.some(d =>
          /schizo|bipolar|major depress|tourette|huntington|psychosis|delusion|hallucination/i.test(d.description) ||
          /^F(20|21|22|25|30|31|32\.3|33\.3)/i.test(d.icd10)
        );

        if (!hasSupportingDiag) {
          createAlert({
            code: 'AP-002',
            severity: 'critical',
            title: 'ANTIPSYCHOTIC — DIAGNOSIS/INDICATION REVIEW',
            message: 'Supporting diagnosis documentation was not found in the imported data. Review the order indication and the complete clinical record.',
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 },
              { sourceReport: 'Active Diagnosis Report', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `Active antipsychotic order for ${drugName} identified.`,
              `Active Diagnosis Report searched: no matching psychiatric condition (e.g. Schizophrenia, Bipolar Mania, Psychotic Disorder) was identified in imported records.`,
              `An order indication alone does not verify supporting diagnosis documentation.`
            ]
          });
        }

        // RULE AP-003: NEW DIAGNOSIS + ANTIPSYCHOTIC
        // CMS surveyor guidance scrutinizes newly added schizophrenia diagnoses
        const recentSchizophrenia = residentDiags.find(d => {
          if (!d.isPsychiatric) return false;
          const onsetMs = Date.parse(d.onsetDate);
          return onsetMs && onsetMs <= now && (now - onsetMs <= 90 * 24 * 60 * 60 * 1000);
        });

        if (recentSchizophrenia) {
          createAlert({
            code: 'AP-003',
            severity: 'high',
            title: 'NEW PSYCHIATRIC DIAGNOSIS — DOCUMENTATION REVIEW',
            message: `New diagnosis of ${recentSchizophrenia.description} (${recentSchizophrenia.icd10}) identified for resident receiving ${drugName}. Review documentation for supporting psychiatric evaluation.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: recentSchizophrenia.sourceReport || 'Active Diagnoses', reportDateTime: this._safeISO(recentSchizophrenia.reportDate), originalRow: recentSchizophrenia.originalRow || 1 },
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }
            ],
            whyFlagged: [
              `Diagnosis of ${recentSchizophrenia.description} first appeared in records on ${recentSchizophrenia.onsetDate}.`,
              `Verify the new diagnosis and its relationship to the medication using the complete clinical record.`,
              `Recommend verifying presence of comprehensive psychiatric evaluation, PASARR Level II (if applicable), and detailed clinical history in the clinical record.`
            ]
          });
        }

        // RULE AP-004: NO TARGET SYMPTOM FOUND
        // If indication is behavioral/distress, verify that a target symptom is documented
        const isBehaviorIndication = !hasSupportingDiag || (ap.indication && /behavior|agitat|aggression|distress|dementia/i.test(ap.indication));
        const recentTargetBehaviors = residentBehs.filter(b => (now - Date.parse(b.eventDate)) <= lookbackMs);

        if (isBehaviorIndication && recentTargetBehaviors.length === 0) {
          createAlert({
            code: 'AP-004',
            severity: 'critical',
            title: 'ANTIPSYCHOTIC — TARGET SYMPTOM DOCUMENTATION NOT FOUND',
            message: `Resident receives ${drugName} for behavioral management, but no specific target symptom documentation was located in imported clinical records during the look-back window.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 },
              { sourceReport: 'Behavior Monitoring Report', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `Antipsychotic indication or usage corresponds to behavioral symptoms.`,
              `No documented target symptoms (such as physical aggression, hallucinations, or delusions) found within configured ${settings.behaviorLookbackDays}-day lookback.`,
              `Review target symptom documentation under 42 CFR 483.45(d)-(e) and facility policy.`
            ]
          });
        }

        // RULE AP-005: BEHAVIOR DOCUMENTATION GAP
        // If resident has a documented target behavior in the past, but none recently
        if (residentBehs.length > 0) {
          const sortedBehs = [...residentBehs].sort((a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate));
          const lastBeh = sortedBehs[0];
          const lastBehDateMs = Date.parse(lastBeh.eventDate);
          const daysSinceLastBeh = Math.floor((now - lastBehDateMs) / (24 * 60 * 60 * 1000));

          if (daysSinceLastBeh > (settings.behaviorLookbackDays || 10)) {
            createAlert({
              code: 'AP-005',
              severity: 'high',
              title: 'BEHAVIOR MONITORING GAP',
              message: `Medication: ${drugName}. Indication: ${ap.indication || 'Behavioral symptoms'}. Last documented target behavior found: ${daysSinceLastBeh} days ago (${lastBeh.eventDate}).`,
              residentId,
              residentName,
              residentRoom,
              drug: drugName,
              sources: [
                { sourceReport: lastBeh.sourceReport || 'Behavior Monitoring Report', reportDateTime: this._safeISO(lastBeh.reportDate), originalRow: lastBeh.originalRow || 1 }
              ],
              whyFlagged: [
                `Resident receives scheduled psychotropic for target behaviors.`,
                `Most recent behavior documentation identified was ${lastBeh.targetSymptom} on ${lastBeh.eventDate} (${daysSinceLastBeh} days ago).`,
                `Exceeds facility policy look-back threshold of ${settings.behaviorLookbackDays} days without updated monitoring entries.`
              ]
            });
          }
        }

        // RULE: NON-PHARMACOLOGICAL INTERVENTION WATCH
        const hasInterventions = residentBehs.some(b => b.interventionsAttempted && b.interventionsAttempted.trim().length > 3) ||
          residentNotesList.some(n => NON_PHARM_INTERVENTIONS.some(term => n.text.toLowerCase().includes(term)));

        if (!hasInterventions && isBehaviorIndication) {
          createAlert({
            code: 'AP-NONPHARM',
            severity: 'high',
            title: 'NON-PHARMACOLOGICAL INTERVENTIONS NOT DOCUMENTED',
            message: `Antipsychotic in use without documentation of prior or concurrent non-pharmacological interventions in imported records.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: 'Behavior & Progress Note Reports', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `42 CFR 483.45(e)(2) addresses behavioral interventions and clinical contraindications; verify the complete record.`,
              `No structured intervention entries identified in imported behavior or nursing records.`
            ]
          });
        }

        // RULE: PRN ANTIPSYCHOTIC 14-DAY WATCH (Deterministic)
        if (ap.isPRN && daysOnDrug !== null) {
          const prnDays = daysOnDrug;
          let prnSeverity = null;
          let prnTitle = null;

          if (prnDays >= 14) {
            prnSeverity = 'critical';
            prnTitle = 'PRN ANTIPSYCHOTIC — REVIEW ORDER DURATION / RENEWAL';
          } else if (prnDays >= 13) {
            prnSeverity = 'high';
            prnTitle = 'PRN ANTIPSYCHOTIC REVIEW REQUIRED (DAY 13)';
          } else if (prnDays >= 10) {
            prnSeverity = 'review';
            prnTitle = 'PRN ANTIPSYCHOTIC APPROACHING 14-DAY LIMIT (DAY ' + prnDays + ')';
          }

          if (prnSeverity) {
            createAlert({
              code: 'PRN-014',
              severity: prnSeverity,
              title: prnTitle,
              message: `PRN order for ${drugName} has reached Day ${prnDays}. Review the original order and any renewal evaluation under 42 CFR 483.45(e)(5); imported records may be incomplete.`,
              residentId,
              residentName,
              residentRoom,
              drug: drugName,
              sources: [{ sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }],
              whyFlagged: [
                `Order start date: ${ap.startDate}. Current day of order: Day ${prnDays}.`,
                `CMS 42 CFR 483.45(e)(5): PRN antipsychotic duration and evaluation before renewal require review.`,
                prnDays >= 14 ? `CRITICAL: Prescribing practitioner must evaluate the resident for appropriateness before renewal.` : `Approaching mandatory review milestone.`
              ]
            });
          }
        }

        // RULE: GDR WATCH
        const residentGDR = residentGDRList.find(g => g.medication && g.medication.toLowerCase().includes(ap.genericName.toLowerCase())) ;
        if ((residentGDR?.nextReviewDate && Date.parse(residentGDR.nextReviewDate) <= now) || (daysOnDrug !== null && daysOnDrug > 180 && !residentGDR)) {
          createAlert({
            code: 'GDR-001',
            severity: 'high',
            title: 'GDR REVIEW DUE / DOCUMENTATION NOT FOUND',
            message: `Review ${drugName}: imported GDR review date is due, or the facility 180-day screening threshold was reached without matching GDR documentation. Supporting documentation may exist outside imported data.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [{ sourceReport: 'Consultant Pharmacist / GDR Log', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }],
            whyFlagged: [
              `Imported duration: ${daysOnDrug === null ? "unknown" : daysOnDrug} days; review date: ${residentGDR?.nextReviewDate || "not found"}.`,
              `42 CFR 483.45(e)(2) requires GDR unless clinically contraindicated. This timing screen is a facility heuristic, not a regulatory determination.`,
              `No clinical contraindication statement or GDR trial was located in imported records.`
            ]
          });
        }
      }
    }

    // SYNC WITH OPEN ISSUES ENGINE
      this._syncOpenIssues();
    });

    this._invalidateCache();

    return true;
  }


module.exports={runRulesEngine};
