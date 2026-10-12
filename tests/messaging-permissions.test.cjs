'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {Resources}=require('../source/resources.cjs');
const {WhatsAppWeb,readWhatsApp}=require('../source/whatsapp-web.cjs');
function setup(){const c={groupId:'123456789@g.us',groupName:'Approved',senders:['15550001111@c.us'],mode:'read-write',backgroundReplies:false};let s={enabled:true,adapter:'web',warningAccepted:true,readOnly:false,allowWhileLocked:false,conversations:[c]};const core={store:{get:()=>s},settings:()=>({}),locked:false};core.resources=new Resources(core,{memory:()=>8*1024**3});core.resources.approve=()=>assert.fail('no unattended prompt');return {core,c,target:{adapter:'web',...c},s};}
test('verified destinations and historical background grants still require foreground approval',async()=>{
 const {core,target,s,c}=setup();
 for(const locked of [false,true])for(const legacy of [false,true]){
  core.locked=locked;s.allowWhileLocked=true;c.backgroundReplies=legacy;
  await assert.rejects(core.resources.task('background',()=>core.resources.preflight('messaging',target,'reply')),{code:'INTERFERENCE'});
 }
 core.locked=false;let prompts=0;core.resources.approve=async detail=>{prompts++;assert.match(detail,/Approved/);assert.match(detail,/exact reply/);return true;};
 await core.resources.preflight('messaging',target,'exact reply');assert.equal(prompts,1);
 s.readOnly=true;await assert.rejects(core.resources.preflight('messaging',target,'exact reply'),{code:'POLICY'});assert.equal(prompts,1);
});
test('actual WhatsApp send waits for exact-message approval and never sends in background',async()=>{
 const {core,target}=setup();const wa=new WhatsAppWeb(core,{chromium:{}});let filled='',clicked=false;
 wa.snapshot=async()=>({verified:true,...target,messages:clicked?[{id:'new',incoming:false,text:'reply'}]:[]});
 wa.page={locator:()=>({count:async()=>1,innerText:async()=>'',fill:async body=>{filled=body;}}),evaluate:async()=>{clicked=true;return true;}};
 await assert.rejects(core.resources.task('background',()=>wa.send(target,'reply')),{code:'INTERFERENCE'});assert.equal(clicked,false);
 core.resources.approve=async()=>false;await assert.rejects(wa.send(target,'reply'),{code:'DEFERRED'});assert.equal(filled,'');
 core.resources.approve=async detail=>{assert.match(detail,/reply/);return true;};await wa.send(target,'reply');assert.equal(filled,'reply');assert.equal(clicked,true);
});
test('revocation between approval and composer fill stops delivery',async()=>{
 const {core,target,s}=setup();core.resources.approve=async()=>true;const wa=new WhatsAppWeb(core,{chromium:{}});
 wa.snapshot=async()=>({verified:true,...target,messages:[]});wa.page={locator:()=>({count:async()=>1,innerText:async()=>{s.readOnly=true;return '';},fill:()=>assert.fail('filled after revocation')}),evaluate:()=>assert.fail('clicked after revocation')};
 await assert.rejects(wa.send(target,'reply'),{code:'POLICY'});
});
test('direct and group DOM identities are verified without trusting display names',()=>{function read(ids){const nodes=ids.map(id=>({getAttribute:()=>id,querySelector:()=>({innerText:'hello'})}));const main={querySelector:()=>({getAttribute:()=> 'Chat'}),querySelectorAll:()=>nodes};return vm.runInNewContext('('+readWhatsApp.toString()+')()',{document:{querySelector:()=>main}});}const direct=read(['false_15550001111@c.us_ABC']);assert.equal(direct.verified,true);assert.equal(direct.messages[0].sender,'15550001111@c.us');assert.equal(direct.messages[0].senderVerified,true);const group=read(['false_123456789@g.us_ABC_15550001111@c.us']);assert.equal(group.messages[0].sender,'15550001111@c.us');assert.equal(read(['display-only']).verified,false);assert.equal(read(['false_15550001111@c.us_ABC','false_15550002222@c.us_DEF']).verified,false);});
