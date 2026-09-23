'use strict';
const fs=require('node:fs'),path=require('node:path');
function missing(root=path.resolve(__dirname,'..')){return require('./release-manifest.json').required.filter(p=>!fs.existsSync(path.join(root,p)));}
if(require.main===module){const files=missing();if(files.length){console.error('WINDOWS RELEASE BLOCKED: required files missing\n'+files.join('\n'));process.exitCode=1;}else console.log('Required files present. Actual Windows artifact/evidence validation is still required.');}
module.exports={missing};
