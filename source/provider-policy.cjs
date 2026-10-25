'use strict';
const crypto = require('node:crypto');
const { fail } = require('./security.cjs');
const { PROVIDERS, endpointFor } = require('./providers.cjs');
const POLICY_VERSION = '3.0.1-1';
const protectedMode = settings => settings.hipaa || settings.processingMode === 'local-only' || settings.allowCloud === false;
const cloudModelName = name => typeof name === 'string' && /(?:-cloud|:cloud)(?::latest)?$/i.test(name);
function remoteModel(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.remote_host || metadata.remote_model || cloudModelName(metadata.name) || cloudModelName(metadata.model)) return true;
  return !!(metadata.details?.remote_host || metadata.details?.remote_model ||
    metadata.model_info?.remote_host || metadata.model_info?.remote_model);
}
function fingerprint(settings, key) {
  const provider = settings.provider || 'openai';
  if (!PROVIDERS[provider]) throw fail('INVALID');
  return crypto.createHash('sha256').update(JSON.stringify({
    version: POLICY_VERSION, provider, endpoint: endpointFor(provider, settings),
    org: settings.org || '', project: settings.projectId || '', model: settings.model || '',
    realtimeModel: settings.realtimeModel || '',
    credential: crypto.createHash('sha256').update(key || '').digest('hex')
  })).digest('hex');
}
function approved(settings, key) {
  return settings.providerApproval?.policyVersion === POLICY_VERSION &&
    settings.providerApproval?.fingerprint === fingerprint(settings, key) &&
    settings.providerApproval?.organizationConfirmed === true;
}
function assertProviderPolicy(settings, key) {
  const id = settings.provider || 'openai';
  if (!PROVIDERS[id]) throw fail('INVALID');
  endpointFor(id, settings); // Validate URLs even for local providers.
  if (id === 'ollama' && protectedMode(settings) && cloudModelName(settings.model)) throw fail('POLICY');
  if (id === 'local' || id === 'ollama') return;
  if (settings.processingMode === 'local-only' || settings.allowCloud === false) throw fail('LOCAL_ONLY');
  // Other cloud providers require a separately reviewed healthcare policy adapter.
  if (settings.hipaa && (id !== 'openai' || !approved(settings, key))) throw fail('POLICY');
}
module.exports = { POLICY_VERSION, fingerprint, approved, assertProviderPolicy, protectedMode, cloudModelName, remoteModel };
