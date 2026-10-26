'use strict';
const {fail}=require('../security.cjs');
const {SNFCommandCenter}=require('../snf-command-center.cjs');
class DemoStore {
 constructor(store){this.base=store;this.db=store.db;}
 get(k,id){return this.base.get('demo:'+k,id);}
 put(k,id,value,options){return this.base.put('demo:'+k,id,{...value,demo:true},options);}
 project(k,fn){return this.base.project('demo:'+k,fn);}
 list(k){return this.base.list('demo:'+k);}
 count(k){return this.base.count('demo:'+k);}
 summaries(k,options){return this.base.summaries('demo:'+k,options);}
 aggregate(k,build){return this.base.aggregate('demo:'+k,build);}
 delete(k,id){return this.base.delete('demo:'+k,id);}
 transaction(fn){return this.base.transaction(fn);}
 audit(){/* Demo events stay in the isolated encrypted records, never live alert audit. */}
 reset(){this.transaction(()=>{for(const {kind,id} of this.db.prepare("SELECT kind,id FROM records WHERE kind LIKE 'demo:%'").all())this.base.delete(kind,id);});}
}
class Workspaces {
 constructor(core){this.core=core;this.mode='production';this.demo=null;}
 current(){return this.mode==='demo'?this.demo:this.core.snf;}
 async set({mode,reset=false}={}){
  if(!['demo','production'].includes(mode))throw fail('INVALID');
  if(reset){const store=new DemoStore(this.core.store);store.reset();this.demo=null;}
  if(mode==='demo'&&!this.demo){this.demo=new SNFCommandCenter({store:new DemoStore(this.core.store),root:this.core.root,demoMode:true});await this.demo.seedRealisticPCCDataset();}
  this.mode=mode;return {mode,demo:mode==='demo'};
 }
}
const workspaces=new WeakMap();
function forCore(core){if(!workspaces.has(core))workspaces.set(core,new Workspaces(core));return workspaces.get(core);}
function markExport(value,demo){return demo?'DEMO DATA — NOT FOR CLINICAL USE\n\n'+value:value;}
module.exports={DemoStore,Workspaces,forCore,markExport};
