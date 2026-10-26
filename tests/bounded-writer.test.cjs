'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {boundedWriter}=require('../source/bounded-writer.cjs');
test('bounded writer waits for drain and preserves complete frame order',()=>{
 const stream=new EventEmitter(),seen=[];let blocked=true;stream.write=b=>{seen.push(b.toString());return !blocked;};
 const writer=boundedWriter(stream,()=>assert.fail('unexpected failure'));writer.write(Buffer.from('one'));writer.write(Buffer.from('two'));writer.write(Buffer.from('three'));
 assert.deepEqual(seen,['one']);assert.equal(writer.pendingBytes,8);blocked=false;stream.emit('drain');assert.deepEqual(seen,['one','two','three']);assert.equal(writer.pendingBytes,0);writer.close();assert.equal(stream.listenerCount('drain'),0);
});
test('bounded writer closes once at byte cap including stream-owned bytes',()=>{
 const stream=new EventEmitter();stream.writableLength=5;stream.write=()=>false;let failures=0;const writer=boundedWriter(stream,()=>failures++,{maxBytes:10});
 writer.write(Buffer.from('one'));assert.throws(()=>writer.write(Buffer.from('123456')),{code:'LIMIT'});assert.equal(failures,1);assert.throws(()=>writer.write(Buffer.from('x')),{code:'NETWORK'});assert.equal(stream.listenerCount('drain'),0);
});
test('stalled writer releases its retained queue on deadline',async()=>{
 const stream=new EventEmitter();stream.write=()=>false;let failures=0;const writer=boundedWriter(stream,()=>failures++,{stallMs:10});writer.write(Buffer.from('one'));writer.write(Buffer.from('two'));await new Promise(r=>setTimeout(r,25));assert.equal(failures,1);assert.equal(writer.pendingBytes,0);
});
