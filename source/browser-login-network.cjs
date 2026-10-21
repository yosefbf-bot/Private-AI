'use strict';
const {fail}=require('./security.cjs');

// Protected sign-in cannot use route.continue(): browser-managed redirects may
// forward a POST without another route callback. Fetch one hop, inspect it, and
// turn permitted top-level redirects into a NEW, guarded GET navigation.
function protectedNetwork({recipe,check,page:currentPage}){
 const queued=[];let failure=null,redirects=0,submission=false,expectedGet=null,secrets=[];
 const clean=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!recipe.origins.includes(u.origin))throw fail('POLICY');return u;};
 const handler=async route=>{
  try{
   if(failure)throw failure;
   check();const request=route.request(),url=clean(request.url()),method=request.method();
   const parts=[url.pathname,...url.searchParams.values()];
   if(secrets.some(secret=>parts.some(value=>value.includes(secret))||url.href.includes(encodeURIComponent(secret))))throw fail('POLICY');
   if(submission&&request.isNavigationRequest()&&request.frame()===currentPage()?.mainFrame()&&method!=='POST'&&url.href!==expectedGet)throw fail('POLICY');
   if(!['GET','HEAD','POST'].includes(method))throw fail('POLICY');
   if(method==='POST'&&(url.search||url.hash||!recipe.autoLogin.formActions.includes(url.origin+url.pathname)))throw fail('POLICY');
   const response=await route.fetch({maxRedirects:0,timeout:45000});if(failure)throw failure;check();
   const status=response.status();
   if(status===429)throw fail('REPORT_RATE_LIMIT');
   if([301,302,303,307,308].includes(status)){
    if(++redirects>12||!request.isNavigationRequest()||request.frame()!==currentPage()?.mainFrame()||(method==='POST'&&[307,308].includes(status)))throw fail('POLICY');
    const next=clean(new URL(response.headers().location,url).href);
    // No redirect response reaches Chromium; it never forwards the secret body.
    await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Continuing approved sign-in</title>'});check();
    queued.push(next.href);
   }else{
    if(Number(response.headers()['content-length'])>100*1024**2)throw fail('LIMIT');
    await route.fulfill({response});
   }
  }catch(e){failure=['LOCKED','CANCELLED','BROWSER_REVIEW','REPORT_RATE_LIMIT','LIMIT'].includes(e.code)?fail(e.code):fail('POLICY');try{await route.abort();}catch{}}
 };
 const settle=async download=>{
  while(queued.length){if(failure)throw failure;check();expectedGet=queued.shift();try{await currentPage().goto(expectedGet,{waitUntil:'domcontentloaded',timeout:45000});}catch{if(failure)throw failure;if(download){await download;queued.length=0;return;}throw fail('BROWSER_LOGIN');}finally{expectedGet=null;}}
  if(failure)throw failure;check();
 };
 return {handler,settle,protect(secret){secrets=[secret.username,secret.password].filter(Boolean);},expectSubmit(){submission=true;},endSubmit(){submission=false;},clear(){secrets=[];submission=false;expectedGet=null;},assert(){if(failure)throw failure;}};
}
module.exports={protectedNetwork};
