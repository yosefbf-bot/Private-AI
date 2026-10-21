'use strict';
const {fail,text}=require('./security.cjs');

// Sign-in instructions contain selectors and approved destinations, never values.
function target(value,origins){
 const u=new URL(text(value,2000));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!origins.includes(u.origin))throw fail('INVALID');
 return u.origin+u.pathname;
}
function validateLogin(input,origins){
 if(input===undefined||input===null)return undefined;
 if(!input||Array.isArray(input)||!Array.isArray(input.steps)||input.steps.length<3||input.steps.length>6||!Array.isArray(input.formActions)||!input.formActions.length||input.formActions.length>4)throw fail('INVALID');
 const steps=input.steps.map(s=>{
  if(!s||!['username','password','click'].includes(s.op)||Object.keys(s).some(k=>!['op','url','selector'].includes(k)))throw fail('INVALID');
  const selector=text(s.selector,300).trim();if(!selector)throw fail('INVALID');
  return {op:s.op,url:target(s.url,origins),selector};
 });
 const ops=steps.map(s=>s.op);
 if(ops.filter(s=>s==='username').length!==1||ops.filter(s=>s==='password').length!==1||ops[0]!=='username'||ops.at(-1)!=='click'||ops.indexOf('password')<ops.indexOf('username'))throw fail('INVALID');
 return {steps,formActions:[...new Set(input.formActions.map(u=>target(u,origins)))]};
}
function pageTarget(page){const u=new URL(page.url());return u.origin+u.pathname;}

async function signIn(core,page,recipe,ready,check,progress,settle=async()=>{},network){
 if(!recipe.autoLogin)return false;
 if(await ready.isVisible()){check();return false;}
 check();
 if(!core.browserCredentials)throw fail('BROWSER_CREDENTIAL');
 // No Playwright tracing, HAR or debug output is enabled for protected sign-in.
 if(process.env.DEBUG||process.env.PWDEBUG)throw fail('BROWSER_CREDENTIAL');
 return core.browserCredentials.use(recipe,async secret=>{
  network?.protect(secret);
  try{
   for(const [index,step] of recipe.autoLogin.steps.entries()){
    progress(index);check();
    const locator=page.locator(step.selector);
    await locator.waitFor({state:'visible',timeout:20000});check();
    if(pageTarget(page)!==step.url||await locator.count()!==1)throw fail('BROWSER_LOGIN');
    check();
    // Inspect attributes and form destinations only; never read existing values.
    const allowed=await locator.evaluate((el,{op,actions})=>{
     if(el.ownerDocument.defaultView!==el.ownerDocument.defaultView.top)return false;
     const form=el.form;
     if(!form||form.method.toLowerCase()!=='post')return false;
     const clean=value=>{try{const u=new URL(value,el.ownerDocument.baseURI);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u.origin+u.pathname:null;}catch{return null;}};
     const action=el.getAttribute('formaction')?el.formAction:form.action;
     const method=el.getAttribute('formmethod')?el.formMethod:form.method;
     if(method.toLowerCase()!=='post'||!actions.includes(clean(action)))return false;
     if(op==='password')return el.matches('input[type="password"]')&&el.autocomplete!=='new-password';
     if(op==='username')return el.matches('input[type="text"],input[type="email"],input:not([type])')&&!/password|passwd|passcode|otp/i.test((el.name||'')+' '+el.id+' '+el.autocomplete);
     return el.matches('button:not([type]),button[type="submit"],input[type="submit"]');
    },{op:step.op,actions:recipe.autoLogin.formActions});
    check();if(!allowed||pageTarget(page)!==step.url||!await locator.isEnabled())throw fail('BROWSER_LOGIN');
    check();if(pageTarget(page)!==step.url)throw fail('BROWSER_LOGIN');
    if(step.op==='click'){network?.expectSubmit();await locator.click({timeout:20000});}
    else await locator.fill(step.op==='password'?secret.password:secret.username,{timeout:20000});
    await settle();
    check();
   }
   await ready.waitFor({state:'visible',timeout:30000});check();
   network?.endSubmit();
   core.store.put('browserLoginVerified',recipe.id,{id:recipe.id,hash:require('./browser-reports.cjs').digest(recipe),revision:secret.revision,tested:Date.now()});
   return true;
  }catch(e){
   network?.assert();
   if(['LOCKED','CANCELLED','POLICY','BROWSER_REVIEW','REPORT_RATE_LIMIT'].includes(e.code))throw e;
   // Playwright errors can include filled values, selectors and session URLs.
   throw fail('BROWSER_LOGIN');
  }
 });
}
module.exports={validateLogin,signIn,pageTarget};
