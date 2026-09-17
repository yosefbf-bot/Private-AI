const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs'),{createTools}=require('../source/local-tools.cjs');
test('requested diagnostics use local configuration without provider calls or private values',async t=>{
 const {core,calls}=fixture(t);core.localTools=createTools(core);const chat=core.createChat();
 const before=JSON.stringify(core.settings());const r=await core.send({chatId:chat.id,prompt:'/diagnose'});const answer=r.chat.messages.at(-1);
 assert.equal(answer.error,undefined);assert.match(answer.text,/API key saved: yes/);assert.match(answer.text,/validity not tested/);assert.doesNotMatch(answer.text,/sk-synthetic|ShareSync Reports/);assert.equal(calls.length,0);assert.equal(JSON.stringify(core.settings()),before);
});
test('plain app troubleshooting explains write override without silently changing it',async t=>{
 const {core,calls}=fixture(t);core.localTools=createTools(core);core.store.put('messaging','settings',{enabled:true,disableAllWriting:true});const chat=core.createChat();const r=await core.send({chatId:chat.id,prompt:'troubleshoot Private AI'});
 assert.match(r.chat.messages.at(-1).text,/Replies are blocked/);assert.equal(core.store.get('messaging','settings').disableAllWriting,true);assert.equal(calls.length,0);
});
