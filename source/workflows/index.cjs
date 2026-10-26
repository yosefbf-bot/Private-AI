"use strict";
const { fail } = require("../security.cjs");
const actions = require("./actions.cjs"),
  imports = require("./imports.cjs"),
  docs = require("./documents.cjs"),
  playbooks = require("./playbooks.cjs"),
  budget = require("./budget.cjs");
const READ_DEMO = [
  "workflowSummary",
  "workflowActionSave",
  "workflowReview",
  "workflowDecisionSave",
  "workflowPacket",
  "workflowNoticeUpdate",
];
async function dispatch(core, op, data = {}) {
  core.assertUnlocked();
  const snf = require("../snf/demo.cjs").forCore(core).current();
  if (core.developmentMode && !READ_DEMO.includes(op)) throw fail("POLICY");
  if (snf.demoMode && !READ_DEMO.includes(op)) throw fail("POLICY");
  switch (op) {
    case "workflowSummary":
      return {
        demo: !!snf.demoMode,
        developmentMode: !!core.developmentMode,
        changes: actions.changes(core, snf),
        notices: require('./notices.cjs').list(core,snf),
        decisions: snf.store.list("wf_decision"),
        metrics: imports.metrics(snf),
        mappings: snf.store.list("wf_mapping"),
        playbooks: snf.demoMode ? [] : core.store.list("wf_playbook"),
        budget: snf.demoMode ? null : budget.status(core),
        files: snf.demoMode
          ? []
          : core.store.summaries("file").map((f) => ({ id: f.id, name: f.name })),
        projects: snf.demoMode ? [] : core.store.list("project"),
        runs: snf.demoMode
          ? []
          : core.store.summaries('job').filter(j=>j.playbook).map(j=>({
              id:j.id,title:j.title,status:j.status,reason:j.reason,playbook:j.playbook,
              outputCheck:j.outputCheck,hasDraftText:j.hasDraftText,output:j.output
            })),
      };
    case "workflowJobDraft": {
      if(typeof data.id!=='string'||data.id.length>200||Object.keys(data).some(k=>k!=='id'))throw fail('INVALID');
      const job=core.store.get('job',data.id);
      if(!job||job.status!=='failed'||!(job.playbook||job.recoveryInput?.playbook)||!job.savedAnswer?.text)throw fail('NOT_FOUND');
      return {id:data.id,draftText:job.savedAnswer.text};
    }
    case "workflowNoticeUpdate":
      return require('./notices.cjs').update(core,snf,data);
    case "workflowActionSave":
      return actions.update(core, snf, data);
    case "workflowReview":
      return actions.markReviewed(core, snf, data);
    case "workflowDecisionSave":
      return actions.decision(snf, data);
    case "workflowPacket":
      return actions.packet(core, snf, data);
    case "workflowMappedPreview":
      return imports.mappedPreview(snf, data);
    case "workflowPacketExport": {
      const packet = actions.packet(core, snf, data);
      if (packet.token !== data.token) throw fail("REVIEW_CHANGED");
      const files = require("../files.cjs"),
        root = core.settings().workspace;
      if (!root) throw fail("WORKSPACE");
      files.workspace(root, core.root);
      const out = await files.exportFile(root, {
        content: packet.text,
        format: "md",
        title: "Evidence review packet",
        subfolder: "Exports",
      });
      core.store.put("output", require("../security.cjs").uuid(), out);
      return out;
    }
    case "workflowMappingSave":
      return imports.saveMapping(snf, data);
    case "workflowMappedImport":
      return imports.mappedImport(snf, data);
    case "workflowMetricPreview":
      return imports.metricPreview(snf, data);
    case "workflowMetricImport":
      return imports.metricImport(snf, data);
    case "workflowSearch":
      return require('./universal-search.cjs').search(core,data);
    case "workflowDocumentReview":
      return docs.review(core,data);
    case "workflowDocumentReviewSave":
      return docs.saveReview(core,data);
    case "workflowDisclosureReview":
      return require('./disclosure-review.cjs').review(core,data);
    case "workflowDisclosureRedact":
      return require('./disclosure-review.cjs').redactCopy(core,data);
    case "workflowCommunicationSettings":
      return require('./correspondence.cjs').settings(core);
    case "workflowCommunicationSave":
      return require('./correspondence.cjs').save(core,data);
    case "workflowCommunicationCheck":
      return require('./correspondence.cjs').check(core,data);
    case "workflowCommunicationList":
      return require('./correspondence.cjs').list(core,data);
    case "workflowCommunicationFollowup":
      return require('./correspondence.cjs').createFollowup(core,data);
    case "workflowCommunicationDismiss":
      return require('./correspondence.cjs').dismiss(core,data);
    case "workflowDocumentSearch":
      if(data.mode!==undefined&&!['words','semantic'].includes(data.mode))throw fail('INVALID');
      return data.mode==='semantic'?require('./semantic-search.cjs').search(core,data):docs.search(core, data);
    case "workflowDocumentToolsStatus":
      return require('../document-tools-assets.cjs').status(core);
    case "workflowDocumentToolsSetup":
      return require('../document-tools-assets.cjs').setup(core,data.kind||'all');
    case "workflowProjectFiles":
      return docs.link(core, data);
    case "workflowPlaybookSave":
      return playbooks.save(core, data);
    case "workflowPlaybookPreview":
      return playbooks.preview(core, data);
    case "workflowPlaybookRun":
      return playbooks.run(core, data);
    case "workflowBudgetSave":
      return budget.save(core, data);
    default:
      throw fail("INVALID");
  }
}
module.exports = { dispatch, READ_DEMO };
