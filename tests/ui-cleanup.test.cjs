'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {closeUI}=require('./ui-cleanup.cjs');
test('UI cleanup closes the browser before waiting for its live HTTP connection',{timeout:5000},async t=>{
 const server=http.createServer((req,res)=>res.write('synthetic pending response'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let request;await new Promise(r=>{request=http.get('http://127.0.0.1:'+server.address().port,res=>{res.once('data',r);res.on('error',()=>{});});request.on('error',()=>{});});
 t.after(()=>{request.destroy();server.closeAllConnections();server.close();});
 let closed=false;const browser={close:async()=>{closed=true;request.destroy();}};
 let timer;try{await Promise.race([closeUI({server,browser}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UI teardown deadlock')),500);})]);}finally{clearTimeout(timer);}
 assert.equal(closed,true);assert.equal(server.listening,false);
});
