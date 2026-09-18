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
  assert.doesNotThrow(() => validateKeyForProvider('AIzaSyD-1234567890abcdefghijklmnopqrstuv', 'gemini'));
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
  core.saveKey('AIzaSyD1234567890123456789012345678901', 'gemini');
  assert.equal(core.key('gemini'), 'AIzaSyD1234567890123456789012345678901');

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
  const models = await client.models(null, { provider: 'ollama' });
  assert.ok(Array.isArray(models));
  assert.ok(models.includes('qwen2.5:1.5b') || models.includes('llama3.2:1b'));
});

