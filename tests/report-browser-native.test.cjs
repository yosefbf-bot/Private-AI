'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs');
const {day,period}=require('../source/report-parameters.cjs');
test('Windows Edge applies dates/options, downloads without overwrite and indexes source-linked history',{skip:process.platform!=='win32',timeout:60000},async t=>{
 const cleanup=[],{core}=fixture({after:f=>cleanup.push(f)});let worker,uiBrowser;const selected=[];let extraPages=0;
 t.after(async()=>{await worker?.close();await uiBrowser?.close();for(const f of cleanup.reverse())f();});
 core.resources.memory=()=>8*1024**3;core.resources.approve=async()=>true;
 const engine=require('playwright-core').chromium,wrapper={launchPersistentContext:async(profile,options)=>{
  const context=await engine.launchPersistentContext(profile,{...options,headless:true}),create=context.newPage.bind(context);
  const instrument=async page=>{await page.route('https://report.privateai.invalid/**',async route=>{
   const url=new URL(route.request().url());if(url.pathname==='/download'){
    selected.push(Object.fromEntries(url.searchParams));
    return route.fulfill({headers:{'content-type':'text/csv','content-disposition':'attachment; filename=synthetic.csv'},body:`date,residentId,unit,eventId\n${day(new Date())},R-SYNTHETIC,North,E-SYNTHETIC`});
   }
   return route.fulfill({contentType:'text/html',body:'<input id="start"><input id="end"><select id="unit"><option>All</option><option>North</option></select><input id="detail" type="checkbox"><button id="download" onclick="location.href=\'/download?\'+new URLSearchParams({start:document.querySelector(\'#start\').value,end:document.querySelector(\'#end\').value,unit:document.querySelector(\'#unit\').value,detail:document.querySelector(\'#detail\').checked})">Download</button>'});
  });return page;};for(const page of context.pages())await instrument(page);context.newPage=async()=>{extraPages++;return instrument(await create());};return context;
 }};
 worker=new BrowserWorker(core,{chromium:wrapper});
 const recipe=validateRecipe({name:'Synthetic configurable export',url:'https://report.privateai.invalid/report',steps:[{op:'fill',selector:'#start',value:'{{start}}'},{op:'fill',selector:'#end',value:'{{end}}'},{op:'select',selector:'#unit',value:'{{unit}}'},{op:'check',selector:'#detail',checked:true},{op:'download',selector:'#download'}],report:{period:'last month',folder:'Reports',dailyFolder:true,choices:{unit:{values:['All','North'],default:'North'}},tracking:{mode:'events',metric:'Synthetic events',dateColumn:'date',residentColumn:'residentId',unitColumn:'unit',eventIdColumn:'eventId'}}});
 const a=await worker.run(recipe),b=await worker.run(recipe,{parameters:{period:'yesterday'}});
 assert.deepEqual(selected[0],{...period('last month'),unit:'North',detail:'true'});assert.deepEqual(selected[1],{...period('yesterday'),unit:'North',detail:'true'});
 assert.equal(extraPages,0,'Each actual fresh launch reuses its one initial page');assert.notEqual(a.relative,b.relative);assert.equal(path.dirname(a.relative).replaceAll('\\','/'),'Reports/'+day(new Date()));assert.ok(fs.existsSync(path.join(core.settings().workspace,a.relative)));assert.equal(worker.context,null);
 await core.reportHistory.index(a.reportId);await core.reportHistory.index(b.reportId);
 assert.equal((await core.reportHistory.trends({entityType:'resident',entityId:'R-SYNTHETIC'})).groups[0].observations,1);
 core.reportHistory.queue({ids:[a.reportId]});assert.equal(await core.reportHistory.tick(),true);
 const analysis=core.store.list('report_analysis')[0];assert.equal(analysis.state,'completed');assert.ok(fs.existsSync(path.join(core.settings().workspace,analysis.output)));assert.equal(core.store.get('job',analysis.jobId).status,'completed');
 uiBrowser=await engine.launch({channel:'msedge',headless:true});const page=await uiBrowser.newPage();
 await page.exposeFunction('fixtureAPI',async(op,data)=>{
  if(op==='browserRecipes')return [];
  if(op==='reportHistory')return {reports:core.reportHistory.list(data),analyses:core.store.summaries('report_analysis')};
  if(op==='reportTrends')return core.reportHistory.trends(data);
  if(op==='scheduleSave')return core.saveSchedule(data);
  throw Error('Unexpected synthetic UI operation '+op);
 });
 await page.setContent('<main id="content"></main>');await page.addStyleTag({path:path.join(__dirname,'../source/ui/style.css')});
 await page.evaluate(async code=>{
  const {createBrowserUI}=await import('data:text/javascript;base64,'+code),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ui=createBrowserUI({api:window.fixtureAPI,esc,toast:()=>{}});document.querySelector('#content').innerHTML=await ui.html();
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(b)await ui.handle(b.dataset.act,b.dataset.id);});
 },Buffer.from(fs.readFileSync(path.join(__dirname,'../source/ui/browser-recipes.mjs'),'utf8')).toString('base64'));
 for(const theme of ['light','dark']){
  await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
  await page.getByRole('button',{name:'Show reports',exact:true}).click();await page.locator('[data-report-history]').getByText('2 reports match',{exact:false}).waitFor();
  await page.getByText('Source-linked trends',{exact:true}).click();await page.locator('[name="trendType"]').selectOption('resident');await page.locator('[name="trendId"]').fill('R-SYNTHETIC');
  await page.getByRole('button',{name:'Review trends',exact:true}).click();await page.locator('[data-report-trends]').getByText('1 distinct events',{exact:false}).waitFor();await page.getByText('Source-linked trends',{exact:true}).click();
 }
 await page.getByText('Schedule analysis of this selection',{exact:true}).click();await page.locator('[name="historyFrequency"]').selectOption('monthly');await page.locator('[name="historyMonthDay"]').fill('15');await page.getByRole('button',{name:'Add analysis schedule',exact:true}).click();
 for(let i=0;i<100&&!core.store.count('schedule');i++)await new Promise(r=>setTimeout(r,20));
 const schedule=core.store.list('schedule')[0];assert.equal(schedule.frequency,'monthly');assert.equal(schedule.monthDay,15);assert.deepEqual(schedule.reportQuery,{date:'today'});
});
