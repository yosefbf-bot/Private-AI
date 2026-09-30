'use strict';
// Reuse the selected SNF workspace, including canonical todo/meeting writes.
// Never let an executive Demo action call methods against the live Core store.
function scopedCore(core){
 core.assertUnlocked();
 const workspace=core.snf?require('./snf/demo.cjs').forCore(core).current():null;
 if(!workspace?.demoMode)return core;
 const scoped=Object.create(core);
 scoped.store=workspace.store;
 scoped.executiveDemo=true;
 scoped.emit=()=>{}; // Demo reminders must not escape into live notifications.
 return scoped;
}
module.exports={scopedCore};
