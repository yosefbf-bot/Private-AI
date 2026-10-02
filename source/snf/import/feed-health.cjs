"use strict";
function getFeedStatus(){
 const data=this.store.get('config',this.feedStatusKey)||{feeds:{}};
 const pcc=this.integrations.status('pcc'),monitoringEnabled=pcc.showDashboard;
 const hours=Number(this.getSettings().staleThresholdHours);
 const now=Date.now(),daily=(Number.isFinite(hours)&&hours>=1&&hours<=168?hours:18)*3600000;
 const assess=feed=>{
  const limit=feed.id==='psych_report'?7*86400000:['pharmacist_review','gdr_tracker','care_plans'].includes(feed.id)?31*86400000:daily;
  const stale=!Number.isFinite(feed.reportDate)||now-feed.reportDate>limit;
  const status=feed.status==='ok'&&stale?'stale':feed.status;
  return {...feed,status,availability:status==='ok'?'available':status==='stale'?'stale':['partial','error'].includes(status)?'incomplete':'unknown',ageHours:Number.isFinite(feed.reportDate)?Math.max(0,(now-feed.reportDate)/3600000):null};
 };
 // General imports describe their own evidence, not PCC feed completeness.
 // Disabling PCC preserves both snapshots and all historical clinical evidence.
 const feeds=Object.fromEntries(Object.entries(data.feeds||{}).map(([id,feed])=>[id,assess({...feed,id})]));
 const saved=this.store.get('config',this.pccFeedStatusKey)||{feeds:{}};
 const monitoringFeeds=Object.fromEntries(Object.entries(feeds).map(([id,feed])=>[id,assess({id,name:feed.name,critical:feed.critical,status:'missing',...saved.feeds?.[id]})]));
 const required=Object.values(monitoringFeeds).filter(f=>f.critical);
 const missingCriticalFeeds=monitoringEnabled?required.filter(f=>f.status!=='ok'):[];
 const dates=Object.values(feeds).map(f=>f.reportDate).filter(Number.isFinite);
 const dataCurrentThrough=dates.length?Math.min(...dates):null;
 const monitoringDates=Object.values(monitoringFeeds).map(f=>f.reportDate).filter(Number.isFinite);
 const monitoringCurrentThrough=monitoringDates.length?Math.min(...monitoringDates):null;
 const monitoringCurrentThroughFormatted=monitoringCurrentThrough?new Date(monitoringCurrentThrough).toISOString():'Not available';
 const isStale=monitoringEnabled&&required.some(f=>f.availability==='stale'||!Number.isFinite(f.reportDate));
 return {...data,feeds,monitoringFeeds,pcc,monitoringEnabled,monitoringCurrentThrough,monitoringCurrentThroughFormatted,expectedFeedsCount:Object.keys(monitoringFeeds).length,receivedFeedsCount:Object.values(monitoringFeeds).filter(f=>f.status==='ok').length,sourceAvailability:pcc.sourceAvailability,dataCurrentThrough,isStale,
  isSurveillanceComplete:monitoringEnabled&&required.length>0&&!missingCriticalFeeds.length&&!isStale,
  missingCriticalFeeds,staleMessage:isStale?'PCC monitoring is incomplete or stale. Review required feeds.':null,
  coverageNotice:'Findings describe supplied records only. Missing records remain unknown; they do not establish absence of a condition or medication.',
  dataCurrentThroughFormatted:dataCurrentThrough?new Date(dataCurrentThrough).toISOString():'Not available'};
}
module.exports={getFeedStatus};
