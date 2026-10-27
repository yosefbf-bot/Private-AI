// Local audio only; opaque desktop intent tokens never leave the native IPC channel.
export async function openLocalAudio({signal,purpose,mediaDevices,constraints,onRevoke=()=>{}}){
  const bridge=globalThis.window?.privateAI;
  let token,stream,closed=false,unsubscribe;
  const endToken=()=>{if(token){const old=token;token=null;void bridge.endLocalAudio({token:old}).catch(()=>{});}};
  const release=()=>{closed=true;const captured=stream;stream=null;captured?.getTracks().forEach(track=>track.stop());endToken();unsubscribe?.();signal?.removeEventListener('abort',cancel);globalThis.document?.removeEventListener('visibilitychange',hidden);globalThis.window?.removeEventListener('pagehide',cancel);};
  const cancel=()=>{release();onRevoke();};
  const hidden=()=>{if(globalThis.document?.hidden)cancel();};
  signal?.addEventListener('abort',cancel,{once:true});
  globalThis.document?.addEventListener('visibilitychange',hidden);
  globalThis.window?.addEventListener('pagehide',cancel);
  const check=()=>{if(closed||signal?.aborted||globalThis.document?.hidden)throw Error('Recording cancelled.');};
  try{
    check();
    if(bridge?.beginLocalAudio){
      unsubscribe=bridge.onEvent(event=>{if(event.type==='local_audio_revoked'||event.type==='locked')cancel();});
      token=(await bridge.beginLocalAudio({purpose})).token;
      if(closed){endToken();throw Error('Recording cancelled.');}
    }
    check();stream=await mediaDevices.getUserMedia(constraints);check();
    return {stream,release};
  }catch(error){release();throw error;}
}
