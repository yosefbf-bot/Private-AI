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
async function boot(t,{background=false,existing=false}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-startup-'));
 const root=path.join(folder,'PrivateAI2'),cipher=new Cipher(require('node:crypto').randomBytes(32));
 fs.mkdirSync(root);
 if(existing){const s=new Store(path.join(root,'privateai.db'),cipher);s.put('settings','main',{workerPaused:true,processingMode:'local-only',allowCloud:false,retentionDays:90});s.put('chat','kept',{id:'kept',title:'Saved chat',messages:[],updated:Date.now()});s.close();}
 const errors=[],dialogs=[],windows=[],handlers=new Map();let core,ready;
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,setName(){},setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>({then(fn){const p=Promise.resolve().then(fn);return {catch(fn){ready=p.catch(fn);return ready;}};}}),exit:code=>errors.push({exit:code}),quit:()=>app.emit('before-quit')});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=true;this.focused=true;this.webContents=new EventEmitter();Object.assign(this.webContents,{send(){},setWindowOpenHandler(){}});windows.push(this);}
  setMenuBarVisibility(){} loadURL(url){this.url=url;} isDestroyed(){return false;} isVisible(){return this.visible;} isFocused(){return this.focused;} show(){this.visible=true;} hide(){this.visible=false;} focus(){this.focused=true;}
 }
 class Tray extends EventEmitter{setToolTip(){}setContextMenu(){}}
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
  if(name==='./core.cjs'){const RealCore=realRequire(name).Core;return {Core:class extends RealCore{constructor(options){super(options);core=this;}}};}
  return realRequire(name);
 },process:fakeProcess,__dirname:path.dirname(sourcePath),Buffer,URL,console,setInterval:()=>timer,clearInterval(){},setTimeout,clearTimeout};
 t.after(()=>{app.emit('before-quit');fs.rmSync(folder,{recursive:true,force:true});});
 vm.runInNewContext(fs.readFileSync(sourcePath,'utf8'),context,{filename:sourcePath});await ready;
 return {core,errors,dialogs,windows,handlers,app};
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
