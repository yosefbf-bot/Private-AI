'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');
function watch(cipher){const open=cipher.open.bind(cipher),reads=[];cipher.open=(p,a)=>{reads.push(a);return open(p,a);};return reads;}

test('bounded job summaries exclude large results and totals survive old metadata writers and rollback',t=>{
 const {core,cipher}=fixture(t),s=core.store;
 for(let i=0;i<130;i++)s.put('job','job-'+i,{status:i%2?'failed':'queued',resultText:'PRIVATE_RESULT'.repeat(1000),savedAnswer:{text:'PRIVATE_DRAFT'},arbitraryBody:'PRIVATE_BODY',recoveryInput:{playbook:{id:'book',revision:1}}},{updated:i});
 const reads=watch(cipher),rows=s.summaries('job',{limit:100});
 assert.equal(rows.length,100);assert.equal(rows[0].id,'job-129');assert.equal(rows[99].id,'job-30');
 assert.equal(reads.filter(a=>a.startsWith('meta:job:')).length,100);assert.equal(reads.filter(a=>a.startsWith('job:')).length,0);
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_|resultText|arbitraryBody|savedAnswer/);assert.equal(rows[0].hasResultText,true);assert.equal(rows[0].hasDraftText,true);
 assert.deepEqual(s.jobStatusTotals(),{failed:65,queued:65});reads.length=0;
 assert.deepEqual(s.jobStatusTotals(),{failed:65,queued:65});assert.equal(reads.filter(a=>a.startsWith('meta:job:')).length,0);
 // Old schema-3 writers may overwrite records AND metadata at identical times.
 const value={status:'completed',resultText:'PRIVATE_LEGACY_RESULT'};
 s.db.prepare("UPDATE records SET payload=? WHERE kind='job' AND id='job-0'").run(cipher.seal(value,'job:job-0'));
 s.db.prepare('INSERT INTO record_meta VALUES(?,?,?,?)').run('job','job-0',0,cipher.seal(value,'meta:job:job-0'));
 assert.deepEqual(s.jobStatusTotals(),{failed:65,queued:64,completed:1});
 assert.equal(s.summary('job','job-0').hasResultText,true);assert.equal(s.summary('job','job-0').resultText,undefined);
 assert.throws(()=>s.transaction(()=>{s.delete('job','job-0');throw Error('rollback');}),/rollback/);
 assert.equal(s.jobStatusTotals().completed,1);s.delete('job','job-0');assert.equal(s.jobStatusTotals().completed,undefined);
 assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,3);
});

test('idle drafting, speech and reminders do not read completed bodies; due dates still notify once',async t=>{
 const {core,cipher}=fixture(t);core.saveSettings({localTier:'selected',localModelPath:'synthetic.gguf',workerPaused:false,autoReminders:true});
 core.router.local={close(){}};
 for(let i=0;i<20;i++){
  core.store.put('capture_note','note-'+i,{text:'PRIVATE_NOTE',assistantDraft:{status:'ready',text:'PRIVATE_DRAFT'}});
  core.store.put('meeting','meeting-'+i,{status:'completed',transcript:[{text:'PRIVATE_TRANSCRIPT'}],assistantDraft:{status:'ready'}});
  core.store.put('todo','todo-'+i,{status:'completed',title:'PRIVATE_TODO',dueAt:1});
 }
 const reads=watch(cipher);
 await require('../source/assistant-drafts.cjs').processPending(core);await require('../source/local-speech.cjs').processPending(core);core.checkReminders();
 assert.deepEqual(reads.filter(a=>/^(capture_note|meeting|todo):/.test(a)),[]);
 for(const [id,fields] of [['due',{dueAt:1}],['follow',{followUpDate:'2000-01-01'}],['off',{dueAt:1,reminderEnabled:false}],['future',{dueAt:Date.now()+86400000}]])core.store.put('todo',id,{status:'pending',title:'Synthetic',...fields});
 assert.deepEqual(core.checkReminders().map(r=>r.id).sort(),['due','follow']);reads.length=0;assert.deepEqual(core.checkReminders(),[]);
 assert.equal(reads.filter(a=>a.startsWith('todo:')).length,0);
 // A rollback writer changes eligibility without touching metadata.
 core.store.db.prepare("UPDATE records SET payload=? WHERE kind='todo' AND id='future'").run(cipher.seal({status:'pending',dueAt:1,title:'Synthetic'},'todo:future'));
 assert.deepEqual(core.checkReminders().map(r=>r.id),['future']);
});

test('identical WhatsApp and correspondence snapshots perform no source/candidate writes',t=>{
 const {core}=fixture(t),{MessagingBridge}=require('../source/messaging.cjs'),triage=require('../source/workflows/correspondence.cjs');
 core.saveSettings({workerPaused:false});core.store.put('messaging','settings',{enabled:true,adapter:'web',readAll:true,disableAllWriting:true,conversations:[]});
 const bridge=new MessagingBridge(core,{});t.after(()=>bridge.close());
 const shot={verified:true,groupId:'123456789@g.us',groupName:'Synthetic group',messages:[{id:'one',text:'Please reply synthetic',incoming:true},{id:'two',text:'Urgent synthetic',incoming:true,time:Date.now()}]};
 bridge.observe(shot);triage.check(core);
 const original=core.store.db.prepare("SELECT kind,id,updated,expires,payload FROM records WHERE kind IN ('messageIn','wf_communication_source','wf_communication_candidate') ORDER BY kind,id").all();
 const put=core.store.put.bind(core.store),writes=[];core.store.put=(k,...a)=>{writes.push(k);return put(k,...a);};
 bridge.observe(shot);triage.check(core);
 assert.deepEqual(writes.filter(k=>['messageIn','wf_communication_source','wf_communication_candidate'].includes(k)),[]);
 assert.deepEqual(core.store.db.prepare("SELECT kind,id,updated,expires,payload FROM records WHERE kind IN ('messageIn','wf_communication_source','wf_communication_candidate') ORDER BY kind,id").all(),original);
 writes.length=0;shot.messages[0].text='Please reply synthetic EDIT';bridge.observe(shot);triage.check(core);
 for(const k of ['messageIn','wf_communication_source','wf_communication_candidate'])assert.equal(writes.filter(v=>v===k).length,1,k);
});

test('staffing summaries only hydrate winning snapshots, preserve history and reveal earlier data on deletion',t=>{
 const {core,cipher}=fixture(t),imports=require('../source/workflows/imports.cjs');
 for(let i=0;i<30;i++)core.store.put('wf_metric_import','batch-'+i,{id:'batch-'+i,type:'staffing',digest:'digest-'+i,sequence:i+1,importedAt:i,filename:'synthetic.csv',reviewer:'Synthetic',completeDay:true,rows:[{date:'2026-01-01',unit:'A',shift:'day',role:'RN',hours:i+1},...(i===0?[{date:'2026-01-01',unit:'B',shift:'night',role:'RN',hours:5}]:[])]},{updated:i});
 const reads=watch(cipher);
 for(let i=0;i<2;i++){
  reads.length=0;const result=imports.metrics(core.snf);
  assert.equal(result.batches.length,30);assert.equal(result.days.find(d=>d.unit==='A').totalHours,30);assert.equal(result.days.find(d=>d.unit==='B').totalHours,5);assert.equal(result.days[0].hppd,null);
  assert.deepEqual(reads.filter(a=>a.startsWith('wf_metric_import:')).sort(),['wf_metric_import:batch-0','wf_metric_import:batch-29']);
 }
 core.store.delete('wf_metric_import','batch-29');assert.equal(imports.metrics(core.snf).days.find(d=>d.unit==='A').totalHours,29);
 const demo=new(require('../source/snf/demo.cjs').DemoStore)(core.store);demo.put('wf_metric_import','demo',{type:'staffing',rows:[{date:'2026-01-01',unit:'Demo',hours:9}]});
 assert.equal(imports.metrics({store:demo}).days[0].totalHours,9);assert.equal(imports.metrics(core.snf).days.some(d=>d.unit==='Demo'),false);
});

test('configured PCC and raw retention counts avoid full import/clinical body reads',t=>{
 const {core,cipher}=fixture(t);
 core.store.put('integration','pcc',{enabled:false,mode:'manual'});
 core.store.put('snf_import_report','synthetic',{sourceProvider:'pcc',rows:['PRIVATE_IMPORT']});
 for(const kind of ['snf_med_order','snf_med_change','snf_progress_note'])core.store.put(kind,'synthetic',{text:'PRIVATE_CLINICAL'});
 const reads=watch(cipher);new(require('../source/snf-command-center.cjs').SNFCommandCenter)({store:core.store,root:core.root});
 assert.equal(core.snf.getRetentionStatus().totalRawRecords,3);
 assert.deepEqual(reads.filter(a=>/^(snf_import_report|snf_med_order|snf_med_change|snf_progress_note):/.test(a)),[]);
});

test('attendance alert aggregation matches complete histories using one table scan',t=>{
 const {core,cipher}=fixture(t),{ExecutiveDeskEngine}=require('../source/executive-desk-engine.cjs'),engine=new ExecutiveDeskEngine(core);
 const now=new Date().toISOString(),old=new Date(Date.now()-70*86400000).toISOString();
 const names=['Synthetic A','synthetic a','Synthetic B','Synthetic C'];
 for(let i=0;i<20;i++)core.store.put('exec_attendance','synthetic-'+i,{employeeName:names[i%4],date:i===0?old:now,type:'call_off',points:2,isWeekend:i%2===0,excused:i===5,role:'RN',department:'Synthetic'},{updated:i});
 const expected=names.map(n=>engine.getEmployeeAttendanceHistory(n)),reads=watch(cipher),alerts=engine.listAttendanceAlerts();
 assert.equal(reads.filter(a=>a.startsWith('exec_attendance:')).length,20);
 assert.equal(alerts.length,expected.filter(e=>e.thresholdWarning).length);
 for(const e of expected){const a=alerts.find(a=>a.employeeName===e.employeeName);assert.equal(a.totalPoints,e.totalPoints60d);assert.equal(a.weekendCallOffs,e.weekendCallOffs60d);assert.equal(a.message,e.thresholdMessage);}
 assert.equal(alerts.find(a=>a.employeeName==='Synthetic A').latestOccurrence,now);
 assert.equal(engine.getEmployeeAttendanceHistory('Synthetic A').history.length,10,'Individual history still contains old and excused records');
});

test('speech finalization takes one audio snapshot and no unrelated transcript or upload bodies',async t=>{
 const {core,cipher}=fixture(t);core.saveSettings({workerPaused:false});
 for(let i=0;i<3;i++){
  const id=crypto.randomUUID();core.store.put('meeting',id,{id,title:'Synthetic',status:'live',companionSourceId:'synthetic-'+i,finishRequested:true,expectedChunkCount:1,transcript:[]});
  core.store.put('meeting_audio','audio-'+i,{meetingId:id,status:'transcribed',created:i});
  // An incomplete upload prevents finalization. Its private body must stay unopened.
  core.store.put('meeting_upload','upload-'+i,{meetingId:id,audio:'PRIVATE_AUDIO'});
 }
 const reads=watch(cipher);await require('../source/local-speech.cjs').processPending(core);
 assert.equal(reads.filter(a=>a.startsWith('meta:meeting_audio:')).length,3);
 assert.deepEqual(reads.filter(a=>/^(meeting|meeting_audio|meeting_upload):/.test(a)),[]);
});

test('old candidate and import writers rebuild summaries once without altering canonical bytes',t=>{
 const {core,cipher}=fixture(t),s=core.store;
 const values={meeting:{status:'completed',transcript:[{text:'Synthetic'}]},capture_note:{text:'Synthetic'},todo:{status:'pending',dueAt:1},snf_import_report:{sourceProvider:'manual'},wf_metric_import:{type:'census',rows:[{date:'2026-01-01',unit:'A',census:8}]}};
 for(const [kind,value] of Object.entries(values)){
  s.db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(kind,'legacy',123,9999999999999,cipher.seal(value,kind+':legacy'));
 }
 const before=s.db.prepare("SELECT * FROM records WHERE id='legacy' ORDER BY kind").all(),reads=watch(cipher);
 for(let n=0;n<2;n++)for(const kind of Object.keys(values))assert.ok(s.summary(kind,'legacy'));
 for(const kind of Object.keys(values))assert.equal(reads.filter(a=>a===kind+':legacy').length,1);
 assert.deepEqual(s.db.prepare("SELECT * FROM records WHERE id='legacy' ORDER BY kind").all(),before);
 s.db.prepare("UPDATE records SET payload=? WHERE kind='capture_note' AND id='legacy'").run(cipher.seal({text:'Synthetic',assistantDraft:{status:'working'}},'capture_note:legacy'));
 require('../source/assistant-drafts.cjs').recover(core);assert.equal(s.get('capture_note','legacy').assistantDraft.status,'needs-review');
});
