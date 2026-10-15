'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const textTypes=new Set(['.cjs','.mjs','.js','.ts','.css','.html','.json','.md','.txt','.svg','.xml','.yml','.yaml','.py','.ps1','.sh','.toml','.ini','.csv']);
function canonicalBytes(file){
 const bytes=fs.readFileSync(file);if(!textTypes.has(path.extname(file).toLowerCase()))return bytes;
 const text=bytes.toString('utf8');
 // Do not turn non-UTF-8 binary input into replacement characters.
 if(!Buffer.from(text,'utf8').equals(bytes))return bytes;
 return Buffer.from(text.replace(/\r\n/g,'\n'),'utf8');
}
function sourceDigest(directoryRoot){
 const hash=crypto.createHash('sha256');
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name!=='build-info.json'){hash.update(path.relative(directoryRoot,file).split(path.sep).join('/'));hash.update(canonicalBytes(file));}}}
 walk(path.join(directoryRoot,'source'));walk(path.join(directoryRoot,'chrome_extension'));hash.update(canonicalBytes(path.join(directoryRoot,'package.json')));
 return hash.digest('hex');
}
function prepare(){
 const dir=path.join(root,'chrome_extension'),target=path.join(dir,'firefox');fs.mkdirSync(target,{recursive:true});
 fs.copyFileSync(require.resolve('@mozilla/readability/Readability.js'),path.join(dir,'vendor/readability.js'));
 fs.copyFileSync(path.join(path.dirname(require.resolve('@mozilla/readability/package.json')),'LICENSE.md'),path.join(dir,'vendor/readability-LICENSE.md'));
 for(const name of ['panel.html','panel.css','panel.mjs','capture.mjs','background.mjs','icon16.png','icon48.png','icon128.png','vendor'])fs.cpSync(path.join(dir,name),path.join(target,name),{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 const version=require('../package.json').version;manifest.version=version.split('-')[0];
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 delete manifest.key;delete manifest.side_panel;manifest.permissions=manifest.permissions.filter(p=>p!=='sidePanel');
 manifest.background={scripts:['background.mjs']};
 manifest.sidebar_action={default_title:'Private AI Companion',default_panel:'panel.html',default_icon:'icon48.png'};
 manifest.browser_specific_settings={gecko:{id:require('../source/browser-hosts.cjs').firefoxId,strict_min_version:'128.0'}};
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const digest=sourceDigest(root),file=path.join(root,'source/build-info.json');let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(previous.sourceSHA256!==digest||previous.version!==version)fs.writeFileSync(file,JSON.stringify({...previous,version,updatedAt:new Date().toISOString(),sourceSHA256:digest},null,2)+'\n');
}
module.exports=prepare;module.exports.sourceDigest=sourceDigest;if(require.main===module)prepare();
