'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const policy = require('../source/provider-policy.cjs');
const { OpenAIClient } = require('../source/api.cjs');
const key = prefix => prefix + 'synthetic-' + 'X'.repeat(20);
const approve = core => core.saveSettings({approved:true,approvalFingerprint:policy.fingerprint(core.settings(),core.key())});
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
    approve(core); core.saveSettings({...patch,approved:true});
    assert.equal(core.settings().approved,false);
  }
  approve(core); core.saveKey(key('sk-'),'openai'); assert.equal(core.settings().approved,false);
  approve(core); core.deleteKey('openai'); assert.equal(core.settings().approved,false);
  const s={provider:'custom',customEndpoint:'https://one.example/v1',model:'m'};
  assert.notEqual(policy.fingerprint(s,'test'),policy.fingerprint({...s,customEndpoint:'https://two.example/v1'},'test'));
});

test('invalid provider deletion leaves every encrypted secret, settings and audit entry unchanged', t => {
  const {core} = fixture(t);
  core.store.put('secret','applock',{synthetic:'app-lock fixture'});
  core.saveKey(key('gsk_'),'groq');
  const secrets = core.store.list('secret'), settings = core.settings(), audit = core.store.list('audit');
  for (const provider of ['applock','constructor','__proto__','toString','unrecognized']) {
    assert.throws(() => core.deleteKey(provider), {code:'INVALID'});
    assert.deepEqual(core.store.list('secret'), secrets);
    assert.deepEqual(core.settings(), settings);
    assert.deepEqual(core.store.list('audit'), audit);
  }
});

test('credential replacement cannot reuse a checked boolean or the previous configuration approval', t => {
  const {core} = fixture(t), previous = core.summary().providerApprovalFingerprint;
  assert.equal(core.settings().approved,true);
  core.saveKey(key('sk-'),'openai');
  core.saveSettings({approved:true}); // A stale form save is not an approval action.
  assert.equal(core.settings().approved,false);
  assert.throws(() => core.canSend(true,true), {code:'SETUP'});
  assert.throws(() => core.saveSettings({approved:true,approvalFingerprint:previous}), {code:'PROVIDER_CHANGED'});
  approve(core);
  assert.equal(core.settings().approved,true);
  assert.doesNotThrow(() => core.canSend(true,true));
  core.saveSettings({model:'another-saved-model'});
  assert.equal(core.settings().approved,false);
});

test('protected Ollama refuses cloud names before inference or metadata requests', async () => {
  let calls = 0;
  const client = new OpenAIClient(async () => { calls++; throw Error('must not run'); });
  for (const mode of [{hipaa:true},{processingMode:'local-only'},{allowCloud:false}]) {
    for (const model of ['synthetic-cloud','synthetic:cloud','synthetic-CLOUD','synthetic-cloud:latest']) {
      await assert.rejects(client.generate(null,{provider:'ollama',model,...mode},[]),{code:'POLICY'});
    }
  }
  assert.equal(calls,0);
});

test('protected Ollama checks selected tags and show metadata without a daemon-wide requirement', async () => {
  for (const mode of [{hipaa:true},{processingMode:'local-only'},{allowCloud:false}]) {
    for (const source of ['tags','show']) {
      for (const indicator of ['remote_host','remote_model']) {
        let inference = 0;
        const client = new OpenAIClient(async url => {
          if (url.endsWith('/api/tags')) return Response.json({models:[{name:'ordinary:latest',...(source==='tags'?{[indicator]:'synthetic-remote'}:{})},{name:'unselected-cloud'}]});
          if (url.endsWith('/api/show')) return Response.json(source==='show'?{[indicator]:'synthetic-remote'}:{details:{family:'synthetic-local'}});
          inference++; return new Response('data: {"choices":[{"delta":{"content":"local output"},"finish_reason":"stop"}]}\n\n');
        });
        await assert.rejects(client.generate(null,{provider:'ollama',model:'ordinary',...mode},[]),{code:'POLICY'});
        assert.equal(inference,0,source+' '+indicator);
      }
    }
  }
  const calls=[];
  const local = new OpenAIClient(async url => {
    calls.push(url);
    if (url.endsWith('/api/tags')) return Response.json({models:[{name:'ordinary:latest'},{name:'unselected-cloud',remote_host:'synthetic-remote'}]});
    if (url.endsWith('/api/show')) return Response.json({details:{family:'synthetic-local'}});
    return new Response('data: {"choices":[{"delta":{"content":"local output"},"finish_reason":"stop"}]}\n\n');
  });
  const answer=await local.generate(null,{provider:'ollama',model:'ordinary',hipaa:true},[]);
  assert.equal(answer.text,'local output');assert.equal(answer.policyNotice,null);
  assert.ok(calls.every(url => url.startsWith('http://127.0.0.1:11434/')));
  assert.deepEqual(await local.models(null,{provider:'ollama',hipaa:true}),['ordinary:latest']);
});

test('unreadable Ollama metadata preserves ordinary local use and reports its verification limit', async () => {
  for (const unavailable of ['error','status','malformed']) {
    const client = new OpenAIClient(async url => {
      if (url.includes('/api/')) {
        if (unavailable === 'error') throw Error('unavailable metadata');
        return unavailable === 'status' ? new Response('',{status:404}) : new Response('{broken');
      }
      return new Response('data: {"choices":[{"delta":{"content":"local output"},"finish_reason":"stop"}]}\n\n');
    });
    const answer=await client.generate(null,{provider:'ollama',model:'ordinary:1b',hipaa:true},[]);
    assert.equal(answer.text,'local output');assert.match(answer.policyNotice,/metadata.*unverified/);
    await assert.rejects(client.generate(null,{provider:'ollama',model:'synthetic:cloud',hipaa:true},[]),{code:'POLICY'});
  }
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

test('cloud model inventory is fetched with the selected provider and unavailable inventory fails visibly',async()=>{
 for(const provider of ['openai','gemini','anthropic','groq','deepseek','custom']){
  const calls=[];const c=new OpenAIClient(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({data:[{id:'synthetic-available-model'}]}));});
  assert.deepEqual(await c.models(key('sk-'),{provider,hipaa:false}),['synthetic-available-model']);
  assert.equal(calls[0].url,require('../source/providers.cjs').endpointFor(provider,{})+'/models');
  assert.equal(calls[0].options.redirect,'error');
 }
 const c=new OpenAIClient(async()=>new Response('{}',{status:404}));
 await assert.rejects(c.models(key('sk-'),{provider:'gemini',hipaa:false}),{code:'MODEL'});
});
