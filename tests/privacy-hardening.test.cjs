'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');const {dispatch}=require('../source/voice-history.cjs');
test('voice transcripts use encrypted storage, retention, and never retain temporary input',t=>{
 const {core,root}=fixture(t);const text='SYNTHETIC_VOICE_PRIVATE';const saved=dispatch(core,'voiceTranscriptSave',{text,legacyId:'vt_synthetic',legacyTimestamp:Date.now()});
 assert.equal(dispatch(core,'voiceTranscriptSave',{text,legacyId:'vt_synthetic'}).id,saved.id);assert.equal(core.store.count('voice_transcript'),1);
 dispatch(core,'voiceTranscriptSave',{text,temporary:true});assert.equal(core.store.count('voice_transcript'),1);
 for(const name of ['privateai.db','privateai.db-wal'])if(fs.existsSync(path.join(root,name)))assert.equal(fs.readFileSync(path.join(root,name)).includes(Buffer.from(text)),false);
 dispatch(core,'voiceTranscriptDelete',{id:saved.id});assert.equal(core.store.count('voice_transcript'),0);
 dispatch(core,'voiceTranscriptSave',{text,legacyId:'vt_expired',legacyTimestamp:Date.now()-101*86400000});core.store.cleanup(100);assert.equal(core.store.count('voice_transcript'),0);
});
test('legacy plaintext copies are removed only after encrypted persistence succeeds',async()=>{
 const {migrateLegacyStorage}=await import('../source/ui/legacy-storage.mjs');const map=new Map([['voice',JSON.stringify([{id:'vt_synthetic',text:'Synthetic'}])]]);const storage={getItem:k=>map.get(k),removeItem:k=>map.delete(k)};
 await assert.rejects(migrateLegacyStorage(async()=>{throw Error('locked');},storage,'draft','voice'));assert.ok(map.has('voice'));
 const saved=[];await migrateLegacyStorage(async(op,data)=>saved.push({op,data}),storage,'draft','voice');assert.equal(map.has('voice'),false);assert.equal(saved[0].op,'voiceTranscriptSave');
});
test('repository policy rejects forced runtime/key additions without printing secrets',()=>{
 const {inspect}=require('../scripts/check-repository.cjs');for(const file of ['app-data/privateai.db','x.db-wal','x.db-shm','vault.key','.env','logs/test.log','credentials.json'])assert.ok(inspect(file).length);
 assert.ok(inspect('source/secret-test.cjs','const value = "'+'sk-'+'A'.repeat(40)+'"').length);assert.ok(inspect('.env.example','KEY=anything').length);assert.deepEqual(inspect('.env.example','KEY=\n'),[]);
 for(const file of ['privateai.db-journal','x.sqlite3-wal','recordings/sample.bin','meeting.wav','voice.webm','model.gguf'])assert.ok(inspect(file).length,file);
});
test('mapped CSV preserves quoted evidence and rejects column drift',async()=>{
 const {parseCSV}=await import('../source/ui/snf/import-center.mjs');assert.equal(parseCSV('residentId,text\n1,"quoted, evidence"').rows[0].text,'quoted, evidence');assert.throws(()=>parseCSV('id,id\n1,2'));assert.throws(()=>parseCSV('id,text\n1'));assert.throws(()=>parseCSV('id,text\n1,"open'));
});
