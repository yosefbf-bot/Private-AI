'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { fail } = require('../source/security.cjs');
const LABEL = 'Development / Demo Mode — Not for PHI';
const ALLOWED = new Set(['userGuide','summary','createChat','chat','archiveChat','renameChat','deleteChat','endTemporary','saveTemporary','send','stop','saveDraft','voiceTranscriptSave','voiceTranscriptDelete','voiceTranscriptClear','settings','saveKey','deleteKey','models','testConnection','localStatus','usageSummary','activity','snfDemo','snfToday','snfImports','snfImportSchema','snfDashboard','snfAlerts','snfAcknowledgeAlert','snfAssignAlert','snfResolveAlert','snfUpdateAlert','snfAlertEvidence','snfOpenIssues','snfMorningBrief','snfResidentTimeline','snfFeedStatus','snfMedChanges','snfPsychWatch','snfPCCReports','snfRunRules']);
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
  return { host: '127.0.0.1', port: 3000, root, token: env.PRIVATE_AI_DEV_TOKEN };
}
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
function isAllowedHost(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.toLowerCase().split(':')[0];
  if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
  if (h.endsWith('.run.app') || h.endsWith('.google.com') || h.endsWith('.google.dev') || h.endsWith('.aistudio.google.com')) return true;
  return false;
}

function isAllowedOrigin(origin, reqHost) {
  if (!origin || typeof origin !== 'string') return true;
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
    if (h.endsWith('.run.app') || h.endsWith('.google.com') || h.endsWith('.google.dev') || h.endsWith('.aistudio.google.com')) return true;
    if (reqHost) {
      const hostName = reqHost.toLowerCase().split(':')[0];
      if (u.host.toLowerCase() === reqHost.toLowerCase() || h === hostName) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function boundary(config) {
  const sessions = new Map();
  return function(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.google.com https://*.google.dev https://*.aistudio.google.com https://*.run.app");
    const reqHost = req.headers['x-forwarded-host'] || req.headers.host;
    if (!isAllowedHost(reqHost)) return res.status(403).json({ ok: false });
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin, reqHost)) return res.status(403).json({ ok: false });
    if (req.path.startsWith('/api/') && req.headers['sec-fetch-site'] === 'cross-site' && req.headers.origin && !isAllowedOrigin(req.headers.origin, reqHost)) return res.status(403).json({ ok: false });
    if (req.path === '/api/dev-token' && req.method === 'GET') return next();
    if (req.path === '/api/session' && req.method === 'POST') {
      if (!equal(req.headers.authorization, `Bearer ${config.token}`) || req.headers['x-private-ai'] !== 'development') return res.status(401).json({ ok: false });
      const session = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(32).toString('hex');
      for (const [id,s] of sessions) if (s.expires < Date.now()) sessions.delete(id);
      if (sessions.size >= 20) sessions.delete(sessions.keys().next().value);
      sessions.set(session, { csrf, expires: Date.now() + 60 * 60 * 1000 });
      res.setHeader('Set-Cookie', `privateai_dev=${session}; HttpOnly; SameSite=None; Secure; Path=/api; Max-Age=3600`);
      return res.json({ ok: true, csrf, session, mode: LABEL });
    }
    if (!req.path.startsWith('/api/')) return next();
    const id = req.headers['x-private-ai-session'] || req.query?.session || req.url?.match(/[?&]session=([a-f0-9]{64})/)?.[1] || req.headers.cookie?.match(/(?:^|;\s*)privateai_dev=([a-f0-9]{64})(?:;|$)/)?.[1];
    const session = sessions.get(id);
    if (!session || session.expires < Date.now()) return res.status(401).json({ ok: false });
    if (req.method !== 'GET' && !equal(req.headers['x-private-ai-csrf'], session.csrf)) return res.status(403).json({ ok: false });
    return next();
  };
}
module.exports = { LABEL, ALLOWED, configuration, boundary, assertOperation, isAllowedHost, isAllowedOrigin };
