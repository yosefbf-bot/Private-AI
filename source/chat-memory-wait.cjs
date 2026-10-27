'use strict';
const {fail,safeError,uuid}=require('./security.cjs');
const {signature}=require('./workflows/actions.cjs');
const {localInput}=require('./local-brain.cjs');
const {references}=require('./deterministic.cjs');
const {evaluateLocal}=require('./hybrid-router.cjs');
const docs=require('./workflows/documents.cjs');
const SETTINGS=['provider','model','hipaa','processingMode','allowCloud','localTier','localMaxTier','localModelPath','smallModelPath','mediumModelPath','highModelPath','extraModelPath','localContext','localMaxOutput','resourceMode','org','projectId','customEndpoint','ollamaEndpoint','customInstructions','contextChars'];
const policy=core=>{const s=core.settings();return signature(Object.fromEntries(SETTINGS.map(k=>[k,s[k]])));};
const history=(chat,index)=>signature(chat.messages.slice(0,index).map(({memoryWait,...m})=>m));
class ChatMemoryWait{
 constructor(core){this.core=core;this.offers=new Map();this.closed=false;}
 raw(id){if(this.closed||!this.core.store.db)return null;return this.core.temporary.get(id)||this.core.store.get('chat',id);}
 present(chat){for(const m of chat.messages||[])if(m.memoryWait&&['offered','waiting','paused','running'].includes(m.memoryWait.state)){const e=this.offers.get(m.memoryWait.token);if(e?.state==='offered'&&Date.now()-e.created>15*60000)this.offers.delete(e.token);if(!this.offers.has(m.memoryWait.token))m.memoryWait={...m.memoryWait,state:'interrupted'};}return chat;}
 offer(chat,answer,request){
  if(this.closed||this.core.locked||!request)return;
  this.cancelChat(chat.id);
  for(const [token,e]of this.offers)if(e.state==='offered'&&Date.now()-e.created>15*60000)this.offers.delete(token);
  const row=this.core.modelManager?.catalog(request.settings).find(r=>r.installed&&r.file===request.settings.localModelPath);
  // A custom unverified file cannot promise an immutable model identity.
  if(!row||this.offers.size>=4)return;
  const input={settings:{...request.settings,processingMode:'local-only',allowCloud:false},messages:structuredClone(request.messages),instructions:request.instructions||'',omitted:request.omitted||0};
  const bytes=Buffer.byteLength(JSON.stringify(input));
  if(bytes>2*1024**2||[...this.offers.values()].reduce((n,e)=>n+e.bytes,bytes)>8*1024**2)return;
  localInput(input.settings,input.messages,input);
  const index=chat.messages.indexOf(answer),sources=[];
  for(const id of new Set(chat.messages.slice(0,index).flatMap(m=>m.fileIds||[]))){const f=this.core.file(id,chat);if(!f)return;sources.push([id,docs.sourceRevision(f)]);}
  const token=uuid(),entry={token,chatId:chat.id,index,time:answer.time,history:history(chat,index),instructions:signature(this.core.getInstructions(chat)),policy:policy(this.core),row,input,sources,bytes,created:Date.now(),state:'offered'};
  this.offers.set(token,entry);answer.memoryWait={token,state:'offered',tier:row.tier,model:row.name};
 }
 check(entry){
  if(this.closed||this.core.locked||entry.controller?.signal.aborted)throw fail('CANCELLED');
  const c=this.raw(entry.chatId),m=c?.messages[entry.index];
  if(!c||c.archived||c.messages.length!==entry.index+1||m?.role!=='assistant'||m.time!==entry.time||history(c,entry.index)!==entry.history||policy(this.core)!==entry.policy||signature(this.core.getInstructions(c))!==entry.instructions)throw fail('CHANGED');
  for(const [id,rev]of entry.sources){const f=this.core.file(id,c);if(!f||docs.sourceRevision(f)!==rev)throw fail('CHANGED');}
  const current=this.core.modelManager?.catalog(entry.input.settings).find(r=>r.tier===entry.row.tier);
  if(!current?.installed||current.file!==entry.row.file||current.id!==entry.row.id||current.bytes!==entry.row.bytes)throw fail('CHANGED');
  localInput(entry.input.settings,entry.input.messages,entry.input);return c;
 }
 update(entry,state){
  const c=this.raw(entry.chatId),m=c?.messages[entry.index];if(!m||m.time!==entry.time||m.memoryWait?.token!==entry.token)return;
  entry.state=state;m.memoryWait={...m.memoryWait,state};this.core.saveChat(c);this.core.emit({type:'jobs_changed'});
 }
 async queue({chatId,token}={}){
  this.core.assertUnlocked();if(this.core.locked)throw fail('LOCKED');
  const entry=this.offers.get(token);if(!entry||entry.chatId!==chatId||entry.state!=='offered'||Date.now()-entry.created>15*60000)throw fail('RECOVERY');
  if(this.core.requests.has(chatId))throw fail('BUSY');
  try{this.check(entry);}catch(error){this.offers.delete(token);throw error;}
  entry.controller=new AbortController();
  try{this.core.requests.set(chatId,entry.controller);this.update(entry,'waiting');
   const response={chat:structuredClone(this.core.chat(chatId)),omitted:entry.input.omitted};
   queueMicrotask(()=>this.run(entry).catch(()=>{}));return response;
  }catch(error){entry.controller.abort();if(this.core.requests.get(chatId)===entry.controller)this.core.requests.delete(chatId);this.offers.delete(token);this.core.resources.notify();throw error;}
 }
 async run(entry){
  const started=Date.now(),signal=entry.controller.signal;
  try{
   await this.core.resources.task('background',async()=>{
    this.check(entry);
    const result=await this.core.resources.withAI(async settings=>{
     this.check(entry);this.core.stability.assertModel();await this.core.modelManager.verifyTier(entry.row.tier,entry.input.settings,signal);this.check(entry);
     return this.core.router.local.generate(settings,entry.input.messages,{instructions:entry.input.instructions,signal});
    },{localSettings:entry.input.settings,waitForMemory:true,allowContextReduction:false});
    const c=this.check(entry),answer=c.messages[entry.index];
    const checked=evaluateLocal(result.text,references(entry.input.messages),!entry.input.omitted&&!result.incomplete);
    const text=(checked.reliability.score<70?'Local draft — not sufficiently verified.\n\n':'')+checked.text;
    const output=this.core.router.finish({...result,...checked,text,provider:'local',model:entry.row.name,reason:'local_memory_wait',usage:{inputTokens:0,outputTokens:0},routing:{mode:'pinned-local-wait',selectedTier:entry.row.tier,contextTokens:entry.input.settings.localContext,attempts:[{tier:entry.row.tier,phase:'answer',status:'completed'}],notice:'Resumed the original local request with the same brain and supplied input.'}},entry.input.settings,{signal});
    this.check(entry);answer.text=output.text;delete answer.error;answer.durationMs=Date.now()-started;answer.usage=output.usage;answer.incomplete=output.incomplete;answer.processing={provider:'local',model:output.model,reason:output.reason,reliability:output.reliability,meter:output.meter,routing:output.routing};answer.memoryWait={...answer.memoryWait,state:'completed'};this.core.saveChat(c);
   },{signal,update:state=>{if(this.offers.get(entry.token)===entry&&!this.core.locked)this.update(entry,state);}});
  }catch(error){if(!this.closed&&!this.core.locked){const c=this.raw(entry.chatId),m=c?.messages[entry.index];if(m?.memoryWait?.token===entry.token&&m.time===entry.time){m.error=safeError(error);m.memoryWait={...m.memoryWait,state:signal.aborted?'cancelled':'failed'};this.core.saveChat(c);}}}
  finally{if(this.core.requests.get(entry.chatId)===entry.controller)this.core.requests.delete(entry.chatId);this.offers.delete(entry.token);this.core.resources.notify();this.core.emit({type:'jobs_changed'});}
 }
 cancelChat(id){for(const [token,entry]of this.offers)if(entry.chatId===id){this.offers.delete(token);entry.controller?.abort();try{this.update(entry,'cancelled');}catch{/* Revocation and security teardown must not depend on a status write. */}}}
 cancelChangedSettings(){const current=policy(this.core);for(const entry of [...this.offers.values()])if(entry.policy!==current)this.cancelChat(entry.chatId);}
 cancelSource(id){for(const entry of [...this.offers.values()])if(entry.sources.some(([source])=>source===id))this.cancelChat(entry.chatId);}
 cancelAll(){for(const entry of [...this.offers.values()])this.cancelChat(entry.chatId);}
 close(){this.closed=true;this.cancelAll();this.offers.clear();}
}
module.exports={ChatMemoryWait};
