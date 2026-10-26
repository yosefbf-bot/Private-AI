'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateRecipe}=require('../source/browser-worker.cjs');
const {period,resolveRun}=require('../source/report-parameters.cjs');
const base=()=>({name:'Synthetic falls',url:'https://example.com/report',steps:[{op:'fill',selector:'#start',value:'{{start}}'},{op:'fill',selector:'#end',value:'{{end}}'},{op:'select',selector:'#unit',value:'{{unit}}'},{op:'check',selector:'#detail',checked:true},{op:'download',selector:'#download'}],report:{period:'last month',folder:'Reports/Falls',dailyFolder:true,dateFormat:'MM/DD/YYYY',choices:{unit:{values:['All','North'],default:'All'}}}});
test('calendar-relative selections roll across year/leap boundaries without UTC day drift',()=>{
 assert.deepEqual(period('last month',new Date(2026,0,1,0,5)),{start:'2025-12-01',end:'2025-12-31'});
 assert.deepEqual(period('2024-02',new Date()),{start:'2024-02-01',end:'2024-02-29'});
 assert.deepEqual(period('3 days ago',new Date(2026,2,10,12)),{start:'2026-03-07',end:'2026-03-07'});
 for(const value of ['02/03/26','2026-02-30','2026-13','last quarter','tomorrow','10001 days ago'])assert.throws(()=>period(value,new Date(2026,9,26)),{code:'INVALID'});
});
test('approved parameter definitions resolve dates and exact choices once per download',()=>{
 const r=validateRecipe(base()),run=resolveRun(r,{period:'yesterday',choices:{unit:'North'}},new Date(2026,0,1,23,59));
 assert.equal(run.steps[0].value,'12/31/2025');assert.equal(run.steps[1].value,'12/31/2025');assert.equal(run.steps[2].value,'North');assert.equal(run.folder,'Reports/Falls/2026-01-01');
 assert.deepEqual(run.period,{start:'2025-12-31',end:'2025-12-31'});assert.equal(r.steps[0].value,'{{start}}');
 assert.throws(()=>resolveRun(r,{choices:{unit:'NotApproved'}},new Date()),{code:'INVALID'});
 assert.throws(()=>resolveRun(r,{choices:{newSelector:'anything'}},new Date()),{code:'INVALID'});
});
test('destination and placeholder validation reject escape, device names, unknown options and secrets',()=>{
 for(const folder of ['../Outside','C:\\Outside','\\\\server\\share','Reports/../Outside','Reports/NUL','Reports/secret:stream','Reports/trailing.'])assert.throws(()=>validateRecipe({...base(),report:{...base().report,folder}}),{code:'INVALID'});
 assert.throws(()=>validateRecipe({...base(),steps:[{op:'fill',selector:'#x',value:'{{unknown}}'},{op:'download',selector:'#download'}]}),{code:'INVALID'});
 assert.throws(()=>validateRecipe({...base(),steps:[{op:'fill',selector:'#password',value:'{{start}}'},{op:'download',selector:'#download'}]}),{code:'BROWSER_LOGIN'});
 const r=validateRecipe(base());assert.throws(()=>resolveRun(r,{url:'https://other.example'},new Date()),{code:'INVALID'});
});
test('legacy recipes retain identical normalized shape and approval digest',()=>{
 const old={name:'Old report',url:'https://example.com/report',steps:[{op:'download',selector:'#download'}]};
 const r=validateRecipe(old);assert.equal(Object.hasOwn(r,'report'),false);assert.deepEqual(resolveRun(r,{},new Date(2026,9,26)).folder,'Reports');
});
