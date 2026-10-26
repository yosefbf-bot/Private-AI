'use strict';
const {fail}=require('./security.cjs');
const HELP='Use a saved workflow: Run report "Report name" for yesterday to "Reports" in daily folders with unit="North". Dates: today, yesterday, N days ago, last month, YYYY-MM, YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD. Use /reports today, /analyze reports today, /analyze folder "Reports/2026-10-26", or /trends resident "exact source ID" over 100 days. Set up and test the website workflow in Browser reports first; choices must match its approved list.';
function parse(prompt){
 const p=prompt.trim();let m;
 if((m=p.match(/^\/?(?:show )?reports(?: (?:from )?(.+))?$/i)))return {type:'list',query:{date:m[1]||'today'}};
 if((m=p.match(/^\/?analy[sz]e reports(?: (?:from |for )?(.+))?$/i)))return {type:'analyze',query:{date:m[1]||'today'}};
 if((m=p.match(/^\/?analy[sz]e (?:reports in |all files in )?folder "([^"\r\n]{1,500})"$/i)))return {type:'analyze',query:{folder:m[1]}};
 if((m=p.match(/^\/?(?:show report )?trends(?: (resident|staff|unit) "([^"\r\n]{1,200})")?(?: over (\d{1,3}) days)?$/i)))return {type:'trends',query:{...(m[1]?{entityType:m[1].toLowerCase(),entityId:m[2]}:{}),...(m[3]?{days:Number(m[3])}:{})}};
 if((m=p.match(/^\/report ([^"\r\n]{1,80})$/i)))return {type:'run',name:m[1],parameters:{}};
 m=p.match(/^(?:\/report|(?:go to (?:point ?click ?care|pcc) and )?(?:run|download)(?: the)?(?: report)?) "([^"\r\n]{1,80})"(.*)$/i);
 if(!m)return /^(?:\/report\b|\/?analy[sz]e (?:reports|folder)|\/?trends\b|(?:go to (?:point ?click ?care|pcc) and )?(?:run|download) (?:the )?report\b)/i.test(p)?{type:'help'}:null;
 const parameters={},suffix=m[2];
 const tail=suffix.match(/^(?: for ([^"\r\n]+?))?(?: to "([^"\r\n]{1,500})")?(?: (in daily folders|without daily folders))?(?: with (.+))?$/i);
 if(!tail)return {type:'help'};
 if(tail[1])parameters.period=tail[1].trim();if(tail[2])parameters.folder=tail[2];if(tail[3])parameters.dailyFolder=/^in/i.test(tail[3]);
 if(tail[4]){const choices={};for(const piece of tail[4].split(/,\s*(?=[a-zA-Z_]+=)/)){
  const choice=piece.match(/^([a-z][a-zA-Z0-9_]{0,30})="([^"\r\n]{1,150})"$/);if(!choice||Object.hasOwn(choices,choice[1]))return {type:'help'};Object.defineProperty(choices,choice[1],{value:choice[2],enumerable:true});
 }parameters.choices=choices;}
 return {type:'run',name:m[1],parameters};
}
async function execute(core,browser,command){
 core.assertUnlocked();if(core.developmentMode)throw fail('POLICY');
 if(command.type==='help')return HELP;
 if(command.type==='run'){
  if(!browser)throw fail('LOCAL_UNAVAILABLE');const found=core.store.list('browserRecipe').filter(r=>r.name.toLowerCase()===command.name.toLowerCase());
  if(found.length!==1)return 'No unique saved report workflow matches that name. '+HELP;
  const out=await browser.run(found[0],{parameters:command.parameters});return 'Report saved: '+out.relative+'\nRequested period: '+out.requestedPeriod.start+' through '+out.requestedPeriod.end+'. Source coverage is checked separately.\n'+(out.reportId?'History indexing and source comparisons are pending.':'');
 }
 if(command.type==='list'){
  const rows=core.reportHistory.list(command.query);return rows.length?rows.map(r=>`- ${r.name} — ${r.downloadDate} — ${r.state}${r.duplicateOf?' (duplicate source)':''} — ${r.relative}`).join('\n'):'No catalogued reports match. This does not establish that the source reports were empty.';
 }
 if(command.type==='analyze'){
  const intake=command.query.folder?await core.reportHistory.catalogFolder(command.query.folder):null;
  const result=core.reportHistory.queue(command.query);return `Queued ${result.queued} report analyses. ${result.notice} Track the queue in Browser reports; started analyses and results appear in Automation.`+(intake?` ${intake.catalogued} supported files; ${intake.excluded} unsupported entries/subfolders excluded. Folder intake is not recursive.`:'');
 }
 if(command.type==='trends'){
  const result=core.reportHistory.trends(command.query);return result.notice+'\n\nWindow: '+result.start+' through '+result.end+`. Pending/unreviewed reports: ${result.pending}. Unknown rows: ${result.unknownRows}.\n`+(result.groups.map(g=>`- ${g.entityType} ${g.entityId}; ${g.metric}: ${g.observations} distinct ${g.mode==='events'?'events':'dated values'}; latest ${g.latest?.date||'unknown'}${g.mode==='snapshot'?'; value '+(g.latest?.value??'unknown')+'; change '+(g.change??'unknown'):''}${g.anomaly?'; unusual versus supplied baseline — review':''}${g.repeated?'; repeated events — review':''}${g.conflicts?`; ${g.conflicts} conflicting points excluded`:''}. Sources: ${g.sources.map(s=>s.reportId+' row '+s.row).join(', ')}${g.sourceListLimited?' (last20 source links shown)':''}`).join('\n')||'No comparable source observations in this selection.');
 }
 throw fail('INVALID');
}
module.exports={parse,execute,HELP};
