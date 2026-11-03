'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {closeUI}=require('./ui-cleanup.cjs');
test('UI cleanup closes the browser before waiting for its live HTTP connection',{timeout:5000},async t=>{
 const server=http.createServer((req,res)=>res.write('synthetic pending response'));
 let request;
 t.after(()=>{request?.destroy();server.closeAllConnections();server.close();});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{request=http.get('http://127.0.0.1:'+server.address().port,res=>{res.once('data',resolve);res.on('error',reject);});request.on('error',reject);request.setTimeout(2000,()=>request.destroy(Error('Synthetic request timed out')));});
 let closed=false;const browser={close:async()=>{closed=true;request.destroy();}};
 let timer;try{await Promise.race([closeUI({server,browser}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UI teardown deadlock')),500);})]);}finally{clearTimeout(timer);}
 assert.equal(closed,true);assert.equal(server.listening,false);
});
