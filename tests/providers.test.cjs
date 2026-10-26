const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const { PROVIDERS, validateKeyForProvider } = require('../source/providers.cjs');
const { generateLocalResponse } = require('../source/local-assistant.cjs');

test('Providers metadata defines supported providers and prefixes', () => {
  assert.ok(PROVIDERS.local);
  assert.ok(PROVIDERS.gemini);
  assert.ok(PROVIDERS.anthropic);
  assert.ok(PROVIDERS.openai);
  assert.ok(PROVIDERS.deepseek);
  assert.ok(PROVIDERS.groq);
  assert.ok(PROVIDERS.custom);
  assert.ok(PROVIDERS.ollama);

  assert.equal(PROVIDERS.local.requiresKey, false);
  assert.equal(PROVIDERS.ollama.requiresKey, false);
  assert.equal(PROVIDERS.gemini.requiresKey, true);
});

test('validateKeyForProvider validates service-specific API key formats', () => {
  assert.doesNotThrow(() => validateKeyForProvider('', 'local'));
  assert.doesNotThrow(() => validateKeyForProvider('', 'ollama'));
  assert.doesNotThrow(() => validateKeyForProvider(('AIza' + 'synthetic'.repeat(4)), 'gemini'));
  assert.throws(() => validateKeyForProvider('bad-key', 'gemini'));

  assert.doesNotThrow(() => validateKeyForProvider('sk-ant-api03-1234567890abcdef', 'anthropic'));
  assert.throws(() => validateKeyForProvider('sk-other', 'anthropic'));

  assert.doesNotThrow(() => validateKeyForProvider('gsk_1234567890abcdefghijklmnopqrstuv', 'groq'));
  assert.throws(() => validateKeyForProvider('bad', 'groq'));

  assert.doesNotThrow(() => validateKeyForProvider('sk-1234567890abcdef', 'openai'));
  assert.throws(() => validateKeyForProvider('bad', 'openai'));
});

test('Local Assistant generates accurate responses without an API key', async () => {
  const clinical = await generateLocalResponse('What is standard treatment for hypertension?');
  assert.ok(clinical.text.includes('Hypertension'));
  assert.equal(clinical.provider, 'local');

  const calc = await generateLocalResponse('Calculate 45 * 12');
  assert.ok(calc.text.includes('540'));

  const general = await generateLocalResponse('Provide a briefing on data privacy principles');
  assert.ok(general.text.length > 50);
});

test('Core operates with Local Assistant when no API key is set', async (t) => {
  const { core } = fixture(t);
  core.deleteKey('openai');
  core.saveSettings({ provider: 'local', hipaa: true, approved: true });

  const c = core.createChat();
  const r = await core.send({ chatId: c.id, prompt: 'What is diabetic ketoacidosis?' });
  assert.equal(r.chat.messages.at(-1).error, undefined);
  assert.ok(r.chat.messages.at(-1).text.includes('Diabetic Ketoacidosis') || r.chat.messages.at(-1).text.includes('DKA'));

  const testConn = await core.testConnection('local');
  assert.equal(testConn.ok, true);

  const models = await core.models('local');
  assert.ok(models.includes('local-clinical-engine'));
});

test('Core saves and maintains keys per provider independently', async (t) => {
  const { core } = fixture(t);
  core.saveKey(('AIza' + 'synthetic'.repeat(4)), 'gemini');
  assert.equal(core.key('gemini'), ('AIza' + 'synthetic'.repeat(4)));

  core.saveKey('gsk_1234567890123456789012345678901', 'groq');
  assert.equal(core.key('groq'), 'gsk_1234567890123456789012345678901');

  const summary = core.summary();
  assert.equal(summary.savedProviders.gemini, true);
  assert.equal(summary.savedProviders.groq, true);

  core.deleteKey('gemini');
  assert.equal(core.key('gemini'), null);
  assert.equal(core.key('groq'), 'gsk_1234567890123456789012345678901');
});

test('Ollama provider handles offline daemon gracefully without crashing', async (t) => {
  const { core } = fixture(t);
  core.saveSettings({ provider: 'ollama', hipaa: true, approved: true });

  const testConn = await core.testConnection('ollama');
  assert.ok(typeof testConn.note === 'string');
  assert.equal(testConn.ok, false); // Daemon not running in container test, correctly reported

  const { OpenAIClient } = require('../source/api.cjs');
  const client = new OpenAIClient(async () => { throw new Error('connection refused'); });
  await assert.rejects(client.models(null, { provider: 'ollama' }), {code:'LOCAL_UNAVAILABLE'}); // Do not claim unavailable models are installed.
});

test('keyless custom provider works through real Core and HTTP without Authorization', async t => {
  const http=require('node:http'),{OpenAIClient}=require('../source/api.cjs');
  const received=[];
  const server=http.createServer((req,res)=>{
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      received.push({authorization:req.headers.authorization,path:req.url,body:JSON.parse(body)});
      res.writeHead(200,{'Content-Type':'text/event-stream'});
      res.end('data: {"choices":[{"delta":{"content":"Synthetic keyless response"},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":17,"completion_tokens":4}}\n\n');
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const {core}=fixture(t,new OpenAIClient());core.resources.memory=()=>8*1024**3;
  core.saveSettings({provider:'custom',customEndpoint:'http://127.0.0.1:'+server.address().port+'/v1',model:'synthetic-local',hipaa:false,publicModeConfirmed:true,processingMode:'cloud-first'});
  assert.equal(core.saveKey('', 'custom'),true);
  assert.equal(core.key('custom'),null);
  const chat=core.createChat(),result=await core.send({chatId:chat.id,prompt:'Discuss the supplied synthetic design tradeoffs.'});
  assert.equal(result.chat.messages.at(-1).error,undefined);
  assert.equal(result.chat.messages.at(-1).text,'Synthetic keyless response');
  assert.equal(received.length,1);assert.equal(received[0].path,'/v1/chat/completions');assert.equal(received[0].authorization,undefined);
  assert.equal(result.chat.messages.at(-1).usage.inputTokens,17);
  core.saveKey('synthetic-optional','custom');core.saveKey('   ','custom');assert.equal(core.key('custom'),'synthetic-optional');
});

test('every provider requiring authentication rejects a missing key before transmission', async () => {
  const {OpenAIClient}=require('../source/api.cjs');let calls=0;
  const client=new OpenAIClient(async()=>{calls++;assert.fail('Missing credentials must never reach the network');});
  for(const provider of Object.values(PROVIDERS).filter(p=>p.requiresKey).map(p=>p.id)) {
    await assert.rejects(client.generate(null,{provider,model:'synthetic',hipaa:false},[]),{code:'KEY'});
  }
  assert.equal(calls,0);
});


