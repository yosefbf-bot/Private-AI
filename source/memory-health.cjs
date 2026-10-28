'use strict';
const GIB=1024**3;
function assessMemory(raw){
 const unknown={status:'unknown',message:'Windows memory health could not be checked. No system settings were changed.'};
 const number=v=>Number.isSafeInteger(v)&&v>=0;
 if(!raw||!['totalBytes','availableBytes','commitLimitBytes','commitAvailableBytes'].every(k=>number(raw[k]))||!raw.totalBytes||!raw.commitLimitBytes||raw.availableBytes>raw.totalBytes||raw.commitAvailableBytes>raw.commitLimitBytes)return unknown;
 const known=raw.pageFileKnown===true&&number(raw.pageFileBytes),gb=v=>Math.round(v/GIB*10)/10;
 const result={status:known?'ok':'unknown',message:known?'Windows has a usable page file and memory-limit headroom.':'Windows memory-limit counters are available; page-file size could not be checked.',availableGB:gb(raw.availableBytes),commitHeadroomGB:gb(raw.commitAvailableBytes),pageFileGB:known?gb(raw.pageFileBytes):null};
 if(raw.commitAvailableBytes<Math.max(GIB,raw.commitLimitBytes*.1)){result.status='attention';result.message='Windows is close to its memory limit. Close unused apps and let Windows manage the page file size.';}
 else if(known&&raw.pageFileBytes<GIB){result.status='attention';result.message='Let Windows manage the page file size. It gives apps a safety net when RAM fills up.';}
 return result;
}
module.exports={assessMemory};
