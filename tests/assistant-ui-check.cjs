'use strict';
// Real Core/SQLite and browser UI, synthetic data only; no external account calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./helpers.cjs');
const cleanup=[],{core}=fixture({after:f=>cleanup.push(f)}),root=path.resolve(__dirname,'..');
let browser;const errors=[],calls=[];
const chatControl={wait:null,started:null,release:null,finished:null};let chatCompletion=null,chatDispatched=false;
const captureControl={fail:false,wait:null,started:null,listWait:null,listStarted:null,summaryWait:null,summaryStarted:null};
core.deleteKey('openai'); // Exercise keyless setup, including its warning in dark mode.
// This UI fixture checks rendering, not the host's changing memory pressure.
core.resources.memory=()=>8*1024**3;
async function dispatch(op,data={}){
  calls.push(op);
  if(op==='send'){try{chatDispatched=true;chatControl.started?.();if(chatControl.wait)await chatControl.wait;return await core.send(data);}finally{chatControl.finished?.();}}
  if(op==='summary'&&captureControl.summaryWait){const wait=captureControl.summaryWait;captureControl.summaryWait=null;captureControl.summaryStarted?.();await wait;}
  if(op==='captureList'&&captureControl.listWait){const wait=captureControl.listWait;captureControl.listWait=null;captureControl.listStarted?.();await wait;}
  if(op==='captureCreate'){
    if(captureControl.fail)throw require('../source/security.cjs').fail('INVALID');
    const wait=captureControl.wait;if(wait){captureControl.started?.();await wait;}
  }
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
  assert.equal(await page.locator('#resource-status').isVisible(),false,'Routine idle status stays out of the chat');
  core.saveSettings({workerPaused:true});
  await page.evaluate(()=>window.__deliver({type:'jobs_changed'}));
  await page.locator('#resource-status').waitFor({state:'visible'});
  assert.match(await page.locator('#resource-status').innerText(),/Background work is paused/);
  core.saveSettings({workerPaused:false});
  await page.evaluate(()=>window.__deliver({type:'jobs_changed'}));
  await page.locator('#resource-status').waitFor({state:'hidden'});
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
  // Dark-only regressions: these controls previously retained deep light-theme
  // colors. Check rendered text, disabled labels, field/composer edges and focus.
  const darkVisibility=[];
  await page.locator('#sidebar [data-view=settings]').click();await page.locator('[name=appearance]').selectOption('dark');
  await page.locator('#content').evaluate(content=>{
    const fixture=document.createElement('section');fixture.id='dark-visibility-fixture';fixture.className='section';
    fixture.innerHTML='<button class="danger" data-contrast="danger-action">Delete synthetic item</button>'+
      '<label class="voice-control-label" data-contrast="voice-label">Microphone options</label>'+
      '<button class="voice-composer-btn" data-contrast="microphone-control">Microphone</button>'+
      '<span class="message-duration extended" data-contrast="extended-duration">15s</span>'+
      '<p class="composer-note" data-contrast="composer-hint">Synthetic privacy reminder</p>'+
      '<p class="snf-stale-banner" data-contrast="stale-evidence-warning">Synthetic source is stale</p>'+
      '<p class="text-high" data-contrast="high-priority-text">Synthetic review priority</p>'+
      '<button class="primary" disabled data-contrast="disabled-action">Waiting for synthetic operation</button>'+
      '<label>Input boundary <input id="dark-visibility-input" placeholder="Synthetic input hint"></label>'+
      '<label>Select boundary <select><option>Synthetic option</option></select></label>'+
      '<label>Text area boundary <textarea placeholder="Synthetic note hint"></textarea></label>';
    content.append(fixture);
  });
  await audit('dark','#dark-visibility-fixture [data-contrast]');
  await page.locator('#dark-visibility-fixture .voice-composer-btn').hover();
  await audit('dark','#dark-visibility-fixture .voice-composer-btn');
  await page.mouse.move(1,1);
  const visualRows=await page.locator('#dark-visibility-fixture input,#dark-visibility-fixture select,#dark-visibility-fixture textarea').evaluateAll(elements=>elements.map(el=>{
    const style=getComputedStyle(el),hint=getComputedStyle(el,'::placeholder');let parent=el.parentElement;
    while(parent&&getComputedStyle(parent).backgroundColor==='rgba(0, 0, 0, 0)')parent=parent.parentElement;
    return {target:el.tagName,border:style.borderTopColor,width:parseFloat(style.borderTopWidth),background:style.backgroundColor,surrounding:getComputedStyle(parent).backgroundColor,placeholder:hint.color};
  }));
  const contrastRatio=(foreground,background)=>{
    const lum=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
    const a=lum(foreground),b=lum(background);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  };
  for(const row of visualRows){
    const ratio=Math.min(contrastRatio(row.border,row.background),contrastRatio(row.border,row.surrounding));
    assert.ok(row.width>=1&&ratio>=3,`${row.target} dark field boundary contrast: ${ratio}`);darkVisibility.push({...row,ratio});
    if(row.target!=='SELECT'){const hintRatio=contrastRatio(row.placeholder,row.background);assert.ok(hintRatio>=4.5,`Dark placeholder contrast: ${hintRatio}`);darkVisibility.push({target:row.target+' placeholder',ratio:hintRatio});}
  }
  assert.equal(await page.locator('#dark-visibility-fixture button:disabled').evaluate(el=>getComputedStyle(el).opacity),'1','Disabled labels must remain readable, with muted styling and native disabled behavior');
  await page.keyboard.press('Tab');await page.locator('#dark-visibility-input').focus();
  const focus=await page.locator('#dark-visibility-input').evaluate(el=>({visible:el.matches(':focus-visible'),color:getComputedStyle(el).outlineColor,width:parseFloat(getComputedStyle(el).outlineWidth),background:getComputedStyle(el).backgroundColor}));
  const focusRatio=contrastRatio(focus.color,focus.background);assert.ok(focus.visible&&focus.width>=2&&focusRatio>=3,'Dark keyboard focus must be visible');darkVisibility.push({target:'keyboard focus',ratio:focusRatio});
  await page.locator('#dark-visibility-fixture').screenshot({path:path.join(out,'dark-visibility-controls.png')});
  await page.locator('#dark-visibility-fixture').evaluate(el=>el.remove());
  await page.locator(`[data-id="${guideChat.id}"]`).click();
  await audit('dark','#voice-composer-btn,#composer-note');
  const composer=await page.locator('#compose .composer-box').evaluate(el=>({border:getComputedStyle(el).borderTopColor,background:getComputedStyle(el).backgroundColor}));
  const composerRatio=contrastRatio(composer.border,composer.background);assert.ok(composerRatio>=3,'Actual dark chat composer boundary must be visible');darkVisibility.push({target:'actual chat composer boundary',ratio:composerRatio});
  await page.screenshot({path:path.join(out,'response-dark-visibility.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'dark-visibility.json'),JSON.stringify(darkVisibility,null,2)+'\n');
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
  // Exercise the actual Notes UI and real encrypted Core while navigation,
  // review refresh, failed save and delayed successful save compete with typing.
  const notesDraftChecks=[];
  await page.locator('#sidebar [data-view=captures]').click();
  const noteText='SYNTHETIC unsaved rounds observation';
  await page.locator('#capture-form [name=text]').fill(noteText);
  await page.locator('#capture-form .manual-details > summary').click();
  await page.locator('#capture-form [name=owner]').fill('SYNTHETIC reviewer');
  await page.locator('#capture-file').setInputFiles({name:'SYNTHETIC-evidence.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC evidence, not a real record')});
  const cancelledDialog=page.waitForEvent('dialog');
  const cancelledNavigation=page.locator('#sidebar [data-view=dashboard]').click();
  const discard=await cancelledDialog;assert.match(discard.message(),/discard the unsaved note/);await discard.dismiss();await cancelledNavigation;
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),noteText);
  notesDraftChecks.push('Cancel navigation keeps the unsaved note');
  const chatsBeforeCancelledNew=core.store.count('chat');
  const cancelledNewDialog=page.waitForEvent('dialog');const cancelledNew=page.locator('#sidebar [data-act=new]').click();
  await (await cancelledNewDialog).dismiss();await cancelledNew;
  assert.equal(core.store.count('chat'),chatsBeforeCancelledNew);assert.equal(await page.locator('#capture-form [name=text]').inputValue(),noteText);
  notesDraftChecks.push('Cancel New chat leaves Notes and chat history unchanged');
  const priorForm=await page.locator('#capture-form').elementHandle();
  await page.locator('[data-action]').first().click();
  await page.locator('#modal-content [name=note]').fill('SYNTHETIC administrative review');
  await page.locator('#modal-submit').click();
  await page.waitForFunction(el=>!el.isConnected,priorForm);await priorForm.dispose();
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),noteText);
  assert.equal(await page.locator('#capture-form [name=owner]').inputValue(),'SYNTHETIC reviewer');
  assert.notEqual(await page.locator('#capture-form .manual-details').getAttribute('open'),null);
  notesDraftChecks.push('Review reload preserves text and optional fields');
  assert.equal(await page.locator('#capture-file').evaluate(el=>el.files[0]?.name),'SYNTHETIC-evidence.txt');
  notesDraftChecks.push('Review reload preserves explicitly selected evidence');
  const beforeFailedSave=core.store.count('capture_note');captureControl.fail=true;
  await page.locator('#capture-form button[type=submit]').click();
  const invalidMessage=require('../source/security.cjs').safeError(require('../source/security.cjs').fail('INVALID')).message;
  await page.getByText(invalidMessage,{exact:true}).waitFor();
  assert.equal(core.store.count('capture_note'),beforeFailedSave);
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),noteText);
  assert.equal(await page.locator('#capture-file').evaluate(el=>el.files.length),1);
  captureControl.fail=false;notesDraftChecks.push('Failed save leaves the unsaved form/evidence intact');
  const acceptedDialog=page.waitForEvent('dialog');
  const acceptedNavigation=page.locator('#sidebar [data-view=dashboard]').click();
  await (await acceptedDialog).accept();await acceptedNavigation;
  await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await page.locator('#sidebar [data-view=captures]').click();
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),'');
  assert.equal(await page.locator('#capture-file').evaluate(el=>el.files.length),0);
  notesDraftChecks.push('Only explicit discard clears an unsaved form on navigation');
  await page.locator('#capture-form [name=text]').fill('SYNTHETIC submitted observation');
  await page.locator('#capture-file').setInputFiles({name:'SYNTHETIC-submitted.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC submitted evidence')});
  const savingForm=await page.locator('#capture-form').elementHandle();
  let started,release;const saveStarted=new Promise(resolve=>{started=resolve;});
  captureControl.started=started;captureControl.wait=new Promise(resolve=>{release=resolve;});
  let listStarted,releaseList;const listRequestStarted=new Promise(resolve=>{listStarted=resolve;});
  captureControl.listStarted=listStarted;captureControl.listWait=new Promise(resolve=>{releaseList=resolve;});
  await page.locator('[data-action]').first().click();await page.locator('#modal-content [name=note]').fill('SYNTHETIC review begins before save');await page.locator('#modal-submit').click();await listRequestStarted;
  await page.locator('#capture-form button[type=submit]').click();await saveStarted;
  captureControl.listStarted=null;releaseList();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  // Wait for the pre-existing captureList RPC to resume; no timer-based save
  // completion is assumed, and the same form must remain guarded.
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.equal(await savingForm.evaluate(el=>el.isConnected),true);
  assert.equal(await page.locator('#capture-form button[type=submit]').isDisabled(),true);
  notesDraftChecks.push('A save starting during list refresh retains its original guarded form');
  const captureCallsBeforeReview=calls.filter(op=>op==='captureCreate').length;
  await page.locator('[data-action]').first().click();await page.locator('#modal-content [name=note]').fill('SYNTHETIC review during save');await page.locator('#modal-submit').click();
  await page.waitForFunction(()=>!document.querySelector('#modal').open);
  assert.equal(await savingForm.evaluate(el=>el.isConnected),true,'Review refresh must not replace the in-flight form');
  assert.equal(await page.locator('#capture-form button[type=submit]').isDisabled(),true);
  await page.locator('#capture-form').evaluate(el=>el.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(calls.filter(op=>op==='captureCreate').length,captureCallsBeforeReview);
  notesDraftChecks.push('Review refresh and repeated submission cannot duplicate an in-flight note');
  await page.locator('#capture-form [name=text]').fill('SYNTHETIC newer draft typed during save');
  await page.locator('#capture-file').setInputFiles({name:'SYNTHETIC-newer.txt',mimeType:'text/plain',buffer:Buffer.from('SYNTHETIC newer evidence')});
  captureControl.wait=null;captureControl.started=null;release();
  await page.waitForFunction(el=>!el.isConnected,savingForm);await savingForm.dispose();
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),'SYNTHETIC newer draft typed during save');
  assert.equal(await page.locator('#capture-file').evaluate(el=>el.files[0]?.name),'SYNTHETIC-newer.txt');
  assert.equal(core.store.count('capture_note'),beforeFailedSave+1);
  assert.ok(core.store.list('capture_note').some(c=>c.text==='SYNTHETIC submitted observation'));
  assert.ok(!core.store.list('capture_note').some(c=>c.text==='SYNTHETIC newer draft typed during save'));
  notesDraftChecks.push('Delayed save preserves newer text and evidence without claiming it saved');
  const finalForm=await page.locator('#capture-form').elementHandle();
  let lastListStarted,releaseLastList;const lastListRequest=new Promise(resolve=>{lastListStarted=resolve;});
  captureControl.listStarted=lastListStarted;captureControl.listWait=new Promise(resolve=>{releaseLastList=resolve;});
  await page.locator('[data-action]').first().click();await page.locator('#modal-content [name=note]').fill('SYNTHETIC list held across acknowledgment');await page.locator('#modal-submit').click();await lastListRequest;
  let ackRefreshStarted,releaseAckRefresh;const ackRefreshRequest=new Promise(resolve=>{ackRefreshStarted=resolve;});
  captureControl.summaryStarted=ackRefreshStarted;captureControl.summaryWait=new Promise(resolve=>{releaseAckRefresh=resolve;});
  await page.locator('#capture-form button[type=submit]').click();await ackRefreshRequest;
  captureControl.listStarted=null;releaseLastList();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await finalForm.evaluate(el=>el.isConnected),true,'A pre-ack list response must not replace the acknowledged form while its refresh awaits');
  captureControl.summaryStarted=null;releaseAckRefresh();
  notesDraftChecks.push('A pre-ack list response cannot restore an acknowledged note');
  await page.waitForFunction(el=>!el.isConnected,finalForm);await finalForm.dispose();
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),'');
  assert.equal(await page.locator('#capture-file').evaluate(el=>el.files.length),0);
  assert.equal(core.store.count('capture_note'),beforeFailedSave+2);
  notesDraftChecks.push('Acknowledged unchanged submission clears exactly once');
  const lockMarker='SYNTHETIC_UNSAVED_LOCK_CLEAR';
  await page.locator('#capture-form [name=text]').fill(lockMarker);
  let lockDialogs=0;const onLockDialog=dialog=>{lockDialogs++;dialog.dismiss();};page.on('dialog',onLockDialog);
  await page.evaluate(()=>window.__deliver({type:'locked'}));
  await page.getByRole('heading',{name:'Private AI is locked',exact:true}).waitFor();
  assert.equal(lockDialogs,0);assert.equal(await page.locator('#capture-form').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes(lockMarker));
  page.off('dialog',onLockDialog);notesDraftChecks.push('Forced lock clears Notes without a blocking discard dialog');
  assert.equal(await page.evaluate(marker=>JSON.stringify({...localStorage,...sessionStorage}).includes(marker),lockMarker),false);
  await page.reload();await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  await page.locator('#sidebar [data-view=captures]').click();
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),'');
  notesDraftChecks.push('Unsubmitted content is not persisted into browser storage or restored after lock/reload');
  // Rejected chat navigation must not deactivate the Notes form. Hold the real
  // API call before deterministic Core calculation, representing a pending reply.
  await page.locator(`[data-id="${guideChat.id}"]`).click();
  let chatStarted;const awaitingChat=new Promise(resolve=>{chatStarted=resolve;});chatControl.started=chatStarted;
  chatControl.wait=new Promise(resolve=>{chatControl.release=resolve;});chatCompletion=new Promise(resolve=>{chatControl.finished=resolve;});
  await page.locator('#prompt').fill('/calc 2+2');await page.locator('#send').click();await awaitingChat;
  await page.locator('#sidebar [data-view=captures]').click();
  const pendingReplyNote='SYNTHETIC note while a reply is pending';await page.locator('#capture-form [name=text]').fill(pendingReplyNote);
  let blockedDialogs=0;const acceptBlockedDialog=dialog=>{blockedDialogs++;dialog.accept();};page.on('dialog',acceptBlockedDialog);
  const beforeBlockedNavigation=core.store.count('chat');
  await page.locator('#sidebar [data-act=new]').click();await page.getByText('Stop the current response first.',{exact:true}).waitFor();
  await page.locator(`[data-id="${guideChat.id}"]`).click();
  assert.equal(blockedDialogs,0,'A rejected chat switch must not ask to discard or stop the Notes form');
  page.off('dialog',acceptBlockedDialog);
  assert.equal(core.store.count('chat'),beforeBlockedNavigation);assert.equal(await page.locator('#capture-form [name=text]').inputValue(),pendingReplyNote);
  const blockedForm=await page.locator('#capture-form').elementHandle(),beforePendingSave=core.store.count('capture_note');
  await page.locator('#capture-form button[type=submit]').click();await page.waitForFunction(el=>!el.isConnected,blockedForm);await blockedForm.dispose();
  assert.equal(core.store.count('capture_note'),beforePendingSave+1);assert.equal(core.store.list('capture_note').filter(c=>c.text===pendingReplyNote).length,1);
  assert.equal(await page.locator('#capture-form [name=text]').inputValue(),'');
  chatControl.release();await chatCompletion;await page.waitForFunction(()=>!document.querySelector('#prompt').disabled);
  notesDraftChecks.push('Rejected New/Open chat during a response preserves an active Notes form and exactly-one Save');
  fs.writeFileSync(path.join(out,'notes-draft-checks.json'),JSON.stringify(notesDraftChecks,null,2)+'\n');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:25,notesDraftChecks:notesDraftChecks.length,surfaceContrastChecks:surfaceContrast.length,darkVisibilityChecks:darkVisibility.length,scope:'Synthetic Core/SQLite + Edge: existing assistant workflows, actual settings/guide and shared card/hover text contrast in both themes',browser:await browser.version()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{chatControl.release?.();if(chatDispatched)await chatCompletion;await browser?.close();server.close();for(const fn of cleanup)fn();});
