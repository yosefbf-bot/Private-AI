'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
test('Core shutdown stops reminder work before closing encrypted storage',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {core}=fixture(t);let calls=0;t.mock.method(core,'checkReminders',()=>{calls++;});
 t.mock.timers.tick(30000);assert.equal(calls,1);
 core.close();t.mock.timers.tick(60000);assert.equal(calls,1);assert.equal(core.store.db,null);
});
