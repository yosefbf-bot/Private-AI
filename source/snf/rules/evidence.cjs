'use strict';
const {getRule}=require('./registry.cjs');
const {canonical,hash}=require('../import/validation.cjs');
const FEED_KINDS={census:'snf_resident',med_profile:'snf_med_order',orders:'snf_med_change',med_changes:'snf_med_change',diagnoses:'snf_diagnosis',behaviors:'snf_behavior',progress_notes:'snf_progress_note',gdr_tracker:'snf_gdr',psych_report:'snf_psych_review',pharmacist_review:'snf_pharmacist_review'};
function capture(code,residentId,message,whyFlagged){
 const rule=getRule(code),health=this.getFeedStatus();
 const inputData=Object.fromEntries(rule.required_feeds.map(feed=>[feed,FEED_KINDS[feed]?this.store.list(FEED_KINDS[feed]).filter(r=>!residentId||r.residentId===residentId||r.id===residentId):[]]));
 const records=Object.values(inputData).flat();
 const sources=records.map(r=>({...r.provenance,recordId:r.id,sourceReport:r.sourceReport,reportDateTime:Number.isFinite(r.reportDate)?new Date(r.reportDate).toISOString():null,originalRow:r.originalRow||null}));
 const missingEvidence=rule.required_feeds.filter(feed=>health.feeds[feed]?.status!=='ok'||(residentId&&inputData[feed].length===0));
 const evidence={ruleId:code,ruleVersion:rule.rule_version,ruleSnapshot:rule,inputData,sources,sourceReports:[...new Set(sources.map(s=>s.sourceReport).filter(Boolean))],sourceReportDates:[...new Set(sources.map(s=>s.reportDateTime).filter(Boolean))],batchIds:[...new Set(sources.map(s=>s.batchId).filter(Boolean))],evidence:whyFlagged,missingEvidence,result:'review_required',explanation:message,reviewRequired:true,demo:!!this.demoMode};
 const id='evaluation-'+hash(canonical(evidence));
 const evaluation=this.store.get('snf_rule_evaluation',id)||{id,...evidence,generationTime:Date.now()};
 this.store.put('snf_rule_evaluation',id,evaluation);
 return {...evidence,evaluationId:id,generationTime:evaluation.generationTime};
}
module.exports={capture};
