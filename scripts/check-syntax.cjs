'use strict';
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
let files=[];
try{
  files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(p=>/\.(cjs|mjs|js)$/.test(p)&&!p.includes('/vendor/'));
}catch{
  function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(e.name==='node_modules'||e.name==='.git'||e.name==='vendor')continue;
      const p=path.join(dir,e.name);
      if(e.isDirectory())walk(p);
      else if(/\.(cjs|mjs|js)$/.test(e.name))files.push(p.replace(/^[./]+/, ''));
    }
  }
  walk('.');
}
for(const file of files)execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log(`Syntax checked: ${files.length} files.`);
