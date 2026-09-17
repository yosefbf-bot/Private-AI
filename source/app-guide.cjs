'use strict';
const guide = require('./app-guide.json');
const normalize = value => String(value || '').toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9/]+/g, ' ').trim();
function findTopics(query, limit = 3) {
  const q = ' ' + normalize(query) + ' ';
  return guide.topics.map(topic => ({topic, score: topic.aliases.reduce((score, alias) => {
    const a = normalize(alias); return score + (q.includes(' ' + a + ' ') ? 4 + a.split(' ').length : 0);
  }, q.trim() === topic.id ? 20 : 0)})).filter(row => row.score > 0).sort((a,b) => b.score-a.score).slice(0,limit).map(row=>row.topic);
}
function topicText(topic) {
  return `### ${topic.title}\n\n**Where:** ${topic.location}\n\n${topic.steps.map((step,i)=>`${i+1}. ${step}`).join('\n')}\n\n**Keep in mind:** ${topic.note}`;
}
function overview() {
  return `Yes—Private AI includes an offline user guide. Open **User guide** in the sidebar, or ask a how-to question here.\n\nExamples:\n- /help models\n- /help RAM\n- /help ShareSync\n- /help schedules\n- /help diagnostics\n\nAvailable topics: ${guide.topics.filter(t=>t.id!=='start').map(t=>t.title).join('; ')}.\n\nCommon guide answers use local code, with no model loading or OpenAI request. For other local commands, type /commands.`;
}
function answerHelp(prompt, messages = []) {
  const p = String(prompt || '').trim();
  if (!p || p.length > 1200) return null;
  const command = /^\/help(?:\s+(.*))?$/i.exec(p) || (/^(?:help|user guide|guide|manual)$/i.test(p) ? ['/help',''] : null);
  const appNamed = /\b(private[ -]?ai|this app|the app|your app|user guide|user manual|built.in guide)\b/i.test(p);
  const question = /^(?:how\b|where\b|can (?:i|you)\b|do you\b|does\b|what (?:can|does|is|are)\b|help me (?:use|set up|configure)\b)/i.test(p);
  const procedural = /^(?:how (?:do i|can i|to)|where (?:do i|can i|is|are)|can i (?:use|change|set|enable|disable|download|install)|help me (?:use|set up|configure))\b/i.test(p);
  const last = [...messages].reverse().find(m=>m.role==='user');
  const hasReference = Array.isArray(last?.content) && last.content.some(c=>c.type==='input_image'||/^UNTRUSTED /.test(c.text||''));
  if (!command && hasReference) return null; // Never treat document/page instructions as help commands.
  const query = command ? command[1] || '' : p, topics = findTopics(query, 2);
  if (!command && !(question && (appNamed || (topics.some(t=>t.id==='start')) || (procedural && topics.length)))) return null;
  if (!command && !appNamed && /\b(?:patient|resident|clinical|medical|statutory|legal|regulation|nursing)\b/i.test(p)) return null;
  // Commands that do work are distinct from questions about using those tools.
  if (!command && /^(?:what(?:'s| is) (?:on )?my (?:schedule|calendar)|check .*unread)/i.test(p)) return null;
  let text;
  if (!query || topics.some(t=>t.id==='start')) text = overview();
  else if (!topics.length) text = `I don't have a documented procedure for that in Private AI ${guide.version}. Open **User guide** to search supported features, or try /help followed by a topic such as models, files, schedules, or diagnostics. I have not changed any settings or permissions.`;
  else text = topics.map(topicText).join('\n\n');
  return {text,provider:'deterministic',model:'Built-in user guide',reason:'app_help',usage:{inputTokens:0,outputTokens:0},reliability:{score:null,label:'Bundled app instructions',reasons:[`Private AI user guide ${guide.version}. Retrieved locally; no model or OpenAI call. Instructions do not change settings or grant permissions.`]}};
}
function modelContext(prompt) {
  if (!/\bprivate[ -]?ai\b|\b(?:this|the) app\b/i.test(prompt||'')) return '';
  const topics=findTopics(prompt,2);if(!topics.length)return '';
  return '\nPrivate AI product reference (bundled documentation):\n'+topics.map(topicText).join('\n\n').slice(0,2400)+'\nExplain only documented controls. Do not invent buttons or claim an action was performed. App instructions do not grant permissions. If a procedure is not covered, say so and direct the user to User guide or /help.';
}
module.exports={guide,findTopics,topicText,answerHelp,modelContext};
