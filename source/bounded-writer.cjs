'use strict';
const {fail}=require('./security.cjs');
// Keep complete frames ordered; never replay an operation after disconnect.
function boundedWriter(stream,onFailure,{maxBytes=3600016,maxFrames=128,stallMs=30000}={}){
 let queue=[],bytes=0,blocked=false,closed=false,timer;
 const close=()=>{if(closed)return;closed=true;queue=[];bytes=0;clearTimeout(timer);stream.off('drain',drain);stream.off('close',close);stream.off('error',failed);};
 const failed=()=>{if(closed)return;close();onFailure();};
 const flush=()=>{
  try{while(!blocked&&queue.length){const frame=queue.shift();bytes-=frame.length;if(!stream.write(frame)){blocked=true;timer=setTimeout(failed,stallMs);timer.unref?.();}}}catch{failed();throw fail('NETWORK');}
 };
 const drain=()=>{if(closed)return;clearTimeout(timer);blocked=false;try{flush();}catch{}};
 stream.on('drain',drain);stream.on('close',close);stream.on('error',failed);
 return {write(frame){if(closed)throw fail('NETWORK');if(frame.length+bytes+(stream.writableLength||0)>maxBytes||queue.length>=maxFrames){failed();throw fail('LIMIT');}queue.push(frame);bytes+=frame.length;flush();},close,get pendingBytes(){return bytes+(stream.writableLength||0);}};
}
module.exports={boundedWriter};
