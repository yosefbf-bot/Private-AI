'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {NativeMemoryProbe}=require('../scripts/native-memory-probe.cjs');
test('native probe returns numeric system counters and rejects unrelated process/control requests',{skip:process.platform!=='win32',timeout:30000},async()=>{
 const p=await new NativeMemoryProbe().start();try{
  const r=await p.call('sample');assert.ok(r.availableBytes>0);assert.ok(r.commitLimitBytes>=r.commitAvailableBytes);assert.equal(r.allocatedBytes,0);
  await assert.rejects(p.call('attach',{pid:process.pid}));await assert.rejects(p.call('allocate',{bytes:2**34}));assert.equal((await p.call('sample')).allocatedBytes,0);
 }finally{await p.close();}assert.ok(p.child.exitCode!==null||p.child.signalCode!==null);
});
