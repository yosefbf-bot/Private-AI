'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {options,summarize}=require('../scripts/measure-app-tree.cjs');
test('whole-app measurement accepts only bounded synthetic modes and packaged app names',()=>{
 const app=path.resolve('PrivateAI.exe'),out=path.resolve('new-evidence.json');
 assert.equal(options(['--app',app,'--out',out]).kind,'idle');
 for(const args of [['--app',app,'--out',out,'--kind','owner'],['--app',path.resolve('other.exe'),'--out',out],['--app',app,'--out',out,'--model',path.resolve('model.gguf')],['--app',app,'--out',out,'--seconds','99999']])assert.throws(()=>options(args));
});
test('whole-app counter summary distinguishes working set, private commit, CPU and available RAM',()=>{
 const r=summarize([{elapsedMs:1000,workingSetBytes:500,privateBytes:100,processCount:3,cpuMs:20,availableBytes:5000},{elapsedMs:3000,workingSetBytes:900,privateBytes:150,processCount:4,cpuMs:40,availableBytes:4000}]);
 assert.deepEqual(r,{samples:2,sampledPeakWorkingSetBytes:900,sampledPeakPrivateCommitBytes:150,meanWorkingSetBytes:700,meanPrivateCommitBytes:125,peakProcessCount:4,minimumAvailableBytes:4000,cpuMs:20,oneCoreCpuPercent:1});
 assert.equal(summarize([]),null);assert.equal(summarize([{elapsedMs:1,workingSetBytes:1,privateBytes:1,processCount:1,cpuMs:0,availableBytes:1}]).oneCoreCpuPercent,null);
});
