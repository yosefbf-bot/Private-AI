'use strict';
const fs=require('node:fs'),path=require('node:path');
function missing(root=path.resolve(__dirname,'..')){return require('./release-manifest.json').required.filter(p=>!fs.existsSync(path.join(root,p)));}
function validate(root=path.resolve(__dirname,'..')){
 const absent=missing(root);if(absent.length)throw Error('Required files missing\n'+absent.join('\n'));
 for(const relative of require('./release-manifest.json').required){if(!fs.statSync(path.join(root,relative)).isFile())throw Error(relative+': regular file required');}
 const {inspectPe}=require('../build/pe-integrity.cjs');let binaries=0;
 // .NET ships valid AnyCPU IL assemblies with I386 PE headers. The helper
 // launcher and all native inference binaries must still target x64.
 function inspect(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())inspect(file);else if(/\.(exe|dll)$/i.test(item.name)){const relative=path.relative(root,file),result=inspectPe(fs.readFileSync(file),relative);if((/\.exe$/i.test(item.name)||relative.startsWith('build'+path.sep+'local-runtime'+path.sep))&&result.machine!=='0x8664')throw Error(relative+': x64 binary required');binaries++;}}}
 for(const dir of ['build/desktop-helper','build/local-runtime'])inspect(path.join(root,dir));
 return {binaries};
}
if(require.main===module){try{const result=validate();console.log(`Required files and ${result.binaries} Windows PE binaries validated. Actual Windows artifact/evidence validation is still required.`);}catch(e){console.error('WINDOWS RELEASE BLOCKED: '+e.message);process.exitCode=1;}}
module.exports={missing,validate};
