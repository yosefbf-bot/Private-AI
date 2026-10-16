'use strict';
// Real Core/SQLite and browser UI, synthetic data only; no external account calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./helpers.cjs');
const cleanup=[],{core}=fixture({after:f=>cleanup.push(f)}),root=path.resolve(__dirname,'..');
let browser;const errors=[],calls=[];
core.deleteKey('openai'); // Exercise keyless setup, including its warning in dark mode.
// This UI fixture checks rendering, not the host's changing memory pressure.
core.resources.memory=()=>8*1024**3;
async function dispatch(op,data={}){
  calls.push(op);
  for(const [prefix,module] of [['workflow','workflows/index'],['capture','capture-workflows'],['meeting','operations-copilot'],['speaker','operations-copilot'],['snf','snf/index'],['speech','local-speech']])if(op.startsWith(prefix))return require('../source/'+module+'.cjs').dispatch(core,op,data);
  if(op==='summary')return {...core.summary(),autostart:false};
  if(op==='userGuide')return require('../source/app-guide.cjs').guide;
  if(op==='activity')return true;
  if(op==='createChat')return core.createChat(data);
  if(op==='chat')return core.chat(data.id);
  if(op==='pickFiles'){const file=path.join(core.root,'synthetic-policy.txt');fs.writeFileSync(file,'SYNTHETIC facility policy: review the conference door before use.');return [await core.importFile(file)];}
  if(op==='projectSave')return core.projectSave(data);
  if(op==='saveDraft')return core.saveDraft(data.id,data.text);
  if(op==='settings')return core.saveSettings(data);
  throw Error('Unexpected test RPC: '+op);
}
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM});
  const page=await browser.newPage({viewport:{width:1392,height:950}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('testCall',async(op,data)=>{try{return {ok:true,result:await dispatch(op,data)};}catch(e){return {ok:false,error:require('../source/security.cjs').safeError(e)};}});
  await page.addInitScript(()=>{window.privateAI={call:(...args)=>window.testCall(...args),onEvent:cb=>window.__deliver=cb};navigator.mediaDevices.getUserMedia=async()=>{throw Error('Synthetic test does not open the physical microphone.');};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/source/ui/index.html');
  await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  assert.deepEqual(await page.locator('.primary-nav button').evaluateAll(buttons=>buttons.map(button=>button.dataset.view)),['search','dashboard','captures','meetings','workspace']);
  assert.equal(await page.locator('#sidebar [data-view=operations],#sidebar [data-view=actions],#sidebar [data-view=playbooks],#sidebar [data-view=worker]').count(),0);
  await page.locator('#sidebar [data-view=captures]').click();await page.locator('#capture-form textarea').fill('Please call maintenance about the broken conference room door.');
  assert.equal(await page.locator('.manual-details').getAttribute('open'),null);
  await page.locator('#capture-form button[type=submit]').click();await page.getByText('Note and review items saved.',{exact:true}).waitFor();
  await page.locator('#sidebar [data-view=dashboard]').click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.locator('#dashboard-tasks [data-review]').count(),1);
  const out=process.env.PRIVATE_AI_UI_EVIDENCE||path.join(root,'Validation/assistant-first-2026-10-07');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'dashboard.png'),fullPage:true});
  await page.locator('#sidebar [data-view=meetings]').click();await page.locator('#meeting-new').click();await page.locator('#modal-content input[name=title]').fill('Synthetic maintenance meeting');await page.locator('#modal-submit').click();
  await page.locator('#meeting-note textarea').fill('We will call maintenance about the door.');await page.locator('#meeting-note button[type=submit]').click();
  await page.locator('[data-track]').click();assert.equal(core.store.count('todo'),2);
  await page.locator('#meeting-finish').click();await page.getByText('Draft summary',{exact:true}).waitFor();assert.equal(core.store.list('meeting')[0].status,'completed');
  await page.screenshot({path:path.join(out,'meetings.png'),fullPage:true});
  await page.locator('#sidebar [data-view=workspace]').click();await page.locator('#wf-policies').click();await page.getByText('Facility policies selected.',{exact:false}).waitFor();
  assert.equal(core.store.list('project').filter(p=>p.name==='Facility policies').length,1);await page.locator('#wf-policies').click();assert.equal(core.store.count('project'),1);
  await page.locator('#wf-upload').click();await page.getByText('Files added to the collection.',{exact:true}).waitFor();
  const policy=core.store.list('project')[0];assert.equal(policy.fileIds.length,1);assert.match(core.store.get('file',policy.fileIds[0]).text,/SYNTHETIC/);
  await page.locator('#sidebar [data-view=captures]').click();await page.locator('#sidebar [data-view=workspace]').click();await page.locator('#wf-project').selectOption(policy.id);assert.equal(core.store.get('project',policy.id).fileIds.length,1);
  await page.locator('#sidebar .more-tools > summary').click();await page.locator('#sidebar [data-view=automation]').click();await page.getByRole('heading',{name:'Automation',exact:true}).waitFor();
  await page.getByRole('button',{name:'Worker settings',exact:true}).click();await page.getByRole('heading',{name:"Let another PC handle the work"}).first().waitFor();
  await page.locator('#sidebar [data-view=settings]').click();
  await page.locator('[name=appearance]').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.reload();await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:path.join(out,'chat-dark.png'),fullPage:true});
  const guideChat=core.createChat({});await core.send({chatId:guideChat.id,prompt:'/help'});
  core.emit({type:'jobs_changed'});await page.reload();
  await page.locator(`[data-id="${guideChat.id}"]`).click();
  await page.locator('.message.assistant .message-body').waitFor();
  const guideAnswer=core.chat(guideChat.id).messages.at(-1);
  assert.equal(guideAnswer.processing?.provider,'deterministic',JSON.stringify(guideAnswer.error));
  const replyContrast=()=>page.locator('.message.assistant .message-body').evaluate(el=>{
    const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
    return [el,...el.querySelectorAll('p,li,a,strong')].map(node=>{
      let bg=node;while(getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)'&&bg.parentElement)bg=bg.parentElement;
      const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(bg).backgroundColor);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
  });
  for(const theme of ['dark','light']){
    await page.locator('#sidebar [data-view=settings]').click();await page.locator('[name=appearance]').selectOption(theme);
    await page.locator(`[data-id="${guideChat.id}"]`).click();
    for(const ratio of await replyContrast())assert.ok(ratio>=4.5,`${theme} assistant response contrast: ${ratio}`);
    await page.screenshot({path:path.join(out,`response-${theme}.png`),fullPage:true});
  }
  // Measure rendered colors, rather than asserting implementation-specific CSS.
  const surfaceContrast=[];
  const measureContrast=elements=>{
    const rgba=color=>color.match(/[\d.]+/g).map(Number);
    const composite=(foreground,background)=>foreground.slice(0,3).map((v,i)=>v*(foreground[3]??1)+background[i]*(1-(foreground[3]??1)));
    const luminance=color=>{const c=color.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
    const backgrounds=el=>{
      if(!el)return [[255,255,255]];
      const style=getComputedStyle(el),base=backgrounds(el.parentElement).map(parent=>composite(rgba(style.backgroundColor),parent));
      const stops=style.backgroundImage.match(/rgba?\([^)]+\)/g);
      return stops?stops.flatMap(stop=>base.map(color=>composite(rgba(stop),color))):base;
    };
    return elements.map(el=>{
      const colors=backgrounds(el),foreground=rgba(getComputedStyle(el).color);
      return {target:el.dataset.contrast||el.className||el.tagName,text:el.textContent.slice(0,100),foreground:getComputedStyle(el).color,backgrounds:colors,ratio:Math.min(...colors.map(color=>{const a=luminance(composite(foreground,color)),b=luminance(color);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}))};
    });
  };
  const audit=async(theme,selector)=>{
    const rows=await page.locator(selector).evaluateAll(measureContrast);assert.ok(rows.length,'Contrast targets must render');
    for(const row of rows)surfaceContrast.push({theme,...row});
  };
  for(const theme of ['dark','light']){
    await page.locator('#sidebar [data-view=settings]').click();await page.locator('[name=appearance]').selectOption(theme);
    assert.equal(await page.locator('.path-display').innerText(),core.settings().workspace);
    await audit(theme,'.path-display,.section p,.provider-badge.warning');
    await page.screenshot({path:path.join(out,`settings-${theme}.png`),fullPage:true});
    await page.locator('.section').filter({has:page.getByRole('heading',{name:'2. Choose where reports are saved',exact:true})}).screenshot({path:path.join(out,`report-folder-${theme}.png`)});
    if(await page.locator('#sidebar .more-tools').getAttribute('open')===null)await page.locator('#sidebar .more-tools > summary').click();
    await page.locator('#sidebar [data-view=guide]').click();await page.locator('#guide-search').waitFor();
    await audit(theme,'.guide-topic[open] > summary,.guide-topic[open] .guide-location,.guide-topic[open] .guide-note');
    // Supplement actual settings/guide views with their shared card states,
    // including optional clinical panels without importing any resident data.
    await page.locator('#content').evaluate(content=>{
      const surfaces=['file-chip','pill','snf-alert-card severity-critical','inline-action-panel resolve-panel','clinical-surveillance-card','clinical-surveillance-card active','today-alert-card severity-critical','ops-launch-card','ops-sentinel-item severity-critical','ops-sentinel-item severity-high','card-overhead-page','ops-speaker-review-card review-uncertain'];
      const fixture=document.createElement('div');fixture.id='theme-surface-fixture';
      fixture.innerHTML=surfaces.map(classes=>`<div class="${classes}"><span data-contrast="${classes}">Synthetic panel text</span></div>`).join('')+
        '<div class="psych-stat highlight-stat"><span class="val" data-contrast="highlight-value">1</span><span class="lbl" data-contrast="highlight-label">Review required</span></div>'+
        '<div class="ops-ai-flag-box"><span class="ops-ai-flag-kicker" data-contrast="flag-kicker">Review</span><p class="ops-ai-flag-text" data-contrast="flag-text">Synthetic finding</p><span class="ops-ai-flag-disclaimer" data-contrast="flag-disclaimer">Verify source</span></div>'+
        '<div class="voice-mode-tabs"><button class="voice-tab" data-contrast="voice-tab">Voice</button><button class="voice-tab active" data-contrast="voice-tab-active">Selected voice</button></div>'+
        '<button class="today-tab-btn" data-contrast="tab-hover">Tab</button><div class="today-alert-card" data-contrast="alert-hover">Alert</div><table class="today-table"><tr><td data-contrast="row-hover">Synthetic table value</td></tr></table>';
      content.append(fixture);
    });
    await audit(theme,'#theme-surface-fixture [data-contrast]');
    for(const target of ['.voice-tab:not(.active)','.today-tab-btn','.today-alert-card:not(.severity-critical)','.today-table td']){
      const el=page.locator('#theme-surface-fixture '+target);await el.hover();await page.waitForTimeout(250);
      await audit(theme,'#theme-surface-fixture '+target);
    }
    await page.locator('#theme-surface-fixture').evaluate(el=>el.remove());
  }
  fs.writeFileSync(path.join(out,'surface-contrast.json'),JSON.stringify(surfaceContrast,null,2)+'\n');
  assert.deepEqual(surfaceContrast.filter(row=>!Number.isFinite(row.ratio)||row.ratio<4.5),[],'Rendered text must reach 4.5:1 contrast in both themes');
  await page.locator('#sidebar [data-view=settings]').click();await page.locator('[name=appearance]').selectOption('dark');
  await page.locator('#sidebar [data-view=dashboard]').click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'dashboard-dark.png'),fullPage:true});
  await page.locator('#sidebar [data-view=meetings]').click();await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'meetings-dark.png'),fullPage:true});
  await page.locator('#sidebar [data-view=settings]').click();assert.equal(await page.locator('[name=appearance]').inputValue(),'dark');
  const contrast=await page.evaluate(()=>{
    const luminance=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
    return ['.provider-badge.warning','.section p'].map(selector=>{
      const el=document.querySelector(selector);if(!el)throw Error('Missing contrast target '+selector);
      let bg=el;while(getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)'&&bg.parentElement)bg=bg.parentElement;
      const a=luminance(getComputedStyle(el).color),b=luminance(getComputedStyle(bg).backgroundColor);
      return {selector,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
    });
  });
  for(const item of contrast)assert.ok(item.ratio>=4.5,`${item.selector} needs readable dark-mode text: ${item.ratio}`);
  await page.screenshot({path:path.join(out,'settings-dark.png'),fullPage:true});
  await page.locator('[name=appearance]').selectOption('system');await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.locator('[name=appearance]').selectOption('light');await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:25,surfaceContrastChecks:surfaceContrast.length,scope:'Synthetic Core/SQLite + Edge: existing assistant workflows, actual settings/guide and shared card/hover text contrast in both themes',browser:await browser.version()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();for(const fn of cleanup)fn();});
