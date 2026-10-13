'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fail}=require('./security.cjs');
const {conversationId,conversations,selected,assertSendAllowed}=require('./messaging-policy.cjs');
const serial=id=>typeof id==='string'?id:id?._serialized||'';
function normalizeMessage(m,groupId,live=false){
 const sender=serial(m.author)||(m.fromMe?'':serial(m.from));
 return {id:serial(m.id),groupId,sender:sender.replace('@s.whatsapp.net','@c.us'),senderVerified:/^\d{6,16}@(c\.us|s\.whatsapp\.net|lid)$/.test(sender),incoming:!m.fromMe,text:typeof m.body==='string'?m.body.slice(0,12000):'',time:Number(m.timestamp)*1000||Date.now(),type:m.type||'unknown',hasMedia:m.hasMedia===true,live};
}
// Uses the account's message stream, never sidebar clicking or global input.
class WhatsAppAccount{
 constructor(core,{factory,now=Date.now}={}){this.core=core;this.factory=factory;this.now=now;this.client=null;this.state='off';this.pending=new Map();this.chatIds=[];this.cursor=0;this.lastDiscovery=0;this.dropped=0;this.epoch=0;this.onRead=null;}
 settings(){return this.core.store.get('messaging','settings')||{};}
 active(){const s=this.settings();return s.enabled&&!this.core.settings().workerPaused&&(!this.core.locked||s.allowWhileLocked);}
 readable(id){const s=this.settings();return this.active()&&s.adapter==='web'&&conversationId.test(id)&&(s.readAll!==false||conversations(s).some(c=>c.groupId===id));}
 status(){return {state:this.state,coverage:'account-message-stream',queued:this.pending.size,dropped:this.dropped};}
 readScopeChanged(){this.chatIds=[];this.cursor=0;this.lastDiscovery=0;}
 reset(){this.epoch++;this.pending.clear();this.chatIds=[];this.cursor=0;this.lastDiscovery=0;}
 async open(){
  await this.core.resources.preflight('messaging');
  if(this.client&&['disconnected','authentication-failed','connection-failed'].includes(this.state))await this.close();
  if(this.client){await this.client.pupPage?.bringToFront();return;}
  await this.core.resources.checkpoint(1.5*1024**3);
  if(this.factory)this.client=this.factory();else{
   const {Client,LocalAuth}=require('whatsapp-web.js');
   const executablePath=[process.env['PROGRAMFILES(X86)'],process.env.PROGRAMFILES,process.env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,'Microsoft/Edge/Application/msedge.exe')).find(p=>fs.existsSync(p));
   if(!executablePath)throw fail('MESSAGING');
   this.client=new Client({authStrategy:new LocalAuth({dataPath:path.join(this.core.root,'whatsapp-account-profile')}),puppeteer:{executablePath,headless:false},webVersionCache:{type:'none'},takeoverOnConflict:false});
  }
  const client=this.client;this.state='connecting';
  client.on('qr',()=>{this.state='scan-qr';});
  client.on('ready',()=>{if(this.client!==client)return;this.state='connected';this.readyAt=Math.floor(this.now()/1000)*1000;this.reset();});
  client.on('auth_failure',()=>{this.state='authentication-failed';this.reset();});
  client.on('disconnected',()=>{this.state='disconnected';this.reset();});
  client.on('message_create',m=>{if(this.client!==client)return;this.receive(m).catch(()=>{this.state='read-error';});});
  // QR pairing must not hold an IPC request open indefinitely.
  this.initializing=client.initialize().catch(()=>{if(this.client===client){this.state='connection-failed';this.reset();}});
 }
 async receive(m){
  const id=serial(m.fromMe?m.to:m.from);if(!this.readable(id)||!['connected','read-error','queue-overflow'].includes(this.state))return;
  const epoch=this.epoch,revision=this.settings().revision;
  const chat=await this.client.getChatById(id);
  if(epoch!==this.epoch||revision!==this.settings().revision||!this.readable(id)||serial(chat.id)!==id)return;
  const msg=normalizeMessage(m,id,Number(m.timestamp)*1000>=this.readyAt);
  if(!msg.id||msg.id.length>300)return;
  const shot={verified:!!chat.name,groupId:id,groupName:chat.name||'',messages:[msg],stream:true};
  this.onRead?.(shot);
  // Reading a chat never grants task execution. Only selected senders can queue work.
  const c=selected(this.settings(),{...shot,adapter:'web'});
  if((this.settings().disableAllWriting??this.settings().readOnly)||!msg.live||!msg.incoming||!c||c.mode==='read-only'||!msg.senderVerified||!c.senders.includes(msg.sender))return;
  if(this.pending.has(msg.id))return;
  if(this.pending.size>=1000){this.dropped++;this.state='queue-overflow';return;}
  this.pending.set(msg.id,shot);
 }
 async list(){if(!this.client||!['connected','read-error','queue-overflow'].includes(this.state))throw fail('MESSAGING');const chats=await this.client.getChats();return chats.filter(c=>conversationId.test(serial(c.id))).map(c=>({groupId:serial(c.id),groupName:c.name||serial(c.id)}));}
 async snapshot(id){
  if(!id||!conversationId.test(id)||!this.client)throw fail('MESSAGING');
  const chat=await this.client.getChatById(id);if(serial(chat.id)!==id||!chat.name)throw fail('MESSAGING');
  const messages=await chat.fetchMessages({limit:100});
  return {verified:true,groupId:id,groupName:chat.name,stream:true,messages:messages.map(m=>normalizeMessage(m,id))};
 }
 async poll(){
  if(!this.active())return [];
  if(!['connected','read-error','queue-overflow'].includes(this.state))throw fail('MESSAGING');
  const revision=this.settings().revision,epoch=this.epoch;
  if(this.pending.size){const [key,shot]=this.pending.entries().next().value;this.pending.delete(key);return this.readable(shot.groupId)?[shot]:[];}
  const s=this.settings();
  if(s.readAll!==false){if(!this.lastDiscovery||this.now()-this.lastDiscovery>60000){this.chatIds=(await this.list()).map(c=>c.groupId);this.lastDiscovery=this.now();}}
  else this.chatIds=conversations(s).map(c=>c.groupId);
  if(!this.chatIds.length)return [];
  const id=this.chatIds[this.cursor++%this.chatIds.length];if(!this.readable(id))return [];
  const shot=await this.snapshot(id);
  if(epoch!==this.epoch||revision!==this.settings().revision||!this.readable(id))return [];
  return [shot];
 }
 async send(target,body){
  await this.core.resources.preflight('messaging',target,body);
  if(!this.client||!['connected','read-error','queue-overflow'].includes(this.state))throw fail('MESSAGING');
  const chat=await this.client.getChatById(target.groupId);
  if(serial(chat.id)!==target.groupId||chat.name!==target.groupName)throw fail('MESSAGING');
  assertSendAllowed(this.core,target);
  // sendSeen:false avoids implicitly marking the conversation as read.
  const result=await this.client.sendMessage(target.groupId,body,{sendSeen:false,waitUntilMsgSent:true});
  if(!result?.fromMe||serial(result.to)!==target.groupId||result.body!==body||!serial(result.id))throw fail('MESSAGING');
  return {sent:true,messageId:serial(result.id)};
 }
 async readMedia(target,id){
  const s=this.settings(),c=selected(s,target),epoch=this.epoch,revision=s.revision;
  if(!this.active()||!s.allowTasks||!c||c.mode==='read-only'||s.disableAllWriting||!c.senders.includes(target.sender)||!this.client)throw fail('POLICY');
  const msg=await this.client.getMessageById(id);
  const normalized=normalizeMessage(msg,target.groupId);
  if(normalized.id!==id||serial(msg.from)!==target.groupId||normalized.sender!==target.sender||!normalized.incoming||!normalized.senderVerified||!msg.hasMedia)throw fail('MESSAGING');
  // Unknown size is not permission to allocate an unbounded download.
  if(!Number.isSafeInteger(msg._data?.size)||msg._data.size<1||msg._data.size>5*1024**2)throw fail('LIMIT');
  const media=await msg.downloadMedia();
  if(epoch!==this.epoch||revision!==this.settings().revision||!this.active())throw fail('POLICY');
  if(!media||typeof media.data!=='string'||media.data.length>Math.ceil(5*1024**2/3)*4||!['image/jpeg','image/png','application/pdf','text/plain'].includes(media.mimetype))throw fail('FILE');
  const extension={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf','text/plain':'txt'}[media.mimetype];
  return {data:media.data,mime:media.mimetype,name:'WhatsApp evidence.'+extension};
 }
 async close(){const client=this.client;this.client=null;this.reset();this.state='off';try{await client?.destroy();}catch{}}
}
module.exports={WhatsAppAccount,normalizeMessage};
