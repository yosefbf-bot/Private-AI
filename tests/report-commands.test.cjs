'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../source/report-commands.cjs');
test('report commands resolve explicit periods, destinations and approved choices without consuming ordinary chat',()=>{
 assert.deepEqual(parse('Go to Point Click Care and run report "Falls" for 7 days ago to "Reports" in daily folders with unit="North"'),{type:'run',name:'Falls',parameters:{period:'7 days ago',folder:'Reports',dailyFolder:true,choices:{unit:'North'}}});
 assert.deepEqual(parse('Run report "Weights" for last month'),{type:'run',name:'Weights',parameters:{period:'last month'}});
 assert.deepEqual(parse('/analyze reports today'),{type:'analyze',query:{date:'today'}});
 assert.deepEqual(parse('analyze all files in folder "Reports/2026-10-26"'),{type:'analyze',query:{folder:'Reports/2026-10-26'}});
 assert.deepEqual(parse('/trends resident "R-1" over 100 days'),{type:'trends',query:{entityType:'resident',entityId:'R-1',days:100}});
 assert.equal(parse('run report something vague').type,'help');assert.equal(parse('Explain how falls are reviewed'),null);
 assert.equal(parse('Run report "Falls" with unit="North", unit="South"').type,'help');
});
