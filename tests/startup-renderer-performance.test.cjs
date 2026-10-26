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
