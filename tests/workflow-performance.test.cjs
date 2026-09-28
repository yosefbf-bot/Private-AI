'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers.cjs');
const {dispatch} = require('../source/workflows/index.cjs');

test('workflow summaries read file metadata without decrypting document bodies and reflect edits immediately', async t => {
  const {core, cipher} = fixture(t);
  core.store.put('file', 'synthetic-a', {name:'Synthetic A', text:'SYNTHETIC DOCUMENT BODY '.repeat(10000)}, {updated:100});
  core.store.put('file', 'synthetic-b', {name:'Synthetic B', text:'Synthetic B body'}, {updated:200});
  const open = cipher.open.bind(cipher), documentReads = [];
  cipher.open = (payload, aad) => { if(aad.startsWith('file:')) documentReads.push(aad); return open(payload, aad); };
  let summary = await dispatch(core, 'workflowSummary');
  assert.deepEqual(summary.files, [{id:'synthetic-b',name:'Synthetic B'}, {id:'synthetic-a',name:'Synthetic A'}]);
  assert.deepEqual(documentReads, []);
  assert.doesNotMatch(JSON.stringify(summary), /SYNTHETIC DOCUMENT BODY/);
  core.store.put('file', 'synthetic-a', {name:'Updated A', text:'Updated synthetic text'}, {updated:300});
  core.store.delete('file', 'synthetic-b');
  summary = await dispatch(core, 'workflowSummary');
  assert.deepEqual(summary.files, [{id:'synthetic-a',name:'Updated A'}]);
  assert.deepEqual(documentReads, []);
});

test('projected workflow jobs preserve legacy playbooks and failed drafts without exposing recovery inputs', async t => {
  const {core} = fixture(t), playbook = {id:'synthetic',revision:2};
  core.store.put('job','failed',{title:'Failed',status:'failed',recoveryInput:{playbook,text:'PRIVATE_SYNTHETIC_RECOVERY'},savedAnswer:{text:'Synthetic failed draft'}},{updated:300});
  core.store.put('job','completed',{title:'Completed',status:'completed',playbook,savedAnswer:{text:'PRIVATE_COMPLETED_ANSWER'}},{updated:200});
  core.store.put('job','ordinary',{title:'Ordinary',status:'failed',savedAnswer:{text:'PRIVATE_ORDINARY_ANSWER'}},{updated:100});
  const summary = await dispatch(core, 'workflowSummary');
  assert.deepEqual(summary.runs.map(j=>j.id), ['failed','completed']);
  assert.deepEqual(summary.runs[0].playbook, playbook);
  assert.equal(summary.runs[0].draftText, 'Synthetic failed draft');
  assert.equal(summary.runs[1].draftText, null);
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_SYNTHETIC_RECOVERY|PRIVATE_COMPLETED_ANSWER|PRIVATE_ORDINARY_ANSWER/);
});

test('review changes distinguish deleted sources from completed and unchanged actions', async t => {
  const {core} = fixture(t);
  for(const id of ['retained','completed','deleted']) core.store.put('todo',id,{title:'Synthetic '+id,status:'pending'});
  const initial = await dispatch(core,'workflowSummary');
  await dispatch(core,'workflowReview',{token:initial.changes.token,reviewer:'Synthetic reviewer'});
  core.store.delete('todo','deleted');
  core.store.put('todo','completed',{title:'Synthetic completed',status:'completed'});
  const changes = (await dispatch(core,'workflowSummary')).changes;
  assert.equal(changes.items.find(r=>r.key==='todo:retained').change,'unchanged');
  assert.equal(changes.items.find(r=>r.key==='todo:completed').change,'resolved');
  assert.deepEqual(changes.unavailable.map(r=>r.key),['todo:deleted']);
  assert.equal(changes.unavailable[0].change,'unavailable');
  await assert.rejects(dispatch(core,'workflowReview',{token:initial.changes.token,reviewer:'Synthetic reviewer'}),{code:'REVIEW_CHANGED'});
});
