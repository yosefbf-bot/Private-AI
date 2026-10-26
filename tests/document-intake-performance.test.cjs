'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs'),playbooks=require('../source/workflows/playbooks.cjs');
test('oversized playbook input is rejected using encrypted metadata without reading bodies',t=>{
 const {core}=fixture(t),ids=[];
 for(let i=0;i<2;i++){const id=crypto.randomUUID();ids.push(id);core.store.put('file',id,{id,name:'Synthetic '+i,ext:'.txt',bytes:'A'.repeat(18000000),text:'Synthetic source',hipaa:true,updated:123});}
 const get=core.store.get.bind(core.store);let reads=0;core.store.get=(kind,...args)=>{if(kind==='file')reads++;return get(kind,...args);};
 const p=playbooks.save(core,{name:'Synthetic',prompt:'Extract',fileIds:ids,requiredSections:['Findings'],reviewer:'Synthetic'});
 assert.equal(reads,0,'saving a selection needs metadata only');
 assert.throws(()=>playbooks.preview(core,{id:p.id}),{code:'LIMIT'});assert.equal(reads,0);
});
test('admitted playbook fingerprints and original timestamps remain identical',t=>{
 const {core}=fixture(t),id=crypto.randomUUID(),file={id,name:'Synthetic',ext:'.txt',bytes:Buffer.from('source').toString('base64'),text:'Synthetic complete source',hipaa:true,updated:123};
 core.store.put('file',id,file,{updated:999});const p=playbooks.save(core,{name:'Synthetic',prompt:'Extract',fileIds:[id],requiredSections:['Findings'],reviewer:'Synthetic'});
 const preview=playbooks.preview(core,{id:p.id});assert.equal(preview.inputs[0].updated,123);
 assert.equal(preview.inputs[0].revision,require('../source/workflows/actions.cjs').signature({text:file.text,bytes:file.bytes,hipaa:file.hipaa}));
 core.store.put('file',id,{...file,bytes:Buffer.from('change').toString('base64')},{updated:999});assert.throws(()=>playbooks.run(core,{...preview,reviewer:'Synthetic'}),{code:'REVIEW_CHANGED'});
});

test('five MiB capture evidence uses linear encrypted writes and completed replay is read-only',t=>{
 const {core}=fixture(t),capture=require('../source/capture-workflows.cjs'),bytes=Buffer.alloc(5*1024**2,65),put=core.store.put.bind(core.store);let written=0,writes=0;
 core.store.put=(kind,id,value,...args)=>{if(kind.startsWith('capture_')){written+=Buffer.byteLength(JSON.stringify(value));writes++;}return put(kind,id,value,...args);};
 const base={uploadId:crypto.randomUUID(),total:64,name:'Synthetic.txt',mime:'text/plain',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};let result,last;
 for(let index=0;index<64;index++){last={...base,index,data:bytes.subarray(index*81920,(index+1)*81920).toString('base64')};result=capture.writeEvidence(core,last);}
 assert.equal(result.complete,true);assert.ok(written<bytes.length*4,'encrypted serialized bytes must stay below4x input, not cumulative partial bodies');
 const savedWrites=writes;assert.deepEqual(capture.writeEvidence(core,last),result);assert.equal(writes,savedWrites);
 assert.equal(capture.readEvidence(core,{id:result.evidenceId}).data,bytes.toString('base64'));assert.equal(core.store.count('capture_upload'),0);assert.equal(core.store.count('capture_upload_chunk'),0);
 t.diagnostic(`5 MiB upload: ${written} serialized encrypted-write bytes in ${writes} writes`);
});

test('legacy partial capture migrates once, rolls back invalid completion and retains live chunks until parent expiry',t=>{
 const {core}=fixture(t),capture=require('../source/capture-workflows.cjs'),signature=require('../source/workflows/actions.cjs').signature;
 const base={uploadId:crypto.randomUUID(),total:3,name:'Synthetic.txt',mime:'text/plain',bytes:6,sha256:crypto.createHash('sha256').update('abcdef').digest('hex')};
 capture.writeEvidence(core,{...base,index:0,data:Buffer.from('ab').toString('base64')});
 const row=core.store.list('capture_upload')[0],expiry=Date.now()+86400000;
 core.store.delete('capture_upload_chunk',row.id+':0');
 core.store.put('capture_upload',row.id,{id:row.id,actorKey:row.actorKey,inputHash:signature([base.total,base.name,base.mime,base.bytes,base.sha256]),total:3,chunks:{0:Buffer.from('ab').toString('base64')}},{expires:expiry});
 capture.writeEvidence(core,{...base,index:1,data:Buffer.from('cd').toString('base64')});
 assert.equal(core.store.get('capture_upload',row.id).chunks,undefined);assert.equal(core.store.count('capture_upload_chunk'),2);
 assert.throws(()=>capture.writeEvidence(core,{...base,index:2,data:Buffer.from('xx').toString('base64')}),{code:'CHANGED'});
 assert.equal(core.store.count('capture_upload_chunk'),2);assert.equal(core.store.get('capture_upload',row.id).receivedBytes,4);
 const old=core.store.get('capture_upload_chunk',row.id+':0');core.store.put('capture_upload_chunk',old.id,old,{expires:Date.now()-1});
 core.store.cleanup(100,Date.now());assert.equal(core.store.count('capture_upload_chunk'),2,'live parent preserves earlier chunks');
 const result=capture.writeEvidence(core,{...base,index:2,data:Buffer.from('ef').toString('base64')});assert.equal(result.complete,true);
 assert.equal(capture.readEvidence(core,{id:result.evidenceId}).data,Buffer.from('abcdef').toString('base64'));
 const next={...base,uploadId:crypto.randomUUID()};capture.writeEvidence(core,{...next,index:0,data:Buffer.from('ab').toString('base64')});
 core.store.cleanup(100,Date.now()+86400001);assert.equal(core.store.count('capture_upload'),0);assert.equal(core.store.count('capture_upload_chunk'),0);
});
