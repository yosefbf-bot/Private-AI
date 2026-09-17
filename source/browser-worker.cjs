'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fail,uuid,safePath,text}=require('./security.cjs');
const {workspace}=require('./files.cjs');
function validateRecipe(input){
 const name=text(input.name,80).trim(),url=new URL(text(input.url,2000));if(!name||url.protocol!=='https:'||url.username||url.password)throw fail('INVALID');
 const origins=[...new Set([url.origin,...(input.origins||[])])];if(origins.length>8||origins.some(v=>new URL(v).protocol!=='https:'||new URL(v).origin!==v))throw fail('INVALID');
 const steps=input.steps||[];if(!Array.isArray(steps)||!steps.length||steps.length>20)throw fail('INVALID');
 for(const s of steps){if(!['click','fill','wait','download'].includes(s.op)||typeof s.selector!=='string'||s.selector.length>300)throw fail('INVALID');if(s.op==='fill')text(s.value,500);}
 if(steps.filter(s=>s.op==='download').length!==1||steps.at(-1).op!=='download')throw fail('INVALID');
 return {id:input.id||uuid(),name,url:url.href,origins,steps};
}
class BrowserWorker{
 constructor(core,{chromium=require('playwright-core').chromium}={}){this.core=core;this.chromium=chromium;this.busy=false;this.context=null;}
 async open(url,origins,running=false){
  if(this.opening||this.busy&&!running)throw fail('BUSY');this.opening=true;
  try{
   if(!running)await this.core.resources.preflight('browser');
   if(!this.context){await this.core.resources.reserveBrowser(this,'Report browser (Edge)');this.context=await this.chromium.launchPersistentContext(path.join(this.core.root,'browser-profile'),{channel:'msedge',headless:false,acceptDownloads:true,viewport:null});this.context.on('close',()=>{this.context=null;this.core.resources.releaseBrowser(this);});}
   await this.context.unroute('**/*');await this.context.route('**/*',route=>{let allowed=false;try{const u=new URL(route.request().url());allowed=u.protocol==='https:'&&origins.includes(u.origin);}catch{}return allowed?route.continue():route.abort();});
   const page=this.context.pages()[0]||await this.context.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});return page;
  }catch(e){if(!['DEFERRED','INTERFERENCE'].includes(e.code))await this.close();if(e.code)throw e;throw fail('ACCESS');}finally{this.opening=false;}
 }
 async run(input){
  if(this.busy)throw fail('BUSY');const recipe=validateRecipe(input);
  await this.core.resources.preflight('browser');
  if(this.busy||this.opening)throw fail('BUSY');this.busy=true;let temp;
  try{const root=workspace(this.core.settings().workspace,this.core.root),page=await this.open(recipe.url,recipe.origins,true);
   const check=()=>{if(!recipe.origins.includes(new URL(page.url()).origin))throw fail('POLICY');};
   for(const step of recipe.steps){await this.core.resources.checkpoint();check();const locator=page.locator(step.selector);if(await locator.count()!==1)throw fail('ACCESS');
    if(step.op==='click')await locator.click({timeout:20000});
    if(step.op==='fill')await locator.fill(step.value,{timeout:20000});
    if(step.op==='wait')await locator.waitFor({state:'visible',timeout:30000});
    if(step.op==='download'){
     const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),locator.click({timeout:20000})]);check();const ext=path.extname(download.suggestedFilename()).toLowerCase();if(!['.pdf','.xlsx','.xls','.csv','.tsv','.docx','.txt'].includes(ext))throw fail('FILE');
     const name='Report-'+new Date().toISOString().slice(0,10)+'-'+uuid()+ext,relative='Reports/'+name,file=safePath(root,relative);temp=file+'.partial';await download.saveAs(temp);if(await download.failure())throw fail('FILE');if(fs.statSync(temp).size>100*1024**2)throw fail('LIMIT');fs.renameSync(temp,file);temp=null;return {relative,complete:true};
    }
   }
  }catch(e){if(e.code)throw e;throw fail('ACCESS');}finally{if(temp)try{fs.unlinkSync(temp);}catch{}this.busy=false;await this.close();}
 }
 async close(){const context=this.context;this.context=null;try{await context?.close();}catch{}this.core.resources.releaseBrowser(this);}
}
module.exports={BrowserWorker,validateRecipe};
