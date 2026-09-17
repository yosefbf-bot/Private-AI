'use strict';
const path=require('node:path');const {fail}=require('./security.cjs');
// Executed only inside the explicitly opened WhatsApp Web profile.
function readWhatsApp(){
 const main=document.querySelector('#main');if(!main)return {verified:false,messages:[]};
 const header=main.querySelector('header span[title]');const groupName=header?.getAttribute('title')||'';const messages=[];
 for(const node of main.querySelectorAll('[data-id]')){
  const id=node.getAttribute('data-id')||'',match=id.match(/^(true|false)_(\d+(?:-\d+)?@g\.us|\d{6,16}@(c\.us|s\.whatsapp\.net|lid))_([^_]+)(?:_(\d+@(c\.us|s\.whatsapp\.net|lid)))?$/);
  if(!match)continue;const bodyNode=node.querySelector('.selectable-text');const body=bodyNode?.innerText||bodyNode?.textContent||'';if(!body)continue;
  const sender=match[5]||(!match[2].endsWith('@g.us')&&match[1]==='false'?match[2]:'');
  messages.push({id,groupId:match[2],sender:sender.replace('@s.whatsapp.net','@c.us'),senderVerified:!!sender,incoming:match[1]==='false',text:body});
 }
 const groups=[...new Set(messages.map(m=>m.groupId))];return {verified:groups.length===1&&!!groupName,groupId:groups.length===1?groups[0]:'',groupName,messages:messages.slice(-100)};
}
class WhatsAppWeb{
 constructor(core,{chromium=require('playwright-core').chromium}={}){this.core=core;this.chromium=chromium;this.context=null;this.page=null;}
 async open(){
  if(this.opening)throw fail('BUSY');this.opening=true;
  try{if(!this.account)this.account=new (require('./whatsapp-account.cjs').WhatsAppAccount)(this.core);this.account.onRead=shot=>this.onRead?.(shot);await this.account.open();}finally{this.opening=false;}
 }
 status(){return this.account?.status()||{state:'off',coverage:'account-message-stream'};}
 readScopeChanged(){this.account?.readScopeChanged();}
 reset(){this.account?.reset();}
 async list(){if(!this.account)throw fail('MESSAGING');return this.account.list();}
 async poll(){if(!this.account)throw fail('MESSAGING');return this.account.poll();}
 async snapshot(groupId){if(this.account)return this.account.snapshot(groupId);if(!this.page||this.page.isClosed()||new URL(this.page.url()).origin!=='https://web.whatsapp.com')throw fail('MESSAGING');return this.page.evaluate(readWhatsApp);}
 async send(settings,body){
  if(this.account)return this.account.send(settings,body);
  await this.core.resources.preflight('messaging',settings.groupId?settings:undefined);
  const shot=await this.snapshot();if(!shot.verified||shot.groupId!==settings.groupId||shot.groupName!==settings.groupName)throw fail('MESSAGING');
  const composer=this.page.locator(`#main:has([data-id^="false_${settings.groupId}_"], [data-id^="true_${settings.groupId}_"]) footer [contenteditable="true"][role="textbox"]`);if(await composer.count()!==1||await composer.innerText())throw fail('MESSAGING');
  require('./messaging-policy.cjs').assertSendAllowed(this.core,settings);
  const latest=await this.snapshot();if(!latest.verified||latest.groupId!==settings.groupId||latest.groupName!==settings.groupName)throw fail('MESSAGING');
  require('./messaging-policy.cjs').assertSendAllowed(this.core,settings);
  await composer.fill(body);
  // Verify and click in one browser task, with no await between the identity
  // check and the click. A changed header/list cannot receive the response.
  require('./messaging-policy.cjs').assertSendAllowed(this.core,settings);
  const sent=await this.page.evaluate(({groupId,groupName,body})=>{
   const main=document.querySelector('#main');if(!main||main.querySelector('header span[title]')?.getAttribute('title')!==groupName)return false;
   const ids=[...main.querySelectorAll('[data-id]')].map(e=>e.getAttribute('data-id')).filter(id=>/^(true|false)_.*@(g\.us|c\.us|s\.whatsapp\.net|lid)_/.test(id));if(!ids.length||!ids.every(id=>id.startsWith('false_'+groupId+'_')||id.startsWith('true_'+groupId+'_')))return false;
   const box=main.querySelector('footer [contenteditable="true"][role="textbox"]');if(!box||box.innerText.replace(/\r/g,'')!==body.replace(/\r/g,''))return false;
   const icon=main.querySelector('footer [data-icon="send"]'),button=icon?.closest('button');if(!button)return false;button.click();return true;
  },{groupId:settings.groupId,groupName:settings.groupName,body});
  if(!sent)throw fail('MESSAGING');
  const before=new Set(shot.messages.map(m=>m.id));const deadline=Date.now()+10000;
  while(Date.now()<deadline){const after=await this.snapshot();if(!after.verified||after.groupId!==settings.groupId||after.groupName!==settings.groupName)throw fail('MESSAGING');if(after.messages.some(m=>!m.incoming&&!before.has(m.id)&&m.text===body))return {sent:true};await new Promise(r=>setTimeout(r,300));}
  throw fail('MESSAGING');
 }
 async close(){await this.account?.close();this.account=null;try{await this.context?.close();}catch{}this.context=null;this.page=null;this.core.resources.releaseBrowser(this);}
}
module.exports={WhatsAppWeb,readWhatsApp};
