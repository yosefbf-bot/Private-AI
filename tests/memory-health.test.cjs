'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assessMemory}=require('../source/memory-health.cjs');
const GIB=1024**3,healthy={totalBytes:16*GIB,availableBytes:4*GIB,commitLimitBytes:36*GIB,commitAvailableBytes:18*GIB,pageFileKnown:true,pageFileBytes:20*GIB};
test('healthy memory advice uses numeric allowlisted counters and never alters settings',()=>{
 const input={...healthy,path:'sensitive filename',prompt:'private',token:'secret'},before=structuredClone(input),r=assessMemory(input);assert.equal(r.status,'ok');assert.equal(r.commitHeadroomGB,18);assert.equal(r.pageFileGB,20);assert.deepEqual(input,before);assert.ok(!JSON.stringify(r).match(/sensitive|private|secret/));
});
test('missing, inconsistent or unavailable counters remain unknown, not a disabled page file',()=>{
 for(const raw of [null,{}, {...healthy,availableBytes:Infinity},{...healthy,commitAvailableBytes:40*GIB}])assert.equal(assessMemory(raw).status,'unknown');
 const result=assessMemory({...healthy,pageFileKnown:false,pageFileBytes:0});assert.equal(result.status,'unknown');assert.equal(result.pageFileGB,null);assert.doesNotMatch(result.message,/disabled/);
});
test('disabled/small page files and exhausted commit produce advice only',()=>{
 for(const bytes of [0,GIB/2]){const r=assessMemory({...healthy,pageFileBytes:bytes});assert.equal(r.status,'attention');assert.match(r.message,/Windows manage the page file/);}
 const r=assessMemory({...healthy,commitAvailableBytes:GIB/2});assert.equal(r.status,'attention');assert.match(r.message,/memory limit/);
});
test('local checks preserve sanitized memory advice in the existing encrypted maintenance record',async t=>{
 const {core,calls}=require('./helpers.cjs').fixture(t),{localChecks}=require('../source/self-check.cjs');
 const result=await localChecks(core,{pipe:'\\\\.\\pipe\\PrivateAI-synthetic-missing-'+require('node:crypto').randomUUID(),safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},verifyPermissions:()=>{},helperHealth:async()=>({windows:true,memory:{...healthy,pageFileBytes:0,path:'PRIVATE_TEST_FILENAME'}})});
 assert.equal(result.memoryHealth.status,'attention');assert.deepEqual(core.store.get('maintenance','localChecks').memoryHealth,result.memoryHealth);assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_FILENAME'));assert.equal(result.networkRequests,0);assert.equal(calls.length,0);
});
