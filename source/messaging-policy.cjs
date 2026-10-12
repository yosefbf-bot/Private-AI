'use strict';
const {fail}=require('./security.cjs');
const conversationId=/^\d+(?:-\d+)?@g\.us$|^\d{6,16}@(c\.us|s\.whatsapp\.net|lid)$/;
function conversations(s){return s.conversations?.length?s.conversations:(s.groupId?[{groupId:s.groupId,groupName:s.groupName,senders:s.senders,mode:'commands',backgroundReplies:false}]:[]);}
function selected(s,target){return s.adapter===target.adapter&&conversations(s).find(c=>c.groupId===target.groupId&&c.groupName===target.groupName);}
function writable(s,target){const c=selected(s,target);return !!(s.enabled&&!(s.disableAllWriting??s.readOnly??false)&&c&&c.mode!=='read-only');}
function assertWritable(core,target){const s=core.store.get('messaging','settings')||{};if(!writable(s,target)||(target.revision!==undefined&&target.revision!==s.revision))throw fail('POLICY');return selected(s,target);}
function assertSendAllowed(core,target){assertWritable(core,target);if(core.resources.isBackground()||core.locked)throw fail('INTERFERENCE');}
// Historical grants never authorize unattended delivery under the current policy.
function backgroundReplyAllowed(){return false;}
module.exports={conversationId,conversations,selected,writable,assertWritable,assertSendAllowed,backgroundReplyAllowed};
