'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs'),{dispatch}=require('../source/workflows/index.cjs');
test('staffing import rejects coerced blank/boolean/array hours and preserves incomplete units',async t=>{
 const {core}=fixture(t);const date='2026-09-01';
 const common={type:'staffing',reviewer:'Synthetic reviewer',filename:'synthetic-staffing.csv'};
 for(const hours of ['   ',true,[],[1],'0x10',-1,Infinity]){
  const req={...common,rows:[{date,unit:'Unit A',shift:'day',role:'RN',hours}]};
  const preview=await dispatch(core,'workflowMetricPreview',req);assert.equal(preview.rejected.length,1,String(hours));
  await assert.rejects(dispatch(core,'workflowMetricImport',{...req,token:preview.token}),{code:'INVALID'});
 }
 const ingest=async req=>{const preview=await dispatch(core,'workflowMetricPreview',req);return dispatch(core,'workflowMetricImport',{...req,token:preview.token});};
 await ingest({...common,type:'census',rows:[{date,unit:'Unit A',census:10,capacity:12,medicare:2,medicaid:6,other:2},{date,unit:'Unit B',census:5,capacity:6}]});
 const rows=['RN','LPN','CNA'].flatMap(role=>['day','evening','night'].map(shift=>({date,unit:'Unit A',role,shift,hours:' 8 '})));
 const req={...common,rows,completeDay:true};const first=await ingest(req);assert.equal((await ingest(req)).duplicate,true);
 const data=await dispatch(core,'workflowSummary');const a=data.metrics.days.find(d=>d.unit==='Unit A'),b=data.metrics.days.find(d=>d.unit==='Unit B');
 assert.equal(a.totalHours,72);assert.equal(a.hppd,7.2);assert.equal(a.staffing.source.id,first.id);assert.equal(a.staffing.source.reviewer,common.reviewer);assert.equal(b.hppd,null);assert.equal(b.totalHours,null);assert.match(a.notice,/not a regulatory compliance score/);
 // A later partial snapshot revokes a previous complete-day attestation.
 await ingest({...req,rows:rows.slice(0,1),completeDay:false});assert.equal((await dispatch(core,'workflowSummary')).metrics.days.find(d=>d.unit==='Unit A').hppd,null);
});
