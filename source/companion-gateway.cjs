'use strict';
// Optional desktop-only HTTPS transport. No forwarding of arbitrary IPC or paths.
const https = require('node:https');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const {fail, safeError, uuid} = require('./security.cjs');
const {createCertificate, describeCertificate, tlsOptions} = require('./companion-tls.cjs');
const DEFAULT = Object.freeze({enabled: false, host: '127.0.0.1', port: 8443});
const PREFIX = '/mobile/api/v1';
const MAX_BODY = 192 * 1024;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const allowedId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
function privateAddress(host) {
  if (net.isIP(host) !== 4) return false;
  const [a,b] = host.split('.').map(Number);
  return a === 127 || a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
}
function interfaces() {
  const result = [{name: 'This PC only (testing)', address: '127.0.0.1'}];
  for (const [name, rows] of Object.entries(os.networkInterfaces()))
    for (const row of rows || []) if (!row.internal && privateAddress(row.address) && !result.some(x => x.address === row.address)) result.push({name, address: row.address});
  return result;
}
function httpError(code, status) { return Object.assign(fail(code), {status}); }
function sendJSON(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
  res.end(JSON.stringify(data));
}
async function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) throw httpError('INVALID', 415);
  if (Number(req.headers['content-length']) > MAX_BODY) throw httpError('LIMIT', 413);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) throw httpError('LIMIT', 413); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error(); return result; }
  catch { throw httpError('INVALID', 400); }
}

class CompanionGateway {
  constructor(core, {certificateFactory = createCertificate, networkInterfaces = interfaces} = {}) {
    this.core = core; this.certificateFactory = certificateFactory; this.networkInterfaces = networkInterfaces;
    this.server = null; this.sockets = new Set(); this.active = new Map(); this.generation = 0; this.error = null; this.changing = false; this.closed = false; this.rate = new Map();
  }
  settings() { return {...DEFAULT, ...this.core.store.get('companion', 'settings')}; }
  devices() { return this.core.store.list('companion_device').map(({id, name, scopes, created}) => ({id, name, scopes, created})); }
  status() {
    const settings = this.settings(), saved = this.core.store.get('secret', 'companion_tls');
    let certificate = null;
    if (saved) { try { const d = describeCertificate(saved, settings.host); certificate = {fingerprint: d.fingerprint, expires: d.expires}; } catch {} }
    return {settings, state: this.error ? 'error' : this.server?.listening ? 'listening' : 'off', error: this.error, interfaces: this.networkInterfaces(), devices: this.devices(), certificate, baseUrl: `https://${settings.host}:${settings.port}`, locked: this.core.locked, activeRequests: this.active.size};
  }
  assertDesktop() { if (this.closed || this.core.locked) throw fail('LOCKED'); this.core.assertUnlocked(); }
  async configure(input) {
    this.assertDesktop();
    if (this.changing) throw fail('BUSY');
    if (!input || Object.keys(input).some(k => !['enabled', 'host', 'port'].includes(k))) throw fail('INVALID');
    const next = {...this.settings(), ...input};
    if (typeof next.enabled !== 'boolean' || !Number.isInteger(next.port) || next.port < 1024 || next.port > 65535 || !privateAddress(next.host)) throw fail('INVALID');
    if (next.enabled && !this.networkInterfaces().some(x => x.address === next.host)) throw fail('COMPANION_BIND');
    this.changing = true;
    try {
      // Fail closed before asynchronous certificate creation or a bind attempt.
      this.stop();
      this.core.store.put('companion', 'settings', {...next, enabled: false});
      if (next.enabled) {
        let cert = this.core.store.get('secret', 'companion_tls');
        try { describeCertificate(cert, next.host); }
        catch { cert = await this.certificateFactory(next.host); describeCertificate(cert, next.host); }
        this.assertDesktop();
        this.core.store.put('secret', 'companion_tls', cert);
        this.core.store.put('companion', 'settings', next);
        await this.start();
      }
      return this.status();
    } catch (e) {
      this.stop();
      if (!this.closed) this.core.store.put('companion', 'settings', {...next, enabled: false});
      this.error = safeError(e);
      throw e;
    } finally { this.changing = false; }
  }
  async start() {
    if (this.closed || this.server) return;
    const s = this.settings();
    if (!s.enabled) return;
    try {
      if (!privateAddress(s.host) || !this.networkInterfaces().some(x => x.address === s.host)) throw fail('COMPANION_BIND');
      const cert = this.core.store.get('secret', 'companion_tls'); describeCertificate(cert, s.host);
      const server = https.createServer({...tlsOptions(cert), maxHeaderSize: 8192}, (req,res) => this.handle(req,res));
      this.server = server; server.maxConnections = 24; server.maxHeadersCount = 30; server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 2000;
      server.on('connection', socket => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); });
      server.on('tlsClientError', () => {});
      await new Promise((resolve,reject) => { server.once('error',reject); server.listen(s.port,s.host,() => { server.removeListener('error',reject); resolve(); }); });
      server.on('error', () => { this.stop(); this.error = safeError(fail('COMPANION_BIND')); });
      this.started = Date.now(); this.error = null;
    } catch (e) { this.stop(); this.error = safeError(fail(e.code === 'COMPANION_TLS' ? 'COMPANION_TLS' : 'COMPANION_BIND')); throw fail(this.error.code); }
  }
  stop() {
    this.generation++;
    for (const job of this.active.values()) { job.controller.abort(); if (job.chatId) this.core.stop(job.chatId); }
    const server = this.server; this.server = null;
    server?.close(); for (const socket of this.sockets) socket.destroy(); this.sockets.clear();
    this.error = null;
  }
  close() { this.closed = true; this.stop(); }
  pair({name, scopes = {chat: true}}) {
    this.assertDesktop();
    if (!this.server?.listening || this.changing) throw fail('COMPANION_BIND');
    if (typeof name !== 'string' || !name.trim() || name.length > 60 || /[\u0000-\u001f]/.test(name) || !scopes || typeof scopes !== 'object' || Array.isArray(scopes) || Object.entries(scopes).some(([k,v]) => !['chat','tasks','alerts'].includes(k) || typeof v !== 'boolean')) throw fail('INVALID');
    if (this.devices().length >= 10) throw fail('LIMIT');
    const key = crypto.randomBytes(32).toString('base64url');
    const device = {id: uuid(), name: name.trim(), scopes: {chat: false, tasks: false, alerts: false, ...scopes}, keyHash: digest(key), created: Date.now()};
    this.core.store.put('companion_device', device.id, device);
    const s = this.settings(), certificate = describeCertificate(this.core.store.get('secret', 'companion_tls'),s.host);
    const params = new URLSearchParams({host:s.host, port:String(s.port), scheme:'https', key, fingerprint:certificate.fingerprint, certificate:certificate.certificate});
    return {id:device.id, name:device.name, key, baseUrl:`https://${s.host}:${s.port}`, pairingUrl:`privateai://pair?${params}`, ...certificate};
  }
  revoke(id) {
    this.assertDesktop();
    if (typeof id !== 'string') throw fail('INVALID');
    this.core.store.delete('companion_device', id);
    for (const job of this.active.values()) if (job.deviceId === id) { job.controller.abort(); this.core.stop(job.chatId); }
    return this.status();
  }
  authenticate(req) {
    const key = req.headers['x-pair-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw httpError('COMPANION_AUTH',401);
    const hash = Buffer.from(digest(key),'hex');
    const device = this.core.store.list('companion_device').find(d => typeof d.keyHash === 'string' && /^[a-f0-9]{64}$/.test(d.keyHash) && crypto.timingSafeEqual(hash,Buffer.from(d.keyHash,'hex')));
    if (!device) throw httpError('COMPANION_AUTH',401);
    return device;
  }
  assertSession(device, generation, scope) {
    if (this.closed || generation !== this.generation || !this.settings().enabled || !this.server?.listening) throw httpError('COMPANION_AUTH',401);
    const current = this.core.store.get('companion_device',device.id);
    if (!current || current.keyHash !== device.keyHash) throw httpError('COMPANION_AUTH',401);
    if (scope && current.scopes[scope] !== true) throw httpError('POLICY',403);
    if (this.core.locked) throw httpError('LOCKED',423);
    this.core.assertUnlocked();
  }
  throttle(id) {
    const now = Date.now();
    for (const [key,row] of this.rate) if (row.until <= now) this.rate.delete(key);
    if (!this.rate.has(id)) { if (this.rate.size >= 128) throw httpError('BUSY',429); this.rate.set(id,{count:0,until:now+60000}); }
    if (++this.rate.get(id).count > 120) throw httpError('BUSY',429);
  }
  async handle(req,res) {
    try {
      const s = this.settings();
      // Native clients only. Browser origins, query-string credentials and redirects are not accepted.
      if (req.headers.host !== `${s.host}:${s.port}` || req.headers.origin || req.headers['sec-fetch-site'] || !req.url.startsWith(PREFIX+'/') || req.url.includes('?') || req.url.includes('#')) throw httpError('POLICY',403);
      this.throttle(req.socket.remoteAddress || 'unknown');
      const device = this.authenticate(req), generation = this.generation;
      this.assertSession(device,generation);
      let response;
      if (req.method === 'GET' && req.url === PREFIX+'/status') {
        const local = this.core.router.local?.status();
        const jobs = device.scopes.tasks ? this.core.store.list('job') : null;
        response = {status:'ONLINE', serverName:os.hostname(), loadedModel:local?.state === 'ready' ? local.model : null, localModelState:local?.state || 'unavailable', cpuUsage:null, gpuUsage:null, vramUsedGb:null, vramTotalGb:null, activeJobs:jobs ? jobs.filter(j => ['queued','running','waiting','paused'].includes(j.status)).length : null, uptime:`${Math.floor((Date.now()-this.started)/1000)}s`, processingMode:this.core.settings().processingMode, provider:this.core.settings().provider, scopes:device.scopes, protocolVersion:1};
      } else if (req.method === 'GET' && req.url === PREFIX+'/tasks') {
        this.assertSession(device,generation,'tasks');
        const rows = this.core.store.list('job');
        response = {tasks:rows.slice(0,100).map(j => ({id:j.id,status:j.status,created:j.created || null,updated:j.updated || null})), total:rows.length, truncated:rows.length>100, details:'Task status only. Review output and approvals on the desktop.'};
      } else if (req.method === 'GET' && req.url === PREFIX+'/alerts') {
        this.assertSession(device,generation,'alerts');
        const rows = this.core.snf.getActiveAlerts(), coverage = this.core.snf.getFeedStatus();
        response = {alerts:rows.slice(0,100).map(a => ({id:digest(a.id),severity:a.severity,status:a.status,category:a.category || null})), total:rows.length,truncated:rows.length>100, monitoringEnabled:coverage.monitoringEnabled, isSurveillanceComplete:coverage.isSurveillanceComplete, details:'Alert metadata only. An empty list is not an all-clear; review evidence and residents on the desktop.'};
      } else if (req.method === 'POST' && req.url === PREFIX+'/chat/send') {
        this.assertSession(device,generation,'chat');
        const data = await readJSON(req);
        response = await this.chat(device,generation,data,res);
      } else throw httpError('NOT_FOUND',404);
      this.assertSession(device,generation);
      sendJSON(res,200,response);
    } catch (e) { sendJSON(res,e.status || (e.code === 'BUSY' ? 409 : e.code === 'INVALID' ? 400 : e.code === 'LIMIT' ? 413 : e.code === 'LOCKED' ? 423 : e.code === 'POLICY' ? 403 : 503),{error:safeError(e)}); }
  }
  async chat(device,generation,data,res) {
    this.assertSession(device,generation,'chat');
    if (Object.keys(data).some(k => !['prompt','sessionId','requestId','attachmentName','attachmentType'].includes(k)) || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 40000) throw httpError('INVALID',400);
    if (data.attachmentName || data.attachmentType) throw httpError('COMPANION_ATTACHMENT',422);
    const session = data.sessionId ?? 'default';
    if (!allowedId(session) || data.requestId !== undefined && !allowedId(data.requestId)) throw httpError('INVALID',400);
    if (this.core.settings().workerPaused) throw httpError('COMPANION_PAUSED',409);
    const requestKey = data.requestId ? digest(device.id+'|'+data.requestId) : null;
    const inputHash = digest(JSON.stringify([session,data.prompt]));
    if (requestKey) {
      const prior = this.core.store.get('companion_request',requestKey);
      if (prior && prior.expires > Date.now()) {
        if (prior.inputHash !== inputHash) throw httpError('CHANGED',409);
        if (!this.core.store.get('chat',prior.chatId)) throw httpError('NOT_FOUND',404);
        if (prior.response) return prior.response;
        throw httpError('INTERRUPTED',409);
      }
    }
    if (this.active.size) throw httpError('BUSY',409);
    const sessionKey = digest(device.id+'|'+session);
    let saved = this.core.store.get('companion_session',sessionKey);
    if (!saved || !this.core.store.get('chat',saved.chatId)) {
      if (this.core.store.list('companion_session').filter(r => r.deviceId === device.id).length >= 100) throw fail('LIMIT');
      saved = {deviceId:device.id,chatId:this.core.createChat().id};
    }
    this.core.store.put('companion_session',sessionKey,saved);
    const expires = Date.now()+86400000;
    if (requestKey) this.core.store.put('companion_request',requestKey,{inputHash,chatId:saved.chatId,state:'started',expires},{expires});
    const job = {deviceId:device.id,chatId:saved.chatId,controller:new AbortController()};
    this.active.set(sessionKey,job);
    const cancel = () => { job.controller.abort(); this.core.stop(job.chatId); };
    const disconnected = () => { if (!res.writableEnded) cancel(); };
    res.once('close',disconnected);
    const timeout = setTimeout(cancel,300000);
    try {
      const result = await this.core.resources.task('background',() => this.core.send({chatId:saved.chatId,prompt:data.prompt},()=>{},{allowTools:false}),{signal:job.controller.signal});
      this.assertSession(device,generation,'chat');
      if (job.controller.signal.aborted) throw fail('CANCELLED');
      const answer = result.chat.messages.at(-1);
      if (answer?.error) throw fail(answer.error.code);
      if (!answer?.text) throw fail('LOCAL_UNAVAILABLE');
      const response = {reply:answer.text,sessionId:session,requestId:data.requestId || null,processing:answer.processing ? {provider:answer.processing.provider,model:answer.processing.model,reason:answer.processing.reason} : null,incomplete:!!answer.incomplete};
      if (requestKey) this.core.store.put('companion_request',requestKey,{inputHash,chatId:saved.chatId,response,expires},{expires});
      return response;
    } finally { clearTimeout(timeout); res.removeListener('close',disconnected); this.active.delete(sessionKey); }
  }
}
module.exports = {CompanionGateway, DEFAULT, interfaces, privateAddress};
