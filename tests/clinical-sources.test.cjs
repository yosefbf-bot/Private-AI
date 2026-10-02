'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {forCore}=require('../source/snf/demo.cjs');
const {dispatch}=require('../source/snf/index.cjs');
const {mappedPreview,mappedImport,saveMapping}=require('../source/workflows/imports.cjs');
const {Store}=require('../source/database.cjs');
const {Core}=require('../source/core.cjs');
const path=require('node:path');
const report=(type,rows,date=new Date().toISOString())=>({type,rows,date,filename:'synthetic-'+type+'.csv'});
const census=()=>report('census',[{residentId:'synthetic-source-1',name:'Synthetic Source Resident',stayType:'long_stay'}]);
const medication=()=>report('med_profile',[{residentId:'synthetic-source-1',medication:'quetiapine',startDate:'2020-01-01'}]);
const sourceAlert=a=>/^(STALE-|SURV-)/.test(a.code);

test('fresh offline/keyless application keeps clinical tools usable with PCC unconfigured',async t=>{
 const {core,calls}=fixture(t);core.deleteKey();core.saveSettings({processingMode:'local-only'});
 assert.equal(core.summary().integrations[0].state,'not_configured');
 assert.equal(core.summary().integrations[0].supportsImport,true);
 for(const op of ['import','sync','scheduled'])await assert.rejects(core.integrations.read('pcc',op,[]),{code:'INTEGRATION_UNAVAILABLE'});
 await core.snf.runRulesEngine();
 assert.equal(core.snf.getActiveAlerts().length,0);assert.equal(core.store.count('snf_alert'),0);
 const health=core.snf.getFeedStatus();assert.equal(health.monitoringEnabled,false);assert.equal(health.isStale,false);assert.deepEqual(health.missingCriticalFeeds,[]);
 assert.equal(health.sourceAvailability,'unavailable');assert.equal(health.feeds.med_profile.availability,'unknown');assert.equal(health.isSurveillanceComplete,false);
 assert.equal(core.snf.getDashboardMetrics().qmWatch.estimatedRatePercentage,null);
 assert.match(core.snf.generateMorningBrief(),/unknown/);assert.doesNotMatch(core.snf.generateMorningBrief(),/SURVEILLANCE COMPLIANCE ALERT|No unresolved critical alerts found across verified/i);
 const r=await core.snf.ingestReports([census(),medication()],'Synthetic reviewer',{sourceProvider:'manual'});assert.equal(r.success,true);
 const clinical=core.snf.getActiveAlerts().find(a=>a.code==='AP-002');assert.ok(clinical);
 assert.ok(!core.snf.getActiveAlerts().some(sourceAlert));assert.equal(clinical.dataAvailability.diagnoses,'unknown');
 assert.equal(clinical.sources[0].sourceProvider,'manual');assert.match(clinical.message,/not found in the imported data/);assert.equal(calls.length,0);
});

test('PCC and generic reports reach the same rules, with distinct provenance and independent feed snapshots',async t=>{
 const {core}=fixture(t);await assert.rejects(core.snf.ingestReports([census()],'Synthetic',{sourceProvider:'pcc'}),{code:'INTEGRATION_UNAVAILABLE'});
 assert.equal(core.store.count('snf_import_batch'),0);
 core.integrations.configure('pcc',{enabled:true,mode:'manual'});
 const records=[census(),medication()];await core.snf.ingestReports(records,'Synthetic',{sourceProvider:'pcc'});
 const alert=core.snf.getActiveAlerts().find(a=>a.code==='AP-002');assert.ok(alert);assert.equal(alert.sources[0].sourceProvider,'pcc');
 assert.equal(core.snf.getFeedStatus().monitoringFeeds.census.status,'ok');
 const pccBatch=core.store.list('snf_import_batch')[0];assert.equal(pccBatch.sourceProvider,'pcc');
 const duplicate=await core.snf.ingestReports(records,'Synthetic',{sourceProvider:'pcc'});assert.equal(duplicate.results[0].status,'duplicate');
 const originalId=alert.id;await core.snf.ingestReports(records,'Synthetic',{sourceProvider:'generic'});
 assert.equal(core.snf.getActiveAlerts().find(a=>a.code==='AP-002').id,originalId);
 assert.equal(core.store.list('snf_med_order')[0].provenance.sourceProvider,'generic');
 assert.equal(core.snf.getFeedStatus().monitoringFeeds.census.batchId,pccBatch.id);
 await core.snf.ingestReports([report('diagnoses',[])],'Synthetic',{sourceProvider:'generic'});
 assert.equal(core.snf.getFeedStatus().feeds.diagnoses.status,'ok');assert.equal(core.snf.getFeedStatus().monitoringFeeds.diagnoses.status,'missing');
 assert.equal(core.snf.getFeedStatus().monitoringCurrentThrough,Math.min(...records.map(r=>Date.parse(r.date))));
 assert.throws(()=>core.integrations.configure('pcc',{enabled:true,mode:'sync'}),{code:'INTEGRATION_UNAVAILABLE'});
 assert.equal(core.integrations.status('pcc').canSchedule,false);
});

test('disabling PCC hides source-monitoring alerts without resolving or deleting evidence or clinical findings',async t=>{
 const {core}=fixture(t);core.integrations.configure('pcc',{enabled:true,mode:'manual'});
 await core.snf.ingestReports([census(),medication()],'Synthetic',{sourceProvider:'pcc'});
 const before=core.store.list('snf_alert');assert.ok(before.some(sourceAlert));assert.ok(before.some(a=>a.code==='AP-002'));
 const stored=core.store.db.prepare("SELECT kind,id,payload FROM records WHERE kind IN ('snf_alert','snf_med_order','snf_import_batch') ORDER BY kind,id").all();
 core.integrations.configure('pcc',{enabled:false});
 assert.deepEqual(core.store.db.prepare("SELECT kind,id,payload FROM records WHERE kind IN ('snf_alert','snf_med_order','snf_import_batch') ORDER BY kind,id").all(),stored);
 assert.ok(core.snf.getActiveAlerts().some(a=>a.code==='AP-002'));assert.ok(!core.snf.getActiveAlerts().some(sourceAlert));
 assert.ok(!(await dispatch(core,'snfAlerts')).some(sourceAlert));
 assert.ok(!(await dispatch(core,'snfToday')).allAlerts.some(sourceAlert));
 const queue=require('../source/workflows/actions.cjs').queue(core,core.snf);assert.ok(!queue.some(a=>a.kind==='alert'&&sourceAlert(a.source)));
 await core.snf.runRulesEngine();assert.equal(core.store.list('snf_alert').filter(sourceAlert).length,before.filter(sourceAlert).length);
 core.integrations.configure('pcc',{enabled:true});assert.ok(core.snf.getActiveAlerts().some(sourceAlert));
 assert.equal(core.store.count('snf_med_order'),1);
});

test('generic imports survive restart without enabling PCC; legacy imports migrate once and honor later disable',async t=>{
 const {core,root,cipher}=fixture(t);await core.snf.ingestReports([census()]);
 const settings=core.settings(),version=core.store.db.prepare('PRAGMA user_version').get().user_version;
 core.close();
 let next=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher)});
 try {
 assert.equal(next.integrations.status('pcc').state,'not_configured');assert.equal(next.store.count('snf_resident'),1);
 // Representative old installation: reports predating sourceProvider metadata.
 const batch=next.store.list('snf_import_report')[0];delete batch.sourceProvider;next.store.put('snf_import_report',batch.id,batch);next.close();
 next=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher)});
 assert.equal(next.integrations.status('pcc').state,'manual_import');assert.equal(next.store.count('snf_resident'),1);
 assert.deepEqual(next.settings(),settings);assert.equal(next.store.db.prepare('PRAGMA user_version').get().user_version,version);
 next.integrations.configure('pcc',{enabled:false});next.close();next=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher)});
 assert.equal(next.integrations.status('pcc').state,'disabled');assert.equal(next.store.count('snf_import_report'),1);
 } finally {if(next.store.db)next.close();}
});

test('PCC disabled blocks reviewed PCC mappings; a changed source invalidates the review token',async t=>{
 const {core}=fixture(t),snf=core.snf;
 const mapping=saveMapping(snf,{name:'Synthetic census',type:'census',headers:['residentId','name'],mapping:{residentId:'residentId',name:'name'},reviewer:'Synthetic'});
 const data={id:mapping.id,revision:mapping.revision,type:'census',headers:mapping.headers,rows:census().rows.map(({residentId,name})=>({residentId,name})),date:new Date().toISOString(),reviewer:'Synthetic',sourceProvider:'pcc'};
 const preview=mappedPreview(snf,data);
 await assert.rejects(mappedImport(snf,{...data,previewToken:preview.token}),{code:'INTEGRATION_UNAVAILABLE'});
 await assert.rejects(mappedImport(snf,{...data,sourceProvider:'generic',previewToken:preview.token}),{code:'REVIEW_CHANGED'});
 core.integrations.configure('pcc',{enabled:true,mode:'manual'});
 assert.equal((await mappedImport(snf,{...data,previewToken:preview.token})).success,true);
 await assert.rejects(snf.ingestReports([census()],'Synthetic',{sourceProvider:'untrusted-custom-code'}),{code:'INVALID'});
});

test('demo PCC capabilities and synthetic records remain isolated from production',async t=>{
 const {core}=fixture(t);core.integrations.configure('pcc',{enabled:false});
 const work=forCore(core);await work.set({mode:'demo'});
 assert.equal(work.current().integrations.status('pcc').canImport,true);
 assert.equal(work.current().getFeedStatus().monitoringEnabled,true);
 assert.equal(core.integrations.status('pcc').state,'disabled');assert.equal(core.store.count('snf_resident'),0);
 await work.set({mode:'production',reset:true});assert.equal(core.integrations.status('pcc').state,'disabled');
});
