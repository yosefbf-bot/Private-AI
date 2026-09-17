'use strict';
const {fail}=require('./security.cjs');
const {executableInfo}=require('./apps.cjs');
class WhatsAppWindows{
 constructor(core,access){this.core=core;this.access=access;}
 async grant(){const s=this.core.store.get('messaging','windows')||{};const app=this.access.require('app',s.appId,'read');const info=await executableInfo(app.path);if(info.sha256!==app.sha256)throw fail("APP");return {...s,path:app.path};}
 async snapshot(){const g=await this.grant();return this.access.helper({op:'wa.snapshot',path:g.path,pid:g.pid});}
 async send(settings,body){await this.grant();if(!this.webFallback)throw fail('MESSAGING');return this.webFallback.send(settings,body);}
 close(){}
}
module.exports={WhatsAppWindows};
