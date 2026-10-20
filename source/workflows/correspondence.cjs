'use strict';
// Cached, owner-authorized review only. This module never reads an Inbox,
// executes message instructions, calls a provider, or sends/deletes messages.
const crypto = require('node:crypto');
const {fail, uuid, isId} = require('../security.cjs');
const captures = require('../capture-workflows.cjs');
const messagingPolicy = require('../messaging-policy.cjs');
const DEFAULTS = Object.freeze({enabled:false, whatsapp:true, outlook:false,
  includeUnread:false, intervalMinutes:15,
  keywords:['urgent','asap','please reply','follow up','time-sensitive']});
const SOURCE = 'wf_communication_source', CANDIDATE = 'wf_communication_candidate';
const MAX_ROWS = 100, MAX_TEXT = 12000;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fields(data, allowed) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !allowed.includes(k))) throw fail('INVALID');
}
function owner(core) {
  if (core.locked) throw fail('LOCKED');
  core.assertUnlocked();
  if (core.developmentMode || core.executiveDemo || core.resources.isBackground() || require('../snf/demo.cjs').forCore(core).current().demoMode) throw fail('POLICY');
}
function readable(core) {
  return !core.locked && !core.developmentMode && !core.executiveDemo && !core.resources.isBackground() && !require('../snf/demo.cjs').forCore(core).current().demoMode;
}
function config(core) {
  const saved = core.store.get('wf_communication','settings');
  return {...DEFAULTS, keywords:[...DEFAULTS.keywords], revision:null, lastCheck:null, ...saved};
}
function settings(core) {
  owner(core);
  return {...config(core), coverage:'Approved cached WhatsApp messages and explicitly selected Outlook snapshots only. No Inbox watcher or guaranteed reply detection.'};
}
function save(core, data) {
  owner(core);
  fields(data, [...Object.keys(DEFAULTS), 'revision']);
  const old = core.store.get('wf_communication','settings');
  if (old && data.revision !== old.revision) throw fail('REVIEW_CHANGED');
  const next = {...config(core), ...data};
  for (const key of ['enabled','whatsapp','outlook','includeUnread']) if (typeof next[key] !== 'boolean') throw fail('INVALID');
  if (!Number.isInteger(next.intervalMinutes) || next.intervalMinutes < 5 || next.intervalMinutes > 1440 ||
      !Array.isArray(next.keywords) || next.keywords.length > 20 ||
      next.keywords.some(k => typeof k !== 'string' || !k.trim() || k.length > 100 || /[\x00-\x1f]/.test(k))) throw fail('INVALID');
  next.keywords = [...new Set(next.keywords.map(k => k.trim().toLocaleLowerCase()))];
  next.revision = uuid();
  next.lastCheck = null;
  core.store.put('wf_communication','settings',next);
  core.store.audit('settings');
  return settings(core);
}
function whatsappAllowed(core, row, opts = config(core)) {
  const policy = core.store.get('messaging','settings') || {};
  return opts.whatsapp && policy.enabled === true && row.adapter === policy.adapter &&
    messagingPolicy.conversationId.test(row.groupId || '') &&
    (policy.readAll === true || !!messagingPolicy.selected(policy,row));
}
function allowed(core, row, opts = config(core)) {
  return row.channel === 'whatsapp' ? whatsappAllowed(core,row,opts)
    : row.channel === 'outlook' && opts.outlook && core.store.get('access','outlook')?.readMessages === true;
}
function expiry(core, observedAt = Date.now()) {
  const days = core.settings().retentionDays;
  return days === 0 ? null : observedAt + (days ?? 100) * 86400000;
}
function trim(core, kind) {
  // Delete only disposable triage metadata. Canonical captures/tasks remain intact.
  core.store.db.prepare('DELETE FROM records WHERE kind=? AND id NOT IN (SELECT id FROM records WHERE kind=? ORDER BY updated DESC,id DESC LIMIT ?)').run(kind,kind,MAX_ROWS);
}
function knownDate(value) {
  if (Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime())) return value;
  if (typeof value === 'string' && value.length <= 80 && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) && Number.isFinite(Date.parse(value))) {
    const clock = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (clock && (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] || 0) > 59)) return null;
    const [year,month,day] = value.slice(0,10).split('-').map(Number);
    const actual = new Date(Date.UTC(year,month-1,day));
    if (actual.toISOString().slice(0,10) === value.slice(0,10)) return value;
  }
  return null;
}
function matches(source, opts) {
  const searchable = (source.subject+'\n'+source.text).toLocaleLowerCase();
  const keywords = opts.keywords.filter(k => searchable.includes(k));
  const unread = opts.includeUnread && source.unread === true;
  return {keywords, unread, matched:keywords.length > 0 || unread};
}
function record(core, input, opts) {
  const id = hash([input.channel,input.sourceId]);
  const sourceHash = hash([input.channel,input.sourceId,input.text,input.subject,input.sourceDate,input.unread,input.partial]);
  const old = core.store.get(SOURCE,id), now = Date.now();
  const source = {...input,id,sourceHash,revision:old?.sourceHash === sourceHash ? old.revision : (old?.revision || 0)+1,
    observedAt:old?.sourceHash === sourceHash && Number.isSafeInteger(old.observedAt) && old.observedAt > 0 ? old.observedAt : now};
  // Rechecking a cache is not a fresh observation of the original message.
  core.store.put(SOURCE,id,source,{updated:now,expires:expiry(core,source.observedAt)});
  const found = matches(source,opts), cid = captures.stableId('communication|'+id), prior = core.store.get(CANDIDATE,cid);
  if (!found.matched && !prior) return source;
  const status = !found.matched ? 'not_matched' : !prior || prior.sourceHash !== sourceHash || prior.status === 'not_matched' ? 'review' : prior.status;
  const reason = 'Local keyword/unread heuristic; importance and reply status require your review.';
  const changed = !prior || prior.sourceHash !== sourceHash || prior.status !== status || hash(prior.matchedKeywords) !== hash(found.keywords) || prior.unreadMatch !== found.unread;
  const row = {...prior,id:cid,sourceId:id,channel:source.channel,sourceHash,sourceLabel:source.sourceLabel,
    revision:changed ? (prior?.revision || 0)+1 : prior.revision,status,matchedKeywords:found.keywords,
    unreadMatch:found.unread,reason,owner:null,dueAt:null,observedAt:source.observedAt,
    changedSinceReview:!!prior?.reviewedSourceHash && prior.reviewedSourceHash !== sourceHash};
  core.store.put(CANDIDATE,cid,row,{updated:now,expires:expiry(core,source.observedAt)});
  return source;
}
function observeOutlook(core, data, result) {
  owner(core);
  fields(data,['id','storeId']);
  const opts = config(core);
  if (!opts.enabled || !opts.outlook || core.store.get('access','outlook')?.readMessages !== true) return false;
  if (typeof data.id !== 'string' || !data.id || data.id.length > 2000 || typeof data.storeId !== 'string' || !data.storeId || data.storeId.length > 2000 ||
      !result || typeof result.text !== 'string' || result.text.length > 50000) throw fail('INVALID');
  // The helper currently embeds headers in text. Do not fabricate unread/date
  // fields by guessing from free text; retain optional structured facts only.
  const input = {channel:'outlook',sourceId:hash([data.id,data.storeId]),sourceRef:{channel:'outlook',id:data.id,storeId:data.storeId},text:result.text.slice(0,MAX_TEXT),
    subject:typeof result.subject === 'string' ? result.subject.slice(0,300) : '',
    sourceLabel:'Selected Outlook message', sourceDate:knownDate(result.received),
    unread:typeof result.unread === 'boolean' ? result.unread : null,
    partial:result.text.length > MAX_TEXT || result.truncated === true,
    attachmentsExcluded:result.attachmentsExcluded !== false};
  core.store.transaction(() => { record(core,input,opts); trim(core,SOURCE); trim(core,CANDIDATE); });
  return true;
}
function whatsappInput(row) {
  return {channel:'whatsapp',sourceId:row.id,sourceRef:{channel:'whatsapp',id:row.id},adapter:row.adapter,groupId:row.groupId,groupName:typeof row.groupName === 'string' ? row.groupName.slice(0,200) : '',
    text:row.text.slice(0,MAX_TEXT),subject:'',sourceLabel:'Cached WhatsApp conversation',sourceDate:knownDate(row.time),
    unread:typeof row.unread === 'boolean' ? row.unread : null,
    partial:row.text.length >= MAX_TEXT || row.truncated === true,attachmentsExcluded:true};
}
function check(core, data = {}) {
  owner(core); fields(data,[]);
  const opts = config(core);
  const cache = opts.whatsapp && core.store.get('messaging','settings')?.enabled === true ? core.store.recent('messageIn',MAX_ROWS+1) : [];
  core.store.transaction(() => {
    for (const row of cache.slice(0,MAX_ROWS)) {
      if (typeof row.id !== 'string' || !row.id || row.id.length > 300 || row.incoming !== true || typeof row.text !== 'string' || !whatsappAllowed(core,row,opts)) continue;
      record(core,whatsappInput(row),opts);
    }
    for (const source of core.store.recent(SOURCE,MAX_ROWS)) if (source.channel === 'outlook' && allowed(core,source,opts)) record(core,source,opts);
    trim(core,SOURCE); trim(core,CANDIDATE);
    core.store.put('wf_communication','settings',{...opts,revision:opts.revision || uuid(),lastCheck:Date.now(),lastCheckTruncated:cache.length > MAX_ROWS});
  });
  return list(core);
}
function tick(core) {
  if (!readable(core) || core.settings().workerPaused) return false;
  const opts = config(core);
  if (!opts.enabled || opts.lastCheck && Date.now()-opts.lastCheck < opts.intervalMinutes*60000) return false;
  check(core);
  return true;
}
function views(core) {
  return {sources:new Map(core.store.recent(SOURCE,MAX_ROWS).map(s => [s.id,s])),
    whatsapp:new Map((config(core).whatsapp && core.store.get('messaging','settings')?.enabled === true ? core.store.recent('messageIn',MAX_ROWS) : []).map(s => [s.id,s]))};
}
function currentSource(core, row, cached = views(core)) {
  const source = cached.sources.get(row.sourceId);
  if (!source || !allowed(core,source)) return null;
  if (source.channel === 'whatsapp') {
    const reading = cached.whatsapp.get(source.sourceId);
    if (!reading || reading.incoming !== true || typeof reading.text !== 'string' || !whatsappAllowed(core,reading)) return null;
    const input = whatsappInput(reading);
    if (hash([input.channel,input.sourceId,input.text,input.subject,input.sourceDate,input.unread,input.partial]) !== source.sourceHash) return null;
  }
  return source;
}
function list(core, data = {}) {
  owner(core); fields(data,[]);
  const candidates = [], cached = views(core);
  for (const row of core.store.recent(CANDIDATE,MAX_ROWS)) {
    const source = currentSource(core,row,cached);
    if (!source) continue;
    candidates.push({...row,text:source.text,subject:source.subject,sourceDate:source.sourceDate,unread:source.unread,partial:source.partial,
      attachmentsExcluded:source.attachmentsExcluded,unknownFields:['owner','dueAt','replyStatus']});
  }
  return {settings:settings(core),candidates,truncated:config(core).lastCheckTruncated === true || core.store.count(CANDIDATE) >= MAX_ROWS,
    partialCount:candidates.filter(r=>r.partial).length,coverage:'At most 100 recent approved cached items per check. Selected Outlook snapshots are retained references; new mail and replies are not automatically monitored.'};
}
function review(core, data, extra = []) {
  owner(core); fields(data,['id','revision',...extra]);
  const row = isId(data.id) && core.store.get(CANDIDATE,data.id), source = row && currentSource(core,row);
  if (!row || !source) throw fail('NOT_FOUND');
  if (data.revision !== row.revision || row.sourceHash !== source.sourceHash) throw fail('REVIEW_CHANGED');
  return {row,source};
}
function captureInput(prior) {
  return Object.fromEntries(['sourceId','text','kind','observedAt','location','dueAt','owner','evidenceIds','draftChannel'].map(k => [k,prior[k]]));
}
function createFollowup(core, data) {
  const {row,source} = review(core,data,['owner','dueAt','draftChannel']);
  if (row.status === 'dismissed' || !matches(source,config(core)).matched) throw fail('POLICY');
  if (data.owner !== undefined && (typeof data.owner !== 'string' || data.owner.length > 100) ||
      data.dueAt != null && (!Number.isSafeInteger(data.dueAt) || data.dueAt <= 0 || !Number.isFinite(new Date(data.dueAt).getTime())) ||
      data.draftChannel != null && !['outlook','whatsapp'].includes(data.draftChannel)) throw fail('INVALID');
  const sourceId = 'correspondence_'+row.sourceId;
  const captureId = captures.stableId(captures.actorKey({kind:'desktop',id:'desktop'})+'|'+sourceId);
  const prior = core.store.get('capture_note',captureId);
  // One immutable capture per original correspondence source. A changed source,
  // repeated click, or new deadline cannot clone work or resurrect removed todos.
  const input = prior ? captureInput(prior) : {sourceId,text:source.text,kind:'note',observedAt:source.observedAt,
    owner:data.owner || '',dueAt:data.dueAt ?? null,...(data.draftChannel ? {draftChannel:data.draftChannel} : {})};
  let created;
  core.store.transaction(() => {
    created = captures.create(core,input);
    if (!prior) {
      for (const id of created.capture.actionIds) {
        const meta = core.store.get('wf_action_meta','todo:'+id);
        core.store.put('wf_action_meta','todo:'+id,{...meta,communication:{candidateId:row.id,channel:row.channel,sourceId:row.sourceId,sourceHash:source.sourceHash,sourceRef:source.sourceRef,sourceLabel:source.sourceLabel,sourceDate:source.sourceDate,partial:source.partial}},{expires:expiry(core)});
      }
    }
    core.store.put(CANDIDATE,row.id,{...row,status:'followup',captureId,reviewedSourceHash:row.reviewedSourceHash || source.sourceHash,
      changedSinceReview:!!row.reviewedSourceHash && row.reviewedSourceHash !== source.sourceHash,revision:row.revision+1},{expires:expiry(core)});
  });
  // Source metadata changed action revisions during the transaction. Return the
  // authoritative action revisions rather than the pre-metadata create bundle.
  created = captures.create(core,captureInput(created.capture));
  return {...created,replayed:!!prior,alreadyCreated:!!prior,ignoredNewDeadline:!!prior && Object.hasOwn(data,'dueAt'),
    changedSinceReview:!!row.reviewedSourceHash && row.reviewedSourceHash !== source.sourceHash,
    instruction:prior ? 'Existing follow-up retained. Edit its canonical actions to change owner/deadline or review changed source evidence.' : 'Review proposals created. Any message draft remains internal; nothing was sent.'};
}
function dismiss(core, data) {
  const {row} = review(core,data);
  const saved = {...row,status:'dismissed',revision:row.revision+1,dismissedAt:Date.now()};
  core.store.put(CANDIDATE,row.id,saved,{expires:expiry(core)});
  return {id:row.id,status:saved.status,revision:saved.revision};
}
module.exports = {settings,save,observeOutlook,check,tick,list,createFollowup,dismiss};
