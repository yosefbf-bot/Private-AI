'use strict';
const {randomUUID}=require('node:crypto');
const {fail}=require('./security.cjs');
function createLocalAudioPermissions({getCore,getWindow,uiURL,onRevoke=()=>{}}){
 let lease=null;
 function trusted(event){const win=getWindow();return !!win&&!win.isDestroyed()&&event?.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame?.url===uiURL;}
 function available(){const core=getCore(),win=getWindow();return !!core&&!core.locked&&!!core.settings()&&!!win&&!win.isDestroyed()&&win.isVisible();}
 function valid(wc,details){return !!lease&&available()&&wc===lease.wc&&wc.mainFrame===lease.frame&&wc.mainFrame.url===uiURL&&details?.requestingUrl===uiURL&&details?.isMainFrame===true;}
 return {
  begin(event,{purpose}={}){
   if(!trusted(event)||!available()||!getWindow().isFocused()||!['meeting','dictation','speaker-sample'].includes(purpose))throw fail('POLICY');
   getCore().assertUnlocked();
   if(lease)throw fail('BUSY');
   lease={token:randomUUID(),wc:event.sender,frame:event.senderFrame};return {token:lease.token};
  },
  end(event,{token}={}){if(!trusted(event))throw fail('POLICY');if(lease?.token===token)lease=null;return true;},
  revoke(){if(lease){lease=null;onRevoke();}},
  request(wc,permission,callback,details){callback(permission==='media'&&valid(wc,details)&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length===1&&details.mediaTypes[0]==='audio');},
  check(wc,permission,_origin,details){return permission==='media'&&valid(wc,details)&&details.mediaType==='audio';}
 };
}
module.exports={createLocalAudioPermissions};
