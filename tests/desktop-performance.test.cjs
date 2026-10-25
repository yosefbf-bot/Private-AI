'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{uuid}=require('../source/security.cjs');
const {Store}=require('../source/database.cjs');
const {REQUEST_BYTE_LIMIT,jsonStringBytes}=require('../source/request-budget.cjs');

test('request budget counts escaped UTF-8 strings without serializing attachment bodies',()=>{
 for(const value of ['', 'ascii', 'אב🙂', '\ud800', '\udfff', '"\\\n\t\r\u0000\u001f', '\ud800\udc00']){
  assert.equal(jsonStringBytes(value),Buffer.byteLength(JSON.stringify(value)));
  assert.equal(jsonStringBytes(value,true),Buffer.byteLength(JSON.stringify(JSON.stringify(value))));
 }
});

test('cleanup decrypts only potentially expired files/jobs and preserves report extensions and holds',t=>{
 const {core,cipher}=fixture(t),now=Date.now(),old=now-150*86400000;
 const put=(kind,id,value,options)=>core.store.put(kind,id,{id,...value},options);
 put('file','fresh',{name:'Working.txt',bytes:'A'.repeat(1000000)});
 put('job','fresh',{status:'completed',recoveryInput:{prompt:'A'.repeat(1000000)}});
 put('file','report',{name:'Report.pdf',ext:'.pdf'},{updated:old});
 put('job','held',{status:'running',title:'Working task'},{updated:old});
 put('file','expired',{name:'Expired.txt'},{expires:now-1});
 put('file','cutoff',{name:'Old.txt'},{updated:now-100*86400000});
 const opened=[],open=cipher.open.bind(cipher);
 t.mock.method(cipher,'open',(payload,context)=>{if(/^(file|job):/.test(context))opened.push(context);return open(payload,context);});
 const result=core.store.cleanup(100,now);
 assert.deepEqual(opened.sort(),['file:cutoff','file:expired','file:report','job:held']);
 assert.equal(result.files,2);assert.equal(result.reports,0);assert.equal(result.jobs,0);
 assert.ok(core.store.get('file','report'));assert.ok(core.store.get('job','held'));
 opened.length=0;core.store.cleanup(0,now);assert.deepEqual(opened,[]);
});

function image(core,size=2000000){
 const f={id:uuid(),name:'Synthetic.png',size:Math.floor(size*3/4),image:true,mime:'image/png',hipaa:true,bytes:'A'.repeat(size)};
 core.store.put('file',f.id,f);return f;
}

test('history enforces the request byte limit before omitted attachment reads and caches duplicates per request',t=>{
 const {core}=fixture(t),c=core.createChat(),shared=image(core),older=image(core);
 c.messages=[{role:'user',text:'Older source',fileIds:[older.id]},...Array.from({length:19},()=>({role:'user',text:'Repeated source',fileIds:[shared.id]}))];
 const reads=[],get=core.store.get.bind(core.store);
 t.mock.method(core.store,'get',(kind,id)=>{if(kind==='file')reads.push(id);return get(kind,id);});
 const input=core.buildInput(c);
 assert.equal(input.omitted,1);assert.equal(input.messages.length,19);
 assert.ok(Buffer.byteLength(JSON.stringify(input.messages))<REQUEST_BYTE_LIMIT);
 assert.deepEqual(reads,[shared.id]);
 core.buildInput(c);assert.deepEqual(reads,[shared.id,shared.id],'The lookup cache lasts for one request only');
 assert.equal(c.messages.length,20,'Omitted history remains saved');
});

test('an oversized latest message fails clearly before loading bodies or sending a provider request',async t=>{
 const {core,calls}=fixture(t),c=core.createChat(),f=image(core,7000000);core.resources.memory=()=>8*1024**3;
 const get=core.store.get.bind(core.store);let reads=0;
 t.mock.method(core.store,'get',(kind,id)=>{if(kind==='file')reads++;return get(kind,id);});
 await assert.rejects(core.send({chatId:c.id,prompt:'Review these images',fileIds:Array(6).fill(f.id)}),e=>e.code==='REQUEST_LIMIT'&&/latest message.*40 MB/.test(e.message));
 assert.equal(reads,0);assert.equal(calls.length,0);assert.equal(core.chat(c.id).messages.length,0);assert.equal(core.requests.size,0);
});

test('send reuses attachment reads from history assembly and propagates the explicit omission count',async t=>{
 const {core,calls}=fixture(t),c=core.createChat(),f=image(core);core.resources.memory=()=>8*1024**3;
 c.messages=Array.from({length:20},()=>({role:'user',text:'Saved source',fileIds:[f.id]}));core.saveChat(c);
 const get=core.store.get.bind(core.store);let reads=0;
 t.mock.method(core.store,'get',(kind,id)=>{if(kind==='file')reads++;return get(kind,id);});
 const result=await core.send({chatId:c.id,prompt:'Review the supplied source',fileIds:[f.id]});
 assert.equal(reads,1);assert.equal(calls.length,1);assert.equal(result.omitted,2);assert.equal(calls[0].opts.omitted,2);
 assert.equal(core.chat(c.id).messages.length,22);
});

test('legacy file metadata is backfilled lazily and repeated references still decrypt once',t=>{
 const {core,cipher}=fixture(t),c=core.createChat(),f=image(core,100);
 core.store.db.prepare("UPDATE record_meta SET payload=? WHERE kind='file' AND id=?").run(cipher.seal({id:f.id,name:f.name,size:f.size,hipaa:true},'meta:file:'+f.id),f.id);
 const old=Date.now()-150*86400000;
 core.store.db.prepare("UPDATE records SET updated=? WHERE kind='file' AND id=?").run(old,f.id);
 core.store.db.prepare("UPDATE record_meta SET updated=? WHERE kind='file' AND id=?").run(old,f.id);
 c.messages=[{role:'user',text:'Review',fileIds:[f.id,f.id]}];
 const get=core.store.get.bind(core.store);let reads=0;
 t.mock.method(core.store,'get',(kind,id)=>{if(kind==='file')reads++;return get(kind,id);});
 assert.equal(core.buildInput(c).messages[0].content.length,3);assert.equal(reads,1);
 assert.equal(core.store.summary('file',f.id).inputBudgetVersion,1);
 assert.equal(core.store.summary('file',f.id).updated,old,'Lazy indexing must not renew source retention');
});

test('draft autosave never decrypts or rewrites history and survives reload and encrypted backup',t=>{
 const {core,cipher,root,dir}=fixture(t),c=core.createChat();
 c.messages=[{role:'assistant',text:'Synthetic history '.repeat(60000)}];core.saveChat(c);
 const row=()=>core.store.db.prepare("SELECT updated,payload FROM records WHERE kind='chat' AND id=?").get(c.id);
 const before=Buffer.from(row().payload),open=cipher.open.bind(cipher);let historyReads=0;
 t.mock.method(cipher,'open',(payload,context)=>{if(context==='chat:'+c.id)historyReads++;return open(payload,context);});
 for(const draft of ['a','ab','DRAFT_SENTINEL'])assert.equal(core.saveDraft(c.id,draft),true);
 assert.equal(historyReads,0);assert.deepEqual(Buffer.from(row().payload),before);
 assert.equal(core.store.summary('chat',c.id).updated,row().updated);
 const backup=path.join(dir,'draft-backup.db');core.store.backup(backup);
 const restored=new Store(backup,cipher);try{assert.equal(restored.get('chatDraft',c.id).text,'DRAFT_SENTINEL');}finally{restored.close();}
 core.close();core.store=new Store(path.join(root,'privateai.db'),cipher);
 assert.equal(core.chat(c.id).draft,'DRAFT_SENTINEL');assert.equal(core.chat(c.id).messages[0].text,c.messages[0].text);
 assert.equal(core.store.get('chat',c.id).draft,undefined);
});

test('legacy drafts migrate lazily, clearing stays cleared and stale history saves preserve a newer draft',t=>{
 const {core}=fixture(t),c=core.createChat();core.store.put('chat',c.id,{...c,draft:'LEGACY_DRAFT'});
 assert.equal(core.store.get('chatDraft',c.id),null);assert.equal(core.chat(c.id).draft,'LEGACY_DRAFT');
 assert.equal(core.store.get('chatDraft',c.id).text,'LEGACY_DRAFT');
 core.saveDraft(c.id,'');assert.equal(core.chat(c.id).draft,'');
 const stale=core.chat(c.id);core.saveDraft(c.id,'NEW_DRAFT');core.saveChat(stale);
 assert.equal(core.chat(c.id).draft,'NEW_DRAFT');assert.equal(core.store.get('chat',c.id).draft,undefined);
});

test('reading a legacy chat without a draft preserves its payload and performs zero writes',t=>{
 const {core}=fixture(t),id=uuid(),legacy={id,title:'Synthetic legacy chat',messages:[{role:'user',text:'Synthetic saved history'}],hipaa:true};
 core.store.put('chat',id,legacy,{updated:1600000000000,expires:1700000000000});
 const row=()=>core.store.db.prepare("SELECT updated,expires,payload FROM records WHERE kind='chat' AND id=?").get(id);
 const changes=()=>core.store.db.prepare('SELECT total_changes() AS count').get().count;
 const before=row(),writes=changes();
 for(let i=0;i<3;i++){
  assert.deepEqual(core.store.get('chat',id),legacy);
  assert.deepEqual(core.chat(id),legacy);
 }
 assert.equal(changes(),writes,'Reading must not write records or metadata');
 assert.deepEqual(row(),before,'Reading must preserve ciphertext and retention timestamps');
 assert.equal(core.store.get('chatDraft',id),null);
});

test('reading a legacy embedded draft copies it once without rewriting or restamping its chat',t=>{
 const {core}=fixture(t),id=uuid(),legacy={id,title:'Synthetic legacy draft',messages:[],hipaa:true,updated:1600000000000,draft:'Synthetic unfinished draft'};
 core.store.put('chat',id,legacy,{updated:1600000001000,expires:1700000000000});
 const row=kind=>core.store.db.prepare('SELECT updated,expires,payload FROM records WHERE kind=? AND id=?').get(kind,id);
 const changes=()=>core.store.db.prepare('SELECT total_changes() AS count').get().count;
 const before=row('chat'),writes=changes();
 assert.deepEqual(core.chat(id),legacy);
 assert.equal(changes()-writes,1,'Only the separate encrypted draft record is written');
 assert.deepEqual(core.store.get('chatDraft',id),{text:legacy.draft});
 const migrated=row('chatDraft');
 for(let i=0;i<3;i++)assert.deepEqual(core.chat(id),legacy);
 assert.equal(changes()-writes,1,'Repeated reads must not repeat the migration');
 assert.deepEqual(row('chat'),before,'Migration must not renew chat retention or rewrite its history');
 assert.deepEqual(row('chatDraft'),migrated);
 assert.deepEqual(core.store.get('chat',id),legacy);
});

test('drafts follow parent retention, temporary-chat, explicit deletion and backup purge rules',t=>{
 const {core,root}=fixture(t),c=core.createChat(),temporary=core.createChat({temporary:true});
 assert.equal(core.saveDraft(temporary.id,'TEMPORARY'),false);assert.equal(core.store.get('chatDraft',temporary.id),null);
 const old=Date.now()-101*86400000;core.store.put('chat',c.id,c,{updated:old});core.saveDraft(c.id,'Active draft');
 core.store.cleanup(100);assert.equal(core.chat(c.id).draft,'Active draft');
 core.store.db.prepare("UPDATE records SET updated=? WHERE kind='chat' AND id=?").run(old,c.id);
 assert.equal(core.store.cleanup(100).chats,1);assert.equal(core.store.get('chatDraft',c.id),null);
 const kept=core.createChat();core.saveDraft(kept.id,'Keep indefinitely');core.store.db.prepare("UPDATE records SET updated=? WHERE kind='chat' AND id=?").run(old,kept.id);
 core.store.cleanup(0);assert.equal(core.chat(kept.id).draft,'Keep indefinitely');
 const backups=path.join(root,'backups');fs.mkdirSync(backups,{recursive:true});const backup=path.join(backups,'privateai-123.db');core.store.backup(backup);
 core.deleteChat(kept.id);assert.equal(core.store.get('chatDraft',kept.id),null);assert.equal(fs.existsSync(backup),false);
 const missing=uuid();assert.throws(()=>core.saveDraft(missing,'No orphan'),{code:'INVALID'});assert.equal(core.store.get('chatDraft',missing),null);
});
