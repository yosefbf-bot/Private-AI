'use strict';
// Experimental acoustic similarity, NOT a calibrated identity probability.
// Every automatic label remains a suggestion until a person confirms it.
const VERSION = 'local-spectrum-v1';
const POLICY = Object.freeze({minSamples: 3, threshold: 0.96, margin: 0.10});
function quality(features = {}) {
  if (features.version !== VERSION || typeof features.captureId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(features.captureId)) return 'A new local microphone recording is required.';
  for (const key of ['durationSeconds','voicedSeconds','snrDb','pitchMean','clippingRatio','capturedAt']) {
    if (!Number.isFinite(features[key])) return 'Microphone measurements are incomplete.';
  }
  if (features.durationSeconds < 4 || features.durationSeconds > 20 || features.voicedSeconds < 2 ||
      features.voicedSeconds > features.durationSeconds) return 'Record at least two seconds of clear speech.';
  if (features.snrDb < 18 || features.snrDb > 120 || features.clippingRatio < 0 || features.clippingRatio > 0.005)
    return 'Recording is too noisy or clipped. Move closer and record again.';
  if (features.pitchMean < 65 || features.pitchMean > 450) return 'A stable speech pitch could not be measured.';
  if (features.singleSpeakerConfirmed !== true || features.isOverlapping === true)
    return 'Confirm that only one person spoke; overlapping speech cannot identify a person.';
  if (!Array.isArray(features.spectrum) || features.spectrum.length !== 16 ||
      !features.spectrum.every(x => Number.isFinite(x) && x >= 0 && x <= 1) ||
      Math.abs(features.spectrum.reduce((n,x) => n+x*x,0)-1) > 0.02)
    return 'A valid measured spectrum is required.';
  return null;
}
function similarity(a,b) {
  const spectral = a.spectrum.reduce((n,x,i) => n+x*b.spectrum[i],0);
  const pitch = Math.exp(-4*Math.abs(Math.log(a.pitchMean/b.pitchMean)));
  return Math.min(1, Math.max(0,0.65*spectral+0.35*pitch));
}
function identify(features, profiles) {
  const unknown = reason => ({label:'Unknown Speaker', confidenceLevel:'weak', profileId:null,
    role:'Unverified', needsConfirmation:true, speakerVerified:false, reason, policy:POLICY});
  const problem=quality(features); if(problem)return unknown(problem);
  const ranked=profiles.map(profile => {
    const samples=(profile.samples||[]).filter(s=>!quality(s)&&s.verifiedBy&&s.captureId!==features.captureId);
    const scores=samples.map(s=>similarity(features,s)).sort((a,b)=>b-a);
    // Three independent recordings must support a suggestion, not one lucky match.
    return {profile,count:new Set(samples.map(s=>s.captureId)).size,score:scores.length? scores[Math.min(2,scores.length-1)]:0};
  }).filter(p=>p.count).sort((a,b)=>b.score-a.score);
  const best=ranked[0],runner=ranked[1]?.score||0;
  if(!best||best.count<POLICY.minSamples)return unknown('At least three confirmed recordings are needed for this speaker.');
  if(best.score<POLICY.threshold)return unknown('No speaker passed the conservative match threshold.');
  if(best.score-runner<POLICY.margin)return unknown('Similar voices: the leading candidates are too close to label.');
  return {label:best.profile.name, profileId:best.profile.id,role:best.profile.role,
    confidenceLevel:'possible',matchStrength:'strong',needsConfirmation:true,speakerVerified:false,
    reason:'Strong acoustic similarity; identity still requires confirmation.',policy:POLICY};
}
module.exports={VERSION,POLICY,quality,similarity,identify};
