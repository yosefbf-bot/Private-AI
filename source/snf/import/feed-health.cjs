'use strict';
function getFeedStatus(){
 const data=this.store.get('config',this.feedStatusKey)||{feeds:{}};
 const now=Date.now(),daily=(this.getSettings().staleThresholdHours||18)*3600000;
 const feeds=Object.fromEntries(Object.entries(data.feeds||{}).map(([id,feed])=>{
  const limit=['psych_report'].includes(id)?7*86400000:['pharmacist_review','gdr_tracker','care_plans'].includes(id)?31*86400000:daily;
  const stale=!Number.isFinite(feed.reportDate)||now-feed.reportDate>limit;
  return [id,{...feed,status:feed.status==='ok'&&stale?'stale':feed.status,ageHours:Number.isFinite(feed.reportDate)?Math.max(0,(now-feed.reportDate)/3600000):null}];
 }));
 const required=Object.values(feeds).filter(f=>f.critical),missingCriticalFeeds=required.filter(f=>f.status!=='ok');
 const dates=required.map(f=>f.reportDate).filter(Number.isFinite);
 const dataCurrentThrough=dates.length?Math.min(...dates):null;
 const isStale=required.some(f=>!f.reportDate||now-f.reportDate>daily);
 return {...data,feeds,dataCurrentThrough,isStale,isSurveillanceComplete:required.length>0&&!missingCriticalFeeds.length&&!isStale,missingCriticalFeeds,staleMessage:isStale?'PCC monitoring is incomplete or stale. Review required feeds.':null,dataCurrentThroughFormatted:dataCurrentThrough?new Date(dataCurrentThrough).toISOString():'Not available'};
}
module.exports={getFeedStatus};
