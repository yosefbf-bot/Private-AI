'use strict';
const fs=require('node:fs');
const {fail,safePath}=require('./security.cjs');
const frequencies=['once','daily','weekdays','weekly','monthly','interval','watch'];
function normalize(s){
 const out={frequency:s.frequency||'daily',time:s.time||'08:00'};
 if(!frequencies.includes(out.frequency)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.time))throw fail('INVALID');
 if(out.frequency==='once'){out.at=s.at;if(typeof out.at!=='string'||!Number.isFinite(Date.parse(out.at)))throw fail('INVALID');}
 if(out.frequency==='weekly'){out.weekdays=Array.isArray(s.weekdays)?s.weekdays:String(s.weekdays??'1').split(',').map(Number);if(!out.weekdays.length||out.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw fail('INVALID');out.weekdays=[...new Set(out.weekdays)];}
 if(out.frequency==='monthly'){out.monthDay=Number(s.monthDay??1);if(!Number.isInteger(out.monthDay)||out.monthDay<1||out.monthDay>31)throw fail('INVALID');}
 if(['interval','watch'].includes(out.frequency)){out.intervalMinutes=Number(s.intervalMinutes??60);if(!Number.isInteger(out.intervalMinutes)||out.intervalMinutes<1||out.intervalMinutes>525600)throw fail('INVALID');}
 if(out.frequency==='watch'){out.watchPath=s.watchPath;if(typeof out.watchPath!=='string'||!out.watchPath.trim()||out.watchPath.length>1000)throw fail('INVALID');}
 return out;
}
function nextRun(input,now=Date.now()){
 const s=normalize(input);if(s.frequency==='once'){const at=Date.parse(s.at);return at>now?at:null;}
 if(['interval','watch'].includes(s.frequency))return now+s.intervalMinutes*60000;
 const [h,m]=s.time.split(':').map(Number);let d=new Date(now);d.setHours(h,m,0,0);
 if(s.frequency==='monthly'){
  const date=(y,month)=>new Date(y,month,Math.min(s.monthDay,new Date(y,month+1,0).getDate()),h,m,0,0);
  d=date(d.getFullYear(),d.getMonth());if(+d<=now)d=date(d.getFullYear(),d.getMonth()+1);return +d;
 }
 if(+d<=now)d.setDate(d.getDate()+1);
 while((s.frequency==='weekdays'&&[0,6].includes(d.getDay()))||(s.frequency==='weekly'&&!s.weekdays.includes(d.getDay())))d.setDate(d.getDate()+1);
 return +d;
}
function watchFingerprint(schedule,workspace){const file=safePath(workspace,schedule.watchPath);try{const s=fs.statSync(file);if(!s.isFile())throw fail('INVALID');return `${s.size}:${s.mtimeMs}:${s.ctimeMs}`;}catch(e){if(e.code==='ENOENT')return 'missing';throw e;}}
module.exports={normalize,nextRun,watchFingerprint};
