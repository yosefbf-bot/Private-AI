'use strict';
const {canonical,hash}=require('./validation.cjs');
const EVENTS=new Set(['snf_admission','snf_transfer','snf_clinical24','snf_med_change','snf_emar_exception','snf_behavior','snf_fall','snf_infection','snf_wound','snf_lab','snf_progress_note','snf_gdr','snf_psych_review','snf_pharmacist_review','snf_weight','snf_care_plan']);
function writeRecord(kind,id,value){
 const context=this._batchContext;
 if(!context)throw Error('Clinical records require an import batch');
 const row=context.rows[value.originalRow-1];
 if(!row)throw Error('Source row unavailable');
 const originalData=row.row;
 if(EVENTS.has(kind))id='event-'+hash(canonical({kind,resident:row.residentId,identity:originalData.eventId||originalData.id||originalData,eventDate:originalData.eventDate||originalData.orderDate||originalData.noteDate||context.reportDate}));
 const provenance={batchId:context.batchId,reportId:context.reportId,fileHash:context.fileHash,sourceFile:context.filename,reportType:context.type,reportDate:context.reportDate,sourceRow:row.index,rowId:context.reportId+':'+row.index};
 const old=this.store.get(kind,id);
 if(old?.reportDate>context.reportDate)return old;
 const record={...value,id,originalRow:row.index,originalData,provenance,batchId:context.batchId,demo:this.demoMode===true};
 this.store.put(kind,id,record);return record;
}
module.exports={writeRecord};
