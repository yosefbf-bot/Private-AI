'use strict';
const URL='https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-B/section-483.45';
const specs=[
 ['AP-001','New antipsychotic','critical',['med_profile','orders'],'Newly started antipsychotic in imported dates'],
 ['AP-002','Diagnosis/indication review','critical',['med_profile','diagnoses'],'No potentially supporting diagnosis in imported data; order indication is not diagnostic proof'],
 ['AP-003','New psychiatric diagnosis review','high',['med_profile','diagnoses'],'Recent relevant diagnosis associated with an antipsychotic'],
 ['AP-004','Target symptom documentation','critical',['med_profile','behaviors'],'No recent target behavior documentation in imported data'],
 ['AP-005','Behavior documentation gap','high',['med_profile','behaviors'],'Behavior documentation exceeds facility lookback'],
 ['AP-NONPHARM','Nonpharmacological documentation','high',['behaviors','progress_notes'],'No intervention found in imported records'],
 ['PRN-014','PRN antipsychotic review','high',['med_profile'],'Review imported PRN start and renewal dates approaching 14 days'],
 ['GDR-001','GDR review','high',['med_profile','gdr_tracker'],'GDR due date exceeded or legacy 180-day review heuristic without evidence'],
 ['AP-CHANGE','Antipsychotic change','high',['med_changes'],'Dose increase/decrease, changed order or new PRN order'],
 ['PSYCH-DUE','Psychiatry follow-up','high',['psych_report'],'Explicit imported follow-up due date reached'],
 ['PHARM-PENDING','Pharmacist recommendation','high',['pharmacist_review'],'Imported recommendation has no documented resolution'],
 ['MED-NEW','New medication review','medium',['med_changes'],'Recent imported new medication'],
 ['DATA-001','Import validation','critical',['census'],'Census anomaly'],
 ['STALE-001','Feed freshness','critical',['census','med_profile','diagnoses','behaviors'],'One or more required feeds are stale or unavailable']
];
const RULES=Object.fromEntries(specs.map(([rule_id,name,severity,required_feeds,condition])=>[rule_id,Object.freeze({rule_id,name,category:rule_id.startsWith('AP')||rule_id.startsWith('PRN')||rule_id.startsWith('GDR')?'psychotropic':'surveillance',severity,description:condition,effective_from:'2026-09-23',effective_to:null,rule_version:rule_id==='MED-NEW'?'3.0.1-2':'3.0.1-1',source_authority:['STALE-001','DATA-001','MED-NEW'].includes(rule_id)?'Facility operational policy (review pending)':'42 CFR 483.45; facility heuristic requires clinical validation',source_citation:rule_id==='PRN-014'?'42 CFR 483.45(e)(5)':rule_id==='PHARM-PENDING'?'42 CFR 483.45(c)':'42 CFR 483.45(d)-(e)',source_url:URL,publication_date:null,required_feeds,condition,output_message:'Review imported evidence; this is not a clinical or regulatory conclusion.',review_required:true,last_reviewed:null,review_owner:'Unassigned — facility clinical reviewer required',source_checked_at:'2026-09-23'})]));
function getRule(id){if(RULES[id])return RULES[id];if(id.startsWith('SURV-'))return {...RULES['STALE-001'],rule_id:id,name:'Required feed missing',required_feeds:[id.slice(5).toLowerCase()]};throw Error('Unregistered surveillance rule: '+id);}
module.exports={RULES,getRule};
