'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const policy = require('../source/provider-policy.cjs');
const { OpenAIClient } = require('../source/api.cjs');
const key = prefix => prefix + 'synthetic-' + 'X'.repeat(20);
test('credentials remain isolated for DeepSeek, Groq, Anthropic, Gemini, custom, and deletion', t => {
  const {core} = fixture(t); const original = core.key('openai');
  for (const [id,prefix] of [['deepseek','sk-'],['groq','gsk_'],['anthropic','sk-ant-'],['gemini','AIza'],['custom','sk-']]) {
    core.saveKey(key(prefix), id); assert.equal(core.key('openai'), original);
  }
  core.deleteKey('deepseek'); assert.equal(core.key('deepseek'), null);
  assert.equal(core.key('groq'), key('gsk_')); assert.equal(core.key('openai'), original);
  core.deleteKey('openai'); assert.equal(core.key('gemini'), key('AIza'));
});
test('legacy approval is invalid; approval binds provider, endpoint, organization, model and credential', t => {
  const {core} = fixture(t); assert.equal(core.settings().approved,true);
  core.store.put('settings','main',{...core.settings(),providerApproval:undefined,approved:true});
  assert.equal(core.settings().approved,false);
  for (const patch of [{provider:'deepseek'},{provider:'openai'},{org:'other-org'},{projectId:'other-project'},{model:'different-model'}]) {
    core.saveSettings({approved:true}); core.saveSettings({...patch,approved:true});
    assert.equal(core.settings().approved,false);
  }
  core.saveSettings({approved:true}); core.saveKey(key('sk-'),'openai'); assert.equal(core.settings().approved,false);
  core.saveSettings({approved:true}); core.deleteKey('openai'); assert.equal(core.settings().approved,false);
  const s={provider:'custom',customEndpoint:'https://one.example/v1',model:'m'};
  assert.notEqual(policy.fingerprint(s,'test'),policy.fingerprint({...s,customEndpoint:'https://two.example/v1'},'test'));
});
test('HIPAA transmission fails closed at the provider boundary, including realtime', async () => {
  let calls=0; const c=new OpenAIClient(async()=>{calls++;throw Error('network must not run');});
  for(const provider of ['openai','deepseek','gemini','custom']) {
    await assert.rejects(c.generate(key('sk-'),{provider,hipaa:true,approved:true,model:'m'},[]),{code:'POLICY'});
  }
  await assert.rejects(c.createRealtimeSession(key('sk-'),{hipaa:true,approved:true}),{code:'POLICY'});
  await assert.rejects(c.models(null,{provider:'ollama',ollamaEndpoint:'http://127.0.0.1.attacker.example'}),{code:'POLICY'});
  assert.equal(calls,0);
});
test('API ignores key prefixes when selecting the explicitly configured provider', async () => {
  const calls=[];const c=new OpenAIClient(async(url,options)=>{calls.push(url);return new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n');});
  await c.generate(key('sk-'),{provider:'deepseek',model:'deepseek-chat',hipaa:false},[]);
  assert.equal(calls[0],'https://api.deepseek.com/chat/completions');
});
test('production initializes without synthetic clinical records',t=>{
 const {core}=fixture(t);assert.equal(core.store.count('snf_resident'),0);assert.equal(core.store.count('snf_med_order'),0);
});
