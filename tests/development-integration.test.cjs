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
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 10000);
      child.stdout.on('data', data => { if (data.toString().includes('127.0.0.1:3000')) {clearTimeout(timer);resolve();} });
      child.once('exit', code => {clearTimeout(timer);reject(Error('Server startup failed: '+code));});
      child.once('error', reject);
    });
    const base = 'http://127.0.0.1:3000';
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
    const summary = await call('summary');
    assert.equal(summary.ok, true);
    assert.equal(summary.result.settings.approved, false);
    assert.match(summary.result.modeLabel, /Not for PHI/);
    const today = await call('snfToday');
    assert.equal(today.result.demo, false);
    assert.equal(today.result.dataHealth.isSurveillanceComplete, false);
    for (const [op,data] of [['browserRecipes',{}], ['browserSave',{}], ['browserOpen',{browser:'firefox',url:'https://example.com'}], ['browserRun',{}], ['settings',{approved:true}], ['grantFolder',{}], ['runJob',{}], ['snfIngest',{reports:[]}], ['snfSeedData',{}]]) {
      assert.equal((await call(op,data)).ok, false, op+' must be denied');
    }
    assert.equal((await call('snfImportSchema')).ok, true);
    const workflows=await call('workflowSummary');assert.equal(workflows.ok,true);
    const decision=await call('workflowDecisionSave',{title:'Synthetic HTTP decision',reason:'Synthetic source review',reviewer:'Synthetic'});assert.equal(decision.ok,true);
    assert.equal((await call('workflowReview',{token:workflows.result.changes.token,reviewer:'Synthetic'})).ok,true);
    for(const op of ['workflowPacketExport','workflowMappedPreview','workflowMappingSave','workflowMappedImport','workflowMetricPreview','workflowMetricImport','workflowDocumentSearch','workflowProjectFiles','workflowPlaybookSave','workflowPlaybookPreview','workflowPlaybookRun','workflowBudgetSave'])assert.equal((await call(op)).error.code,'POLICY',op);

    assert.equal((await call('snfDemo',{mode:'demo'})).ok, true);
    assert.equal((await call('snfToday')).result.demo, true);
    const ds=await call('workflowSummary'),alert=ds.result.changes.items.find(r=>r.kind==='alert');
    assert.equal((await call('workflowActionSave',{...alert,owner:'Synthetic HTTP',reviewer:'Synthetic',note:'Review pending'})).ok,true);
    assert.match((await call('workflowPacket',{key:alert.key})).result.text,/DEMO DATA/);
    assert.equal(ds.result.decisions.length,0);

    assert.equal((await call('snfDemo',{mode:'production',reset:true})).ok, true);
    const live = await call('snfToday');
    assert.equal(live.result.demo, false);
    assert.equal(live.result.psychWatch.length, 0);
    assert.equal((await fetch(base+'/api/call',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,403);
  } finally {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {child.once('exit', resolve);setTimeout(resolve, 1000).unref();});
    fs.rmSync(root,{recursive:true,force:true});
  }
});

