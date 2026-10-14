'use strict';
// Execute the shipped entry point and real Core/SQLite/services. Only Electron,
// the Windows ACL/DPAPI boundary and named pipe transport are replaced. This is
// a startup integration test, not evidence of Windows/Electron UI execution.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {Cipher}=require('../source/security.cjs'),{Store}=require('../source/database.cjs');
const sourcePath=process.env.PRIVATEAI_TEST_MAIN||path.resolve(__dirname,'../source/main.cjs');
const realRequire=createRequire(sourcePath);
async function boot(t,{background=false,existing=false,browserWorker}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-startup-'));
 const root=path.join(folder,'PrivateAI2'),cipher=new Cipher(require('node:crypto').randomBytes(32));
 fs.mkdirSync(root);
 if(existing){const s=new Store(path.join(root,'privateai.db'),cipher);s.put('settings','main',{workerPaused:true,processingMode:'local-only',allowCloud:false,retentionDays:90});s.put('chat','kept',{id:'kept',title:'Saved chat',messages:[],updated:Date.now()});s.close();}
 const errors=[],dialogs=[],windows=[],trays=[],handlers=new Map();let core,ready;
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,setName(){},setPath(){},requestSingleInstanceLock:()=>true,getLoginItemSettings:()=>({openAtLogin:false}),whenReady:()=>({then(fn){const p=Promise.resolve().then(fn);return {catch(fn){ready=p.catch(fn);return ready;}};}}),exit:code=>errors.push({exit:code}),quit:()=>app.emit('before-quit')});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=true;this.focused=true;this.webContents=new EventEmitter();Object.assign(this.webContents,{send(){},setWindowOpenHandler(){}});windows.push(this);}
  setMenuBarVisibility(){} loadURL(url){this.url=url;} isDestroyed(){return false;} isVisible(){return this.visible;} isFocused(){return this.focused;} show(){this.visible=true;} hide(){this.visible=false;} focus(){this.focused=true;}
 }
 class Tray extends EventEmitter{constructor(){super();trays.push(this);}setToolTip(){}setContextMenu(menu){this.menu=menu;}}
 const partitions=new Map();
 const electron={app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x},nativeImage:{createFromPath:()=>({})},powerMonitor:new EventEmitter(),safeStorage:{},shell:{},clipboard:{},
  ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showErrorBox:(title,message)=>errors.push({title,message}),showMessageBox:async(_win,detail)=>{dialogs.push(detail);return {response:1};}},
  session:{fromPartition(name){if(!partitions.has(name))partitions.set(name,{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}},fetch:()=>assert.fail('Startup must not request network access')});return partitions.get(name);}}};
 const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{platform:'win32',env:{LOCALAPPDATA:folder,SystemRoot:'C:\\Windows'},argv:['PrivateAI.exe',...(background?['--background']:[])],execPath:'C:\\PrivateAI\\PrivateAI.exe',resourcesPath:path.resolve(__dirname,'../resources'),stdin:new EventEmitter(),stdout:{write(){}},stderr:{write(){}}});
 const timer={unref(){}};
 const context={require(name){
  if(name==='electron')return electron;
  if(name==='node:child_process')return {spawn:()=>assert.fail('Startup must not spawn a browser or local model'),execFileSync:exe=>exe.endsWith('whoami.exe')?'"test","S-1-5-21-123"':''};
  if(name==='./windows-acl.cjs')return {verifyPrivateAcl(){}};
  if(name==='./startup-storage.cjs')return {...realRequire(name),loadVault:()=>cipher};
  if(name==='./bridge.cjs')return {startBridge:()=>({server:new EventEmitter(),broadcast(){},close(){}})};
  if(name==='./browser-worker.cjs'&&browserWorker)return {...realRequire(name),BrowserWorker:class{constructor(){return browserWorker;}}};
  if(name==='./core.cjs'){const RealCore=realRequire(name).Core;return {Core:class extends RealCore{constructor(options){super(options);core=this;}}};}
  return realRequire(name);
 },process:fakeProcess,__dirname:path.dirname(sourcePath),Buffer,URL,console,setInterval:()=>timer,clearInterval(){},setTimeout,clearTimeout};
 t.after(()=>{app.emit('before-quit');fs.rmSync(folder,{recursive:true,force:true});});
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8'),context,{filename:sourcePath});await ready;
 return {core,errors,dialogs,windows,trays,handlers,app};
}
test('entry point reaches chat startup and wires approval only after real Core initialization',async t=>{
 const b=await boot(t);assert.equal(b.errors.length,0,JSON.stringify(b.errors));assert.ok(b.core);assert.equal(b.windows.length,1);assert.match(b.windows[0].url,/ui\/index.html$/);assert.ok(b.handlers.has('privateai:call'));assert.equal(b.core.router.local.state,'unloaded');
 const chat=b.core.createChat({temporary:true}),answer=await b.core.send({chatId:chat.id,prompt:'/calc 2+3'});assert.match(answer.chat.messages.at(-1).text,/5/);
 assert.equal(await b.core.resources.approve('May affect the focused app.'),true);assert.equal(b.dialogs[0].defaultId,0);
 b.windows[0].focused=false;assert.equal(await b.core.resources.approve('test'),false);
 b.windows[0].focused=true;b.windows[0].visible=false;assert.equal(await b.core.resources.approve('test'),false);
 b.windows[0].visible=true;b.core.locked=true;assert.equal(await b.core.resources.approve('test'),false);assert.equal(b.dialogs.length,1);
});
test('background entry point starts without opening a window or asking unattended approval',async t=>{
 const b=await boot(t,{background:true});assert.equal(b.errors.length,0,JSON.stringify(b.errors));assert.ok(b.core);assert.equal(b.windows.length,0);assert.equal(await b.core.resources.approve('Desktop input'),false);assert.equal(b.dialogs.length,0);assert.equal(b.core.router.local.state,'unloaded');
});
test('desktop Load model IPC fits Automatic context and preserves explicit manual context',async t=>{
 const b=await boot(t),loads=[],row={tier:'small',file:'C:\\synthetic\\qwen-small.gguf',bytes:1282439584,installed:true};
 b.core.saveSettings({localTier:'auto',localContext:4096,localMaxOutput:768});b.core.resources.memory=()=>3*1024**3;
 b.core.modelManager.catalog=()=>[row];b.core.modelManager.verifyTier=async()=>row;
 b.core.router.local={state:'unloaded',validate:()=>row.bytes,status:()=>({state:'ready'}),close(){},load:async s=>loads.push(s)};
 const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=()=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op:'localLoad',data:{}});
 assert.equal((await call()).ok,true);assert.equal(loads.length,1);assert.equal(loads[0].localContext,2048);assert.equal(b.core.settings().localContext,4096);
 b.core.saveSettings({localTier:'small'});assert.equal((await call()).error.code,'LOW_MEMORY');assert.equal(loads.length,1);
});
test('entry point preserves existing encrypted chat and paused local-only settings',async t=>{
 const b=await boot(t,{existing:true});assert.equal(b.errors.length,0,JSON.stringify(b.errors));assert.equal(b.core.store.get('chat','kept').title,'Saved chat');assert.equal(b.core.settings().workerPaused,true);assert.equal(b.core.settings().processingMode,'local-only');assert.equal(b.core.settings().allowCloud,false);
});

test('actual desktop IPC dispatch reaches operations, meetings, SBAR and speaker modules', async t => {
 const b=await boot(t); assert.deepEqual(b.errors,[]);
 const contents=b.windows[0].webContents, frame={url:b.windows[0].url}; contents.mainFrame=frame;
 const call=(op,data={})=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});
 for(const op of ['operationsSummary','operationsHuddleBrief','meetingList','sbarList','sbarTemplates','speakerProfilesList']) {
   const result=await call(op); assert.equal(result.ok,true,op+': '+JSON.stringify(result.error));
 }
 const meeting=await call('meetingSave',{title:'Synthetic IPC Meeting'}); assert.equal(meeting.ok,true);
 assert.equal((await call('meetingGet',{id:meeting.result.id})).result.title,'Synthetic IPC Meeting');
 const {measuredSample}=require('./measured-speaker-fixture.cjs');
 const profile=await call('speakerProfileSave',{name:'Synthetic IPC Speaker'});assert.equal(profile.ok,true);
 for(let i=0;i<3;i++)assert.equal((await call('speakerSampleAdd',{profileId:profile.result.id,...measuredSample()})).result.accepted,true);
 const identified=await call('speakerIdentify',{features:measuredSample()});assert.equal(identified.result.label,'Synthetic IPC Speaker');assert.equal(identified.result.speakerVerified,false);
 const statement=await call('meetingAddTranscript',{meetingId:meeting.result.id,text:'Synthetic measured statement',acousticFeatures:measuredSample()});
 assert.equal(statement.result.transcript[0].attribution,'suggested');
 b.core.locked=true; assert.equal((await call('operationsSummary')).ok,false);
});

test('desktop workflow IPC executes saved assignments, imports, document search and reviewed playbooks',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=async(op,data={})=>{const r=await b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});assert.equal(r.ok,true,op+': '+JSON.stringify(r.error));return r.result;};
 const todo=b.core.saveTodo({title:'Synthetic IPC action'});let s=await call('workflowSummary'),item=s.changes.items.find(i=>i.id===todo.id);
 await call('workflowActionSave',{...item,owner:'Synthetic reviewer',reviewer:'Synthetic reviewer',note:'Checked'});s=await call('workflowSummary');await call('workflowReview',{token:s.changes.token,reviewer:'Synthetic reviewer'});
 await call('workflowDecisionSave',{title:'Synthetic decision',reason:'Source reviewed',reviewer:'Synthetic',sourceKey:item.key});assert.match((await call('workflowPacket',{key:item.key})).text,/Synthetic decision/);
 const mapping=await call('workflowMappingSave',{name:'Synthetic',type:'census',headers:['residentId','name'],mapping:{residentId:'residentId',name:'name'},reviewer:'Synthetic'});
 await call('workflowMappedPreview',{id:mapping.id,revision:mapping.revision,type:'census',headers:mapping.headers,rows:[{residentId:'synthetic-ipc',name:'Synthetic IPC'}],reviewer:'Synthetic',date:new Date().toISOString()});
 await call('workflowMappedImport',{id:mapping.id,revision:mapping.revision,type:'census',headers:mapping.headers,rows:[{residentId:'synthetic-ipc',name:'Synthetic IPC'}],reviewer:'Synthetic',date:new Date().toISOString()});
 const data={type:'census',reviewer:'Synthetic',rows:[{date:new Date().toISOString().slice(0,10),unit:'Synthetic',census:2}]},preview=await call('workflowMetricPreview',data);await call('workflowMetricImport',{...data,token:preview.token});
 const source=path.join(path.dirname(b.core.root),'synthetic.txt');fs.writeFileSync(source,'Synthetic document finding.');const file=await b.core.importFile(source),project=b.core.projectSave({name:'Synthetic'});
 await call('workflowProjectFiles',{projectId:project.id,fileIds:[file.id]});assert.equal((await call('workflowDocumentSearch',{projectId:project.id,query:'finding'})).totalMatches,1);
 const p=await call('workflowPlaybookSave',{name:'Synthetic',prompt:'Extract findings',fileIds:[file.id],requiredSections:['Findings'],reviewer:'Synthetic'}),runPreview=await call('workflowPlaybookPreview',{id:p.id});
 b.core.saveSettings({workspace:path.join(path.dirname(b.core.root),'output')});const packetPreview=await call('workflowPacket',{key:item.key});const packetFile=await call('workflowPacketExport',{key:item.key,token:packetPreview.token,generatedAt:packetPreview.generatedAt});assert.ok(fs.existsSync(packetFile.path));const current=await call('workflowPlaybookPreview',{id:p.id});let queued;b.core.runJob=async j=>{queued=j;};await call('workflowPlaybookRun',{...current,reviewer:'Synthetic'});assert.equal(queued.playbook.revision,1);
 await call('workflowBudgetSave',{enabled:true,maxRequests:0});assert.equal((await call('workflowSummary')).budget.policy.enabled,true);
 b.core.locked=true;const blocked=await b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op:'workflowSummary',data:{}});assert.equal(blocked.ok,false);
});

test('desktop browser IPC saves and reloads browser choice, opens selected engine and runs saved recipe',async t=>{
 let closes=0;const opened=[],runs=[],worker={open:async(...args)=>opened.push(args),run:async r=>{runs.push(r);return {complete:true};},close:async()=>{closes++;}};
 const b=await boot(t,{browserWorker:worker});assert.deepEqual(b.errors,[]);
 const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=(op,data={})=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});
 const saved=await call('browserSave',{name:'Synthetic browser workflow',browser:'firefox',url:'https://example.com',steps:[{op:'login',selector:'#ready'},{op:'download',selector:'#export'}]});assert.equal(saved.ok,true);
 const row=(await call('browserRecipes')).result.find(r=>r.id===saved.result.id);assert.equal(row.browser,'firefox');
 assert.equal((await call('browserOpen',{url:row.url,browser:row.browser})).ok,true);assert.equal(opened[0][3],'firefox');
 assert.equal((await call('browserRun',{id:row.id})).ok,true);assert.equal(runs[0].steps[0].op,'login');assert.equal(runs[0].browser,'firefox');
 b.core.locked=true;assert.equal((await call('browserOpen',row)).ok,false);assert.equal(opened.length,1);
 b.core.locked=false;b.core.lock();assert.equal(closes,1,'The real desktop lock event closes the report browser.');
});


test('desktop IPC saves PCC capability, preserves clinical analysis, and rejects writes while locked',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);assert.equal(b.core.key(),null);
 const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=(op,data={})=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});
 assert.equal((await call('summary')).result.integrations[0].state,'not_configured');
 const report={type:'census',date:new Date().toISOString(),rows:[{residentId:'synthetic-ipc-pcc',name:'Synthetic IPC'}]};
 assert.equal((await call('snfIngest',{reports:[report],sourceProvider:'pcc'})).error.code,'INTEGRATION_UNAVAILABLE');
 assert.equal((await call('integrationSave',{id:'pcc',settings:{enabled:true,mode:'manual'}})).result.state,'manual_import');
 assert.equal((await call('summary')).result.integrations[0].canImport,true);
 assert.equal((await call('snfIngest',{reports:[report],sourceProvider:'pcc',user:'Synthetic'})).result.success,true);
 assert.equal((await call('integrationSave',{id:'pcc',settings:{enabled:false}})).result.state,'disabled');
 const today=(await call('snfToday')).result;assert.equal(today.dataHealth.monitoringEnabled,false);
 assert.equal(b.core.store.count('snf_resident'),1);
 b.core.locked=true;assert.equal((await call('integrationSave',{id:'pcc',settings:{enabled:true}})).error.code,'LOCKED');
});

test('window closure and repeated quit after shutdown do not access the closed database',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);
 b.app.emit('before-quit');
 assert.equal(b.core.store.db,null);
 assert.doesNotThrow(()=>b.app.emit('window-all-closed'));
 assert.doesNotThrow(()=>b.app.emit('before-quit'));
 assert.deepEqual(b.errors,[]);
});

test('tray Quit cancels pending requests and closes the real Core database',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);
 const pending=new AbortController();b.core.requests.set('synthetic-tray-quit',pending);
 b.trays[0].menu.find(item=>item.label==='Quit Private AI').click();
 assert.equal(pending.signal.aborted,true);assert.equal(b.core.store.db,null);
 assert.equal(b.core.router.local.state,'unloaded');assert.doesNotThrow(()=>b.app.emit('before-quit'));
});

test('desktop capture IPC saves and reloads source notes, evidence, reviewed follow-ups and internal drafts',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=async(op,data={})=>{const r=await b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});assert.equal(r.ok,true,op+': '+JSON.stringify(r.error));return r.result;};
 const raw=Buffer.from('Synthetic IPC evidence.'),sha256=require('node:crypto').createHash('sha256').update(raw).digest('hex');
 const evidence=await call('captureEvidenceWrite',{uploadId:require('node:crypto').randomUUID(),index:0,total:1,name:'Synthetic.txt',mime:'text/plain',bytes:raw.length,sha256,data:raw.toString('base64')});
 assert.equal((await call('captureEvidenceRead',{id:evidence.evidenceId})).sha256,sha256);
 const captured=await call('captureCreate',{sourceId:'synthetic-ipc',text:'Remind me to contact the physician.',kind:'reminder',evidenceIds:[evidence.evidenceId],draftChannel:'outlook'});
 assert.equal((await call('captureList')).captures.length,1);const item=captured.actions[0];
 await call('captureActionUpdate',{id:item.id,revision:item.revision,owner:'Synthetic reviewer',dueAt:Date.now()+60000,note:'Explicit deadline'});
 const saved=await call('captureList');assert.equal(saved.actions[0].owner,'Synthetic reviewer');
 await call('captureDraftSave',{id:saved.drafts[0].id,revision:1,captureId:captured.capture.id,channel:'outlook',body:'Synthetic reviewed draft'});
 assert.equal(b.dialogs.length,0); // internal draft does not invoke the outgoing Outlook helper
 b.core.lock();const r=await b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op:'captureList',data:{}});assert.equal(r.error.code,'LOCKED');
});

test('desktop companion IPC saves and reloads, pairs over real HTTPS, revokes and respects app lock',async t=>{
 const b=await boot(t);assert.deepEqual(b.errors,[]);
 const {freePort,request}=require('./companion-fixture.cjs');
 const contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=(op,data={})=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});
 assert.equal((await call('companionStatus')).result.state,'off');
 const port=await freePort(),saved=await call('companionSave',{enabled:true,host:'127.0.0.1',port});assert.equal(saved.ok,true,JSON.stringify(saved));
 const summary=(await call('summary')).result;assert.equal(summary.companion.settings.port,port);assert.equal(summary.companion.state,'listening');
 const paired=await call('companionPair',{name:'Synthetic IPC phone',scopes:{chat:true}});assert.equal(paired.ok,true);
 const gateway={settings:()=>({host:'127.0.0.1',port})};
 assert.equal((await request(gateway,paired.result,'/status')).status,200);
 const shared=b.core.createChat();assert.equal((await call('companionGrant',{id:paired.result.id,sharedChats:[shared.id]})).ok,true);
 assert.equal((await request(gateway,paired.result,'/conversations')).body.conversations[0].sessionId,'shared_'+shared.id);
 const reloaded=(await call('companionStatus')).result;assert.equal(reloaded.devices[0].name,'Synthetic IPC phone');assert.equal(reloaded.devices[0].key,undefined);
 b.core.lock();assert.equal((await call('companionPair',{name:'Blocked'})).error.code,'LOCKED');assert.equal((await request(gateway,paired.result,'/status')).status,423);
 b.core.unlock();assert.equal((await call('companionRevoke',{id:paired.result.id})).ok,true);assert.equal((await request(gateway,paired.result,'/status')).status,401);
 assert.equal((await call('companionSave',{enabled:false})).result.state,'off');
});


test('desktop IPC preserves unknown matcher inputs and uses only explicit reviewed costs',async t=>{
 const b=await boot(t),contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const call=data=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op:'staffingReplacementMatch',data});
 const missing=await call({openShift:{role:'CNA',hours:8},roster:[{name:'Synthetic IPC unknown',role:'CNA'}]});assert.equal(missing.ok,true);assert.equal(missing.result[0].estimatedShiftCost,null);assert.equal(missing.result[0].willIncurOT,null);
 const known=await call({openShift:{role:'CNA',hours:12},roster:[{name:'Synthetic IPC reviewed',role:'CNA',currentHours:35,hourlyRate:20,isAgency:false,overtimeRule:{reviewed:true,periodHoursConfirmed:true,thresholdHours:40,multiplier:1.5}}]});assert.equal(known.ok,true);assert.equal(known.result[0].estimatedShiftCost,310);assert.equal(known.result[0].otHoursAdded,7);
 assert.equal((await call({openShift:{role:'CNA',hours:8},roster:[{name:'Synthetic IPC malformed',role:'CNA',currentHours:'38'}]})).error.code,'INVALID');b.core.lock();assert.equal((await call({openShift:{role:'CNA',hours:8}})).error.code,'LOCKED');
});


test('desktop IPC executes local search, document review, safe copy and correspondence without cloud or sending',async t=>{
 const b=await boot(t),core=b.core,contents=b.windows[0].webContents,frame={url:b.windows[0].url};contents.mainFrame=frame;
 const raw=(op,data={})=>b.handlers.get('privateai:call')({sender:contents,senderFrame:frame},{op,data});
 const call=async(op,data={})=>{const r=await raw(op,data);assert.equal(r.ok,true,op+': '+JSON.stringify(r));return r.result;};
 core.saveSettings({processingMode:'local-only',allowCloud:false,workerPaused:false});
 const id=require('node:crypto').randomUUID(),file={id,name:'Synthetic IPC policy.txt',text:'Synthetic needletest policy email person@example.test',bytes:Buffer.from('Synthetic original').toString('base64'),hipaa:true,updated:Date.now()};core.store.put('file',id,file);
 const project=core.projectSave({name:'Synthetic IPC collection'});await call('workflowProjectFiles',{projectId:project.id,fileIds:[id]});
 const found=await call('workflowSearch',{query:'needletest',types:['documents'],projectId:project.id});assert.equal(found.results[0].sourceId,id);assert.equal(found.results[0].route.fileId,id);
 const review=await call('workflowDocumentReview',{fileId:id,projectId:project.id});assert.equal(review.freshness.currency,'unknown');
 await call('workflowDocumentReviewSave',{fileId:id,projectId:project.id,revision:review.revision,metadata:{version:'Synthetic reviewed v1'}});
 assert.equal((await call('workflowDocumentReview',{fileId:id})).metadata.version,'Synthetic reviewed v1');
 assert.equal((await raw('workflowDocumentReviewSave',{fileId:id,revision:review.revision,metadata:{}})).error.code,'REVIEW_CHANGED');
 const privacy=await call('workflowDisclosureReview',{fileId:id,projectId:project.id});assert.equal(privacy.spans.length,1);
 const copy=await call('workflowDisclosureRedact',{fileId:id,projectId:project.id,revision:privacy.revision,manualSpans:privacy.manualSpans,selectedSpans:[privacy.spans[0].id]});assert.match(copy.text,/REDACTED/);assert.equal(copy.text.includes('person@example.test'),false);
 const {referenceReview,...original}=core.store.get('file',id);assert.deepEqual(original,file);
 core.store.put('messaging','settings',{enabled:true,adapter:'web',readAll:true,disableAllWriting:true,conversations:[]});
 core.store.put('messageIn','synthetic-ipc-message',{id:'synthetic-ipc-message',adapter:'web',groupId:'123456789@g.us',incoming:true,text:'Please reply about synthetic needletest.'});
 const settings=await call('workflowCommunicationSettings');await call('workflowCommunicationSave',{revision:settings.revision,enabled:true,intervalMinutes:5});assert.equal((await call('workflowCommunicationSettings')).enabled,true);
 const candidate=(await call('workflowCommunicationCheck')).candidates[0];assert.equal((await call('workflowCommunicationList')).candidates.length,1);
 const capture=await call('workflowCommunicationFollowup',{id:candidate.id,revision:candidate.revision,draftChannel:'outlook'});assert.equal(capture.drafts[0].channel,'outlook');assert.equal((await call('captureList',{captureId:capture.capture.id})).captures[0].id,capture.capture.id);
 const after=(await call('workflowCommunicationList')).candidates[0];await call('workflowCommunicationDismiss',{id:after.id,revision:after.revision});assert.equal((await call('workflowCommunicationList')).candidates[0].status,'dismissed');
 core.store.put('job','synthetic-notice',{id:'synthetic-notice',title:'Synthetic IPC interrupted run',status:'failed',error:'INTERRUPTED',completed:Date.now()});
 const notice=(await call('workflowSummary')).notices.items[0];await call('workflowNoticeUpdate',{key:notice.key,revision:notice.revision,status:'acknowledged'});assert.equal((await call('workflowSummary')).notices.active,0);assert.equal(core.store.get('job','synthetic-notice').status,'failed');
 assert.equal(core.store.count('messageOut'),0);assert.equal(b.dialogs.length,0);assert.equal(core.router.local.state,'unloaded');
 const ops=['workflowSearch','workflowDocumentReview','workflowDocumentReviewSave','workflowDisclosureReview','workflowDisclosureRedact','workflowCommunicationSettings','workflowCommunicationSave','workflowCommunicationCheck','workflowCommunicationList','workflowCommunicationFollowup','workflowCommunicationDismiss'];
 await call('snfDemo',{mode:'demo'});for(const op of ops)assert.equal((await raw(op)).error.code,'POLICY',op);assert.equal((await call('workflowSummary')).notices.items.length,0);
 core.lock();for(const op of [...ops,'workflowNoticeUpdate'])assert.equal((await raw(op)).error.code,'LOCKED',op);
});
