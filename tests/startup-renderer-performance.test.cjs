'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
function graph(file,seen=new Set()) {
 if(seen.has(file))return seen;seen.add(file);
 for(const match of fs.readFileSync(file,'utf8').matchAll(/^import\s+.*?\s+from\s+["']([^"']+)["']/gm))if(match[1].startsWith('.'))graph(path.resolve(path.dirname(file),match[1]),seen);
 return seen;
}
test('initial renderer static module graph stays below 400 KB without deferred clinical/meeting modules',()=>{
 const files=[...graph(path.resolve(__dirname,'../source/ui/app.mjs'))],bytes=files.reduce((n,f)=>n+fs.statSync(f).size,0);
 assert.ok(bytes<=400000,`Initial module graph: ${bytes} bytes in ${files.length} modules`);
 for(const feature of ['snf-ui.mjs','meetings.mjs','automation-center.mjs','operations-copilot.mjs'])assert.equal(files.some(f=>path.basename(f)===feature),false);
});
test('meeting list metadata avoids transcript bodies while selected detail reconciles canonical tasks',async t=>{
 const {core,cipher}=fixture(t),{dispatch}=require('../source/operations-copilot.cjs');
 const meeting=await dispatch(core,'meetingSave',{title:'Synthetic large meeting',type:'general'});
 const value=core.store.get('meeting',meeting.id);value.transcript=Array.from({length:2000},(_,i)=>({id:String(i),text:'SYNTHETIC transcript '+i}));core.store.put('meeting',meeting.id,value);
 const open=cipher.open.bind(cipher),reads=[];cipher.open=(p,a)=>{if(a.startsWith('meeting:'))reads.push(a);return open(p,a);};
 const rows=await dispatch(core,'meetingList',{metadata:true});assert.deepEqual(reads,[]);assert.equal(rows[0].title,value.title);assert.equal(rows[0].transcriptCount,2000);assert.equal(rows[0].transcript,undefined);
 assert.equal((await dispatch(core,'meetingGet',{id:meeting.id})).transcript.length,2000);assert.equal(reads.length,1);
 assert.equal((await dispatch(core,'meetingList'))[0].transcript.length,2000,'Legacy consumers keep complete records');
});
test('lazy features retain one instance and cancel delayed navigation without importing on stop',async()=>{
 const {lazyFeature}=await import('../source/ui/lazy-feature.mjs');let loads=0,renders=0,stops=0,resolve;
 const ui=lazyFeature(()=>{loads++;return new Promise(r=>resolve=r);});
 assert.equal(ui.stop(),true);assert.equal(loads,0);
 const first=ui.render({});ui.stop();resolve({render(){renders++;},stop(){stops++;return true;}});await first;
 assert.equal(renders,0);await ui.render({});await ui.render({});assert.equal(loads,1);assert.equal(renders,2);ui.stop();assert.equal(stops,1);
});
test('visible refresh coalesces bursts, defers edits and never calls RPC while hidden',async()=>{
 const {createVisibleRefresh}=await import('../source/ui/visible-refresh.mjs');let shown=false,editing=false,calls=0;const queue=new Map();let id=0;
 const refresh=createVisibleRefresh({visible:()=>shown,blocked:()=>editing,run:async()=>{calls++;},setTimer:fn=>{queue.set(++id,fn);return id;},clearTimer:id=>queue.delete(id)});
 for(let n=0;n<10;n++)refresh.request();assert.equal(queue.size,0);assert.equal(calls,0);
 shown=true;refresh.resume();for(let n=0;n<10;n++)refresh.request();assert.equal(queue.size,1);
 let fn=[...queue.values()][0];queue.clear();await fn();assert.equal(calls,1);
 editing=true;refresh.request();assert.equal(queue.size,0);editing=false;refresh.resume();assert.equal(queue.size,1);
 shown=false;refresh.resume();assert.equal(queue.size,0);assert.equal(calls,1);
 shown=true;refresh.resume();fn=[...queue.values()][0];queue.clear();await fn();assert.equal(calls,2);
 refresh.request();refresh.clear();assert.equal(queue.size,0);
});
test('Worker snapshot never reads unrelated chat, file or voice bodies and remains lock protected',t=>{
 const {core,cipher}=fixture(t);for(const kind of ['chat','file','voice_transcript'])core.store.put(kind,'synthetic',{title:'Synthetic',text:'Synthetic body'});
 const open=cipher.open.bind(cipher),reads=[];cipher.open=(p,a)=>{reads.push(a);return open(p,a);};
 assert.deepEqual(Object.keys(core.workerSnapshot()).sort(),['jobs','resources','schedules','worker']);assert.equal(reads.some(a=>/^(chat|file|voice_transcript):/.test(a)),false);
 core.lock();assert.throws(()=>core.workerSnapshot(),{code:'LOCKED'});
});
test('ACL protection persists then fully verifies in one process and sanitizes native failures',t=>{
 const vm=require('node:vm'),{createRequire}=require('node:module'),os=require('node:os');const root=fs.mkdtempSync(path.join(os.tmpdir(),'acl-wrapper-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.resolve(__dirname,'../source/windows-acl.cjs'),real=createRequire(file),calls=[];let failure;
 const context={module:{exports:{}},Buffer,process:{platform:'win32',env:{SystemRoot:'C:\\Windows'}},require:name=>name==='node:child_process'?{execFileSync:(...args)=>{calls.push(args);if(failure)throw failure;}}:real(name)};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);const {protectPrivateFolder,verifyPrivateAcl}=context.module.exports;
 protectPrivateFolder(root,'S-1-5-21-123');assert.equal(calls.length,1);
 const script=Buffer.from(calls[0][1].at(-1),'base64').toString('utf16le');assert.ok(script.indexOf('SetAccessControl')<script.indexOf('GetAccessControl'));assert.match(script,/RawSecurityDescriptor/);assert.match(script,/GetAccessRules/);assert.match(script,/PropagationFlags/);
 verifyPrivateAcl(root,'S-1-5-21-123');assert.equal(calls.length,2);
 for(const code of ['ETIMEDOUT','ENOENT','NATIVE_EXIT']){failure=Object.assign(Error('synthetic private path'),{code});assert.throws(()=>protectPrivateFolder(root,'S-1-5-21-123'),e=>e.code==='STORAGE'&&!e.message.includes('private path'));}
});
