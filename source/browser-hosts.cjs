'use strict';
const path=require('node:path');
const extension=require('./extension-id.json');
const firefoxId='companion@privateai.local';
const origin='chrome-extension://'+extension.id+'/';
const keys=['Google\\Chrome','Microsoft\\Edge','Mozilla'].map(v=>'HKCU\\Software\\'+v+'\\NativeMessagingHosts\\org.privateai.companion');
function manifests(root,executable){const common={name:'org.privateai.companion',description:'Private AI Browser Companion',path:executable,type:'stdio'};return [
 {file:path.join(root,'native-host.json'),keys:keys.slice(0,2),value:{...common,allowed_origins:[origin]}},
 {file:path.join(root,'native-host-firefox.json'),keys:keys.slice(2),value:{...common,allowed_extensions:[firefoxId]}}
];}
function isInvocation(args){return args.some(a=>a.startsWith('chrome-extension://')||path.win32.basename(a)==='native-host-firefox.json');}
function allowedInvocation(args,root){
 const chromium=args.filter(a=>a.startsWith('chrome-extension://'));
 if(chromium.length)return chromium.length===1&&chromium[0]===origin&&!args.includes(firefoxId);
 const index=args.findIndex(a=>path.win32.basename(a)==='native-host-firefox.json');
 return index>=0&&path.resolve(args[index]).toLowerCase()===path.resolve(root,'native-host-firefox.json').toLowerCase()&&args[index+1]===firefoxId;
}
module.exports={firefoxId,origin,keys,manifests,isInvocation,allowedInvocation};
