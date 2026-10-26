'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');

test('streaming Markdown remains formatted and never caches intermediate prefixes',async()=>{
 const {createMarkdownCache}=await import('../source/ui/markdown-cache.mjs'),{marked}=await import('../source/ui/vendor/marked.mjs');
 let renders=0;const md=createMarkdownCache(text=>{renders++;return marked.parse(text);});
 const answer='# Synthetic heading\n\n**Bold** and `code`.\n\n'+('Long synthetic answer. '.repeat(4000));
 for(let n=100;n<answer.length;n+=100){assert.match(md(answer.slice(0,n),{streaming:true}),/<h1>/);assert.equal(md.stats().entries,0);assert.equal(md.stats().bytes,0);}
 assert.match(md(answer,{streaming:true}),/<strong>Bold<\/strong>/);assert.equal(md.stats().bytes,0);
 const final=md(answer);assert.match(final,/<strong>Bold<\/strong>/);const count=renders;assert.equal(md(answer),final);assert.equal(renders,count);assert.equal(md.stats().entries,1);
 md.clear();assert.equal(md.stats().entries,0);assert.equal(md.stats().bytes,0);md(answer);assert.equal(renders,count+1);
});

test('completed Markdown cache obeys a byte budget including source keys and output HTML',async()=>{
 const {createMarkdownCache}=await import('../source/ui/markdown-cache.mjs');let renders=0;
 const md=createMarkdownCache(text=>{renders++;return '<p>'+text+'</p>';},{maxBytes:4096});
 for(let n=0;n<100;n++){md(n+'🙂'.repeat(100));assert.ok(md.stats().bytes<=4096);}
 assert.ok(md.stats().entries<10);const retained=md.stats().bytes;md('oversized'.repeat(1000));assert.equal(md.stats().bytes,retained);
 md.clear();assert.equal(md.stats().bytes,0);assert.equal(md.stats().entries,0);assert.ok(renders>100);
});

test('adaptive streaming intervals bound refresh frequency as the answer grows',async()=>{
 const {streamRenderInterval}=await import('../source/ui/markdown-cache.mjs');
 assert.equal(streamRenderInterval(0),45);assert.ok(streamRenderInterval(10000)>streamRenderInterval(1000));assert.equal(streamRenderInterval(100000),500);
 const work=length=>{let parsed=0;for(let chars=100;chars<length;chars+=streamRenderInterval(chars)*10)parsed+=chars;return parsed+length;};
 assert.ok(work(70000)<work(35000)*2.7,'Doubling a long answer must cost substantially less than quadratic reparsing');
});

test('shipped stream handler bypasses caching and lock/chat deletion clear completed Markdown',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const {createMarkdownCache,streamRenderInterval}=await import('../source/ui/markdown-cache.mjs'),{marked}=await import('../source/ui/vendor/marked.mjs'),{responseLayout}=await import('../source/ui/response-layout.mjs');
 const source=fs.readFileSync(path.join(__dirname,'../source/ui/app.mjs'),'utf8');
 const renderer=source.slice(source.indexOf('const md = createMarkdownCache'),source.indexOf('function attachCodeCopyButtons()'));
 const lock=source.slice(source.indexOf('function showLocked()'),source.indexOf('let voiceManager = null'));
 const open=source.slice(source.indexOf('async function openChat('),source.indexOf('async function attach()'));
 const events=source.slice(source.indexOf('window.privateAI.onEvent((event)'),source.indexOf('const messagingUI='));
 const deletion=source.slice(source.indexOf('      case "delete-chat":'),source.indexOf('      case "save-temp":'));
 const body={innerHTML:'',classList:{add(){}}},elements=new Map(),sanitized=[],timers=[];
 const content={scrollHeight:500,scrollTop:500,clientHeight:100,querySelector:()=>body};elements.set('content',content);
 const stop={stop(){return true;}},context={pageGeneration:0,sessionGeneration:0,workerPoll:null,liveRefresh:{clear(){}},createMarkdownCache,streamRenderInterval,marked,responseLayout,DOMPurify:{sanitize:(html,options)=>{sanitized.push(options);return html;}},
  $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},captureUI:stop,companionPairingUI:stop,workflowUI:stop,searchUI:stop,snfUI:stop,meetingsUI:stop,dashboardUI:stop,operationsCopilotUI:{stopListening(){}},closeVoiceSession(){},attachCodeCopyButtons(){},stopResponseTimer(){},
  chat:{id:'synthetic',messages:[{role:'assistant',text:''}]},sending:true,view:'chat',streamTimer:null,
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},
  api:async(op,data)=>op==='chat'?{id:data.id,draft:'',messages:[]}:true,confirmAction:async()=>true,refresh:async()=>{},renderChat(){},autoResizePrompt(){},renderAttachments(){},window:{privateAI:{onEvent:fn=>context.deliver=fn}}};
 vm.createContext(context);vm.runInContext(renderer+lock+open+events+'\nglobalThis.cache=md;\nglobalThis.deleteChat=async()=>{switch("delete-chat"){'+deletion+'}};',context);
 context.deliver({type:'delta',chatId:'synthetic',delta:'# Synthetic heading\n\n**Bold**'});assert.equal(timers[0].ms,45);timers[0].fn();
 assert.match(body.innerHTML,/<h1>/);assert.match(body.innerHTML,/<strong>Bold<\/strong>/);assert.equal(context.cache.stats().entries,0);
 context.deliver({type:'delta',chatId:'synthetic',delta:'x'.repeat(80000)});assert.equal(timers[1].ms,500);timers[1].fn();assert.equal(context.cache.stats().bytes,0);
 const options=JSON.parse(JSON.stringify(sanitized[0]));
 assert.deepEqual(options,{FORBID_TAGS:['img','iframe','form','input','button','style','script','svg','math','video','audio'],FORBID_ATTR:['style','src','srcset','id'],ALLOW_DATA_ATTR:false});
 context.cache('Completed answer');assert.equal(context.cache.stats().entries,1);context.showLocked();assert.equal(context.cache.stats().entries,0);assert.equal(context.cache.stats().bytes,0);
 context.chat={id:'synthetic',messages:[]};context.cache('Another completed answer');await context.deleteChat();assert.equal(context.cache.stats().bytes,0);assert.equal(context.cache.stats().entries,0);
 context.sending=false;context.chat={id:'synthetic-temporary',temporary:true,messages:[]};context.cache('Temporary answer');await context.openChat('saved');assert.equal(context.cache.stats().bytes,0);
});
