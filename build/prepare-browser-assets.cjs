'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function prepare(){
 const dir=path.join(root,'chrome_extension'),target=path.join(dir,'firefox');fs.mkdirSync(target,{recursive:true});
 for(const name of ['panel.html','panel.css','panel.mjs','capture.mjs','background.mjs','icon16.png','icon48.png','icon128.png','vendor'])fs.cpSync(path.join(dir,name),path.join(target,name),{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 manifest.version=require('../package.json').version.split('-')[0];
 delete manifest.key;delete manifest.side_panel;manifest.permissions=manifest.permissions.filter(p=>p!=='sidePanel');
 manifest.background={scripts:['background.mjs'],type:'module'};
 manifest.sidebar_action={default_title:'Private AI Companion',default_panel:'panel.html',default_icon:'icon48.png'};
 manifest.browser_specific_settings={gecko:{id:require('../source/browser-hosts.cjs').firefoxId,strict_min_version:'128.0'}};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const hash=crypto.createHash('sha256');
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name!=='build-info.json'){hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));}}}
 walk(path.join(root,'source'));walk(dir);hash.update(fs.readFileSync(path.join(root,'package.json')));
 const digest=hash.digest('hex'),file=path.join(root,'source/build-info.json');let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(previous.sourceSHA256!==digest)fs.writeFileSync(file,JSON.stringify({...previous,updatedAt:new Date().toISOString(),sourceSHA256:digest},null,2)+'\n');
}
module.exports=prepare;if(require.main===module)prepare();
