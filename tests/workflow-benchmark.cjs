'use strict';
// Manual benchmark, not a timing-sensitive CI assertion. All data is temporary and synthetic.
// Run: node --expose-gc tests/workflow-benchmark.cjs
const {fixture} = require('./helpers.cjs');
const {dispatch} = require('../source/workflows/index.cjs');
const {performance} = require('node:perf_hooks');
const cleanup = [];
const {core, cipher} = fixture({after: fn => cleanup.push(fn)});
(async () => {
  core.store.transaction(() => {
    for (let i=0; i<400; i++) core.store.put('file', `synthetic-file-${i}`, {name:`Synthetic document ${i}`,text:'SYNTHETIC DOCUMENT '.repeat(7000),size:133000}, {updated:100000+i});
    for (let i=0; i<80; i++) core.store.put('job', `synthetic-job-${i}`, {title:`Synthetic job ${i}`,status:i%2?'completed':'failed',playbook:{id:'synthetic-playbook'},recoveryInput:{text:'SYNTHETIC RECOVERY '.repeat(17000)},savedAnswer:{text:i%2?'SYNTHETIC ANSWER '.repeat(12000):'Synthetic retained failed draft'}}, {updated:100000+i});
    for (let i=0; i<1500; i++) core.store.put('todo', `synthetic-todo-${i}`, {title:`Synthetic action ${i}`,status:'pending'}, {updated:100000+i});
  });
  const first = await dispatch(core, 'workflowSummary');
  await dispatch(core, 'workflowReview', {token:first.changes.token,reviewer:'Synthetic benchmark reviewer'});
  let decrypts=0, bytes=0;
  const open=cipher.open.bind(cipher);
  cipher.open=(payload,...args)=>{decrypts++;bytes+=payload.length;return open(payload,...args);};
  const sample=await dispatch(core,'workflowSummary');
  cipher.open=open;
  for(let i=0;i<2;i++)await dispatch(core,'workflowSummary');
  const times=[];
  for(let i=0;i<9;i++) { global.gc?.(); const t=performance.now(); await dispatch(core,'workflowSummary'); times.push(performance.now()-t); }
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({dataset:{files:400,jobs:80,actions:1500},samples:9,medianMs:+times[4].toFixed(2),minMs:+times[0].toFixed(2),maxMs:+times[8].toFixed(2),decryptedRecords:decrypts,decryptedBytes:bytes,returned:{files:sample.files.length,jobs:sample.runs.length,actions:sample.changes.items.length}},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>cleanup.reverse().forEach(fn=>fn()));
