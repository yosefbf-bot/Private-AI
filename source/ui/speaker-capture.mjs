import {openLocalAudio} from './local-audio-capture.mjs';
// Local, bounded feature measurement. No network request or raw audio storage.
// This is an experimental voice signature, not validated biometric identification.
export function estimatePitch(wave, sampleRate) {
  const step=Math.max(1,Math.floor(sampleRate/8000)), data=[];
  for(let i=0;i<wave.length;i+=step)data.push(wave[i]);
  const rate=sampleRate/step, mean=data.reduce((a,b)=>a+b,0)/data.length;
  const values=data.map(v=>v-mean);let best=0,lagBest=0;
  for(let lag=Math.ceil(rate/450);lag<=Math.floor(rate/65);lag++) {
    let dot=0,left=0,right=0;
    for(let i=0;i<values.length-lag;i++){dot+=values[i]*values[i+lag];left+=values[i]**2;right+=values[i+lag]**2;}
    const score=dot/Math.sqrt(left*right||1);
    if(score>best){best=score;lagBest=lag;}
  }
  return best>=0.75&&lagBest?rate/lagBest:null;
}
export function measureFrame(wave, spectrum, sampleRate) {
  const rms=Math.sqrt(wave.reduce((n,x)=>n+x*x,0)/wave.length);
  const bands=Array(16).fill(0);let total=0;
  const lo=100,hi=4000;
  for(let i=1;i<spectrum.length;i++){
    const hz=i*sampleRate/(spectrum.length*2);
    if(hz<lo||hz>=hi)continue;
    const band=Math.min(15,Math.floor(Math.log(hz/lo)/Math.log(hi/lo)*16));
    const power=Number.isFinite(spectrum[i])?10**(spectrum[i]/10):0;
    bands[band]+=power;total+=power;
  }
  return {rms,clipping:wave.filter(x=>Math.abs(x)>=0.99).length/wave.length,
    pitch:rms>0.003?estimatePitch(wave,sampleRate):null,
    spectrum:bands.map(x=>Math.sqrt(total?x/total:0))};
}
export async function captureSpeakerSample({signal,onProgress=()=>{},mediaDevices=globalThis.navigator?.mediaDevices,AudioContextClass=globalThis.AudioContext}={}) {
  if(!mediaDevices?.getUserMedia||!AudioContextClass)throw Error('Local microphone measurement is unavailable on this device.');
  if(signal?.aborted)throw Error('Recording cancelled.');
  let audioLease,revoked=false,stream,context,timer,rejectPending;const frames=[],noise=[];
  const stop=()=>{audioLease?.release();clearInterval(timer);void context?.close().catch(()=>{});};
  // Register before permission resolution so a late microphone grant cannot leak a stream.
  signal?.addEventListener('abort',stop,{once:true});
  try {
    audioLease=await openLocalAudio({signal,purpose:'speaker-sample',mediaDevices,onRevoke:()=>{revoked=true;stop();rejectPending?.(Error('Recording cancelled.'));},constraints:{audio:{channelCount:1,echoCancellation:true,noiseSuppression:false,autoGainControl:false},video:false}});
    stream=audioLease.stream;
    if(revoked||signal?.aborted)throw Error('Recording cancelled.');
    context=new AudioContextClass();await context.resume();
    if(revoked||signal?.aborted)throw Error('Recording cancelled.');
    const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();
    analyser.fftSize=2048;analyser.smoothingTimeConstant=0;
    source.connect(analyser); // Never connect to speakers or transmit this stream.
    const wave=new Float32Array(analyser.fftSize),frequency=new Float32Array(analyser.frequencyBinCount);
    const started=performance.now();
    await new Promise((resolve,reject)=>{
      rejectPending=reject;
      const abort=()=>{clearInterval(timer);reject(Error('Recording cancelled.'));};
      signal?.addEventListener('abort',abort,{once:true});
      timer=setInterval(()=>{
        try{
          if(revoked||signal?.aborted){abort();return;}
          if(stream.getTracks().some(t=>t.readyState==='ended'))throw Error('Microphone disconnected.');
          const seconds=(performance.now()-started)/1000;
          if(seconds>=10){clearInterval(timer);signal?.removeEventListener('abort',abort);resolve();return;}
          analyser.getFloatTimeDomainData(wave);analyser.getFloatFrequencyData(frequency);
          const frame=measureFrame(wave,frequency,context.sampleRate);
          if(seconds<2)noise.push(frame.rms);else frames.push(frame);
          onProgress(seconds<2?'Stay quiet: measuring background sound…':`Speak alone naturally — ${Math.ceil(10-seconds)} seconds remaining`);
        }catch(e){clearInterval(timer);signal?.removeEventListener('abort',abort);reject(e);}
      },50);
    });
    if(revoked||signal?.aborted)throw Error('Recording cancelled.');
    const baseline=Math.max(0.000001,noise.reduce((n,x)=>n+x,0)/Math.max(1,noise.length));
    const voiced=frames.filter(f=>f.pitch&&f.rms>Math.max(0.003,baseline*3));
    if(noise.length<20||frames.length<100||voiced.length<40)throw Error('Not enough clear speech was captured. Record again.');
    const bands=Array(16).fill(0);
    voiced.forEach(f=>f.spectrum.forEach((x,i)=>bands[i]+=x/voiced.length));
    const norm=Math.hypot(...bands);const pitches=voiced.map(f=>f.pitch).sort((a,b)=>a-b);
    return {version:'local-spectrum-v1',captureId:crypto.randomUUID(),capturedAt:Date.now(),
      durationSeconds:8,voicedSeconds:voiced.length*0.05,
      snrDb:20*Math.log10(voiced.reduce((n,f)=>n+f.rms,0)/voiced.length/baseline),
      pitchMean:pitches[Math.floor(pitches.length/2)],spectrum:bands.map(x=>x/norm),
      clippingRatio:frames.reduce((n,f)=>n+f.clipping,0)/frames.length};
  } finally {rejectPending=null;stop();signal?.removeEventListener('abort',stop);}
}
