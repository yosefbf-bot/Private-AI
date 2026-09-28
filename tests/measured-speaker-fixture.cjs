'use strict';
const {randomUUID}=require('node:crypto');
// Synthetic acoustic metadata only; never use this fixture as hardware evidence.
function measuredSample(patch={}) {
 return {version:'local-spectrum-v1',captureId:randomUUID(),capturedAt:Date.now(),durationSeconds:8,
 voicedSeconds:5,snrDb:28,pitchMean:180,clippingRatio:0,spectrum:Array(16).fill(0.25),
 singleSpeakerConfirmed:true,identityConfirmed:true,verifiedBy:'Synthetic reviewer',...patch};
}
module.exports={measuredSample};
