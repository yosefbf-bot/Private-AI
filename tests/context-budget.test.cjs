'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {localInput}=require('../source/local-brain.cjs');
test('full output and safety margin cannot be borrowed for short-context input',()=>{
 const settings={localModelPath:'synthetic-qwen.gguf',localContext:1024,localMaxOutput:768};
 assert.throws(()=>localInput(settings,[{role:'user',content:'Hello'}]),{code:'LOCAL_CONTEXT'});
});
test('context validation preserves every message, instructions and requested output',()=>{
 const settings={localModelPath:'synthetic-qwen.gguf',localContext:2048,localMaxOutput:768},messages=[{role:'user',content:'Synthetic complete source. '.repeat(40)}],instructions='Keep the final source: ID END-42.';
 const result=localInput(settings,messages,{instructions});assert.deepEqual(result.textMessages,messages);assert.ok(result.system.endsWith(instructions));assert.equal(settings.localMaxOutput,768);
 assert.throws(()=>localInput({...settings,localContext:1024},messages,{instructions}),{code:'LOCAL_CONTEXT'});
});
test('internal budget metadata cannot turn a RAM comparison into NaN or lower the real context',()=>{
 const {budgetSettings}=require('../source/local-brain.cjs');
 for(const value of ['bad',NaN,Infinity,-1,512,100000])assert.equal(budgetSettings({localContext:1024,localMemoryContext:value}).localContext,1024);
 assert.equal(budgetSettings({localContext:1024,localMemoryContext:2048}).localContext,2048);
});
