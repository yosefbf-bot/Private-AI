'use strict';
// One reviewed source for offline help, Markdown and HTML; never reads user data.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),guide=require('../source/app-guide.json');
if(guide.version!==require('../package.json').version)throw Error('Guide version must match the application.');
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Only --check is supported.');
const intro='Bundled offline instructions for this source version. Reading this guide does not change settings, grant permissions or update installed applications. See the release evidence for actual test scope and remaining physical-device or live-account acceptance.';
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=`Private AI ${guide.version} — User guide`;
const markdown=`# ${title}\n\n${intro}\n\n`+guide.topics.map(topic=>`## ${topic.title}\n\n**Where:** ${topic.location}\n\n${topic.steps.map((step,index)=>`${index+1}. ${step}`).join('\n')}\n\n**Keep in mind:** ${topic.note}\n`).join('\n');
const html='<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 `<title>${esc(title)}</title><style>html{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;background:Canvas;color:CanvasText;max-width:900px;margin:40px auto;padding:0 24px}section{border-top:1px solid #888;margin-top:30px}h1,h2{line-height:1.2}a{overflow-wrap:anywhere}</style>`+
 `<h1>${esc(title)}</h1><p>${esc(intro)}</p><nav aria-label="Guide topics"><ul>`+
 guide.topics.map(topic=>`<li><a href="#${esc(topic.id)}">${esc(topic.title)}</a></li>`).join('')+'</ul></nav>'+
 guide.topics.map(topic=>`<section id="${esc(topic.id)}"><h2>${esc(topic.title)}</h2><p><strong>Where:</strong> ${esc(topic.location)}</p><ol>${topic.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p><strong>Keep in mind:</strong> ${esc(topic.note)}</p></section>`).join('')+'</html>\n';
for(const [name,content] of [['USER_GUIDE.md',markdown],['USER_GUIDE.html',html]]){
 const target=path.join(root,'docs',name);
 if(process.argv.includes('--check')){
  if(fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==content)throw Error('Bundled user guide drift: run npm run guide:generate.');
 }else fs.writeFileSync(target,content,'utf8');
}
console.log(process.argv.includes('--check')?'Both bundled guide formats match the current source.':'Generated both bundled guide formats.');
