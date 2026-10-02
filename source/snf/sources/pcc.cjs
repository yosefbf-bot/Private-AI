'use strict';
const {fail}=require('../../security.cjs');

function sourceProvider(value='generic') {
  if (!['generic','manual','pcc'].includes(value)) throw fail('INVALID');
  return value;
}

// PCC is an optional report adapter. Parsing/validation/normalization and all
// clinical rules remain in the shared import pipeline. Future synchronizers
// register readSync here and return the same mapped reports; reads never publish.
function attach(snf) {
  snf.integrations.register('pcc', {
    async readImport(reports,{signal}) {
      if (signal.aborted) throw fail('CANCELLED');
      if (!Array.isArray(reports) || reports.length>100) throw fail('INVALID');
      return reports;
    }
  });
  // Older releases only exposed PCC imports. Preserve that explicitly used
  // capability, but do not enable PCC because default settings happen to name it.
  const legacy=snf.store.list('snf_import_report').some(r=>!r.sourceProvider||r.sourceProvider==='pcc');
  if (!snf.store.get('integration','pcc') && (snf.demoMode||legacy)) {
    snf.store.put('integration','pcc',{enabled:true,mode:'manual',migration:'existing-imports-v1'});
    const previous=snf.store.get('config',snf.feedStatusKey);
    if (previous&&!snf.store.get('config',snf.pccFeedStatusKey)) snf.store.put('config',snf.pccFeedStatusKey,previous);
  }
}

function alertVisible(snf,alert) {
  return !alert || !/^(STALE-|SURV-)/.test(alert.code||'') || snf.integrations.status('pcc').showDashboard;
}
module.exports={attach,sourceProvider,alertVisible};
