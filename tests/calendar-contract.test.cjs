'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {formatCalendar,createTools}=require('../source/local-tools.cjs');
const events=[{subject:'SYNTHETIC meeting',start:'2026-10-13T10:00:00',end:'2026-10-13T11:00:00'}];
test('calendar accepts the real native helper response and discloses partial coverage',()=>{
  assert.match(formatCalendar({events,truncated:false}),/SYNTHETIC meeting/);
  assert.doesNotMatch(formatCalendar({events,truncated:false}),/No appointments/);
  assert.match(formatCalendar({events,truncated:true}),/Partial calendar results/);
  assert.match(formatCalendar({events:[],truncated:true}),/additional appointments may not be shown/);
  assert.equal(formatCalendar({events:[],truncated:false}),'No appointments were returned for this date.');
  assert.match(formatCalendar(events),/SYNTHETIC meeting/);
});
test('invalid calendar responses do not become a false empty calendar',()=>{
  for(const result of [null,{},'unavailable',{events:null},{events:[null]},{events:[[]]}])assert.throws(()=>formatCalendar(result),{code:'INVALID'});
});
test('chat calendar command renders actual helper-shaped results through the existing tool path',async()=>{
  let calls=0;
  const run=createTools({}, {outlook:async(op,args)=>{calls++;assert.equal(op,'outlook.calendar');assert.match(args.start,/^\d{4}-\d{2}-\d{2}$/);return {events,truncated:true};}});
  const text=await run('/calendar');
  assert.match(text,/SYNTHETIC meeting/);assert.match(text,/Partial calendar results/);assert.equal(calls,1);
});
