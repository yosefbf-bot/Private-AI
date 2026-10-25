'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {MODEL,LLAMA,MODELS,ModelManager}=require('../source/model-manager.cjs');
function fixture(t,fetcher){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-model-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const bytes=Buffer.from('GGUF synthetic model bytes for download tests');const model={...LLAMA,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};let calls=0;const manager=new ModelManager({directory,models:[model],fetcher:fetcher||(async()=>{calls++;return new Response(bytes);})});return {directory,bytes,model,manager,calls:()=>calls};}
test('catalog keeps Qwen and pins Llama Instruct Q4_K_M separately',()=>{assert.equal(MODELS.length,4);assert.equal(MODEL.id,'qwen3-4b');assert.equal(LLAMA.bytes,2019377696);assert.match(LLAMA.url,/5ab33fa94d1d04e903623ae72c95d1696f09f9e8/);assert.match(LLAMA.file,/Instruct-Q4_K_M/);assert.notEqual(MODEL.file,LLAMA.file);});
test('selected model downloads once and verified existing file is reused',async t=>{const x=fixture(t);const p=await x.manager.download(LLAMA.id);assert.deepEqual(fs.readFileSync(p),x.bytes);await x.manager.download(LLAMA.id);assert.equal(x.calls(),1);assert.equal(x.manager.status().modelId,LLAMA.id);});
test('corrupt existing model is preserved and never silently selected',async t=>{const x=fixture(t);const p=path.join(x.directory,x.model.file);fs.writeFileSync(p,'bad');await assert.rejects(x.manager.download(LLAMA.id),e=>e.code==='LOCAL_MODEL');assert.equal(fs.readFileSync(p,'utf8'),'bad');assert.equal(x.calls(),0);});
test('truncated download fails checksum and removes partial file',async t=>{const x=fixture(t,async()=>new Response('short'));await assert.rejects(x.manager.download(LLAMA.id),e=>e.code==='LOCAL_MODEL');assert.deepEqual(fs.readdirSync(x.directory),[]);});
test('unknown model IDs cannot specify arbitrary downloads',async t=>{const x=fixture(t);await assert.rejects(x.manager.download('../other'),e=>e.code==='INVALID');assert.equal(x.calls(),0);});
test('concurrent downloads are refused and cancellation cleans partial files',async t=>{let release;const x=fixture(t,async(url,{signal})=>{await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});return new Response('unused');});const running=x.manager.download(LLAMA.id);await assert.rejects(x.manager.download(LLAMA.id),e=>e.code==='BUSY');x.manager.cancel();await assert.rejects(running);assert.equal(x.manager.status().state,'cancelled');assert.deepEqual(fs.readdirSync(x.directory),[]);});

test('download handles partial asynchronous writes, yields to timers, flushes and publishes atomically',async t=>{
 const x=fixture(t),open=fs.promises.open;let writes=0,flushed=false,closed=false,ticks=0;
 const timer=setInterval(()=>ticks++,1);t.after(()=>clearInterval(timer));
 t.mock.method(fs.promises,'open',async(...args)=>{
  const fd=await open(...args),write=fd.write.bind(fd),sync=fd.sync.bind(fd),close=fd.close.bind(fd);
  fd.write=async(buffer,offset,length)=>{writes++;await new Promise(r=>setTimeout(r,3));return write(buffer,offset,Math.min(5,length));};
  fd.sync=async()=>{assert.equal(fs.existsSync(path.join(x.directory,x.model.file)),false);await sync();flushed=true;};
  fd.close=async()=>{assert.equal(flushed,true);await close();closed=true;};return fd;
 });
 const target=await x.manager.download(LLAMA.id);assert.ok(writes>1);assert.ok(ticks>1);assert.equal(flushed,true);assert.equal(closed,true);
 assert.deepEqual(fs.readFileSync(target),x.bytes);assert.deepEqual(fs.readdirSync(x.directory),[x.model.file]);
});

test('cancellation during asynchronous flush closes and removes partial output before publication',async t=>{
 const x=fixture(t),open=fs.promises.open;let flushing,release,closed=false;
 const started=new Promise(r=>flushing=r),blocked=new Promise(r=>release=r);
 t.mock.method(fs.promises,'open',async(...args)=>{
  const fd=await open(...args),sync=fd.sync.bind(fd),close=fd.close.bind(fd);
  fd.sync=async()=>{flushing();await blocked;await sync();};fd.close=async()=>{await close();closed=true;};return fd;
 });
 const running=x.manager.download(LLAMA.id);await started;x.manager.cancel();release();
 await assert.rejects(running,{code:'CANCELLED'});assert.equal(closed,true);assert.equal(x.manager.status().state,'cancelled');assert.deepEqual(fs.readdirSync(x.directory),[]);
});

test('zero-length asynchronous writes fail safely and clean the partial file',async t=>{
 const x=fixture(t),open=fs.promises.open;
 t.mock.method(fs.promises,'open',async(...args)=>{const fd=await open(...args);fd.write=async()=>({bytesWritten:0});return fd;});
 await assert.rejects(x.manager.download(LLAMA.id),{code:'STORAGE'});assert.deepEqual(fs.readdirSync(x.directory),[]);
});
