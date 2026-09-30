'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const exec=require('../source/executive-desk-engine.cjs').dispatch;
const ops=require('../source/operations-analytics-engine.cjs').dispatch;
const assistant=require('../source/executive-assistant-engine.cjs').dispatch;
test('new executive screens never seed production facts or manufacture a briefing',t=>{
 const {core}=fixture(t);
 assert.deepEqual(exec(core,'execRoomReadinessList'),[]);
 assert.deepEqual(exec(core,'execNewHireList'),[]);
 assert.deepEqual(ops(core,'regulatoryList'),[]);
 assert.deepEqual(ops(core,'staffingReplacementMatch',{openShift:{role:'CNA',hours:8}}),[]);
 assert.equal(ops(core,'staffingAnalyze',{}).hasData,false);
 assert.ok(exec(core,'execDeptList').every(d=>!d.defaultLeader));
 assert.equal(core.store.count('todo'),0);
 const briefing=assistant(core,'assistantCommuteBriefing');
 assert.equal(briefing.activeCensus,null);
 assert.doesNotMatch(briefing.audioScript,/118|steady|active standing|No critical|10:00 AM/);
 assert.deepEqual(assistant(core,'assistantConflictRadar',{daysAhead:14}),[]);
 assert.match(assistant(core,'assistantMeetingDossier',{}).suggestedAgendaTalkingPoints.join(' '),/Verify task coverage/);
 for(const type of ['family_inquiry','corporate_staffing','physician_followup']){
  const draft=assistant(core,'assistantGhostwrite',{type});
  assert.match(draft.body,/DRAFT/);
  assert.doesNotMatch(draft.body,/Meadowbrook|reviewed this directly|18 hours|3 CNA|Monday|Vitals stable|555\)|strictly maintained/);
 }
});
test('executive demo records and canonical actions remain separate from production',async t=>{
 const {core}=fixture(t);const workspace=require('../source/snf/demo.cjs').forCore(core);
 const live=exec(core,'execActionCapture',{title:'SYNTHETIC production boundary fixture'});
 await workspace.set({mode:'demo'});
 const demo=exec(core,'execActionCapture',{title:'SYNTHETIC demo fixture'});
 ops(core,'regulatoryList');
 assert.equal(core.store.get('todo',demo.id),null);
 assert.ok(workspace.current().store.get('todo',demo.id));
 assert.equal(core.store.count('ops_regulatory'),0);
 assert.ok(exec(core,'execActionList').every(r=>r.id!==live.id));
 assert.match(assistant(core,'assistantCommuteBriefing').audioScript,/DEMO DATA/);
 await workspace.set({mode:'production'});
 assert.equal(exec(core,'execActionList').length,1);
 assert.equal(core.store.get('todo',live.id).title,live.title);
 assert.deepEqual(ops(core,'regulatoryList'),[]);
});
test('license dates stay unknown and repeated renewal saves preserve one canonical task',t=>{
 const {core}=fixture(t);
 const unknown=ops(core,'regulatorySave',{title:'SYNTHETIC unverified license'});
 assert.equal(unknown.expirationDate,null);
 assert.equal(ops(core,'regulatoryList')[0].status,'unknown');
 assert.equal(core.store.count('todo'),0);
 const due=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 let item=ops(core,'regulatorySave',{title:'SYNTHETIC renewal',expirationDate:due});
 item=ops(core,'regulatorySave',{...item,notes:'Reviewed synthetic edit'});
 assert.equal(core.store.count('todo'),1);
 assert.ok(core.store.get('todo',item.todoId));
 assert.ok(core.store.get('wf_action_meta','todo:'+item.todoId));
});
