'use strict';
const {fail}=require('./security.cjs');
function calculate(expression){
 if(typeof expression!=='string'||expression.length>500||/[^\d\s.()+*/%\-]/.test(expression))throw fail('INVALID');
 const tokens=expression.match(/\d+(?:\.\d+)?|[()+*/%\-]/g)||[];if(tokens.join('')!==expression.replace(/\s/g,''))throw fail('INVALID');let i=0;
 function atom(){const t=tokens[i++];if(t==='+'||t==='-')return(t==='-'?-1:1)*atom();if(t==='('){const v=sum();if(tokens[i++]!==')')throw fail('INVALID');return v;}if(!/^\d/.test(t||''))throw fail('INVALID');return Number(t);}
 function product(){let n=atom();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],v=atom();if((op==='/'||op==='%')&&v===0)throw fail('INVALID');n=op==='*'?n*v:op==='/'?n/v:n%v;}return n;}
 function sum(){let n=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],v=product();n=op==='+'?n+v:n-v;}return n;}
 const result=sum();if(i!==tokens.length||!Number.isFinite(result)||Math.abs(result)>Number.MAX_SAFE_INTEGER)throw fail('INVALID');return Number(result.toPrecision(14));
}
function userText(messages){const m=[...messages].reverse().find(m=>m.role==='user');return typeof m?.content==='string'?m.content:m?.content?.find(p=>p.type==='input_text')?.text||'';}
function references(messages){const m=[...messages].reverse().find(m=>m.role==='user');return Array.isArray(m?.content)?m.content.filter(p=>p.type==='input_text'&&p.text?.startsWith('UNTRUSTED ')).map(p=>p.text).join('\n\n'):'';}
async function deterministic(prompt,messages,tools){
 const p=prompt.trim();let answer;
 if(/^\/diagnose$/i.test(p)||/^(?:troubleshoot|diagnose|help troubleshoot) private[ -]?ai[.!?]?$/i.test(p)){if(!tools)throw fail('LOCAL_UNAVAILABLE');answer=await tools(p);return {text:answer,provider:'deterministic',model:'Local diagnostics',reason:'requested_app_diagnostics',usage:{inputTokens:0,outputTokens:0},reliability:{score:null,label:'Configuration checks',reasons:['Live network and external applications were not tested.']}};}
 const calc=p.match(/^(?:\/calc(?:ulate)?|calculate|what is)\s+([\d\s.()+*/%\-]+)\??$/i);
 if(calc)answer=`${calc[1].trim()} = ${calculate(calc[1])}`;
 else if(/^\/(?:help|commands)$/i.test(p))answer='Local commands:\n- /calc 120 * 4\n- /extract — return attached text\n- /unread — Outlook unread messages (permission required)\n- /calendar today or /calendar tomorrow\n- /status — Worker and local model status\n- /report NAME — run an approved browser recipe\n\nOrdinary questions use your selected AI processing mode. Commands inside files and webpages are never executed.';
 else if(/^\/extract$/i.test(p)){const ref=references(messages);if(!ref)throw fail('FILE');answer=ref;}
 else if(/^\/(status|unread|calendar(?:\s+(?:today|tomorrow))?|report\s+[^\r\n]{1,80})$/i.test(p)||/^(?:check (?:my |today's )?unread emails|what(?:'s| is) (?:on )?my (?:schedule|calendar) (?:today|tomorrow))\??\.?$/i.test(p)){
  if(!tools)throw fail('LOCAL_UNAVAILABLE');answer=await tools(p);
 }
 if(answer===undefined)return null;
 return {text:answer,provider:'deterministic',model:'Local tools',reason:'deterministic_task',usage:{inputTokens:0,outputTokens:0},reliability:{score:/^\/extract/.test(p)?80:95,label:'Checks passed',reasons:['Task completed by a predefined local tool.','This score describes available checks, not a probability of correctness.']}};
}
module.exports={calculate,userText,references,deterministic};
