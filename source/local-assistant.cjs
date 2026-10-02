'use strict';
const clinicalRef = require('./clinical-reference.cjs');
const appGuide = require('./app-guide.cjs');

async function generateLocalResponse(prompt, messages, options = {}) {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  // Check clinical reference
  const clinicalContext = clinicalRef.findMatchingContext(p);

  // Check calculation
  const calcMatch = p.match(/(?:(?:what\s+is|calculate)\s+)?([0-9\s.+\-*/()^]+)/i);
  if (calcMatch && /[0-9]+\s*[*+/-]\s*[0-9]+/.test(p)) {
    try {
      const { calculate } = require('./deterministic.cjs');
      const expr = p.replace(/^(?:what\s+is|calculate|\/calc)\s+/i, '').trim();
      const val = calculate(expr);
      return {
        text: `${expr} = ${val}`,
        provider: 'local',
        model: 'Local Deterministic Calculator',
        reason: 'local_deterministic_calc',
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 5,
        reliability: { score: 100, label: 'Deterministic Result', reasons: ['Calculated with exact IEEE mathematical bounds.'] }
      };
    } catch {}
  }

  // Check app guide
  const guideHelp = appGuide.answerHelp(p, messages);
  if (guideHelp) {
    return guideHelp;
  }

  let fullAnswer = '';

  if (clinicalContext) {
    fullAnswer = `### Built-in Clinical Reference (Local)\n\n${clinicalContext}\n\n**Guidance & Application:**\nBased on established long-term care clinical protocols, ensure thorough documentation in the electronic health record (EHR) and follow interdisciplinary team (IDT) notification procedures.\n\n*Note: Local reference answer compiled offline on this PC without cloud transmission.*`;
  } else if (/\b(sbar|handoff|shift report|nurse handoff)\b/i.test(lower)) {
    fullAnswer = `### Structured SBAR Communication Report (Local)\n\n**S — Situation:**\n${p}\n\n**B — Background:**\nReview baseline status, current diagnoses, recent medication adjustments, and advance directives.\n\n**A — Assessment:**\n- Current vitals, pain level, and functional change compared to resident baseline.\n- Relevant diagnostic findings or acute symptom timeline.\n\n**R — Recommendation:**\n- Specific orders requested (e.g., diagnostic workup, medication review, stat assessment).\n- Interim monitoring frequency and IDT/family notification schedule.\n\n*(Compiled locally using standardized long-term care SBAR protocols)*`;
  } else if (/email|draft|write to|memo|notice/i.test(lower)) {
    fullAnswer = `**Subject:** Update regarding: ${p.slice(0, 50)}\n\nDear Team,\n\nI am writing to follow up on the following matter:\n\n${p}\n\nPlease review the details above and let me know if any adjustments are needed. Thank you for your continued dedication.\n\nBest regards,\nClinical & Operations Team\n\n*(Drafted locally by Private AI without external API requests)*`;
  } else if (/to-?do|task|reminder|follow-?up/i.test(lower)) {
    fullAnswer = `### Follow-Up Action Plan (Local)\n\nHere is an organized action list for your request:\n\n1. **High Priority Review:** Assess initial details and verify clinical / administrative impact.\n2. **Documentation & Handoff:** Ensure all items are logged into the shift handoff and communication log.\n3. **Follow-Up Check:** Monitor progress and verify resolution before end-of-shift.\n\n*You can save this as an automated reminder in the To-Do & Reminders dashboard in Settings.*`;
  } else if (/who are you|what is this|help|how to use/i.test(lower)) {
    fullAnswer = `**Private AI (Local Mode)**\n\nYou are currently running in **Local Mode** with zero external API keys or cloud dependencies. This response is generated on this PC. Separately enabled connectors and cloud features follow their own permissions.\n\n**Available Offline Capabilities:**\n- **Geriatric & Long-Term Care Clinical Reference:** Beers Criteria, 3 D's differential, SBAR triage, wound staging, ADLs, IDDSI dysphagia diets, CMS F-Tags, and NYS 10 NYCRR 415.\n- **Voice:** Text-to-speech where a local voice is available. Cloud or browser transcription has separate privacy restrictions.\n- **Outlook & App Integration:** Inspect emails, review calendar schedules, and automate follow-ups.\n- **To-Do Tracking:** Automated desktop reminders for pending items.\n- **Multi-Service API Keys:** Optional support for Google Gemini, Anthropic Claude, OpenAI, DeepSeek, Groq, or custom endpoints whenever you wish to enable cloud models.`;
  } else {
    fullAnswer = `### Summary & Recommendations (Local Mode)\n\n**Overview:**\n${p}\n\n**Key Considerations:**\n- **Patient / Resident Safety:** Ensure adherence to facility infection control and care plan parameters.\n- **Interdisciplinary Alignment:** Coordinate with Nursing, Medical Director, and Therapy departments as appropriate.\n- **Documentation:** Maintain clear, contemporaneous records in accordance with regulatory retention standards.\n\n*(Prepared offline from a built-in template)*`;
  }

  fullAnswer='Built-in reference/template response — no model inference. Verify applicability and supplied facts.\n\n'+fullAnswer;
  // Deliver local text if requested
  if (options.onDelta) {
    const words = fullAnswer.split(/(\s+)/);
    for (const word of words) {
      if (options.signal?.aborted) break;
      options.onDelta(word);
    }
  }

  return {
    text: fullAnswer,
    provider: 'local',
    model: 'Built-in references and templates (no model inference)',
    reason: 'local_offline_assistant',
    usage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 15,
    reliability: {
      score: null,
      label: 'Reference/template — review required',
      reasons: [
        'Running in Local Mode without API keys.',
        'Synthesized offline using local clinical and operational knowledge bases.',
        'Zero cloud network transmission.'
      ]
    }
  };
}

module.exports = {
  generateLocalResponse
};
