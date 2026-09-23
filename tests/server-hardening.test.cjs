'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configuration,boundary,assertOperation}=require('../server/development-policy.cjs');
const env={PRIVATE_AI_DEV_TOKEN:'test-only-'.repeat(5),PRIVATE_AI_DEV_DATA:'/tmp/privateai-dev-test'};
test('development server requires explicit token, loopback binding and external data root',()=>{
 assert.equal(configuration(env).host,'127.0.0.1');assert.throws(()=>configuration({}));
 assert.throws(()=>configuration({...env,PRIVATE_AI_HOST:'0.0.0.0'}));
 assert.throws(()=>configuration({...env,PRIVATE_AI_DEV_DATA:process.cwd()}));
 for(const op of ['browserRun','runJob','grantFolder','folderReadText','backup','snfSeedData','snfIngest']) assert.throws(()=>assertOperation(op,{}));
 assert.throws(()=>assertOperation('settings',{approved:true}));
 assert.throws(()=>assertOperation('settings',{workspace:'/'}));
});
test('development boundary rejects hostile origins, unauthenticated RPC, missing CSRF and hostile Host headers',()=>{
 const gate=boundary(configuration(env));let status,body,headers={};const res={status(n){status=n;return this;},json(v){body=v;return this;},setHeader(k,v){headers[k]=v;}};
 const run=(path,method,h={})=>{status=200;body=null;let passed=false;gate({path,method,headers:{host:'127.0.0.1:3000',...h}},res,()=>passed=true);return passed;};
 assert.equal(run('/api/call','POST'),false);assert.equal(status,401);
 run('/api/session','POST',{authorization:'Bearer '+env.PRIVATE_AI_DEV_TOKEN,'x-private-ai':'development',origin:'https://attacker.example'});assert.equal(status,403);
 run('/api/session','POST',{authorization:'Bearer '+env.PRIVATE_AI_DEV_TOKEN,'x-private-ai':'development'});
 const csrf=body.csrf,cookie=headers['Set-Cookie'].split(';')[0];
 run('/api/call','POST',{cookie});assert.equal(status,403);
 assert.equal(run('/api/call','POST',{cookie,'x-private-ai-csrf':csrf}),true);
 assert.equal(run('/api/events','GET',{cookie}),true);
 assert.equal(run('/api/call','POST',{cookie,'x-private-ai-csrf':csrf,host:'evil.example'}),false);
});
