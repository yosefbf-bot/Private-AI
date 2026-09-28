const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const hosts=require('../source/browser-hosts.cjs');
test('native hosts authorize only the exact companion identity and Firefox manifest path',()=>{
 const root=path.resolve('Validation/synthetic-root'),file=path.join(root,'native-host-firefox.json');
 assert.equal(hosts.allowedInvocation(['app',hosts.origin],root),true);
 assert.equal(hosts.allowedInvocation(['app','chrome-extension://untrusted/'],root),false);
 assert.equal(hosts.allowedInvocation(['app',file,hosts.firefoxId],root),true);
 assert.equal(hosts.allowedInvocation(['app',file,'different@extension'],root),false);
 assert.equal(hosts.allowedInvocation(['app',path.resolve('other/native-host-firefox.json'),hosts.firefoxId],root),false);
 assert.equal(hosts.isInvocation(['app',file,'different@extension']),true);
 const [chromium,firefox]=hosts.manifests(root,'example.exe');assert.deepEqual(chromium.value.allowed_origins,[hosts.origin]);assert.deepEqual(firefox.value.allowed_extensions,[hosts.firefoxId]);assert.equal(firefox.value.allowed_origins,undefined);
});
test('Firefox sidebar opens only from explicit toolbar or keyboard gestures',()=>{
 let click,command,opens=0;const browser={sidebarAction:{open:()=>{opens++;}},action:{onClicked:{addListener:f=>{click=f;}}},commands:{onCommand:{addListener:f=>{command=f;}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../chrome_extension/background.mjs'),'utf8'),{browser});assert.equal(opens,0);click();command('unrelated');assert.equal(opens,1);command('open-private-ai');assert.equal(opens,2);
});
test('Firefox package has shared capture code and no broad website permission',()=>{
 const m=require('../chrome_extension/firefox/manifest.json');assert.equal(m.browser_specific_settings.gecko.id,hosts.firefoxId);assert.deepEqual(m.background.scripts,['background.mjs']);assert.equal(m.sidebar_action.default_panel,'panel.html');assert.equal(m.permissions.includes('sidePanel'),false);assert.equal(m.host_permissions,undefined);assert.equal(m.content_scripts,undefined);
 assert.equal(fs.readFileSync(path.join(__dirname,'../chrome_extension/firefox/capture.mjs'),'utf8'),fs.readFileSync(path.join(__dirname,'../chrome_extension/capture.mjs'),'utf8'));
});
test('Firefox API capture still requires the user include-page choice',async()=>{
 const {buildQuestion}=await import('../chrome_extension/firefox/capture.mjs');let queries=0;
 const browser={tabs:{query:async()=>{queries++;return [{id:9}];}},scripting:{executeScript:async()=>[{result:{text:'Synthetic page'}}]}};
 const old=globalThis.browser;globalThis.browser=browser;try{await buildQuestion({prompt:'hello'});assert.equal(queries,0);await buildQuestion({prompt:'summarize',includePage:true});assert.equal(queries,1);}finally{if(old===undefined)delete globalThis.browser;else globalThis.browser=old;}
});

test('companion falls back to a user-opened popup without sidebar APIs',()=>{
 let popup,command,opened=0;const chrome={action:{setPopup:value=>{popup=value.popup;},openPopup:()=>opened++},commands:{onCommand:{addListener:fn=>command=fn}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../chrome_extension/background.mjs'),'utf8'),{chrome});assert.equal(popup,'panel.html');assert.equal(opened,0);command('open-private-ai');assert.equal(opened,1);
});
