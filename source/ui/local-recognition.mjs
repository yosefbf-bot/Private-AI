import {recordMeeting} from './meeting-recorder.mjs';
// Small event adapter for the existing voice controller. All audio stays local.
export class LocalRecognition {
  constructor({api,allowed}){this.api=api;this.allowed=allowed;this.generation=0;this.level=0;this.running=false;this.audio=new Map();}
  async start(){
    if(this.running||this.stopping)return;this.running=true;
    const generation=++this.generation;this.controller=new AbortController();
    try{
      if(!this.allowed())throw Error('Voice capture is unavailable.');
      const status=await this.api('speechStatus');
      if(generation!==this.generation)return;
      if(!this.allowed())throw Error('Voice capture is unavailable.');
      if(!status.ready)throw Error('Set up local transcription in Meetings before using voice. No audio was recorded.');
      this.recorder=await recordMeeting({signal:this.controller.signal,speechOnly:true,onLevel:level=>this.level=level,
        onSave:chunk=>{this.audio.set(chunk.chunkId,chunk.audio);},
        onChunk:async chunk=>{
          const audio=this.audio.get(chunk.chunkId);this.audio.delete(chunk.chunkId);
          if(generation!==this.generation||!this.allowed())return;
          const requestId=crypto.randomUUID();this.inflight=requestId;
          try{
            const result=await this.api('speechDictate',{audio,requestId});
            if(generation!==this.generation||!this.allowed()||!result.text)return;
            const value=[{transcript:result.text}];value.isFinal=true;
            this.onspeechstart?.();this.onresult?.({resultIndex:0,results:[value]});
          }finally{if(this.inflight===requestId)this.inflight=null;}
        },onState:()=>{},onError:error=>{this.abort();this.onerror?.({error:'local-speech',message:error.message});}});
      if(generation!==this.generation){this.recorder.stop(false);return;}
      this.onstart?.();
    }catch(error){if(generation===this.generation){this.abort();this.onerror?.({error:'local-speech',message:error.message});}}
  }
  async stop(){
    this.running=false;
    if(!this.recorder){this.abort();return;}
    this.stopping=true;const recorder=this.recorder;
    try{await recorder.stop();}finally{if(this.recorder===recorder)this.recorder=null;this.stopping=false;this.level=0;}
  }
  abort(){
    this.running=false;this.generation++;this.controller?.abort();this.recorder?.stop(false);this.recorder=null;this.audio.clear();this.level=0;
    if(this.inflight)this.api('speechCancel',{requestId:this.inflight}).catch(()=>{});
  }
}
