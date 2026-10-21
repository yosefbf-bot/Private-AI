'use strict';
// Real Windows DPAPI and real Edge DOM, temporary synthetic profile only.
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.argv[2],mode=process.argv[3];
let stage='startup',issue=null,operationFailure=null;const operations=[],started=Date.now();
function mark(value){operations.push({event:value,elapsedMs:Date.now()-started});if(operations.length>32)operations.shift();}
function observe(label,action,count=false){return async(...args)=>{mark(label+':start');try{const result=await action(...args);mark(label+':'+(count?(result===0?'zero':result===1?'one':'many'):'done'));return result;}catch(error){operationFailure??={operation:label,kind:['TimeoutError','TargetClosedError','Error'].includes(error.name)?error.name:'OTHER',hints:['navigation','detached','not visible','not stable','intercepts pointer','outside of the viewport','waiting for locator'].filter(token=>String(error.message).includes(token))};throw error;}};}
if(!path.isAbsolute(root)||!path.basename(root).startsWith('privateai-signin-native-')||!['save','restart'].includes(mode))throw Error('Invalid synthetic fixture');
app.setPath('userData',path.join(root,'electron-session'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const {protectPrivateFolder,verifyPrivateAcl}=require('../source/windows-acl.cjs');
 const {execFileSync}=require('node:child_process');
 const sid=execFileSync(path.join(process.env.SystemRoot,'System32','whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-5-(?:\d+-)*\d+/)?.[0];
 protectPrivateFolder(root,sid);verifyPrivateAcl(root,sid);
 const {loadVault}=require('../source/startup-storage.cjs'),{Store}=require('../source/database.cjs'),{Core}=require('../source/core.cjs');
 const {BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs'),{BrowserReports,digest}=require('../source/browser-reports.cjs'),{BrowserCredentials}=require('../source/browser-credentials.cjs');
 const dataRoot=path.join(root,'private-data');fs.mkdirSync(dataRoot,{recursive:true});
 const cipher=loadVault(dataRoot,safeStorage,true),core=new Core({store:new Store(path.join(dataRoot,'privateai.db'),cipher),root:dataRoot,machine:'synthetic-native',client:{generate:()=>assert.fail('No cloud expected')}});
 let worker,server;try{
  core.saveSettings({workspace:path.join(root,'Reports workspace'),processingMode:'local-only',allowCloud:false});
  core.resources.approve=async()=>true;
  core.browserCredentials=new BrowserCredentials(core,{safeStorage,verifyProtection:()=>verifyPrivateAcl(root,sid)});
  let signedIn=false,submissions=0,launches=0,rewrite=false,unsafeRequests=0,otp=false;
  const certificate=await require('selfsigned').generate([{name:'commonName',value:'localhost'}],{days:1,keySize:2048,algorithm:'sha256'});
  server=require('node:https').createServer({key:certificate.private,cert:certificate.cert},(request,response)=>{
   if(request.url.startsWith('/unexpected')){unsafeRequests++;response.writeHead(400);response.end();return;}
   if(request.url==='/submit'){
    let body='';request.on('data',chunk=>{body+=chunk;if(body.length>12000)request.destroy();});request.on('end',()=>{
     assert.equal(request.method,'POST');const input=new URLSearchParams(body);assert.equal(input.get('user'),'synthetic-native-owner');assert.equal(input.get('password'),'synthetic-native-password');submissions++;signedIn=true;response.writeHead(302,{location:'/report'});response.end();
    });return;
   }
   if(request.url==='/download'){response.writeHead(200,{'content-type':'text/plain','content-disposition':'attachment; filename=synthetic.txt'});response.end('Synthetic protected report');return;}
   if(request.url==='/download-start'){response.writeHead(302,{location:'/download'});response.end();return;}
   if(request.url==='/menu'){response.writeHead(302,{location:'/report-ready'});response.end();return;}
   if(request.url==='/report'&&!signedIn){response.writeHead(302,{location:'/login'});response.end();return;}
   response.writeHead(200,{'content-type':'text/html'});response.end(signedIn?'<button id="ready">Signed in</button><button id="menu" onclick="location.href=\'/menu\'">Reports</button>'+(request.url==='/report-ready'?'<button id="download" onclick="location.href=\'/download-start\'">Download</button>':''):'<form method="post" action="/submit"'+(rewrite?' onsubmit="this.method=\'get\';this.action=\'/unexpected\'"':'')+'><input id="user" name="user" autocomplete="username"><input id="password" name="password" type="password" autocomplete="'+(otp?'one-time-code':'current-password')+'"><button id="submit" type="submit">Sign in</button></form>');
  });
  const portFile=path.join(root,'synthetic-port.json'),requested=mode==='restart'?JSON.parse(fs.readFileSync(portFile)).port:0;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(requested,'127.0.0.1',resolve);});
  const site='https://127.0.0.1:'+server.address().port;
  if(mode==='save')fs.writeFileSync(portFile,JSON.stringify({port:server.address().port}));
  const {chromium}=require('playwright-core');
  const engine={launchPersistentContext:async(profile,options)=>{
   launches++;assert.equal(options.serviceWorkers,'block');assert.ok(options.args.includes('--disable-extensions'));
   // Only this ephemeral loopback fixture uses a self-signed test certificate.
   // Production launch options continue to require normal trusted website TLS.
   stage='browser-launch';const context=await chromium.launchPersistentContext(profile,{...options,headless:true,ignoreHTTPSErrors:true});
   const installRoute=context.route.bind(context),instrumented=new WeakSet();
   const instrument=page=>{
    if(instrumented.has(page))return page;instrumented.add(page);
    page.on('download',()=>mark('download:event'));page.on('framenavigated',frame=>{if(frame===page.mainFrame())mark('navigation:committed');});
    page.goto=observe('navigation:goto',page.goto.bind(page));
    const locate=page.locator.bind(page);page.locator=selector=>{
     const locator=locate(selector),label=['#ready','#menu','#download','#user','#password','#submit'].includes(selector)?selector.slice(1):'other';
     for(const method of ['count','click','waitFor','fill','evaluate','isVisible','isEnabled'])locator[method]=observe(label+':'+method,locator[method].bind(locator),method==='count');
     return locator;
    };return page;
   };
   context.pages().forEach(instrument);context.on('page',instrument);const newPage=context.newPage.bind(context);context.newPage=async(...args)=>instrument(await newPage(...args));
   // Reproduce Chromium finishing a navigation before fulfillment returns.
   // This delay changes only the isolated fixture's callback timing, not policy.
   context.route=(pattern,handler)=>installRoute(pattern,route=>{
    const pathname=new URL(route.request().url()).pathname,label=['/report','/login','/submit','/menu','/report-ready','/download-start','/download'].includes(pathname)?pathname.slice(1):'other';
    return handler({request:()=>route.request(),fetch:observe(label+':fetch',options=>route.fetch(options)),abort:observe(label+':abort',()=>route.abort()),fulfill:observe(label+':fulfill',async options=>{await route.fulfill(options);if(options.body==='<!doctype html><title>Continuing approved sign-in</title>')await new Promise(resolve=>setTimeout(resolve,100));})});
   });
   return context;
  }};
  worker=new BrowserWorker(core,{chromium:engine});core.browserReports=new BrowserReports(core,worker);
  let recipe;
  if(mode==='save'){
   recipe=validateRecipe({name:'Synthetic native report',url:site+'/report',steps:[{op:'login',selector:'#ready'},{op:'click',selector:'#menu'},{op:'wait',selector:'#download'},{op:'download',selector:'#download'}],autoLogin:{formActions:[site+'/submit'],steps:[{op:'username',url:site+'/login',selector:'#user'},{op:'password',url:site+'/login',selector:'#password'},{op:'click',url:site+'/login',selector:'#submit'}]}});
   core.store.put('browserRecipe',recipe.id,recipe);core.browserCredentials.save(recipe,{username:'synthetic-native-owner',password:'synthetic-native-password'});
   otp=true;await assert.rejects(worker.run(recipe,{testSignin:true}),{code:'BROWSER_LOGIN'});assert.equal(submissions,0);assert.equal(core.store.get('browserLoginVerified',recipe.id),null);otp=false;
   rewrite=true;await assert.rejects(worker.run(recipe,{testSignin:true}),{code:'POLICY'});assert.equal(unsafeRequests,0);assert.equal(submissions,0);assert.equal(core.store.get('browserLoginVerified',recipe.id),null);rewrite=false;
   stage='manual-test';operations.length=0;operationFailure=null;const out=await worker.run(recipe,{testSignin:true});assert.equal(out.complete,true);assert.equal(submissions,1);
   const plan=core.browserReports.plan(recipe.id);core.browserReports.grant(recipe.id,plan.hash,true,true);
   const schedule=core.browserReports.save({browserRecipeId:recipe.id,frequency:'daily',analysisPrompt:'Summarize synthetic report'});core.store.put('schedule',schedule.id,{...schedule,next:Date.now()-1});
  }else{
   recipe=core.store.list('browserRecipe')[0];assert.ok(core.browserCredentials.status(recipe).matching);assert.equal(core.browserReports.plan(recipe.id).hash,digest(recipe));
   core.lock();await core.browserReports.tick();assert.equal(submissions,1);assert.equal(core.locked,true);
   const job=core.store.list('job')[0];assert.equal(job.status,'completed');assert.equal(job.browserAnalysis.state,'pending');assert.equal(core.store.list('file').length,0);
  }
  const file=path.join(dataRoot,'report-signins',recipe.id+'.dpapi'),bytes=fs.readFileSync(file);assert.ok(!bytes.includes(Buffer.from('synthetic-native-password')));assert.ok(!bytes.includes(Buffer.from('synthetic-native-owner')));
  process.stdout.write('SIGNIN_NATIVE_RESULT='+JSON.stringify({mode,passed:true,actualWindowsDPAPI:true,actualEdgeLogin:true,submissions,launches,unsafeRequests,ciphertextSHA256:crypto.createHash('sha256').update(bytes).digest('hex')})+'\n');
 }catch(e){issue=core.store.list('browserIssue').map(({phase,step,code})=>({phase,step,code}));throw e;}finally{await worker?.close();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));core.close();}
 app.exit(0);
}).catch(error=>{process.stdout.write('SIGNIN_NATIVE_RESULT='+JSON.stringify({passed:false,mode,stage,issue,operationFailure,operations,code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'SYNTHETIC_ACCEPTANCE_FAILED'})+'\n');app.exit(1);});
