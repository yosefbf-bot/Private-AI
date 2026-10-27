'use strict';
const {fail}=require('../../security.cjs');
const STATES=['new','acknowledged','assigned','in_review','waiting','resolved','snoozed'];
function updateAlert(id,patch,user){
 const actorAttribution=typeof user==='string'&&user.trim()?'operator_entered':'unknown';
 user=actorAttribution==='unknown'?'Unknown':user.trim().slice(0,100);
 const alert=this.store.get('snf_alert',id);if(!alert||!patch||typeof patch!=='object')throw fail('INVALID');
 const now=Date.now(),next=patch.status||alert.status;
 if(!STATES.includes(next))throw fail('INVALID');
 if(alert.status==='resolved'&&next!=='resolved'&&!patch.note?.trim())throw fail('INVALID');
 if(next==='resolved'&&(!patch.resolutionReason?.trim()||!patch.note?.trim()))throw fail('INVALID');
 if(next==='assigned'&&!String(patch.owner||alert.owner||alert.assignedTo||'').trim())throw fail('INVALID');
 if(next==='snoozed'&&(!Number.isFinite(patch.snoozedUntil)||patch.snoozedUntil<=now))throw fail('INVALID');
 const before={status:alert.status,owner:alert.owner||alert.assignedTo,dueDate:alert.dueDate};
 if(patch.owner!==undefined)alert.owner=alert.assignedTo=String(patch.owner).slice(0,200);
 if(patch.dueDate!==undefined){if(patch.dueDate!==null&&!Number.isFinite(patch.dueDate))throw fail('INVALID');alert.dueDate=patch.dueDate;}
 alert.status=next;alert.createdDate=alert.createdDate||alert.firstDetected;
 if(next==='acknowledged'){alert.acknowledgedAt=alert.acknowledgedAt||now;alert.acknowledgedBy=user;}
 if(next==='snoozed')alert.snoozedUntil=patch.snoozedUntil;
 if(patch.evidenceReviewed!==undefined){if(!Array.isArray(patch.evidenceReviewed))throw fail('INVALID');alert.evidenceReviewed=patch.evidenceReviewed.map(String).slice(0,100);}
 if(patch.note){alert.notes=[...(alert.notes||[]),{text:String(patch.note).slice(0,4000),user,time:now}];alert.actionNote=String(patch.note).slice(0,4000);}
 if(next==='resolved'){alert.resolutionReason=alert.resolutionStatus=String(patch.resolutionReason).slice(0,1000);alert.resolvedBy=user;alert.resolvedAt=now;}
 else if(before.status==='resolved'){alert.resolvedAt=null;alert.resolvedBy=null;}
 alert.auditTrail=[...(alert.auditTrail||[]),{action:next==='resolved'?'resolved':next==='acknowledged'?'acknowledged':patch.owner?'assigned':'updated',user,actorAttribution,timestamp:now,note:patch.note||'',before,after:{status:next,owner:alert.owner,dueDate:alert.dueDate},resolutionReason:patch.resolutionReason||null,evidenceReviewed:patch.evidenceReviewed||[]}];
 this.store.put('snf_alert',id,alert);this._syncOpenIssues();this._invalidateCache();return alert;
}
function operational(alert,now=Date.now()){
 const open=alert.status!=='resolved';
 return {...alert,ageHours:Math.floor((now-(alert.firstDetected||now))/3600000),overdue:open&&Number.isFinite(alert.dueDate)&&alert.dueDate<now,escalation:open&&(alert.severity==='critical'||Number.isFinite(alert.dueDate)&&alert.dueDate<now),snoozeExpired:alert.status==='snoozed'&&alert.snoozedUntil<=now};
}
module.exports={STATES,updateAlert,operational};
