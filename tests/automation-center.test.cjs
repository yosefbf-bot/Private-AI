'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('history filters update only result rows once per input and fresh detail controls still work',async t=>{
 const {core}=require('./helpers.cjs').fixture(t),{createAutomationCenterUI}=await import('../source/ui/automation-center.mjs');
 core.store.put('job','alpha',{id:'alpha',title:'Synthetic Alpha',status:'completed'});
 core.store.put('job','beta',{id:'beta',title:'Synthetic Beta',status:'failed',error:'FILE'});
 class Element{
  constructor(dataset={}){this.dataset=dataset;this.listeners={};this.writes=0;this.html='';}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  fire(type,value){this.value=value;const fns=[...(this.listeners[type]||[]),this['on'+type]].filter(Boolean);for(const fn of fns)fn({target:this});return fns.length;}
  set innerHTML(value){this.html=value;this.writes++;this.buttons=[...value.matchAll(/data-act="auto-view-run" data-id="([^"]+)"/g)].map(m=>new Element({id:m[1]}));}
  get innerHTML(){return this.html;}
  querySelectorAll(selector){return selector==='[data-act="auto-view-run"]'?this.buttons||[]:[];}
 }
 const modal=new Element(),prior=global.document;global.document={getElementById:id=>id==='auto-modal-container'?modal:null};t.after(()=>global.document=prior);
 const tab=new Element({tab:'history'}),panel=new Element(),status=new Element(),search=new Element(),count=new Element(),root=new Element();
 root.querySelector=selector=>({'#auto-history-results':panel,'#auto-history-count':count,'#history-filter-status':status,'#history-filter-search':search}[selector]);
 root.querySelectorAll=selector=>selector==='[data-act="auto-tab"]'?[tab]:[];
 const ui=createAutomationCenterUI({api:async()=>{},esc:v=>String(v??''),toast:()=>{},refresh:async()=>{},renderPage:()=>{}}),state=core.summary();
 await ui.render(root,state);tab.fire('click');await Promise.resolve();await ui.render(root,state);
 assert.match(root.innerHTML,/id="auto-history-results"/);const fullRenders=root.writes;
 for(const query of ['S','Sy','Syn','Synthetic','Synthetic A','Synthetic Alpha']){
  const before=panel.writes;assert.equal(search.fire('input',query),1);assert.equal(panel.writes,before+1);
 }
 assert.match(panel.innerHTML,/Synthetic Alpha/);assert.doesNotMatch(panel.innerHTML,/Synthetic Beta/);assert.equal(count.textContent,'1');
 assert.equal(status.fire('change','failed'),1);assert.match(panel.innerHTML,/No run history matches/);assert.equal(count.textContent,'0');
 search.fire('input','');assert.match(panel.innerHTML,/Synthetic Beta/);assert.doesNotMatch(panel.innerHTML,/Synthetic Alpha/);assert.equal(count.textContent,'1');
 assert.equal(root.writes,fullRenders,'Filtering keeps controls and focus mounted');
 assert.equal(panel.buttons[0].fire('click'),1);assert.equal(modal.writes,1);assert.match(modal.innerHTML,/Synthetic Beta/);
});

test('Automation & Agent Control Center UI module and integration', async (t) => {
  await t.test('automation-center.mjs module exists and exports createAutomationCenterUI', () => {
    const filePath = path.join(__dirname, '../source/ui/automation-center.mjs');
    assert.ok(fs.existsSync(filePath), 'automation-center.mjs must exist');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /export function createAutomationCenterUI/);
    assert.match(content, /Active Now/);
    assert.match(content, /Needs Attention/);
    assert.match(content, /Upcoming Automations/);
    assert.match(content, /Automation Run History/);
    assert.match(content, /Workers &amp; Operational Resources/);
  });

  await t.test('app.mjs imports and routes automation-center', () => {
    const appPath = path.join(__dirname, '../source/ui/app.mjs');
    const content = fs.readFileSync(appPath, 'utf8');
    assert.match(content, /await import\("\.\/automation-center\.mjs"\)/);
    assert.match(content, /const automationUI=lazyFeature/);
    assert.match(content, /automation:\s*"⚡ Automation & Agent Center"/);
    assert.match(content, /if \(name === "automation"\)/);
  });

  await t.test('index.html contains Automation Center in sidebar', () => {
    const indexPath = path.join(__dirname, '../source/ui/index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.match(content, /data-view="automation"/);
    assert.match(content, /id="automation-sidebar-btn"/);
  });

  await t.test('Administrator Today dashboard integrates automation summary card', () => {
    const todayPath = path.join(__dirname, '../source/ui/snf/today.mjs');
    const content = fs.readFileSync(todayPath, 'utf8');
    assert.match(content, /id="today-automation-summary-card"/);
    assert.match(content, /Automation Summary/);
    assert.match(content, /renderPage\('automation'\)/);
  });

  await t.test('style.css defines automation center operational styles and status strip', () => {
    const cssPath = path.join(__dirname, '../source/ui/style.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    assert.match(content, /\.auto-center-page/);
    assert.match(content, /\.auto-status-strip/);
    assert.match(content, /\.auto-attention-section/);
    assert.match(content, /\.auto-job-grid/);
    assert.match(content, /\.auto-active-card/);
  });
});
