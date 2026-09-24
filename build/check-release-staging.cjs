'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=function(root){const version=require(path.join(root,'package.json')).version,report=JSON.parse(fs.readFileSync(path.join(root,'Validation',version,'packaging-baseline.json'))),stage=path.join(root,'dist/win-unpacked'),actual=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else actual.push(path.relative(stage,f).replaceAll(path.sep,'/'));}}walk(stage);
assert.equal(report.version,version);assert.deepEqual(actual.sort(),report.records.map(r=>r.path).sort(),'Staging contains missing or unapproved files');for(const r of report.records){const b=fs.readFileSync(path.join(stage,r.path));assert.equal(b.length,r.bytes,r.path);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),r.sha256,r.path);}};
