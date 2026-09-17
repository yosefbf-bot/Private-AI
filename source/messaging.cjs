'use strict';
const crypto=require('node:crypto');
const {fail,uuid,safeError,text}=require('./security.cjs');
const {conversationId,conversations,selected,writable}=require('./messaging-policy.cjs');
const DEFAULT={enabled:false,adapter:'web',groupId:'',groupName:'',senders:[],conversations:[],readAll:true,disableAllWriting:false,prefix:'AI:',allowTasks:false,notifyStarted:false,notifyProgress:false,notifyComplete:true,notifyFailure:true,sendSummaries:true,sendAttachments:false,forwardDesktop:false,allowWhileLocked:false,warningAccepted:false};
class MessagingBridge{
 constructor(core){this.core=core;this.adapters={};this.busy=false;this.state='off';this.baselined=new Set();this.verified=new Set();this.generation=0;this.timer=setInterval(()=>this.tick().catch(()=>{this.state='unavailable';}),5000);this.timer.unref?.();}
 settings(){const saved=this.core.store.get('messaging','settings')||{};return {...DEFAULT,...saved,disableAllWriting:saved.disableAllWriting??saved.readOnly??false};}
 code(){let s=this.core.store.get('secret','messaging');if(!s){s={code:crypto.randomBytes(16).toString('base64url')};this.core.store.put('secret','messaging',s);}return s.code;}
 save(input){this.core.assertUnlocked();if(input.readOnly!==undefined&&input.disableAllWriting===undefined)input={...input,disableAllWriting:input.readOnly};const s={...this.settings()};for(const k of Object.keys(DEFAULT))if(input[k]!==undefined)s[k]=input[k];
  for(const k of ['enabled','readAll','disableAllWriting','allowTasks','notifyStarted','notifyProgress','notifyComplete','notifyFailure','sendSummaries','sendAttachments','forwardDesktop','allowWhileLocked','warningAccepted'])if(typeof s[k]!=='boolean')throw fail('INVALID');
  if(!['web','windows'].includes(s.adapter)||!Array.isArray(s.senders)||s.senders.length>10||s.senders.some(v=>!/^\d{6,16}@(c\.us|s\.whatsapp\.net|lid)$/.test(v)))throw fail('INVALID');
  for(const [k,n] of [['groupId',100],['groupName',200],['prefix',30]])text(s[k],n);
  if(!Array.isArray(s.conversations)||s.conversations.length>50)throw fail('INVALID');
  const seen=new Set();
  for(const c of conversations(s)){
   if(!c||!conversationId.test(c.groupId)||typeof c.groupName!=='string'||!c.groupName.trim()||c.groupName.length>200||!['read-only','commands','read-write'].includes(c.mode)||typeof c.backgroundReplies!=='boolean'||!Array.isArray(c.senders)||c.senders.length>10||c.senders.some(v=>!/^\d{6,16}@(c\.us|s\.whatsapp\.net|lid)$/.test(v))||seen.has(c.groupId))throw fail('INVALID');
   seen.add(c.groupId);
   if(c.mode!=='read-only'&&!c.senders.length)throw fail('POLICY');
   const old=selected(this.settings(),{...c,adapter:s.adapter});
   if((c.mode==='read-write'||c.backgroundReplies)&&!this.verified.has(JSON.stringify([s.adapter,c.groupId,c.groupName]))&&!(old&&(old.mode==='read-write'||old.backgroundReplies)))throw fail('POLICY');
  }
  if(s.enabled&&(!s.warningAccepted||!s.prefix.trim()))throw fail('POLICY');
  // Document attachments stay in the approved report folder in this build.
  if(s.sendAttachments)throw fail('POLICY');
  const previous=this.settings(),policyChanged=Object.keys(DEFAULT).some(k=>k!=='readAll'&&JSON.stringify(s[k])!==JSON.stringify(previous[k]));
  if(policyChanged){this.generation++;if(this.activeChatId)this.core.stop(this.activeChatId);if(['groupId','adapter','enabled','disableAllWriting','conversations'].some(k=>JSON.stringify(s[k])!==JSON.stringify(previous[k])))this.baselined.clear();for(const a of Object.values(this.adapters))a.reset?.();}
  else if(s.readAll!==previous.readAll)for(const a of Object.values(this.adapters))a.readScopeChanged?.();
  delete s.readOnly;s.revision=policyChanged?uuid():previous.revision||uuid();
  this.core.store.put('messaging','settings',s);this.state=s.enabled?'waiting':'off';return s;
 }
 status(){return {settings:this.settings(),state:this.state,busy:this.busy,adapters:Object.keys(this.adapters),connection:this.adapters[this.settings().adapter]?.status?.()||{coverage:'open-conversation-only'}};}
 async pair(adapter,groupId){this.core.assertUnlocked();const a=this.adapters[adapter];if(!a)throw fail('MESSAGING');const shot=await a.snapshot(groupId);if(!shot.verified||!conversationId.test(shot.groupId)||!shot.groupName)throw fail('MESSAGING');this.verified.add(JSON.stringify([adapter,shot.groupId,shot.groupName]));return {groupId:shot.groupId,groupName:shot.groupName,senders:[...new Set(shot.messages.filter(m=>m.senderVerified).map(m=>m.sender))]};}
 async tick(){const s=this.settings(),generation=this.generation;if(!s.enabled||this.busy||this.core.settings().workerPaused)return;if(this.core.locked&&!s.allowWhileLocked){this.state='paused-locked';return;}const a=this.adapters[s.adapter];if(!a){this.state='unavailable';return;}this.busy=true;
  try{await this.core.runMessagingBackground(async()=>{
   a.onRead=shot=>this.observe(shot);
   const shots=a.poll?await a.poll(s):[await a.snapshot()];
   for(const shot of shots){
   if(generation!==this.generation||!this.settings().enabled)return;
   this.observe(shot);
   const c=selected(s,{...shot,adapter:s.adapter});if(!shot.verified||!c){this.state=shot.verified&&s.readAll?'reading':'conversation-not-verified';continue;}const target={...s,...c,generation};this.state=s.disableAllWriting?'writing-disabled':c.mode==='read-only'?'read-only':'connected';
   // Baseline existing messages on first connection; never execute chat history.
   const baseline=s.adapter+'|'+c.groupId;if((!shot.stream&&!this.baselined.has(baseline))||s.disableAllWriting||c.mode==='read-only'){for(const m of shot.messages)this.claim(target,m);this.baselined.add(baseline);continue;}
   for(const m of shot.messages.slice(-50)){if((shot.stream&&!m.live)||!m.incoming||!m.senderVerified||!c.senders.includes(m.sender)||typeof m.text!=='string'||(c.mode!=='read-write'&&!m.text.startsWith(s.prefix+' '+this.code()+' ')))continue;if(!this.claim(target,m))continue;
    const prefix=s.prefix+' '+this.code()+' ';const command=(m.text.startsWith(prefix)?m.text.slice(prefix.length):m.text).trim();if(!command||command.length>4000)continue;
    if(!s.allowTasks&&!/^\/(?:status|help)$/i.test(command))continue;
    const taskId=uuid();let response;
    try{if(generation!==this.generation||!this.settings().enabled)return;if(s.notifyStarted)await this.send(a,target,uuid(),'Task started.');if(generation!==this.generation)return;const chat=this.sessionChat(target,m.sender,command==='/new');this.activeChatId=chat.id;const progress=this.progress(a,target,taskId,chat.id);try{if(command==='/new')response='Started a new AI conversation. Send your next question here.';else{const result=await this.core.send({chatId:chat.id,prompt:command});const last=result.chat.messages.at(-1);if(last.error)throw Object.assign(new Error(),{code:last.error.code});response=s.sendSummaries?last.text:'Task completed. Open Private AI or the report folder to review the result.';}}finally{await progress.close();this.activeChatId=null;}
     if(s.notifyComplete)await this.sendResponse(a,target,taskId,response);
    }catch(e){if(s.notifyFailure)await this.send(a,target,taskId,'Task did not complete: '+safeError(e).message);}
    break;
   }
   }
  });}finally{this.busy=false;}
 }
 async list(adapter){this.core.assertUnlocked();const a=this.adapters[adapter];if(!a?.list)throw fail('MESSAGING');return a.list();}
 sessionChat(target,sender,fresh=false){
  // A group member cannot inherit another member's private model context.
  const id=crypto.createHmac('sha256',this.code()).update(target.adapter+'|'+target.groupId+'|'+sender).digest('hex');
  const saved=this.core.store.get('messagingSession',id);let chat;
  if(!fresh&&saved?.chatId)try{chat=this.core.chat(saved.chatId);if(chat.archived)chat=null;}catch{}
  if(!chat){chat=this.core.createChat();chat.title='WhatsApp: '+target.groupName;this.core.saveChat(chat);}
  this.core.store.put('messagingSession',id,{chatId:chat.id},{expires:this.core.settings().retentionDays?Date.now()+this.core.settings().retentionDays*86400000:null});return chat;
 }
 progress(adapter,target,taskId,chatId,intervalMs=60000){
  let pending=Promise.resolve(),sending=false,closed=false;const started=Date.now();
  const timer=target.notifyProgress?setInterval(()=>{if(closed||sending)return;sending=true;pending=this.send(adapter,target,uuid(),'Task '+taskId.slice(0,8)+' is still running ('+Math.max(1,Math.floor((Date.now()-started)/1000))+' seconds).').catch(()=>{this.core.stop(chatId);}).finally(()=>{sending=false;});},intervalMs):null;timer?.unref?.();
  return {close:async()=>{closed=true;clearInterval(timer);await pending;}};
 }
 async sendResponse(adapter,target,id,body){
  const chunks=Array.from(String(body||'Task completed.').matchAll(/[\s\S]{1,3500}/gu),m=>m[0]);
  for(let i=0;i<chunks.length;i++){const result=await this.send(adapter,target,i?uuid():id,(chunks.length>1?'['+(i+1)+'/'+chunks.length+']\n':'')+chunks[i]);if(result?.blocked||result?.deferred)break;}
 }
 observe(shot){
  const s=this.settings();if(!s.enabled||this.core.settings().workerPaused||(this.core.locked&&!s.allowWhileLocked)||!shot.verified||!conversationId.test(shot.groupId)||(!s.readAll&&!selected(s,{...shot,adapter:s.adapter})))return;
  for(const m of shot.messages){if(typeof m.id!=='string'||m.id.length>300||typeof m.text!=='string')continue;
   const id=crypto.createHmac('sha256',this.code()).update(s.adapter+'|'+shot.groupId+'|'+m.id).digest('hex');
   const row={...m,id,adapter:s.adapter,groupId:shot.groupId,groupName:shot.groupName,text:m.text.slice(0,12000),observed:Date.now()};
   const time=Number.isFinite(m.time)?m.time:Date.now();if(this.core.settings().retentionDays&&time<Date.now()-this.core.settings().retentionDays*86400000)continue;
   if(s.readAll||selected(s,{...shot,adapter:s.adapter}))this.core.store.put('messageIn',id,row,{updated:time,expires:this.core.settings().retentionDays?time+this.core.settings().retentionDays*86400000:null});
  }
 }
 readings(){this.core.assertUnlocked();return this.core.store.recent('messageIn',200);}
 clearReadings(){this.core.assertUnlocked();this.core.store.deleteKind('messageIn');}
 claim(s,m){if(typeof m.id!=='string'||m.id.length>300)return false;const id=crypto.createHmac('sha256',this.code()).update(s.adapter+'|'+s.groupId+'|'+m.id).digest('hex');return this.core.store.claim('wa-'+id);}
 async send(adapter,s,id,body){const current=this.settings();if(!current.enabled)throw fail('MESSAGING');if(!writable(current,s)||(s.generation!==undefined&&s.generation!==this.generation))return {blocked:true};
  const row={id,time:Date.now(),status:'sending',groupId:s.groupId,body:'Private AI ['+id.slice(0,8)+']\n'+body};this.core.store.put('messageOut',id,row,{expires:this.core.settings().retentionDays?Date.now()+this.core.settings().retentionDays*86400000:null});
  try{await adapter.send(s,row.body);row.status='sent';}catch(e){if(e.code==='POLICY'){row.status='blocked';this.state='permissions-changed';return {blocked:true};}if(['INTERFERENCE','DEFERRED'].includes(e.code)){row.status='deferred';this.state='paused-interference';return {deferred:true};}row.status='delivery-uncertain';this.core.store.put('messaging','settings',{...this.settings(),enabled:false});this.state='delivery-uncertain';throw fail('MESSAGING');}finally{this.core.store.put('messageOut',id,row,{expires:this.core.settings().retentionDays?Date.now()+this.core.settings().retentionDays*86400000:null});}
 }
 async desktopResult(text,override='default'){const s=this.settings();if(!s.enabled||override==='never'||(override!=='send'&&!s.forwardDesktop)||!s.notifyComplete)return;const a=this.adapters[s.adapter];if(!a)return;try{await this.send(a,s,uuid(),s.sendSummaries?text.slice(0,12000):'Your desktop task is complete. Open Private AI to review it.');}catch{}}
 close(){clearInterval(this.timer);for(const a of Object.values(this.adapters))a.close?.();}
}
module.exports={MessagingBridge,DEFAULT};
