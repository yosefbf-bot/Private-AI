'use strict';
// Genuine Electron permission/capture acceptance with a synthetic audio device.
// No owner profile, physical microphone, database or external service is opened.
const {app,BrowserWindow,session,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=process.argv[2];if(!path.isAbsolute(root)||!path.basename(root).startsWith('privateai-audio-native-'))throw Error('Isolated root required');
app.setPath('userData',path.join(root,'profile'));app.setPath('sessionData',path.join(root,'session'));
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
let win,controller;const timer=setTimeout(()=>{console.log('LOCAL_AUDIO_RESULT='+JSON.stringify({passed:false,reason:'timeout'}));app.exit(1);},25000);
app.whenReady().then(async()=>{
 const html=path.join(root,'synthetic.html');fs.writeFileSync(html,'<!doctype html><title>Synthetic local microphone acceptance</title><p>Synthetic device only</p>');
 const uiURL=pathToFileURL(html).href;
 win=new BrowserWindow({width:480,height:240,webPreferences:{preload:path.resolve(__dirname,'../source/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'audio-acceptance'}});
 const core={locked:false,settings:()=>({hipaa:true,processingMode:'local-only'}),assertUnlocked(){assert.equal(this.locked,false);}};
 controller=require('../source/local-audio-permissions.cjs').createLocalAudioPermissions({getCore:()=>core,getWindow:()=>win,uiURL,onRevoke:()=>win.webContents.send('privateai:event',{type:'local_audio_revoked'})});
 const ses=session.fromPartition('audio-acceptance');let requests=0,checks=0;
 ses.setPermissionRequestHandler((...args)=>{requests++;controller.request(...args);});ses.setPermissionCheckHandler((...args)=>{checks++;return controller.check(...args);});
 ses.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
 ipcMain.handle('privateai:microphone',(event,request)=>request.action==='begin'?controller.begin(event,request):controller.end(event,request));
 win.on('hide',()=>controller.revoke());await win.loadURL(uiURL);win.show();win.focus();
 const moduleURL=pathToFileURL(path.resolve(__dirname,'../source/ui/local-audio-capture.mjs')).href;
 const initial=await win.webContents.executeJavaScript(`(async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true});return false;}catch{return true;}})()`,true);assert.equal(initial,true);
 const live=await win.webContents.executeJavaScript(`(async()=>{const {openLocalAudio}=await import(${JSON.stringify(moduleURL)});window.capture=await openLocalAudio({purpose:'meeting',mediaDevices:navigator.mediaDevices,constraints:{audio:true,video:false}});return capture.stream.getAudioTracks()[0].readyState;})()`,true);assert.equal(live,'live');
 const cameraDenied=await win.webContents.executeJavaScript(`(async()=>{try{const s=await navigator.mediaDevices.getUserMedia({video:true});s.getTracks().forEach(t=>t.stop());return false;}catch{return true;}})()`,true);assert.equal(cameraDenied,true);
 win.hide();
 const stopped=await win.webContents.executeJavaScript(`new Promise(resolve=>{const check=()=>{if(capture.stream.getAudioTracks()[0].readyState==='ended')resolve(true);else setTimeout(check,20);};check();})`);assert.equal(stopped,true);
 win.show();win.focus();
 const recorderURL=pathToFileURL(path.resolve(__dirname,'../source/ui/meeting-recorder.mjs')).href;
 const pcm=await win.webContents.executeJavaScript(`(async()=>{const {recordMeeting}=await import(${JSON.stringify(recorderURL)});let bytes=0,levels=0,ready;const measured=new Promise(r=>ready=r);const states=[];const recorder=await recordMeeting({onSave:async chunk=>{bytes+=chunk.audio.length;},onChunk:async()=>{},onError:e=>{throw e;},onState:s=>states.push(s),onLevel:()=>{if(++levels>=3)ready();}});await measured;await recorder.stop();return {bytes,levels,states};})()`,true);
 assert.ok(pcm.bytes>44);assert.ok(pcm.states.includes('Recording locally'));assert.equal(pcm.states.at(-1),'Stopped');
 assert.ok(requests>0&&checks>0);clearTimeout(timer);console.log('LOCAL_AUDIO_RESULT='+JSON.stringify({passed:true,actualElectron:true,syntheticDevice:true,physicalMicrophone:false,requests,checks,unarmedDenied:initial,cameraDenied,stoppedOnHide:stopped,pcmFrames:pcm.levels,pcmSaved:true}));win.destroy();app.quit();
}).catch(error=>{clearTimeout(timer);console.log('LOCAL_AUDIO_RESULT='+JSON.stringify({passed:false,reason:error.message}));win?.destroy();app.exit(1);});
