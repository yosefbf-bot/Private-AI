'use strict';
const {operational}=require('../alerts/lifecycle.cjs');
function today(snf){
 const alerts=snf.getActiveAlerts().map(a=>operational(a));const since=Date.now()-86400000;
 const recent=kind=>snf.store.list(kind).filter(r=>(r.importTimestamp||0)>=since);
 return {demo:snf.demoMode,critical:alerts.filter(a=>a.severity==='critical'),psychWatch:alerts.filter(a=>/^(AP-|PRN-|GDR-|PSYCH-|PHARM-)/.test(a.code)),medications:snf.getMedicationChangesList(),movement:[...recent('snf_admission'),...recent('snf_transfer')],clinicalChanges:recent('snf_clinical24'),dataHealth:snf.getFeedStatus(),followUp:alerts.filter(a=>a.owner||a.assignedTo||a.overdue),morningBrief:snf.generateMorningBrief()};
}
module.exports={today};
