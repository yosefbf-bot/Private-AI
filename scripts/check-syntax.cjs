'use strict';
const {execFileSync}=require('node:child_process');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>/\.(cjs|mjs|js)$/.test(p)&&!p.includes('/vendor/'));
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log(`Syntax checked: ${files.length} files.`);
