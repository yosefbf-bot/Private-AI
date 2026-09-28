'use strict';
const {fail}=require('../security.cjs');
const {forCore}=require('./demo.cjs');
const {operational}=require('./alerts/lifecycle.cjs');
async function dispatch(core,op,data={}){
 core.assertUnlocked();const workspace=forCore(core),snf=workspace.current();
 switch(op){
 case 'snfDemo':return workspace.set(data);
 case 'snfToday':return require('./reports/today.cjs').today(snf);
 case 'snfImportSchema':return Object.keys(require('./import/batch-manager.cjs').PARSERS).filter(t=>t!=='adt');
 case 'snfImports':return snf.store.list('snf_import_batch');
 case 'snfAlertEvidence':{const alert=snf.store.get('snf_alert',data.alertId);if(!alert)throw fail('INVALID');return (alert.evaluationHistory||[]).map(id=>snf.store.get('snf_rule_evaluation',id)).filter(Boolean);}
 case 'snfDashboard':return {...snf.getDashboardMetrics(),alerts:snf.getAlertSummary(),demo:snf.demoMode,developmentMode:!!core.developmentMode,productionAlerts:core.snf.getAlertSummary()};
 case 'snfAlerts':return snf.store.list('snf_alert').filter(a=>(!data.unresolvedOnly||a.status!=='resolved')&&(!data.severity||a.severity===data.severity)).map(a=>operational(a));
 case 'snfUpdateAlert':return snf.updateAlert(data.alertId,data.patch,data.user);
 case 'snfAcknowledgeAlert':return snf.acknowledgeAlert(data.alertId,data.user);
 case 'snfAssignAlert':return snf.assignAlert(data.alertId,data.assignedTo,data.user,data.note);
 case 'snfResolveAlert':return snf.resolveAlert(data.alertId,data.resolutionStatus,data.note,data.user);
 case 'snfOpenIssues':return snf.store.list('snf_open_issue');
 case 'snfMorningBrief':return {text:snf.generateMorningBrief()};
 case 'snfResidentTimeline':return {text:snf.getResidentTimelineReport(data.query)};
 case 'snfFeedStatus':return snf.getFeedStatus();
 case 'snfMedChanges':return snf.getMedicationChangesList();
 case 'snfPsychWatch':return snf.getPsychWatchData();
 case 'snfPCCReports':return snf.getPCCReportCatalog();
 case 'snfRunRules':return snf.runRulesEngine(data.user);
 case 'snfIngest':if(core.developmentMode)throw fail('POLICY');return snf.ingestReports(data.reports,data.user);
 case 'snfSeedData':throw fail('POLICY');
 case 'snfRetentionCleanup':return snf.cleanup(snf.getSettings().retentionDays||100);
 case 'snfRetentionStatus':return snf.getRetentionStatus();
 case 'snfExportPDF':if(core.developmentMode)throw fail('POLICY');return snf.exportReportPDF(data.type,data.query,core.settings().workspace);
 case 'snfSaveSettings':return snf.saveSettings(data.settings||{});
 default:throw fail('INVALID');
 }
}
module.exports={dispatch};
