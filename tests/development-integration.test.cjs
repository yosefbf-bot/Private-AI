'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

test('real server requires a session and restricts production, privileges and demo records', {timeout: 20000}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privateai-http-test-'));
  const token = crypto.randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: path.resolve(__dirname, '..'),
    env: {...process.env, NODE_ENV: 'production', PRIVATE_AI_DEV_TOKEN: token, PRIVATE_AI_DEV_DATA: root, OPENAI_API_KEY: '', GEMINI_API_KEY: ''},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
      child.stdout.on('data', data => { if (data.toString().includes('127.0.0.1:3000')) {clearTimeout(timer);resolve();} });
      child.once('exit', code => {clearTimeout(timer);reject(Error('Server startup failed: '+code));});
      child.once('error', reject);
    });
    const base = 'http://127.0.0.1:3000';
    for (const [route, method] of [['/API/call','POST'], ['/Api/call','POST'], ['/API/events','GET']]) {
      assert.equal((await fetch(base+route, {method})).status, 404, route+' must be rejected before auth or routing');
    }
    assert.equal((await fetch(base+'/api/health')).status, 401);
    assert.equal((await fetch(base+'/api/dev-token')).status, 404);
    const html=await (await fetch(base)).text();
    assert.ok(!html.includes(token), 'HTML must not disclose the access token');
    const response = await fetch(base+'/api/session', {method:'POST', headers:{authorization:'Bearer '+token, 'x-private-ai':'development'}});
    assert.equal(response.status, 200);
    const session = await response.json();
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const headers = {'content-type':'application/json', cookie, 'x-private-ai-csrf':session.csrf};
    const call = async (op, data={}) => (await fetch(base+'/api/call', {method:'POST', headers, body:JSON.stringify({op,data})})).json();
    for(const op of ['browserCredentialSave','browserCredentialDelete','browserCredentialRead'])assert.equal((await call(op,{})).error.code,'POLICY',op+' must be desktop-only');
    const unknownMatch=await call('staffingReplacementMatch',{openShift:{role:'CNA',hours:8},roster:[{name:'Synthetic HTTP unknown',role:'CNA'}]});assert.equal(unknownMatch.ok,true);assert.equal(unknownMatch.result[0].estimatedShiftCost,null);assert.equal(unknownMatch.result[0].currentHours,null);
    const knownMatch=await call('staffingReplacementMatch',{openShift:{role:'CNA',hours:12},roster:[{name:'Synthetic HTTP reviewed',role:'CNA',currentHours:35,hourlyRate:20,isAgency:false,overtimeRule:{reviewed:true,periodHoursConfirmed:true,thresholdHours:40,multiplier:1.5}}]});assert.equal(knownMatch.ok,true);assert.equal(knownMatch.result[0].estimatedShiftCost,310);
    assert.equal((await call('staffingReplacementMatch',{openShift:{role:'CNA',hours:8},roster:[{name:'Synthetic HTTP malformed',role:'CNA',currentHours:'38'}]})).error.code,'INVALID');
    const summary = await call('summary');
    assert.equal(summary.ok, true);
    assert.equal(summary.result.settings.approved, false);
    assert.equal((await call('settings',{approved:true,approvalFingerprint:summary.result.providerApprovalFingerprint})).error.code,'POLICY');
    const originalProviders = summary.result.savedProviders;
    for (const provider of ['applock','constructor','__proto__']) assert.equal((await call('deleteKey',{provider})).error.code,'INVALID');
    assert.deepEqual((await call('summary')).result.savedProviders, originalProviders);
    assert.match(summary.result.modeLabel, /Not for PHI/);
    const today = await call('snfToday');
    assert.equal(today.result.demo, false);
    assert.equal(today.result.dataHealth.isSurveillanceComplete, false);
    for (const [op,data] of [['browserRecipes',{}], ['browserSave',{}], ['browserOpen',{browser:'firefox',url:'https://example.com'}], ['browserRun',{}], ['settings',{approved:true}], ['grantFolder',{}], ['runJob',{}], ['snfIngest',{reports:[]}], ['snfSeedData',{}]]) {
      assert.equal((await call(op,data)).ok, false, op+' must be denied');
    }
    assert.equal((await call('snfImportSchema')).ok, true);
    const workflows=await call('workflowSummary');assert.equal(workflows.ok,true);
    const capture=await call('captureCreate',{sourceId:'synthetic-development-note',text:'Remind me to review the supplied report.',kind:'note',draftChannel:'whatsapp'});assert.equal(capture.ok,true);
    assert.equal((await call('captureList')).result.captures.length,1);
    const action=capture.result.actions[0];assert.equal((await call('captureActionUpdate',{id:action.id,revision:action.revision,note:'Synthetic reviewed item',owner:'Synthetic'})).ok,true);
    const draft=capture.result.drafts[0];assert.equal((await call('captureDraftSave',{id:draft.id,revision:1,captureId:capture.result.capture.id,channel:'whatsapp',body:'Synthetic reviewed internal draft'})).ok,true);
    const decision=await call('workflowDecisionSave',{title:'Synthetic HTTP decision',reason:'Synthetic source review',reviewer:'Synthetic'});assert.equal(decision.ok,true);
    assert.equal((await call('workflowReview',{token:(await call('workflowSummary')).result.changes.token,reviewer:'Synthetic'})).ok,true);
    for(const op of ['companionInvite','companionInviteCancel','companionInviteStatus','workflowPacketExport','workflowMappedPreview','workflowMappingSave','workflowMappedImport','workflowMetricPreview','workflowMetricImport','workflowDocumentSearch','workflowSearch','workflowDocumentReview','workflowDocumentReviewSave','workflowDisclosureReview','workflowDisclosureRedact','workflowCommunicationSettings','workflowCommunicationSave','workflowCommunicationCheck','workflowCommunicationList','workflowCommunicationFollowup','workflowCommunicationDismiss','workflowProjectFiles','workflowPlaybookSave','workflowPlaybookPreview','workflowPlaybookRun','workflowBudgetSave'])assert.equal((await call(op)).error.code,'POLICY',op);

    assert.equal((await call('snfDemo',{mode:'demo'})).ok, true);
    assert.equal((await call('snfToday')).result.demo, true);
    assert.equal((await call('captureList')).result.captures.length,0);
    assert.equal((await call('captureCreate',{sourceId:'synthetic-demo-note',text:'Synthetic demo note',kind:'note'})).ok,true);
    assert.equal((await call('captureList')).result.demo,true);
    const ds=await call('workflowSummary'),alert=ds.result.changes.items.find(r=>r.kind==='alert');
    assert.equal((await call('workflowActionSave',{...alert,owner:'Synthetic HTTP',reviewer:'Synthetic',note:'Review pending'})).ok,true);
    assert.match((await call('workflowPacket',{key:alert.key})).result.text,/DEMO DATA/);
    assert.equal(ds.result.decisions.length,0);

    assert.equal((await call('snfDemo',{mode:'production',reset:true})).ok, true);
    const live = await call('snfToday');
    assert.equal(live.result.demo, false);
    assert.equal(live.result.psychWatch.length, 0);
    assert.equal((await call('captureList')).result.captures.length,1);
    assert.equal((await fetch(base+'/api/call',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,403);
    assert.match(output, /PRIVATE_AI_DEV_TOKEN.*\.env/);
    assert.equal(output.includes(token), false, 'stdout and stderr must never disclose the bearer token');
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {child.once('exit', resolve);setTimeout(resolve, 1000).unref();});
    fs.rmSync(root,{recursive:true,force:true});
  }
});

