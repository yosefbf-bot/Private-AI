'use strict';
const { fail } = require('./security.cjs');

const PROVIDERS = {
  local: {
    id: 'local',
    name: 'Local Assistant (No API Key)',
    description: 'Local tools and reasoning on this PC. Select Local Only to prohibit cloud routing; review all clinical output.',
    keyRequired: false,
    requiresKey: false,
    defaultModel: 'local-knowledge-engine',
    models: [
      'local-knowledge-engine',
      'local-clinical-engine',
      'local-rules-engine'
    ],
    defaultEndpoint: ''
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local Daemon)',
    description: 'Connects to your local Ollama daemon (http://127.0.0.1:11434). 100% offline, zero API keys, and includes automated memory unloading (keep_alive) to protect your PC RAM.',
    keyRequired: false,
    requiresKey: false,
    defaultModel: 'qwen2.5:1.5b',
    ramModels: {
      conservative: ['qwen2.5:1.5b', 'llama3.2:1b'],
      balanced: ['llama3.2:3b', 'qwen2.5:3b', 'qwen2.5:1.5b'],
      expanded: ['qwen2.5:7b', 'llama3.1:8b', 'qwen2.5:3b', 'deepseek-r1:7b']
    },
    models: [
      'qwen2.5:1.5b',
      'llama3.2:1b',
      'llama3.2:3b',
      'qwen2.5:3b',
      'qwen2.5:7b',
      'deepseek-r1:1.5b',
      'deepseek-r1:7b'
    ],
    defaultEndpoint: 'http://127.0.0.1:11434'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google AI Studio API key (starts with AIzaSy...). Ultra-fast reasoning and multimodal capabilities.',
    keyRequired: true,
    requiresKey: true,
    keyPrefix: 'AIza',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ],
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Anthropic API key (starts with sk-ant-...). Available outside HIPAA Mode; clinical output requires human review.',
    keyRequired: true,
    requiresKey: true,
    keyPrefix: 'sk-ant-',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ],
    defaultEndpoint: 'https://api.anthropic.com/v1'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI API key (starts with sk-...). GPT-4o, o3-mini, and advanced reasoning models.',
    keyRequired: true,
    requiresKey: true,
    keyPrefix: 'sk-',
    defaultModel: 'gpt-4o',
    realtimeModels: ['gpt-4o-realtime-preview-2024-12-17'],
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'o1',
      'o3-mini',
      'gpt-4-turbo'
    ],
    defaultEndpoint: 'https://api.openai.com/v1'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek API key (starts with sk-...). Cost-effective high-capability reasoning and chat models.',
    keyRequired: true,
    requiresKey: true,
    keyPrefix: 'sk-',
    defaultModel: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner'
    ],
    defaultEndpoint: 'https://api.deepseek.com'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    description: 'Groq Cloud API key (starts with gsk_...). Ultra-low latency LPU inference.',
    keyRequired: true,
    requiresKey: true,
    keyPrefix: 'gsk_',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768'
    ],
    defaultEndpoint: 'https://api.groq.com/openai/v1'
  },
  custom: {
    id: 'custom',
    name: 'Custom / OpenAI-Compatible (Ollama, vLLM, OpenRouter)',
    description: 'Connect to any OpenAI-compatible API endpoint, local Ollama/LM Studio server, or OpenRouter gateway.',
    keyRequired: false,
    requiresKey: false,
    defaultModel: 'llama3.2',
    models: [
      'llama3.2',
      'mistral',
      'qwen2.5',
      'custom'
    ],
    defaultEndpoint: 'http://localhost:11434/v1'
  }
};

function validateKeyForProvider(key, provider = 'openai') {
  if (!Object.hasOwn(PROVIDERS, provider)) throw fail('INVALID');
  if (provider === 'local' || provider === 'ollama') return true;
  if (typeof key !== 'string' || !key.trim()) throw fail('INVALID');
  if (/\s/.test(key)) throw fail('INVALID');
  if (provider === 'openai' && !key.startsWith('sk-')) throw fail('INVALID');
  if (provider === 'anthropic' && !key.startsWith('sk-ant-')) throw fail('INVALID');
  if (provider === 'groq' && !key.startsWith('gsk_')) throw fail('INVALID');
  if (provider === 'gemini' && !key.startsWith('AIza') && key.length < 10) throw fail('INVALID');
  return true;
}

module.exports = {
  PROVIDERS,
  validateKeyForProvider
};


// Authoritative provider/model metadata. Model IDs are configured suggestions,
// not a promise of availability; provider errors are surfaced without fallback.
for (const provider of Object.values(PROVIDERS)) {
  provider.modelsAreSuggestions = true;
  provider.classification = ['local', 'ollama'].includes(provider.id) ? 'local' : 'cloud';
  provider.authentication = provider.id === 'anthropic' ? 'x-api-key' : provider.requiresKey ? 'bearer' : 'optional';
  provider.streaming = provider.id !== 'local';
  provider.tools = provider.id === 'openai' ? ['web-search-public-mode'] : [];
  provider.healthcarePolicy = provider.id === 'openai' ? 'organization-approval-required' : provider.classification === 'local' ? 'local-device-policy-required' : 'not-enabled-in-hipaa-mode';
}
function endpointFor(id, settings = {}) {
  if (!Object.hasOwn(PROVIDERS, id)) throw fail('INVALID');
  if (id === 'local') return '';
  const raw = id === 'custom' ? settings.customEndpoint || PROVIDERS.custom.defaultEndpoint : id === 'ollama' ? settings.ollamaEndpoint || PROVIDERS.ollama.defaultEndpoint : PROVIDERS[id].defaultEndpoint;
  let url;
  try { url = new URL(raw); } catch { throw fail('INVALID'); }
  if (url.username || url.password || url.search || url.hash) throw fail('POLICY');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (id === 'ollama' && !loopback) throw fail('POLICY');
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) throw fail('POLICY');
  return url.href.replace(/\/+$/, '');
}
module.exports.endpointFor = endpointFor;
