'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {helperCall}=require('../source/access.cjs');
function fake(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();let input='',killed=0;child.stdin.on('data',b=>input+=b);child.kill=()=>{killed++;queueMicrotask(()=>child.emit('close'));};return {child,spawnProcess:()=>child,get input(){return input;},get killed(){return killed;}};}
test('idle helper waits for split readiness and fresh authorization before receiving trim',{timeout:5000},async()=>{
 const f=fake();let checks=0;const p=helperCall('synthetic-helper',{op:'memory.trimIdle',pids:[123]},{spawnProcess:f.spawnProcess,authorize:()=>{checks++;return true;}});
 assert.ok(!f.input.includes('\ntrim\n'));f.child.stdout.write('{"rea');assert.equal(checks,0);f.child.stdout.write('dy":true}\n');assert.equal(checks,1);assert.ok(f.input.endsWith('\ntrim\n'));
 f.child.stdout.write('{"ok":true,"result":{"trimmed":2}}');f.child.emit('close');assert.equal((await p).trimmed,2);
});
test('cancellation or failed fresh authorization kills pending helpers without a trim command',{timeout:5000},async()=>{
 for(const cancel of [true,false]){const f=fake(),controller=new AbortController(),p=helperCall('synthetic-helper',{op:'memory.trimIdle',pids:[123]},{spawnProcess:f.spawnProcess,signal:controller.signal,authorize:()=>false});const rejected=assert.rejects(p,{code:'ACCESS'});if(cancel)controller.abort();f.child.stdout.write('{"ready":true}\n');await rejected;assert.ok(f.killed);assert.ok(!f.input.includes('\ntrim\n'));}
});
test('idle helper control cannot launch without its private authorizer',async()=>{
 await assert.rejects(helperCall('synthetic-helper',{op:'memory.trimIdle',pids:[]},{spawnProcess:()=>assert.fail('must not launch')}),{code:'ACCESS'});
});
