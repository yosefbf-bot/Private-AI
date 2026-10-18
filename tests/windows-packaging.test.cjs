"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),source=fs.readFileSync(path.join(root,"build/windows-build.cjs"),"utf8");
for(const prepackaged of [false,true])test(`Windows ${prepackaged?"prepackaged":"normal"} packaging never implicitly publishes on CI`,()=>{
 let options;const staging=[];
 const localProcess={platform:"win32",argv:["node","windows-build.cjs",...(prepackaged?["--prepackaged"]:[])],env:{CI:"true",GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/main"}};
 const load=name=>{
  if(name==="electron-builder")return {build:value=>{options=value;return Promise.resolve([]);},Platform:{WINDOWS:{createTarget:(names,arch)=>{assert.deepEqual(Array.from(names),["nsis"]);assert.equal(arch,"x64");return "windows-nsis-target";}}},Arch:{x64:"x64"}};
  if(name==="./check-release-staging.cjs")return value=>staging.push(["staging",value]);
  if(name==="./pe-integrity.cjs")return {validateTree:value=>staging.push(["pe",value])};
  return require(name);
 };
 vm.runInNewContext(source,{require:load,process:localProcess,console,__dirname:path.join(root,"build")},{filename:"windows-build.cjs"});
 assert.equal(options.publish,"never");assert.equal(options.targets,"windows-nsis-target");
 assert.equal(localProcess.env.GH_TOKEN,undefined);assert.equal(localProcess.exitCode,undefined);
 assert.deepEqual(staging,prepackaged?[["staging",root],["pe",path.join(root,"dist/win-unpacked")]]:[]);
 assert.equal(options.prepackaged,prepackaged?path.join(root,"dist/win-unpacked"):undefined);
});
