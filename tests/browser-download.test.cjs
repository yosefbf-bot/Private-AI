'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {saveDownload}=require('../source/browser-download.cjs');
for(const kind of ['stalled','cancelled','oversized'])test(`download ${kind} settles its write before returning`,async()=>{
 let rejectSave,settled=false,cancels=0;const download={saveAs:()=>new Promise((_,reject)=>{rejectSave=reject;}).finally(()=>{settled=true;}),cancel:async()=>{cancels++;rejectSave(Error('cancelled'));},failure:async()=>null};
 const code=kind==='stalled'?'NETWORK':kind==='cancelled'?'CANCELLED':'LIMIT';
 await assert.rejects(saveDownload(download,'unused',()=>{if(kind==='cancelled')throw require('../source/security.cjs').fail('CANCELLED');},{pollMs:2,stallMs:5,progress:async()=>kind==='oversized'?101*1024**2:0}),{code});
 assert.equal(settled,true);assert.equal(cancels,1);
});
test('slow transfer with continuing progress outlives the stall interval',async()=>{
 let bytes=0,cancelled=false,finish,clock=0;const download={saveAs:()=>new Promise(r=>{finish=r;}),cancel:async()=>{cancelled=true;finish();},failure:async()=>null};
 await saveDownload(download,'unused',()=>{},{pollMs:2,stallMs:12,now:()=>clock,progress:async()=>{clock+=10;if(++bytes===5)finish();return bytes;}});assert.equal(bytes,5);assert.ok(clock>12);assert.equal(cancelled,false);
});
