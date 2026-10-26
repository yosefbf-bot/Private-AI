 'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function panel(){
 const elements=new Map(),timers=new Map(),ports=[];let timerId=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){},focus(){}});return elements.get(id);};
 const context=vm.createContext({document:{getElementById:element,addEventListener(){}},window:{addEventListener(){}},crypto:require('node:crypto').webcrypto,console,
 setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),chrome:{runtime:{connectNative(){const p={sent:[],onMessage:{addListener:fn=>p.receive=fn},onDisconnect:{addListener:fn=>p.disconnectEvent=fn},postMessage:m=>p.sent.push(m),disconnect:()=>p.disconnectEvent()};ports.push(p);return p;}}}});
 const source=fs.readFileSync(path.join(__dirname,'../chrome_extension/panel.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(source,context);
 const call=(op)=>vm.runInContext(`call(${JSON.stringify(op)})`,context);
 const ready=()=>{const p=ports.at(-1),q=p.sent[0];p.receive({type:'result',id:q.id,result:{settings:{processingMode:'local-only'},chats:[]}});return p;};
 return {context,call,ready,timers,ports,elements};
}
test('panel caps pending operations, rejects all on disconnect and clears deadlines',async()=>{
 const x=panel(),port=x.ready();await Promise.resolve();const calls=Array.from({length:32},()=>x.call('chat'));const checks=calls.map(p=>assert.rejects(p,/disconnected/));
 await assert.rejects(x.call('chat'),/Too many pending/);assert.equal(port.sent.length,33);port.disconnectEvent();await Promise.all(checks);assert.equal(x.timers.size,0);
});
test('panel deadline fails visibly without replay, and stale disconnect cannot close a new connection',async()=>{
 const x=panel(),old=x.ready();await Promise.resolve();const pending=x.call('send'),check=assert.rejects(pending,/timed out/);const deadline=[...x.timers.values()][0];assert.equal(deadline.ms,1800000);deadline.fn();await check;
 vm.runInContext('connect()',x.context);const fresh=x.ready();await Promise.resolve();old.disconnectEvent();const next=x.call('chat');fresh.receive({type:'result',id:fresh.sent.at(-1).id,result:{ok:true}});assert.equal((await next).ok,true);assert.equal(fresh.sent.length,2);
});
