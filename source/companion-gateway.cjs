'use strict';
// Optional desktop-only HTTPS transport. No forwarding of arbitrary IPC or paths.
const https = require('node:https');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const {performance} = require('node:perf_hooks');
const {fail, safeError, uuid, isId} = require('./security.cjs');
const captures = require('./capture-workflows.cjs');
const {createCertificate, describeCertificate, tlsOptions} = require('./companion-tls.cjs');
const DEFAULT = Object.freeze({enabled: false, host: '127.0.0.1', port: 8443});
const PREFIX = '/mobile/api/v1';
const MAX_BODY = 192 * 1024;
const INVITE_BODY = 2048, INVITE_TTL = 180000, INVITE_RECEIPT_TTL = 600000;
const SCOPES = ['chat','tasks','alerts','workflow','notifications'];
const CAPABILITIES = ['conversations','captures','actions','drafts','evidence-chunks','reminder-notifications','meetings','pairing-bootstrap-v2'];
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
async function readJSON(req, maximum = MAX_BODY) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) throw httpError('INVALID', 415);
  if (Number(req.headers['content-length']) > maximum) throw httpError('LIMIT', 413);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > maximum) throw httpError('LIMIT', 413); chunks.push(chunk); }
  try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error(); return result; }
  catch { throw httpError('INVALID', 400); }
}

class CompanionGateway {
  constructor(core, {certificateFactory = createCertificate, networkInterfaces = interfaces, monotonicNow = () => performance.now(), wallNow = () => Date.now()} = {}) {
    this.core = core; this.certificateFactory = certificateFactory; this.networkInterfaces = networkInterfaces;
    this.server = null; this.sockets = new Set(); this.active = new Map(); this.generation = 0; this.error = null; this.changing = false; this.closed = false; this.rate = new Map();
    this.monotonicNow = monotonicNow; this.wallNow = wallNow; this.invites = new Map(); this.inviteRate = new Map();
  }
  settings() { return {...DEFAULT, ...this.core.store.get('companion', 'settings')}; }
  devices() { return this.core.store.list('companion_device').map(({id, name, scopes, created, sharedChats = [], notificationsWhileLocked = false}) => ({id, name, scopes, created, sharedChats, notificationsWhileLocked})); }
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
    this.invalidateInvites();
    this.generation++;
    for (const job of this.active.values()) { job.controller.abort(); if (job.chatId) this.core.stop(job.chatId); }
    const server = this.server; this.server = null;
    server?.close(); for (const socket of this.sockets) socket.destroy(); this.sockets.clear();
    this.error = null;
  }
  close() { this.closed = true; this.stop(); }
  pairGrants({name, scopes = {chat: true}, sharedChats = [], notificationsWhileLocked = false}) {
    if (typeof name !== 'string' || !name.trim() || name.length > 60 || /[\u0000-\u001f]/.test(name) || !scopes || typeof scopes !== 'object' || Array.isArray(scopes) || Object.entries(scopes).some(([k,v]) => !SCOPES.includes(k) || typeof v !== 'boolean')) throw fail('INVALID');
    this.validateSharedChats(sharedChats);
    if (sharedChats.length && !scopes.chat) throw fail('INVALID');
    if (typeof notificationsWhileLocked!=='boolean' || notificationsWhileLocked && !scopes.notifications) throw fail('INVALID');
    return {name:name.trim(), scopes:Object.fromEntries(SCOPES.map(k=>[k,scopes[k]===true])), sharedChats:[...sharedChats], notificationsWhileLocked};
  }
  newDevice(grants) {
    if (this.devices().length >= 10) throw fail('LIMIT');
    const key = crypto.randomBytes(32).toString('base64url');
    const notificationKey = grants.scopes.notifications ? crypto.randomBytes(32).toString('base64url') : null;
    const device = {id: uuid(), ...grants, keyHash: digest(key), notificationKeyHash:notificationKey?digest(notificationKey):null, created:Date.now()};
    return {device,key,notificationKey};
  }
  pair(input) {
    this.assertDesktop();
    if (!this.server?.listening || this.changing) throw fail('COMPANION_BIND');
    const grants = this.pairGrants(input), {device,key,notificationKey} = this.newDevice(grants);
    this.core.store.put('companion_device', device.id, device);
    const s = this.settings(), certificate = describeCertificate(this.core.store.get('secret', 'companion_tls'),s.host);
    const params = new URLSearchParams({host:s.host, port:String(s.port), scheme:'https', key, fingerprint:certificate.fingerprint, certificate:certificate.certificate});
    if(notificationKey)params.set('notificationKey',notificationKey);
    return {id:device.id, name:device.name, key,...(notificationKey?{notificationKey}:{}), baseUrl:`https://${s.host}:${s.port}`, pairingUrl:`privateai://pair?${params}`, ...certificate};
  }
  pruneInvites() {
    const now = this.monotonicNow();
    for (const [id,row] of this.invites) {
      if (row.state==='pending' && now >= (row.consumed ? row.receiptUntil : row.deadline)) { row.state='expired'; row.tokenHash=null; }
      if (now >= row.receiptUntil) this.invites.delete(id);
    }
  }
  invalidateInvites() {
    for (const row of this.invites.values()) if (row.state==='pending') { row.state='cancelled'; row.tokenHash=null; }
  }
  invite(input) {
    this.assertDesktop();
    if (!this.server?.listening || this.changing) throw fail('COMPANION_BIND');
    if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['name','scopes','sharedChats','notificationsWhileLocked'].includes(k))) throw fail('INVALID');
    const grants=this.pairGrants(input);
    if (this.devices().length>=10) throw fail('LIMIT');
    this.pruneInvites();
    if ([...this.invites.values()].filter(row=>row.state==='pending'&&!row.consumed).length>=3) throw fail('LIMIT');
    // Terminal receipts contain no token; retain only a small, bounded owner-visible history.
    while (this.invites.size>=32) {
      const oldest=[...this.invites].find(([,row])=>row.state!=='pending'||row.consumed);
      if (!oldest) throw fail('LIMIT');
      this.invites.delete(oldest[0]);
    }
    const s=this.settings(), certificate=describeCertificate(this.core.store.get('secret','companion_tls'),s.host);
    const id=uuid(), token=crypto.randomBytes(32).toString('base64url'), now=this.monotonicNow(), expires=this.wallNow()+INVITE_TTL;
    this.invites.set(id,{id,...grants,scopes:{...grants.scopes},sharedChats:[...grants.sharedChats],tokenHash:digest(token),host:s.host,port:s.port,fingerprint:certificate.fingerprint,generation:this.generation,expires,deadline:now+INVITE_TTL,receiptUntil:now+INVITE_RECEIPT_TTL,state:'pending',consumed:false});
    const params=new URLSearchParams({version:'2',host:s.host,port:String(s.port),fingerprint:certificate.fingerprint,id,token,expires:String(expires)});
    return {id,pairingUrl:`privateai://pair/v2?${params}`,expires,...grants};
  }
  inviteStatus(id) {
    this.assertDesktop(); if (!isId(id)) throw fail('INVALID');
    this.pruneInvites();
    const row=this.invites.get(id);
    if (row?.state==='paired' && !this.core.store.get('companion_device',row.issuedDeviceId)) row.state='cancelled';
    return {id,state:row?.state||'cancelled',expires:row?.expires||null,awaitingConnection:row?.state==='pending'&&row.consumed===true,...(row?.state==='paired'?{deviceId:row.issuedDeviceId}:{})};
  }
  cancelInvite(id) {
    this.assertDesktop(); if (!isId(id)) throw fail('INVALID');
    const row=this.invites.get(id);
    // Closing a pairing wizard invalidates its invitation, never a durable device.
    // Device revocation remains the existing explicit owner action.
    if (row) { row.state='cancelled'; row.tokenHash=null; }
    return this.inviteStatus(id);
  }
  throttleInvite(address) {
    const now=this.monotonicNow();
    for (const [id,row] of this.inviteRate) if (now>=row.until) this.inviteRate.delete(id);
    if (!this.inviteRate.has(address)) {
      if (this.inviteRate.size>=64) throw httpError('BUSY',429);
      this.inviteRate.set(address,{count:0,until:now+60000});
    }
    if (++this.inviteRate.get(address).count>12) throw httpError('BUSY',429);
  }
  exchangeInvite(data,generation) {
    this.assertDesktop();
    if (!this.server?.listening || this.changing || generation!==this.generation) throw httpError('COMPANION_AUTH',401);
    if (Object.keys(data).length!==3 || Object.keys(data).some(k=>!['version','id','token'].includes(k)) || data.version!==2 || !isId(data.id) || typeof data.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) throw httpError('INVALID',400);
    this.pruneInvites();
    const row=this.invites.get(data.id), hash=digest(data.token);
    if (!row || row.state!=='pending' || row.consumed || !row.tokenHash || !crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(row.tokenHash,'hex'))) throw httpError('COMPANION_AUTH',401);
    const s=this.settings(), certificate=describeCertificate(this.core.store.get('secret','companion_tls'),s.host);
    if (!s.enabled || row.generation!==generation || row.host!==s.host || row.port!==s.port || row.fingerprint!==certificate.fingerprint) { row.state='cancelled'; row.tokenHash=null; throw httpError('CHANGED',409); }
    const grants=this.pairGrants(row);
    // Never expose a credential before another asynchronous/nested Store transaction commits.
    if (this.core.store.db?.isTransaction) throw httpError('BUSY',409);
    const {device,key,notificationKey}=this.newDevice(grants);
    const response={version:2,id:device.id,name:device.name,key,...(notificationKey?{notificationKey}:{}),baseUrl:`https://${s.host}:${s.port}`,...certificate,scopes:device.scopes,sharedChats:device.sharedChats,notificationsWhileLocked:device.notificationsWhileLocked};
    // Synchronous commit and consumption: concurrent requests cannot both issue a device.
    this.core.store.transaction(()=>this.core.store.put('companion_device',device.id,device));
    row.consumed=true; row.tokenHash=null; row.issuedDeviceId=device.id;
    return response;
  }
  confirmInvite(device,generation) {
    if (this.closed || this.core.locked || generation!==this.generation || device.notificationOnly) return;
    this.pruneInvites();
    for (const row of this.invites.values()) if (row.state==='pending' && row.consumed && row.issuedDeviceId===device.id && row.generation===generation) row.state='paired';
  }
  validateSharedChats(ids) {
    if (!Array.isArray(ids) || ids.length>50 || new Set(ids).size!==ids.length || ids.some(id=>!isId(id) || !this.core.store.get('chat',id) || this.core.store.get('chat',id).archived)) throw fail('INVALID');
  }
  grant({id,sharedChats}) {
    this.assertDesktop(); this.validateSharedChats(sharedChats);
    const device = this.core.store.get('companion_device',id);
    if (!device || !device.scopes.chat) throw fail('NOT_FOUND');
    this.core.store.put('companion_device',id,{...device,sharedChats});
    for (const job of this.active.values()) if (job.deviceId===id && job.session?.startsWith('shared_') && !sharedChats.includes(job.chatId)) { job.controller.abort(); this.core.stop(job.chatId); }
    return this.status();
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
    const matches=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value) && crypto.timingSafeEqual(hash,Buffer.from(value,'hex'));
    const device = this.core.store.list('companion_device').find(d=>matches(d.keyHash)||matches(d.notificationKeyHash));
    if (!device) throw httpError('COMPANION_AUTH',401);
    return {...device,notificationOnly:matches(device.notificationKeyHash)};
  }
  assertSession(device, generation, scope) {
    if (this.closed || generation !== this.generation || !this.settings().enabled || !this.server?.listening) throw httpError('COMPANION_AUTH',401);
    const current = this.core.store.get('companion_device',device.id);
    if (!current || current.keyHash !== device.keyHash) throw httpError('COMPANION_AUTH',401);
    if (device.notificationOnly && (current.notificationKeyHash!==device.notificationKeyHash || scope && scope!=='notifications')) throw httpError('POLICY',403);
    if (scope && current.scopes[scope] !== true) throw httpError('POLICY',403);
    if (this.core.locked && device.notificationOnly && scope==='notifications' && current.notificationsWhileLocked && current.scopes.notifications) return;
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
      if (req.method==='POST' && req.url===PREFIX+'/pair/exchange') {
        this.throttleInvite(req.socket.remoteAddress||'unknown');
        this.assertDesktop();
        const generation=this.generation, data=await readJSON(req,INVITE_BODY);
        sendJSON(res,200,this.exchangeInvite(data,generation));
        return;
      }
      const device = this.authenticate(req), generation = this.generation;
      if(device.notificationOnly && !((req.method==='GET'&&req.url===PREFIX+'/notifications')||(req.method==='POST'&&req.url===PREFIX+'/notifications/ack')))throw httpError('POLICY',403);
      this.assertSession(device,generation,device.notificationOnly?'notifications':undefined);
      let response;
      if (req.method === 'GET' && req.url === PREFIX+'/status') {
        const local = this.core.router.local?.status();
        const jobs = device.scopes.tasks ? this.core.store.list('job') : null;
        response = {status:'ONLINE', serverName:os.hostname(), loadedModel:local?.state === 'ready' ? local.model : null, localModelState:local?.state || 'unavailable', cpuUsage:null, gpuUsage:null, vramUsedGb:null, vramTotalGb:null, activeJobs:jobs ? jobs.filter(j => ['queued','running','waiting','paused'].includes(j.status)).length : null, uptime:`${Math.floor((Date.now()-this.started)/1000)}s`, processingMode:this.core.settings().processingMode, provider:this.core.settings().provider, scopes:device.scopes, protocolVersion:1,capabilities:CAPABILITIES};
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
      } else if (req.method === 'GET' && req.url === PREFIX+'/conversations') {
        this.assertSession(device,generation,'chat'); response = this.conversations(device);
      } else if (req.method === 'POST' && req.url === PREFIX+'/conversations/history') {
        this.assertSession(device,generation,'chat'); response = this.history(device,await readJSON(req));
      } else if (req.method === 'GET' && req.url === PREFIX+'/actions') {
        this.assertSession(device,generation,'workflow'); response = captures.list(this.core,{kind:'companion',id:device.id});
      } else if (req.method==='GET'&&req.url===PREFIX+'/meetings') {
        this.assertSession(device,generation,'workflow');response=await require('./companion-meetings.cjs').dispatch(this.core,device,'list');
      } else if(req.method==='POST'&&['create','audio','finish','get'].some(op=>req.url===PREFIX+'/meetings/'+op)) {
        this.assertSession(device,generation,'workflow');const data=await readJSON(req);this.assertSession(device,generation,'workflow');
        response=await require('./companion-meetings.cjs').dispatch(this.core,device,req.url.split('/').at(-1),data);
      } else if (req.method === 'GET' && req.url === PREFIX+'/notifications') {
        this.assertSession(device,generation,'notifications'); response = device.notificationOnly?captures.backgroundNotifications(this.core,device):captures.notifications(this.core,{kind:'companion',id:device.id});
      } else if (req.method === 'POST' && ['/captures/create','/actions/update','/drafts/save','/evidence/write','/evidence/read','/notifications/ack'].some(p=>req.url===PREFIX+p)) {
        const endpoint = req.url.slice(PREFIX.length);
        this.assertSession(device,generation,endpoint==='/notifications/ack'?'notifications':'workflow');
        const data = await readJSON(req); this.assertSession(device,generation,endpoint==='/notifications/ack'?'notifications':'workflow');
        const fn = {'/captures/create':'create','/actions/update':'update','/drafts/save':'saveDraft','/evidence/write':'writeEvidence','/evidence/read':'readEvidence','/notifications/ack':'acknowledge'}[endpoint];
        response = endpoint==='/notifications/ack'&&device.notificationOnly?captures.backgroundAcknowledge(this.core,data,device):captures[fn](this.core,data,{kind:'companion',id:device.id});
      } else throw httpError('NOT_FOUND',404);
      this.assertSession(device,generation,device.notificationOnly?'notifications':undefined);
      sendJSON(res,200,response);
      if (req.method==='GET' && req.url===PREFIX+'/status' && !res.destroyed) this.confirmInvite(device,generation);
    } catch (e) { sendJSON(res,e.status || (['BUSY','CHANGED','REVIEW_CHANGED'].includes(e.code) ? 409 : e.code === 'NOT_FOUND' ? 404 : e.code === 'INVALID' ? 400 : e.code === 'LIMIT' ? 413 : e.code === 'LOCKED' ? 423 : e.code === 'POLICY' ? 403 : 503),{error:safeError(e)}); }
  }
  async chat(device,generation,data,res) {
    this.assertSession(device,generation,'chat');
    if (Object.keys(data).some(k => !['prompt','sessionId','requestId','attachmentName','attachmentType','requireLocal','requireHipaa'].includes(k)) || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 40000 || ['requireLocal','requireHipaa'].some(k=>data[k]!==undefined && typeof data[k]!=='boolean')) throw httpError('INVALID',400);
    if (data.attachmentName || data.attachmentType) throw httpError('COMPANION_ATTACHMENT',422);
    const session = data.sessionId ?? 'default';
    if (!allowedId(session) || data.requestId !== undefined && !allowedId(data.requestId)) throw httpError('INVALID',400);
    if (this.core.settings().workerPaused) throw httpError('COMPANION_PAUSED',409);
    if (data.requireHipaa && !this.core.settings().hipaa) throw httpError('POLICY',403);
    // Resolve grants before replay: removing a grant must also revoke saved answers.
    const sharedChat = session.startsWith('shared_') ? this.sharedChat(device,session) : null;
    const requestKey = data.requestId ? digest(device.id+'|'+data.requestId) : null;
    const inputHash = digest(JSON.stringify([session,data.prompt,data.requireLocal || false,data.requireHipaa || false]));
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
    let saved = sharedChat ? {deviceId:device.id,sessionId:session,chatId:sharedChat.id,shared:true} : this.core.store.get('companion_session',sessionKey);
    if (!saved || !this.core.store.get('chat',saved.chatId)) {
      if (this.core.store.list('companion_session').filter(r => r.deviceId === device.id).length >= 100) throw fail('LIMIT');
      saved = {deviceId:device.id,sessionId:session,chatId:this.core.createChat().id};
    }
    saved.sessionId = session;
    this.core.store.put('companion_session',sessionKey,saved);
    const expires = Date.now()+86400000;
    if (requestKey) this.core.store.put('companion_request',requestKey,{inputHash,chatId:saved.chatId,state:'started',expires},{expires});
    const job = {deviceId:device.id,chatId:saved.chatId,session,controller:new AbortController()};
    this.active.set(sessionKey,job);
    const cancel = () => { job.controller.abort(); this.core.stop(job.chatId); };
    const disconnected = () => { if (!res.writableEnded) cancel(); };
    res.once('close',disconnected);
    const timeout = setTimeout(cancel,300000);
    try {
      const result = await this.core.resources.task('background',() => this.core.send({chatId:saved.chatId,prompt:data.prompt},()=>{},{allowTools:false,isolatedContext:true,forceLocal:data.requireLocal===true}),{signal:job.controller.signal});
      this.assertSession(device,generation,'chat');
      if (sharedChat) this.sharedChat(device,session);
      if (data.requireHipaa && !this.core.settings().hipaa) throw httpError('POLICY',403);
      if (job.controller.signal.aborted) throw fail('CANCELLED');
      const answer = result.chat.messages.at(-1);
      if (answer?.error) throw fail(answer.error.code);
      if (!answer?.text) throw fail('LOCAL_UNAVAILABLE');
      const response = {reply:answer.text,sessionId:session,requestId:data.requestId || null,processing:answer.processing ? {provider:answer.processing.provider,model:answer.processing.model,reason:answer.processing.reason} : null,incomplete:!!answer.incomplete};
      if (requestKey) this.core.store.put('companion_request',requestKey,{inputHash,chatId:saved.chatId,response,expires},{expires});
      return response;
    } finally { clearTimeout(timeout); res.removeListener('close',disconnected); this.active.delete(sessionKey); }
  }
  sharedChat(device,session) {
    const current = this.core.store.get('companion_device',device.id), id = session.slice(7);
    if (!isId(id) || !current?.sharedChats?.includes(id)) throw httpError('POLICY',403);
    const chat = this.core.store.get('chat',id);
    if (!chat || chat.archived) throw httpError('NOT_FOUND',404);
    return chat;
  }
  conversations(device) {
    const current = this.core.store.get('companion_device',device.id), rows = new Map();
    for (const saved of this.core.store.list('companion_session').filter(s=>s.deviceId===device.id && s.sessionId && !s.shared)) {
      const chat = this.core.store.get('chat',saved.chatId);
      if (chat && !chat.archived) rows.set(saved.sessionId,{sessionId:saved.sessionId,title:chat.title,updated:chat.updated,shared:false});
    }
    for (const id of current.sharedChats || []) {
      const chat = this.core.store.get('chat',id);
      if (chat && !chat.archived) rows.set('shared_'+id,{sessionId:'shared_'+id,title:chat.title,updated:chat.updated,shared:true});
    }
    const conversations = [...rows.values()].sort((a,b)=>b.updated-a.updated);
    return {conversations:conversations.slice(0,100),truncated:conversations.length>100};
  }
  history(device,data) {
    if (Object.keys(data).length!==1 || !allowedId(data.sessionId)) throw httpError('INVALID',400);
    const session = data.sessionId;
    const chat = session.startsWith('shared_') ? this.sharedChat(device,session) : this.core.store.get('chat',this.core.store.get('companion_session',digest(device.id+'|'+session))?.chatId || '');
    if (!chat || chat.archived) throw httpError('NOT_FOUND',404);
    let remaining = 90000;
    const messages = [];
    for (let i=chat.messages.length-1;i>=0 && messages.length<100;i--) {
      const m = chat.messages[i], body = String(m.text || '');
      if (body.length>remaining) break;
      remaining -= body.length;
      messages.unshift({id:captures.stableId(chat.id+'|'+i+'|'+(m.time || 0)),role:m.role,text:body,created:m.time || null,...(m.error?{error:m.error}:{}),processing:m.processing?{provider:m.processing.provider,model:m.processing.model,reason:m.processing.reason}:null});
    }
    return {sessionId:session,title:chat.title,updated:chat.updated,messages,truncated:messages.length<chat.messages.length};
  }
}
module.exports = {CompanionGateway, DEFAULT, interfaces, privateAddress, SCOPES, CAPABILITIES};
