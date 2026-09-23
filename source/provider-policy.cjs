'use strict';
const crypto = require('node:crypto');
const { fail } = require('./security.cjs');
const { PROVIDERS, endpointFor } = require('./providers.cjs');
const POLICY_VERSION = '3.0.1-1';
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
  if (id === 'local' || id === 'ollama') return;
  if (settings.processingMode === 'local-only' || settings.allowCloud === false) throw fail('LOCAL_ONLY');
  // Other cloud providers require a separately reviewed healthcare policy adapter.
  if (settings.hipaa && (id !== 'openai' || !approved(settings, key))) throw fail('POLICY');
}
module.exports = { POLICY_VERSION, fingerprint, approved, assertProviderPolicy };
