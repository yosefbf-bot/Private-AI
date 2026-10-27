import {openLocalAudio} from './local-audio-capture.mjs';
// Local PCM recording only. No SpeechRecognition or network speech service.
export function encodeWav(samples) {
  const bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);
  const put=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
  put(0,'RIFF');v.setUint32(4,bytes.length-8,true);put(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);
  let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);
}
export async function recordMeeting({signal,onChunk,onSave=async()=>{},onState,onError,speechOnly=false,onLevel=()=>{},mediaDevices=navigator.mediaDevices,AudioContextClass=window.AudioContext}) {
  let audioLease,stream,context,source,processor,stopped=false,buffer=new Float32Array(320000),length=0,queue=[],processing=false,finish;
  let voiced=0,quiet=0;
  const drained=new Promise(resolve=>finish=resolve);
  const release=()=>{audioLease?.release();processor?.disconnect();source?.disconnect();context?.close().catch(()=>{});};
  const pump=async()=>{
    if(processing)return;processing=true;
    try{while(queue.length){const chunk=queue[0];const saved=await chunk.saved;if(saved.error)throw saved.error;await onChunk({chunkId:chunk.chunkId});queue.shift();}}
    catch(e){onError(e);stop();await Promise.all(queue.map(chunk=>chunk.saved));queue=[];}
    finally{processing=false;if(stopped&&!queue.length)finish();}
  };
  const flush=()=>{if(length<160)return;if(speechOnly&&voiced<4000){length=0;voiced=quiet=0;return;}voiced=quiet=0;const chunk={chunkId:crypto.randomUUID(),audio:encodeWav(buffer.subarray(0,length))};chunk.saved=Promise.resolve(onSave(chunk)).then(()=>({}),error=>({error}));queue.push(chunk);length=0;pump();};
  const stop=(save=true)=>{if(stopped)return drained;stopped=true;release();signal?.removeEventListener('abort',abort);if(save)flush();else {length=0;queue=[];}onState('Stopped');if(!processing&&!queue.length)finish();return drained;};
  const abort=()=>stop(false);
  signal?.addEventListener('abort',abort,{once:true});
  try{
    if(signal?.aborted)throw Error('Recording cancelled.');
    audioLease=await openLocalAudio({signal,purpose:speechOnly?'dictation':'meeting',mediaDevices,onRevoke:()=>stop(false),constraints:{audio:{channelCount:1,echoCancellation:true,noiseSuppression:false,autoGainControl:false},video:false}});
    stream=audioLease.stream;
    if(stopped||signal?.aborted){release();throw Error('Recording cancelled.');}
    context=new AudioContextClass({sampleRate:16000});
    if(context.sampleRate!==16000)throw Error('This microphone cannot provide 16 kHz audio. Use another input device.');
    source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);
    processor.onaudioprocess=event=>{
      if(stopped)return;
      const input=event.inputBuffer.getChannelData(0);
      const rms=Math.sqrt(input.reduce((n,v)=>n+v*v,0)/input.length);onLevel(Math.min(1,rms*10));
      if(rms>0.012){voiced+=input.length;quiet=0;}else quiet+=input.length;
      // Silent output keeps the capture callback active without microphone echo.
      for(let i=0;i<input.length;i++) {buffer[length++]=input[i];if(length===buffer.length){flush();if(queue.length>=3){onError(Error('Recording paused: transcription cannot keep up. Saved chunks will finish processing.'));stop();break;}}}
      if(speechOnly&&voiced>=4000&&quiet>=16000)flush();
    };
    source.connect(processor);processor.connect(context.destination);await context.resume();if(stopped||signal?.aborted){release();throw Error('Recording cancelled.');}onState('Recording locally');
    return {stop,drained};
  }catch(e){stop(false);throw e;}
}
