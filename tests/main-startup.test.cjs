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
