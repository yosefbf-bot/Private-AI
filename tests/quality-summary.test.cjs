'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixtures}=require('./fixtures/local-quality.cjs'),{rescore,summary}=require('../scripts/summarize-local-quality.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
test('quality reanalysis requires matching immutable synthetic output and keeps original result',()=>{
 const text='{"total":19,"source":"C01"}',record={id:'chat-01',repetition:1,nativeInference:true,passed:false,reasons:['old-check'],outputSHA256:hash(text)},report={fixtureSHA256:hash(JSON.stringify(fixtures())),results:[{tier:'small',context:2048,cases:[record],samples:[]}]},outputs=[{tier:'small',context:2048,id:'chat-01',repetition:1,text}];
 const a=rescore(report,outputs);assert.equal(a.results[0].cases[0].passed,true);assert.equal(a.results[0].cases[0].originalCheck.passed,false);assert.equal(report.results[0].cases[0].passed,false);
 assert.throws(()=>rescore(report,[{...outputs[0],text:'changed'}]));assert.throws(()=>rescore(report,[]));assert.equal(summary(a)[0].tokenIdentityVerified,false);
});
