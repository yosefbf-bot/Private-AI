'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {forCore,markExport}=require('../source/snf/demo.cjs');
const report=(type,rows,date=new Date().toISOString(),extra={})=>({type,filename:type+'.csv',date,rows,...extra});
const census=()=>report('census',[{residentId:'synthetic-1',name:'Synthetic Test Resident'}]);
const medication=()=>report('med_profile',[{residentId:'synthetic-1',medication:'quetiapine',startDate:new Date().toISOString()}]);
test('demo namespace, alerts, deletion and export labels cannot contaminate live records',async t=>{
 const {core}=fixture(t);const work=forCore(core);
 assert.equal(core.store.count('snf_resident'),0);await assert.rejects(core.snf.seedRealisticPCCDataset(),{code:'POLICY'});
 await work.set({mode:'demo'});assert.ok(work.current().store.count('snf_resident')>0);assert.equal(core.store.count('snf_resident'),0);assert.equal(core.store.count('snf_alert'),0);
 assert.match(work.current().generateMorningBrief(),/^DEMO DATA/);assert.match(markExport('test',true),/^DEMO DATA/);
 await assert.rejects(work.current().ingestReports([census()]));
 await work.set({mode:'production',reset:true});assert.equal(work.current(),core.snf);assert.equal(core.store.count('snf_resident'),0);
});
test('PCC duplicate hashes and semantic imports are idempotent with row provenance',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([census()]);
 const order=report('med_changes',[{residentId:'synthetic-1',medication:'quetiapine',changeType:'Dose Increase',previousDose:'25 mg',dose:'50 mg'}],new Date().toISOString(),{rawText:'synthetic source content'});
 const first=await core.snf.ingestReports([order],'Synthetic operator');assert.equal(first.success,true);
 const count=core.store.count('snf_med_change');const duplicate=await core.snf.ingestReports([{...order,filename:'renamed.csv'}]);
 assert.equal(duplicate.results[0].status,'duplicate');assert.equal(duplicate.results[0].duplicateFileHash,true);assert.equal(core.store.count('snf_med_change'),count);
 const record=core.store.list('snf_med_change')[0];assert.equal(record.batchId,first.batchId);assert.equal(record.provenance.sourceFile,'med_changes.csv');assert.equal(record.originalData.previousDose,'25 mg');assert.ok(core.store.get('snf_import_row',record.provenance.rowId));
 const batch=core.store.get('snf_import_batch',first.batchId);assert.equal(batch.operator,'Synthetic operator');assert.equal(batch.reports[0].acceptedRows,1);
});
test('old uploads, missing feeds and rejected mappings cannot produce an all-clear',async t=>{
 const {core}=fixture(t);const old=new Date(Date.now()-3*86400000).toISOString();await core.snf.ingestReports([report('census',census().rows,old)]);
 const health=core.snf.getFeedStatus();assert.equal(health.isSurveillanceComplete,false);assert.equal(health.feeds.census.status,'stale');assert.equal(health.dataCurrentThrough,Date.parse(old));assert.ok(health.missingCriticalFeeds.some(f=>f.id==='diagnoses'));
 const bad=await core.snf.ingestReports([report('med_profile',[{name:'Name only',medication:'test'}])]);assert.equal(bad.success,false);assert.equal(core.store.count('snf_med_order'),0);assert.equal(bad.results[0].rejectedRows,1);
 const missingDate=await core.snf.ingestReports([{type:'census',rows:[]}]);assert.equal(missingDate.success,false);
});
test('rule evaluations preserve version, input data, missing evidence and bounded conclusions',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([census(),medication()]);
 const alert=core.store.list('snf_alert').find(a=>a.code==='AP-002');assert.ok(alert);assert.equal(alert.ruleId,'AP-002');assert.equal(alert.ruleVersion,'3.0.1-1');assert.ok(alert.inputData.med_profile.length);assert.ok(alert.sources[0].batchId);assert.ok(alert.missingEvidence.includes('diagnoses'));assert.match(alert.message,/not found in the imported data/);assert.ok(core.store.get('snf_rule_evaluation',alert.evaluationId));
 const history=alert.evaluationHistory.length;await core.snf.runRulesEngine();assert.equal(core.store.get('snf_alert',alert.id).evaluationHistory.length,history);
});
test('critical findings persist across omissions, snoozes and audited resolution',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([census(),medication()]);const alert=core.store.list('snf_alert').find(a=>a.code==='AP-002');
 core.snf.updateAlert(alert.id,{status:'snoozed',snoozedUntil:Date.now()+3600000,note:'Waiting for review'},'Synthetic reviewer');
 await core.snf.ingestReports([report('census',[])]);assert.equal(core.store.get('snf_alert',alert.id).status,'snoozed');assert.ok(core.snf.getActiveAlerts().some(a=>a.id===alert.id));assert.ok(core.snf.getAlertSummary().critical>0);
 assert.throws(()=>core.snf.resolveAlert(alert.id,'',''));
 core.snf.resolveAlert(alert.id,'Reviewed complete PCC record','Supporting evidence reviewed by clinician','Synthetic reviewer');const resolved=core.store.get('snf_alert',alert.id);assert.equal(resolved.status,'resolved');assert.ok(resolved.auditTrail.some(a=>a.after?.status==='snoozed'));assert.ok(resolved.auditTrail.some(a=>a.action==='resolved'));assert.ok(resolved.evaluationHistory.length);
});
test('missing clinical fields remain unknown and old medication is not newly started on reimport',async t=>{
 const {core}=fixture(t);const med=medication();med.rows[0].startDate='2020-01-01';await core.snf.ingestReports([census(),med]);const stored=core.store.list('snf_med_order')[0];assert.equal(stored.dose,null);assert.equal(stored.route,null);assert.ok(!core.store.list('snf_alert').some(a=>a.code==='AP-001'));
});
test('parser failure rolls back the report and records a failed batch',async t=>{
 const {core}=fixture(t);core.snf._processCensus=function(){this.store.put('snf_resident','rollback',{id:'rollback'});throw Error('synthetic');};const r=await core.snf.ingestReports([census()]);assert.equal(r.success,false);assert.equal(core.store.count('snf_resident'),0);assert.equal(core.store.count('snf_import_row'),0);assert.equal(core.store.count('snf_import_batch'),1);
});

test('demo PDF contains a visible demo label and uses its separate export folder',async t=>{
 const {core}=fixture(t);const work=forCore(core);await work.set({mode:'demo'});
 const file=await work.current().exportReportPDF('morning','',core.settings().workspace);
 assert.match(file.relative,/^Demo-Reports/);
 const parsed=await require('../source/files.cjs').processFile({op:'extract',ext:'.pdf',bytes:require('node:fs').readFileSync(file.path)});
 assert.match(parsed.text,/DEMO DATA/);assert.match(parsed.text,/NOT FOR CLINICAL USE/);
 assert.equal(core.store.count('snf_resident'),0);
});
test('retention prunes expired batches but pins unresolved alert evidence, including snoozed alerts',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([census(),medication()]);
 const alert=core.store.list('snf_alert').find(a=>a.code==='AP-002');
 core.snf.updateAlert(alert.id,{status:'snoozed',snoozedUntil:Date.now()+3600000,note:'Await clinical review'},'Synthetic reviewer');
 core.store.put('snf_import_batch','unreferenced',{id:'unreferenced',importTime:Date.now()-200*86400000});
 core.snf.cleanup(100,Date.now()+200*86400000);
 assert.equal(core.store.get('snf_import_batch','unreferenced'),null);
 const evidence=core.store.get('snf_rule_evaluation',alert.evaluationId);assert.ok(evidence);
 for(const source of evidence.sources){if(source.rowId)assert.ok(core.store.get('snf_import_row',source.rowId));if(source.batchId)assert.ok(core.store.get('snf_import_batch',source.batchId));}
 assert.equal(core.store.get('snf_alert',alert.id).status,'snoozed');
});

test('production critical summary remains visible in demo mode and with clinical navigation disabled',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([census(),medication()]);
 const critical=core.summary().snfAlerts.critical;assert.ok(critical>0);
 core.saveSettings({snfEnabled:false});await forCore(core).set({mode:'demo'});
 assert.equal(core.summary().snfAlerts.critical,critical);
 const dashboard=await require('../source/snf/index.cjs').dispatch(core,'snfDashboard');
 assert.equal(dashboard.demo,true);assert.equal(dashboard.productionAlerts.critical,critical);
});
