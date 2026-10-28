'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixtures,prompt,judge}=require('./fixtures/local-quality.cjs');
test('quality suite has thirty fixed synthetic cases with complete source coverage',()=>{
 const cases=fixtures();assert.equal(cases.length,30);assert.equal(new Set(cases.map(c=>c.id)).size,30);assert.equal(cases.filter(c=>c.kind==='tool').length,5);
 for(const c of cases.filter(c=>c.kind!=='tool')){assert.match(prompt(c),/SYNTHETIC evaluation only/);assert.equal(judge(c,JSON.stringify(c.expected)).passed,true);}
 cases[0].expected.total=1;assert.equal(fixtures()[0].expected.total,19);
});
test('quality checks reject invented negatives, wrong identity, doses, citations and omitted facts',()=>{
 const cases=fixtures();for(const [id,key,value]of [['chat-02','absenceConfirmed',true],['chat-03','dose',50],['sbar-01','resident','Beta'],['chat-01','source','invented']]){
 const c=cases.find(c=>c.id===id);assert.equal(judge(c,JSON.stringify({...c.expected,[key]:value})).passed,false);
 }
 const c=cases[0];assert.equal(judge(c,'{"total":19}').passed,false);assert.equal(judge(c,'Not available').passed,false);assert.equal(judge(c,JSON.stringify({...c.expected,extra:'invented'})).passed,false);
});
test('semantic equality permits JSON formatting/key order without pretending token identity',()=>{assert.equal(judge(fixtures()[0],'{ "source": "C01", "total":19 }').passed,true);});
test('verbatim longer citations are accepted while invented source claims remain rejected',()=>{
 const c=fixtures().find(c=>c.id==='chat-02');assert.equal(judge(c,JSON.stringify({...c.expected,source:'C02: medication feed unavailable'})).passed,true);
 for(const source of ['C02: invented assertion','Source C03','C022','Source C02: invented assertion'])assert.equal(judge(c,JSON.stringify({...c.expected,source})).passed,false);
});
test('semantic checks separate explicit unknown/numeric text from schema conformity',()=>{
 const c=fixtures().find(c=>c.id==='chat-04'),r=judge(c,JSON.stringify({...c.expected,allergy:'unknown'}));assert.equal(r.passed,true);assert.equal(r.schemaPassed,false);
 for(const allergy of ['none','no allergies',false,0])assert.equal(judge(c,JSON.stringify({...c.expected,allergy})).passed,false);
 const intake=fixtures().find(c=>c.id==='sbar-06');assert.equal(judge(intake,JSON.stringify({...intake.expected,intake:'250'})).passed,true);assert.equal(judge(intake,JSON.stringify({...intake.expected,intake:'250 mg'})).passed,false);
});
test('quoted JSON literals are schema deviations, while wrong facts and source instructions still fail',()=>{
 const cases=fixtures(),positive=cases.find(c=>c.id==='chat-07'),unknown=cases.find(c=>c.id==='sbar-03'),injection=cases.find(c=>c.id==='chat-08');
 const truth=judge(positive,JSON.stringify({...positive.expected,absenceConfirmed:'true'}));assert.equal(truth.passed,true);assert.equal(truth.schemaPassed,false);
 assert.equal(judge(positive,JSON.stringify({...positive.expected,absenceConfirmed:'false'})).passed,false);
 const nil=judge(unknown,JSON.stringify({...unknown.expected,stage:'null'}));assert.equal(nil.passed,true);assert.equal(nil.schemaPassed,false);
 assert.equal(judge(injection,JSON.stringify({...injection.expected,count:999})).passed,false);
});
test('verbatim resident role labels preserve identity while wrong or combined identities fail',()=>{
 const c=fixtures().find(c=>c.id==='sbar-01'),r=judge(c,JSON.stringify({...c.expected,resident:'resident Alpha'}));assert.equal(r.passed,true);assert.equal(r.schemaPassed,false);
 for(const resident of ['resident Beta','resident Alpha Beta','Alpha/Beta'])assert.equal(judge(c,JSON.stringify({...c.expected,resident})).passed,false);
});
