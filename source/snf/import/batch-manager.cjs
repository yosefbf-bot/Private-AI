'use strict';
const {uuid}=require('../../security.cjs');
const {canonical,hash,validate}=require('./validation.cjs');
const PARSERS={census:'_processCensus',adt:'_processCensus',admissions:'_processAdmissions',transfers:'_processTransfers',clinical24:'_processClinical24',orders:'_processOrderChanges',med_changes:'_processOrderChanges',med_profile:'_processMedProfile',emar_exceptions:'_processEmarExceptions',diagnoses:'_processDiagnoses',behaviors:'_processBehaviors',falls:'_processFalls',infections:'_processInfections',wounds:'_processWounds',labs:'_processLabs',progress_notes:'_processProgressNotes',gdr_tracker:'_processGDR',psych_report:'_processSupplemental',pharmacist_review:'_processSupplemental',weights:'_processSupplemental',care_plans:'_processSupplemental'};
async function ingestReports(reports,user='Operator'){
 if(!Array.isArray(reports)||reports.length>100)return {success:false,totalRecords:0,results:[],validationErrors:['Expected an array of at most 100 mapped reports.']};
 if(this.demoMode&&!this._seedingDemo)throw Error('Live imports are disabled in Demo Mode.');
 const batch={id:uuid(),importTime:Date.now(),operator:String(user).slice(0,120),demo:!!this.demoMode,reports:[],validationWarnings:[],acceptedRows:0,rejectedRows:0};
 const status=this.store.get('config',this.feedStatusKey)||{feeds:{}};
 // Census matching must complete before dependent reports in this batch.
 const ordered=[...reports].sort((a,b)=>Number(this._mapReportNameToFeedType(b?.type||b?.reportType||b?.name)==='census')-Number(this._mapReportNameToFeedType(a?.type||a?.reportType||a?.name)==='census'));
 this._tx(()=>{
 for(const report of ordered){
  if(!report||typeof report!=='object'){batch.validationWarnings.push('Invalid report object');continue;}
  let type=this._mapReportNameToFeedType(report.type||report.reportType||report.feedType||report.name||report.filename);if(type==='adt')type='census';
  const checked=validate(report,type,this.store),filename=String(report.filename||'unnamed mapped report').slice(0,250);
  const content=typeof report.rawText==='string'&&report.rawText?report.rawText:canonical(report.rows||[]);
  const fileHash=hash(content),reportHash=hash(canonical({type,date:checked.reportDate,rows:Array.isArray(report.rows)?report.rows.map(canonical).sort():[]}));
  const item={id:uuid(),batchId:batch.id,filename,type,reportDate:checked.reportDate,reportRange:report.range||null,fileHash,hashScope:report.rawText?'source-text-bytes':'mapped-data',reportHash,rowCount:Array.isArray(report.rows)?report.rows.length:0,acceptedRows:0,rejectedRows:checked.rejected.length,rejections:checked.rejected,mappingErrors:checked.mappingErrors,unmatchedResidents:checked.unmatched,importTime:batch.importTime,operator:batch.operator};
  if(!PARSERS[type])item.mappingErrors.push('Unsupported report type; mapping required.');
  const duplicate=this.store.list('snf_import_report').find(r=>r.status!=='error'&&(r.fileHash===fileHash&&r.type===type&&r.rowCount>0||r.reportHash===reportHash));
  if(duplicate){item.status='duplicate';item.duplicateOf=duplicate.id;item.duplicateFileHash=duplicate.fileHash===fileHash;batch.reports.push(item);continue;}
  if(!item.mappingErrors.length){
   this._batchContext={batchId:batch.id,reportId:item.id,fileHash,filename,type,reportDate:checked.reportDate,rows:checked.accepted};
   this.store.db.exec('SAVEPOINT snf_report');
   try{
    for(const row of checked.accepted)this.store.put('snf_import_row',item.id+':'+row.index,{id:item.id+':'+row.index,batchId:batch.id,reportId:item.id,sourceFile:filename,reportDate:checked.reportDate,residentId:row.residentId,sourceRow:row.index,importTimestamp:batch.importTime,originalData:row.row,demo:!!this.demoMode});
    item.acceptedRows=this[PARSERS[type]](checked.accepted.map(r=>({...r.row,residentId:r.residentId})),filename,checked.reportDate,batch.importTime);
    item.status=item.rejectedRows?'partial':'success';
    this.store.db.exec('RELEASE snf_report');
   }catch(e){this.store.db.exec('ROLLBACK TO snf_report');this.store.db.exec('RELEASE snf_report');item.status='error';item.acceptedRows=0;item.mappingErrors.push('Parser failed; this report was rolled back.');}
   finally{this._batchContext=null;}
  }else item.status='error';
  if(item.status==='error')item.rejectedRows=item.rowCount;
  if(!status.feeds[type]||!status.feeds[type].reportDate||checked.reportDate>=status.feeds[type].reportDate||item.status==='error'){
   status.feeds[type]={...(status.feeds[type]||{}),id:type,name:status.feeds[type]?.name||type,critical:!!status.feeds[type]?.critical,lastReceived:batch.importTime,reportDate:checked.reportDate,lastRecordCount:item.acceptedRows,filename,batchId:batch.id,reportId:item.id,status:item.status==='success'?'ok':item.status,error:item.status==='success'?null:'Import incomplete; review batch validation.'};
  }else item.mappingErrors.push('Older report retained as evidence; latest feed date unchanged.');
  if(type==='census'&&item.status==='success'&&item.acceptedRows<this.store.count('snf_resident')*.5){status.feeds[type].status='partial';item.mappingErrors.push('Census count dropped by over half; review omissions.');}
  batch.acceptedRows+=item.acceptedRows;batch.rejectedRows+=item.rejectedRows;
  this.store.put('snf_import_report',item.id,item);batch.reports.push(item);
 }
 status.lastSuccessfulCycle=batch.reports.some(r=>r.status==='success')?batch.importTime:status.lastSuccessfulCycle;
 status.validationErrors=batch.reports.flatMap(r=>r.mappingErrors||[]);this.store.put('config',this.feedStatusKey,status);
 this._invalidateCache();const health=this.getFeedStatus();batch.missingExpectedFeeds=health.missingCriticalFeeds.map(f=>f.id);batch.staleFeeds=Object.values(health.feeds).filter(f=>f.status==='stale').map(f=>f.id);
 batch.validationWarnings.push(...status.validationErrors);this.store.put('snf_import_batch',batch.id,batch);
 });
 this._invalidateCache();await this.runRulesEngine(user);
 return {success:batch.reports.length>0&&batch.reports.every(r=>['success','duplicate'].includes(r.status)),batchId:batch.id,totalRecords:batch.acceptedRows,importTime:batch.importTime,results:batch.reports.map(r=>({...r,count:r.acceptedRows})),validationErrors:batch.validationWarnings};
}
module.exports={ingestReports,PARSERS};
