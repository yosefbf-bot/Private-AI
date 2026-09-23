"use strict";
// Compatibility export: desktop and development server use the same transport and policy.
const { OpenAIClient } = require('../source/api.cjs');
class UnifiedClient extends OpenAIClient {}
module.exports = { UnifiedClient };
