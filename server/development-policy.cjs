'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { fail } = require('../source/security.cjs');
const LABEL = 'Development / Demo Mode — Not for PHI';
const ALLOWED = new Set([...require('../source/workflows/index.cjs').READ_DEMO,'userGuide','summary','createChat','chat','archiveChat','renameChat','deleteChat','endTemporary','saveTemporary','send','stop','saveDraft','voiceTranscriptSave','voiceTranscriptDelete','voiceTranscriptClear','settings','saveKey','deleteKey','models','testConnection','localStatus','usageSummary','activity','snfDemo','snfToday','snfImports','snfImportSchema','snfDashboard','snfAlerts','snfAcknowledgeAlert','snfAssignAlert','snfResolveAlert','snfUpdateAlert','snfAlertEvidence','snfOpenIssues','snfMorningBrief','snfResidentTimeline','snfFeedStatus','snfMedChanges','snfPsychWatch','snfPCCReports','snfRunRules','operationsSummary','operationsHuddleBrief','meetingList','meetingGet','meetingSave','meetingDelete','meetingAddTranscript','meetingConvertActionItem','meetingFinalize','sbarGenerate','sbarSave','sbarReview','sbarFinalize','sbarList','sbarGet','sbarDelete','sbarLogNotification','sbarAdvanceLoop','sbarProtocols','sbarProtocolGet','sbarProtocolSave','sbarTemplates','sbarShiftHandoff','sbarSnapshot48h','audioCheckQuality','speakerProfilesList','speakerProfileGet','speakerProfileSave','speakerProfileDelete','speakerSampleAdd','speakerSampleRemove','speakerIdentify','speakerReviewGet','speakerReviewConfirmAll','speakerCorrectionLearn']);
function assertOperation(op, data) {
  if (!ALLOWED.has(op)) throw fail('POLICY');
  if (op === 'settings' && Object.keys(data).some(k => !['provider','model','hipaa','publicModeConfirmed','approved','customEndpoint','ollamaEndpoint','processingMode','allowCloud','org','projectId'].includes(k))) throw fail('POLICY');
  if (op === 'settings' && data.approved === true) throw fail('POLICY');
}
function configuration(env = process.env, repo = path.resolve(__dirname, '..')) {
  if (env.PRIVATE_AI_HOST && env.PRIVATE_AI_HOST !== '127.0.0.1') throw Error('Development server requires 127.0.0.1. Network deployment is unsupported.');
  if (typeof env.PRIVATE_AI_DEV_TOKEN !== 'string' || env.PRIVATE_AI_DEV_TOKEN.length < 32) throw Error('Set PRIVATE_AI_DEV_TOKEN to a randomly generated access token of at least 32 characters. Development only; never use PHI.');
  if (env.PRIVATE_AI_DEV_DATA && !path.isAbsolute(env.PRIVATE_AI_DEV_DATA)) throw Error('Development data requires an absolute path.');
  const requested = path.resolve(env.PRIVATE_AI_DEV_DATA || path.join(os.homedir(), '.privateai-development'));
  let ancestor = requested;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const root = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, requested));
  const relative = path.relative(fs.realpathSync(repo), root);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Development data must be outside the source repository.');
  let previewOrigin = null;
  if (env.PRIVATE_AI_DEV_PREVIEW_ORIGIN) {
    const u = new URL(env.PRIVATE_AI_DEV_PREVIEW_ORIGIN);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw Error('Preview origin must be one exact HTTPS origin.');
    previewOrigin = u.origin;
  }
  return { host: '127.0.0.1', port: 3000, root, token: env.PRIVATE_AI_DEV_TOKEN, previewOrigin };
}
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
function isAllowedHost(host, previewOrigin = null) {
  if (typeof host !== 'string') return false;
  const local = new Set(['127.0.0.1:3000', 'localhost:3000', '[::1]:3000']);
  return local.has(host.toLowerCase()) || (!!previewOrigin && host.toLowerCase() === new URL(previewOrigin).host);
}
function isAllowedOrigin(origin, reqHost, previewOrigin = null) {
  if (!origin) return true; // Non-browser clients still need the bearer/session token.
  try {
    const u = new URL(origin);
    if (u.origin !== origin || u.username || u.password) return false;
    return (u.protocol === 'http:' && u.host === reqHost && isAllowedHost(reqHost)) || (!!previewOrigin && origin === previewOrigin);
  } catch { return false; }
}

function boundary(config) {
  const sessions = new Map();
  return function(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'" + (config.previewOrigin ? " https://aistudio.google.com " + config.previewOrigin : ""));
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reqHost = req.headers.host; // Do not trust arbitrary forwarded host headers.
    if (!isAllowedHost(reqHost, config.previewOrigin)) return res.status(403).json({ ok: false });
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin, reqHost, config.previewOrigin)) return res.status(403).json({ ok: false });
    if (req.path.startsWith('/api/') && req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ ok: false });
    if (req.path === '/api/dev-token') return res.status(404).json({ok: false});
    if (req.path === '/api/session' && req.method === 'POST') {
      if (!equal(req.headers.authorization, `Bearer ${config.token}`) || req.headers['x-private-ai'] !== 'development') return res.status(401).json({ ok: false });
      const session = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(32).toString('hex');
      for (const [id,s] of sessions) if (s.expires < Date.now()) sessions.delete(id);
      if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
      sessions.set(session, { csrf, expires: Date.now() + 60 * 60 * 1000 });
      res.setHeader('Set-Cookie', `privateai_dev=${session}; HttpOnly; ${config.previewOrigin ? 'SameSite=None; Secure' : 'SameSite=Strict'}; Path=/api; Max-Age=3600`);
      return res.json({ ok: true, csrf, session, mode: LABEL });
    }
    if (!req.path.startsWith('/api/')) return next();
    const id = req.headers['x-private-ai-session'] || (req.path === '/api/events' ? req.query?.session : null) || req.headers.cookie?.match(/(?:^|;\s*)privateai_dev=([a-f0-9]{64})(?:;|$)/)?.[1];
    const session = sessions.get(id);
    if (!session || session.expires < Date.now()) return res.status(401).json({ ok: false });
    if (req.method !== 'GET' && !equal(req.headers['x-private-ai-csrf'], session.csrf)) return res.status(403).json({ ok: false });
    return next();
  };
}
module.exports = { LABEL, ALLOWED, configuration, boundary, assertOperation, isAllowedHost, isAllowedOrigin };

