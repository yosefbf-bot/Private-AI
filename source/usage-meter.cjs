'use strict';
const {uuid}=require('./security.cjs');
class UsageMeter {
 constructor(core){this.core=core;}
 record(result,settings){
  const input=Number.isSafeInteger(result.usage?.inputTokens)&&result.usage.inputTokens>=0?result.usage.inputTokens:0,output=Number.isSafeInteger(result.usage?.outputTokens)&&result.usage.outputTokens>=0?result.usage.outputTokens:0,cached=Math.min(input,Number.isSafeInteger(result.usage?.cachedInputTokens)&&result.usage.cachedInputTokens>=0?result.usage.cachedInputTokens:0);
  const cloud=result.provider==='openai',priced=cloud&&settings.priceModel===settings.model&&[settings.priceInput,settings.priceOutput].every(Number.isFinite)&&(!cached||Number.isFinite(settings.priceCachedInput));
  const estimatedCost=cloud?(priced?((input-cached)*settings.priceInput+cached*(settings.priceCachedInput||0)+output*settings.priceOutput)/1e6:null):0;
  const row={id:uuid(),time:Date.now(),provider:result.provider,model:result.model||'',inputTokens:cloud?input:0,outputTokens:cloud?output:0,cachedInputTokens:cloud?cached:0,localTokens:cloud?0:(result.localTokens||0),estimatedCost:result.failed?null:estimatedCost,reason:result.reason||'user_request',reliability:result.reliability?.score??null,failed:!!result.failed,usageUnknown:!!result.usageUnknown};
  this.core.store.put('usage',row.id,row,{expires:settings.retentionDays?row.time+settings.retentionDays*86400000:null});return row;
 }
 summary(now=Date.now()){
  const all=this.core.store.list('usage'),today=new Date(now);today.setHours(0,0,0,0);const week=new Date(today);week.setDate(week.getDate()-((week.getDay()+6)%7));const month=new Date(today.getFullYear(),today.getMonth(),1);
  const aggregate=cutoff=>{const rows=all.filter(r=>r.time>=cutoff);return {tasks:rows.length,local:rows.filter(r=>r.provider!=='openai'&&!r.failed).length,cloud:rows.filter(r=>r.provider==='openai').length,inputTokens:rows.reduce((a,r)=>a+r.inputTokens,0),outputTokens:rows.reduce((a,r)=>a+r.outputTokens,0),estimatedCost:rows.reduce((a,r)=>a+(r.estimatedCost||0),0),unpriced:rows.filter(r=>r.provider==='openai'&&r.estimatedCost===null).length,usageUnknown:rows.filter(r=>r.usageUnknown).length};};
  return {today:aggregate(+today),week:aggregate(+week),month:aggregate(+month),recent:all.slice(0,30),savingsNote:'Local task count is measured. Avoided API calls and dollar savings are not measured; a cloud-only baseline would be required.'};
 }
}
module.exports={UsageMeter};
