'use strict';
// One encrypted, source-linked capture path. Drafts and review todos are not clinical conclusions.
const crypto = require('node:crypto');
const {fail, isId, text} = require('./security.cjs');
const {scopedCore} = require('./executive-workspace.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const signature = value => hash(JSON.stringify(value));
const stableId = value => {
  const h = hash(value);
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};
const actorKey = actor => signature([actor.kind, actor.id]);
const expires = core => core.settings().retentionDays ? Date.now() + core.settings().retentionDays * 86400000 : null;
function context(core, actor = {kind:'desktop', id:'desktop'}) {
  core.assertUnlocked();
  if (!actor || !['desktop','companion','whatsapp'].includes(actor.kind) || typeof actor.id !== 'string' || !actor.id || actor.id.length > 300) throw fail('INVALID');
  const selected = actor.kind === 'desktop' ? scopedCore(core) : core;
  if (actor.kind !== 'desktop' && (core.developmentMode || require('./snf/demo.cjs').forCore(core).current().demoMode)) throw fail('POLICY');
  return {core:selected, actor, key:actorKey(actor)};
}
function owns(row, key, actor) { return !!row && (actor.kind === 'desktop' || row.actorKey === key); }
function requiredString(value, max, allowEmpty = false) {
  if (typeof value !== 'string') throw fail('INVALID');
  const clean = text(value, max).trim();
  if (!allowEmpty && !clean) throw fail('INVALID');
  return clean;
}
function deadline(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value <= 0 || !Number.isFinite(new Date(value).getTime())) throw fail('INVALID');
  return value;
}
function assertFields(data, fields) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !fields.includes(k))) throw fail('INVALID');
}
function action(core, id) {
  const todo = core.store.get('todo',id), meta = core.store.get('wf_action_meta','todo:'+id);
  if (!todo || !meta?.captureId) return null;
  return {id, title:todo.title, description:todo.description, owner:todo.owner, dueAt:todo.dueAt, status:todo.status, captureId:meta.captureId, revision:signature([todo,meta]), reviewRequired:meta.reviewRequired !== false, unknownFields:[...(!todo.owner?['owner']:[]),...(!todo.dueAt?['dueAt']:[]),...(!meta.location?['location']:[])], evidence:meta.evidence || null, note:meta.note || ''};
}
function bundle(core, row, replayed = false) {
  return {capture:row, actions:row.actionIds.map(id=>action(core,id)).filter(Boolean), drafts:row.draftIds.map(id=>core.store.get('capture_draft',id)).filter(Boolean), replayed};
}
function create(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  assertFields(data,['sourceId','text','kind','observedAt','location','dueAt','owner','evidenceIds','draftChannel']);
  const sourceId = requiredString(data.sourceId,100), note = requiredString(data.text,12000);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(sourceId) || !['note','round','reminder'].includes(data.kind || 'note')) throw fail('INVALID');
  const location = requiredString(data.location ?? '',160,true), owner = requiredString(data.owner ?? '',100,true), dueAt = deadline(data.dueAt);
  if (data.observedAt != null && (!Number.isSafeInteger(data.observedAt) || data.observedAt <= 0 || data.observedAt > Date.now()+300000)) throw fail('INVALID');
  const evidenceIds = data.evidenceIds || [];
  if (!Array.isArray(evidenceIds) || evidenceIds.length > 6 || new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some(id=>!isId(id) || !owns(core.store.get('capture_evidence',id),ctx.key,ctx.actor))) throw fail('INVALID');
  if (data.draftChannel != null && !['outlook','whatsapp'].includes(data.draftChannel)) throw fail('INVALID');
  const normalized = {sourceId,text:note,kind:data.kind || 'note',observedAt:data.observedAt || null,location,dueAt,owner,evidenceIds,draftChannel:data.draftChannel || null};
  const id = stableId(ctx.key+'|'+sourceId), inputHash = signature(normalized), prior = core.store.get('capture_note',id);
  if (prior) { if (prior.inputHash !== inputHash) throw fail('CHANGED'); return bundle(core,prior,true); }
  const parsed = new (require('./executive-assistant-engine.cjs').ExecutiveAssistantEngine)(core).parseVoiceMemo(note);
  const proposals = [...(parsed.extractedActions || parsed.actions || []),...(parsed.unmatchedEvidence || []).map(evidence=>({description:evidence.text,evidence}))];
  if (proposals.length>30) throw fail('LIMIT');
  if (!proposals.length) proposals.push({description:note,evidence:{start:0,end:note.length,text:note}});
  const now = Date.now(), row = {id,sourceId,actorKey:ctx.key,actor:ctx.actor, ...normalized,inputHash,created:now,observedAt:normalized.observedAt,revision:1,actionIds:[],draftIds:[],analysis:'Text-based review proposals only. Evidence images are preserved, not interpreted.'};
  core.store.transaction(()=>{
    for (const [index,p] of proposals.entries()) {
      const aid = stableId(id+'|action|'+index), description = (p.description || note).slice(0,4000);
      core.saveTodo({id:aid,title:'Review: '+description.slice(0,185),description,owner,dueAt,source:'manual',priority:'normal',reminderEnabled:!!dueAt});
      core.store.put('wf_action_meta','todo:'+aid,{captureId:id,actorKey:ctx.key,location:location || (p.unknownFields?.location?'':p.location || ''),evidence:p.evidence || {start:0,end:note.length,text:note},reviewRequired:true,note:'',updatedAt:now,history:[]},{expires:expires(core)});
      row.actionIds.push(aid);
    }
    if (data.draftChannel) {
      const did = stableId(id+'|draft');
      core.store.put('capture_draft',did,{id:did,captureId:id,actorKey:ctx.key,channel:data.draftChannel,recipient:'',subject:'Follow-up for review',body:'Please review the following observation and advise on the next steps.\n\n'+note,status:'draft',revision:1,created:now,updated:now},{expires:expires(core)});
      row.draftIds.push(did);
    }
    core.store.put('capture_note',id,row,{expires:expires(core)});
  });
  core.emit({type:'captures_changed'});
  return bundle(core,row);
}
function list(core, actor) {
  const ctx = context(core,actor); core = ctx.core;
  const rows = core.store.list('capture_note').filter(r=>owns(r,ctx.key,ctx.actor));
  const result={captures:[],actions:[],drafts:[],truncated:false,demo:!!core.executiveDemo};
  for(const row of rows.slice(0,100)) {
    const added=bundle(core,row),candidate={...result,captures:[...result.captures,row],actions:[...result.actions,...added.actions],drafts:[...result.drafts,...added.drafts]};
    if(Buffer.byteLength(JSON.stringify(candidate))>512*1024)break;
    Object.assign(result,candidate);
  }
  result.truncated=result.captures.length<rows.length;
  return result;
}
function update(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  assertFields(data,['id','revision','owner','dueAt','note','complete']);
  const item = isId(data.id) && action(core,data.id), row = item && core.store.get('capture_note',item.captureId);
  if (!owns(row,ctx.key,ctx.actor)) throw fail('NOT_FOUND');
  if (data.revision !== item.revision) throw fail('REVIEW_CHANGED');
  const owner = requiredString(data.owner ?? item.owner,100,true), note = requiredString(data.note ?? '',4000,true), dueAt = deadline(data.dueAt ?? (Object.hasOwn(data,'dueAt')?null:item.dueAt));
  if (data.complete !== undefined && typeof data.complete !== 'boolean' || data.complete && !note) throw fail('INVALID');
  core.store.transaction(()=>{
    const todo = core.store.get('todo',data.id), meta = core.store.get('wf_action_meta','todo:'+data.id);
    const reminderEnabled = !!dueAt && (todo.dueAt == null || todo.reminderEnabled !== false);
    core.saveTodo({...todo,owner,dueAt,reminderEnabled,status:data.complete?'completed':todo.status});
    core.store.put('wf_action_meta','todo:'+data.id,{...meta,reviewRequired:false,note,updatedAt:Date.now(),history:[...(meta.history || []),{at:Date.now(),actorKey:ctx.key,note,owner,dueAt,complete:!!data.complete}].slice(-100)},{expires:expires(core)});
  });
  core.emit({type:'captures_changed'});
  return action(core,data.id);
}
function saveDraft(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  assertFields(data,['id','revision','captureId','channel','body','recipient','subject']);
  const capture = isId(data.captureId) && core.store.get('capture_note',data.captureId);
  if (!owns(capture,ctx.key,ctx.actor)) throw fail('NOT_FOUND');
  if (!['outlook','whatsapp'].includes(data.channel)) throw fail('INVALID');
  const id = data.id || stableId(capture.id+'|draft|'+data.channel), prior = core.store.get('capture_draft',id);
  if (!isId(id) || prior && prior.captureId !== capture.id) throw fail('INVALID');
  if (!prior && capture.draftIds.length>=6) throw fail('LIMIT');
  if (prior && data.revision !== prior.revision) throw fail('REVIEW_CHANGED');
  const row = {id,captureId:capture.id,actorKey:capture.actorKey,channel:data.channel,body:requiredString(data.body,12000),recipient:requiredString(data.recipient ?? '',300,true),subject:requiredString(data.subject ?? '',200,true),status:'draft',revision:(prior?.revision || 0)+1,created:prior?.created || Date.now(),updated:Date.now()};
  core.store.transaction(()=>{
    core.store.put('capture_draft',id,row,{expires:expires(core)});
    if (!capture.draftIds.includes(id)) { capture.draftIds.push(id); capture.revision++; core.store.put('capture_note',capture.id,capture,{expires:expires(core)}); }
  });
  core.emit({type:'captures_changed'});
  return row;
}
function writeEvidence(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  assertFields(data,['uploadId','index','total','name','mime','bytes','sha256','data']);
  if (!isId(data.uploadId) || !Number.isInteger(data.index) || !Number.isInteger(data.total) || data.total<1 || data.total>64 || data.index<0 || data.index>=data.total || !Number.isSafeInteger(data.bytes) || data.bytes<1 || data.bytes>5*1024**2 || !/^[a-f0-9]{64}$/.test(data.sha256 || '') || !['image/jpeg','image/png','application/pdf','text/plain'].includes(data.mime)) throw fail('INVALID');
  const name = requiredString(data.name,160);
  if (/[\\/\u0000-\u001f]/.test(name) || typeof data.data !== 'string' || data.data.length>110000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.data)) throw fail('INVALID');
  const chunk = Buffer.from(data.data,'base64');
  if (!chunk.length || chunk.length>80*1024) throw fail('LIMIT');
  const id = stableId(ctx.key+'|evidence|'+data.uploadId), inputHash = signature([data.total,name,data.mime,data.bytes,data.sha256]), done = core.store.get('capture_evidence',id);
  if (done) { if (done.inputHash !== inputHash || done.chunkHashes[data.index] !== hash(chunk)) throw fail('CHANGED'); return {uploadId:data.uploadId,index:data.index,complete:true,evidenceId:id,sha256:done.sha256,bytes:done.bytes}; }
  const prior = core.store.get('capture_upload',id), row = prior || {id,actorKey:ctx.key,inputHash,total:data.total,chunks:{}};
  if (row.inputHash !== inputHash || row.chunks[data.index] && row.chunks[data.index] !== data.data) throw fail('CHANGED');
  row.chunks[data.index] = data.data;
  if (Object.values(row.chunks).reduce((n,s)=>n+Buffer.from(s,'base64').length,0)>data.bytes) throw fail('LIMIT');
  if (!prior && core.store.list('capture_upload').filter(r=>r.actorKey===ctx.key).length>=10) throw fail('LIMIT');
  if (Object.keys(row.chunks).length !== data.total) {
    core.store.put('capture_upload',id,row,{expires:Date.now()+86400000});
    return {uploadId:data.uploadId,index:data.index,complete:false};
  }
  const bytes = Buffer.concat(Array.from({length:data.total},(_,i)=>Buffer.from(row.chunks[i],'base64')));
  if (bytes.length !== data.bytes || hash(bytes) !== data.sha256) throw fail('CHANGED');
  if (data.mime === 'image/png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || data.mime === 'image/jpeg' && !bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || data.mime === 'application/pdf' && bytes.subarray(0,5).toString() !== '%PDF-' || data.mime === 'text/plain' && bytes.includes(0)) throw fail('FILE');
  core.store.transaction(()=>{
    core.store.put('capture_evidence',id,{id,actorKey:ctx.key,inputHash,chunkHashes:Object.fromEntries(Object.entries(row.chunks).map(([i,b])=>[i,hash(Buffer.from(b,'base64'))])),name,mime:data.mime,bytes:bytes.length,sha256:data.sha256,data:bytes.toString('base64'),created:Date.now()},{expires:expires(core)});
    core.store.delete('capture_upload',id);
  });
  return {uploadId:data.uploadId,index:data.index,complete:true,evidenceId:id,sha256:data.sha256,bytes:bytes.length};
}
function readEvidence(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  assertFields(data,['id']);
  const row = isId(data.id) && core.store.get('capture_evidence',data.id);
  if (!owns(row,ctx.key,ctx.actor)) throw fail('NOT_FOUND');
  const {id,name,mime,bytes,sha256,data:content} = row;
  return {id,name,mime,bytes,sha256,data:content};
}
function notificationRows(core, ctx) {
  if (!core.executiveDemo && core.settings().autoReminders !== false) {
    for (const row of core.store.list('capture_note')) {
      if (!owns(row,ctx.key,ctx.actor)) continue;
      for (const aid of row.actionIds) {
        const todo = core.store.get('todo',aid);
        if (todo?.status !== 'pending' || !todo.reminderEnabled || !todo.dueAt || todo.dueAt>Date.now()) continue;
        const id = stableId(row.actorKey+'|reminder|'+aid+'|'+todo.dueAt);
        if (!core.store.get('capture_notification',id)) core.store.put('capture_notification',id,{id,actorKey:row.actorKey,captureId:row.id,actionId:aid,type:'reminder',deadline:todo.dueAt,created:Date.now(),status:'pending'},{expires:expires(core)});
      }
    }
  }
  const rows = core.store.list('capture_notification').filter(row=>owns(row,ctx.key,ctx.actor)).filter(row=>{
    const todo = core.store.get('todo',row.actionId);
    return core.settings().autoReminders !== false && todo?.reminderEnabled !== false && todo?.status === 'pending' && todo.dueAt===row.deadline && todo.dueAt<=Date.now();
  }).sort((a,b)=>Number(a.status==='acknowledged')-Number(b.status==='acknowledged') || a.created-b.created || a.id.localeCompare(b.id));
  return {notifications:rows.slice(0,100).map(({id,type,created,actionId,status})=>({id,type,created,actionId,status})),truncated:rows.length>100};
}
function notifications(core, actor) {
  const ctx = context(core,actor);
  return notificationRows(ctx.core,ctx);
}
// Narrow principal authenticated by CompanionGateway. This path projects only
// administrative deadline metadata; it does not relax Core.assertUnlocked.
function notificationPrincipal(core, principal) {
  const current = core.store.get('companion_device',principal?.id);
  if (!principal?.notificationOnly || !current?.notificationKeyHash || current.notificationKeyHash!==principal.notificationKeyHash || !current.scopes.notifications || !core.store.get('companion','settings')?.enabled) throw fail('POLICY');
  if (core.locked && !current.notificationsWhileLocked) throw fail('LOCKED');
  if (core.developmentMode || require('./snf/demo.cjs').forCore(core).current().demoMode) throw fail('POLICY');
  const actor = {kind:'companion',id:current.id};
  return {core,actor,key:actorKey(actor)};
}
function backgroundNotifications(core,principal) { return notificationRows(core,notificationPrincipal(core,principal)); }
function acknowledge(core, data, actor) {
  const ctx = context(core,actor); core = ctx.core;
  return acknowledgeRow(core,data,ctx);
}
function acknowledgeRow(core,data,ctx) {
  assertFields(data,['id']);
  const row = isId(data.id) && core.store.get('capture_notification',data.id);
  if (!owns(row,ctx.key,ctx.actor)) throw fail('NOT_FOUND');
  core.store.put('capture_notification',row.id,{...row,status:'acknowledged',acknowledgedAt:Date.now()},{expires:expires(core)});
  return {id:row.id,status:'acknowledged'};
}
function backgroundAcknowledge(core,data,principal) { return acknowledgeRow(core,data,notificationPrincipal(core,principal)); }
function dispatch(core, op, data) {
  switch (op) {
    case 'captureList': return list(core);
    case 'captureCreate': return create(core,data);
    case 'captureActionUpdate': return update(core,data);
    case 'captureDraftSave': return saveDraft(core,data);
    case 'captureEvidenceWrite': return writeEvidence(core,data);
    case 'captureEvidenceRead': return readEvidence(core,data);
    default: throw fail('INVALID');
  }
}
module.exports = {create,list,update,saveDraft,writeEvidence,readEvidence,notifications,acknowledge,backgroundNotifications,backgroundAcknowledge,dispatch,actorKey,stableId};
