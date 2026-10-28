'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {options,readStream}=require('../scripts/evaluate-local-quality.cjs');
test('quality measurement rejects production-like paths/modes and unbounded resource requests',()=>{
 const base=['--runtime',path.resolve('llama-server.exe'),'--out',path.resolve('synthetic.json')];
 assert.equal(options(base).repetitions,2);
 for(const extras of [['--condition','physical'],['--condition','system','--allocate-mib','99999'],['--condition','commit','--cap-mib','100'],['--repetitions','50'],['--contexts','100'],['--cases','invented']])assert.throws(()=>options([...base,...extras]));
});
test('stream metrics start with content, retain exact output and never invent token identity',async()=>{
 const body=['data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n','data: {"choices":[{"delta":{"content":"{\\\"answer\\\":1}"},"finish_reason":"stop"}],"usage":{"completion_tokens":4}}\n\n','data: [DONE]\n\n'];
 const r=await readStream({body:(async function*(){for(const s of body)yield Buffer.from(s);})()});assert.equal(r.text,'{"answer":1}');assert.equal(r.usage.completion_tokens,4);assert.equal(r.tokenIdsSHA256,null);assert.ok(r.ttftMs!==null);
});
test('missing stream terminator fragment cannot count as completed output',async()=>{await assert.rejects(readStream({body:(async function*(){yield Buffer.from('data: {');})()}));});
test('a dropped response at a clean event boundary cannot count as complete',async()=>{await assert.rejects(readStream({body:(async function*(){yield Buffer.from('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\n');})()}));});
test('actual final verbose token ids are hashed without retaining verbose payloads',async()=>{
 const body='data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}],__verbose:{tokens:[5,9],stop:true,prompt:'must not escape'}})+'\n\ndata: [DONE]\n\n';
 const result=await readStream({body:(async function*(){yield Buffer.from(body);})()});assert.equal(result.tokenIdsSHA256,require('node:crypto').createHash('sha256').update('[5,9]').digest('hex'));assert.ok(!JSON.stringify(result).includes('must not escape'));
});
test('empty or partial token arrays never establish generated-token identity',async()=>{
 for(const verbose of [{tokens:[],stop:true},{tokens:[1,2],stop:false}]){const body='data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}],__verbose:verbose})+'\n\ndata: [DONE]\n\n';assert.equal((await readStream({body:(async function*(){yield Buffer.from(body);})()})).tokenIdsSHA256,null);}
});
test('nonstream identity requires real generated ids and cannot fabricate first-token time',()=>{
 const {tokenResponse}=require('../scripts/evaluate-local-quality.cjs');const data={choices:[{message:{content:'ok'},finish_reason:'stop'}],__verbose:{tokens:[5,9],prompt:'private synthetic field'}};
 const r=tokenResponse(data);assert.equal(r.tokenIdsCount,2);assert.equal(r.ttftMs,null);assert.ok(!JSON.stringify(r).includes('private synthetic field'));assert.throws(()=>tokenResponse({...data,__verbose:{tokens:[]}}));
});
