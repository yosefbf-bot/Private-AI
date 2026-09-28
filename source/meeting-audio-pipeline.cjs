'use strict';

/**
 * Meeting speaker profiles and review. Local measurement is implemented in
 * ui/speaker-capture.mjs; conservative experimental matching is in speaker-match.cjs.
 * Automatic names are suggestions, never verified identity or a probability.
 * The older enhancement/diarization helpers below are synthetic calculations,
 * not live filtering, overlap detection, or continuous speaker diarization.
 */

const { fail, isId, text, uuid } = require('./security.cjs');
const speakerMatch = require('./speaker-match.cjs');

// Non-speech acoustic signatures & patterns
const NON_SPEECH_PATTERNS = [
  {
    type: 'overhead_page',
    label: 'Possible overhead page',
    regex: /\b(overhead|all staff|code blue|dr\.\s*strong|paging|attention all|facility announcement|chime)\b/i,
    excludeFromCommitments: true
  },
  {
    type: 'door_event',
    label: 'Door sound',
    regex: /\b(door closes?|door opens?|slam|click)\b/i,
    excludeFromCommitments: true
  },
  {
    type: 'phone_ring',
    label: 'Phone ringing',
    regex: /\b(phone ring(?:ing)?|call incoming|telephone chime)\b/i,
    excludeFromCommitments: true
  },
  {
    type: 'cross_talk',
    label: 'Multiple speakers',
    regex: /\b(crosstalk|simultaneous|overlapping|inaudible chatter)\b/i,
    excludeFromCommitments: true
  }
];

class AudioCaptureService {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000;
    this.channels = options.channels || 1;
    this.preferredDeviceId = options.preferredDeviceId || 'default';
  }

  getConstraints() {
    return {
      audio: {
        channelCount: this.channels,
        sampleRate: this.sampleRate,
        echoCancellation: true,
        noiseSuppression: false, // We control enhancement in our layer
        autoGainControl: false
      }
    };
  }
}

class AudioEnhancementService {
  constructor() {
    this.rawBufferCache = new Map(); // Retains original audio buffers temporarily for reprocessing
  }

  // Pre-process audio chunk / frame
  enhanceFrame(frameData = {}) {
    const rawEnergy = frameData.energy || 0.05;
    const rawRumble = frameData.lowFreqEnergy || 0.01;
    const clipCount = frameData.clipping || 0;

    // 1. 80Hz High-Pass Rumble Filter (reduces HVAC and desk rumble)
    const filteredEnergy = Math.max(0, rawEnergy - (rawRumble * 0.85));

    // 2. Voice Activity Detection (VAD)
    const vadThreshold = 0.025;
    const isSpeech = filteredEnergy >= vadThreshold && clipCount < 100;

    // 3. Gain Normalization (AGC simulation)
    const targetRms = 0.15;
    const gainFactor = filteredEnergy > 0 ? Math.min(3.0, Math.max(0.5, targetRms / filteredEnergy)) : 1.0;
    const normalizedEnergy = filteredEnergy * gainFactor;

    return {
      isSpeech,
      rawEnergy,
      filteredEnergy: normalizedEnergy,
      gainApplied: gainFactor,
      isClipped: clipCount > 5
    };
  }

  cacheRawAudio(segmentId, buffer) {
    if (this.rawBufferCache.size > 200) {
      const oldest = this.rawBufferCache.keys().next().value;
      this.rawBufferCache.delete(oldest);
    }
    this.rawBufferCache.set(segmentId, buffer);
  }

  getRawAudio(segmentId) {
    return this.rawBufferCache.get(segmentId) || null;
  }
}

class AudioQualityAssessor {
  assess(metrics = {}) {
    if (!['noiseFloorDb','snrDb','clippingCount','crossTalkRatio'].every(k => Number.isFinite(metrics[k]))) return {status: 'Unmeasured', metrics: {}, issues: ['Missing microphone measurements'], warning: 'Microphone quality has not been measured.'};
    const noiseFloor = metrics.noiseFloorDb ?? -45; // e.g. -45 dB
    const snr = metrics.snrDb ?? 22; // e.g. 22 dB
    const clippingCount = metrics.clippingCount || 0;
    const crossTalkRatio = metrics.crossTalkRatio || 0.05;

    let issues = [];
    if (noiseFloor > -32) issues.push('High background noise (HVAC/hallway)');
    if (snr < 12) issues.push('Low speech signal-to-noise ratio');
    if (clippingCount > 20) issues.push('Microphone input clipping / distortion');
    if (crossTalkRatio > 0.35) issues.push('High volume of simultaneous cross-talk');

    let status = 'Good';
    if (issues.length >= 2 || snr < 8 || clippingCount > 50) {
      status = 'Poor';
    } else if (issues.length === 1 || snr < 15) {
      status = 'Fair';
    }

    return {
      status, // 'Good' | 'Fair' | 'Poor'
      metrics: {
        noiseFloorDb: noiseFloor,
        snrDb: snr,
        clippingCount,
        crossTalkRatio
      },
      issues,
      warning: status === 'Poor'
        ? 'Meeting audio quality may reduce transcription or speaker-identification accuracy.'
        : null
    };
  }
}

class SpeakerDiarizationService {
  diarize(transcriptEntries = []) {
    // Segments utterances into speaker turns
    // Flags cross-talk / multiple speakers
    return transcriptEntries.map(entry => {
      const isCrossTalk = /\b(multiple speakers|everyone talking|overlapping)\b/i.test(entry.text) || entry.isOverlapping;
      return {
        id: entry.id || uuid(),
        turnStart: entry.startTime || entry.timestamp,
        turnEnd: entry.endTime || (entry.timestamp + 3000),
        rawSpeakerLabel: entry.speaker || 'Speaker',
        isCrossTalk,
        text: entry.text
      };
    });
  }
}

class SpeakerRecognitionService {
  constructor(core) {
    this.core = core;
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // Persistent Voice Profiles CRUD
  // -------------------------------------------------------------
  listProfiles() {
    this.core.assertUnlocked();
    const profiles = (this.store.list('speaker_profile') || []).map(p => ({...p, samples: (p.samples || []).filter(s => !speakerMatch.quality(s) && s.verifiedBy)}));
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  getProfile(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const p = this.store.get('speaker_profile', id);
    if (!p) throw fail('NOT_FOUND');
    return p;
  }

  createProfile(input = {}) {
    this.core.assertUnlocked();
    const profile = {
      id: uuid(),
      name: text(input.name || 'Staff Member', 100),
      role: text(input.role || 'Staff', 60),
      department: text(input.department || 'Clinical', 60),
      expectedMeeting: text(input.expectedMeeting || 'All Meetings', 100),
      samples: [], // Array of clean verified acoustic samples
      quality: 'Needs Samples', // 'Good' | 'Fair' | 'Needs Samples'
      lastVerifiedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.store.put('speaker_profile', profile.id, profile);
    this.core.emit?.({ type: 'speaker_profile_updated', profileId: profile.id, name: profile.name });
    return profile;
  }

  saveProfile(data = {}) {
    this.core.assertUnlocked();
    if (!data.id || !isId(data.id)) return this.createProfile(data);
    const existing = this.getProfile(data.id);
    const updated = {
      ...existing,
      name: data.name ? text(data.name, 100) : existing.name,
      role: data.role ? text(data.role, 60) : existing.role,
      department: data.department ? text(data.department, 60) : existing.department,
      expectedMeeting: data.expectedMeeting ? text(data.expectedMeeting, 100) : existing.expectedMeeting,
      updatedAt: Date.now()
    };
    this.store.put('speaker_profile', updated.id, updated);
    this.core.emit?.({ type: 'speaker_profile_updated', profileId: updated.id, name: updated.name });
    return updated;
  }

  deleteProfile(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.delete('speaker_profile', id);
    this.core.purgeBackups?.();
    return true;
  }

  // -------------------------------------------------------------
  // Add Verified Sample with Sample Quality Filtering
  // -------------------------------------------------------------
  addVerifiedSample(profileId, sampleData = {}) {
    this.core.assertUnlocked();
    const profile = this.getProfile(profileId);

    const problem = speakerMatch.quality(sampleData);
    if (problem) return {accepted:false,reason:problem};
    if (!String(sampleData.verifiedBy || '').trim() || sampleData.identityConfirmed !== true)
      return {accepted:false,reason:'Confirm the speaker identity and enter the reviewer name.'};
    if (Math.abs(Date.now()-sampleData.capturedAt)>120000)
      return {accepted:false,reason:'Record a fresh sample before enrollment.'};
    if ((this.store.list('speaker_profile') || []).some(p => (p.samples||[]).some(s=>s.captureId===sampleData.captureId)))
      return {accepted:false,reason:'This recording was already enrolled. Record a different passage.'};
    const sample = {
      id:uuid(),timestamp:Date.now(),version:sampleData.version,captureId:sampleData.captureId,
      durationSeconds:sampleData.durationSeconds,voicedSeconds:sampleData.voicedSeconds,
      snrDb:sampleData.snrDb,pitchMean:sampleData.pitchMean,clippingRatio:sampleData.clippingRatio,
      spectrum:[...sampleData.spectrum],capturedAt:sampleData.capturedAt,singleSpeakerConfirmed:true,
      verifiedBy:text(sampleData.verifiedBy,100)
    };
    profile.samples=[...(profile.samples||[]).filter(s=>!speakerMatch.quality(s)&&s.verifiedBy),sample].slice(-12);
    profile.quality=profile.samples.length>=3?'Ready for experimental suggestions':'Needs 3 confirmed recordings';
    profile.lastVerifiedAt=profile.updatedAt=Date.now();
    this.store.put('speaker_profile',profile.id,profile);
    return {accepted:true,sample,profileQuality:profile.quality,totalSamples:profile.samples.length};
  }

  removeSample(profileId, sampleId) {
    this.core.assertUnlocked();
    const profile = this.getProfile(profileId);
    if (!isId(sampleId)) throw fail('INVALID');
    profile.samples = (profile.samples || []).filter(s => s.id !== sampleId);

    profile.quality = profile.samples.filter(s=>!speakerMatch.quality(s)&&s.verifiedBy).length>=3 ? 'Ready for experimental suggestions' : 'Needs 3 confirmed recordings';
    profile.updatedAt = Date.now();
    this.store.put('speaker_profile', profile.id, profile);
    this.core.purgeBackups?.();
    return profile;
  }

  // -------------------------------------------------------------
  // Acoustic Recognition Matcher & Confidence Scorer
  // -------------------------------------------------------------
  identifySpeaker(acousticFeatures = {}) {
    this.core.assertUnlocked();
    return speakerMatch.identify(acousticFeatures, this.listProfiles());
  }

  // -------------------------------------------------------------
  // Learn From Verified Corrections Workflow
  // -------------------------------------------------------------
  applyCorrectionAndLearn({ meetingId, transcriptEntryId, correctedSpeaker, correctedRole, learnForFuture = true, segmentDuration = 3.5 }) {
    this.core.assertUnlocked();
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    const entry = (meeting.transcript || []).find(t => t.id === transcriptEntryId);
    if (!entry) throw fail('NOT_FOUND');

    if (!String(correctedSpeaker || '').trim() || /^unknown speaker$/i.test(correctedSpeaker.trim())) throw fail('INVALID');
    const oldSpeaker = entry.speaker;
    entry.speaker = text(correctedSpeaker, 100);
    if (correctedRole) entry.role = text(correctedRole, 60);
    entry.speakerVerified = true;
    entry.attribution = 'manual';
    entry.confirmedAt = Date.now();
    entry.confidenceLevel = 'strong';

    for (const item of meeting.actionItems || []) {
      if (item.detectedFromTranscriptId === entry.id) { item.assignee=entry.speaker; item.department=entry.role; }
    }
    for (const finding of meeting.clinicalRadar || []) {
      if (finding.transcriptEntryId === entry.id || (!finding.transcriptEntryId && finding.timestamp === entry.timestamp && finding.speaker === oldSpeaker)) finding.speaker=entry.speaker;
    }
    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);
    // Post-meeting corrections must also reach copied minutes, without changing
    // the original completion time or silently learning a voice signature.
    if (meeting.status === 'completed') new (require('./operations-copilot.cjs').OperationsCopilotEngine)(this.core).finalizeMeeting(meeting.id);

    this.core.emit?.({
      type: 'speaker_identity_corrected',
      meetingId,
      entryId: transcriptEntryId,
      oldSpeaker,
      newSpeaker: correctedSpeaker
    });

    let learningResult = null;
    if (learnForFuture) learningResult = {accepted: false, reason: 'Correction saved. No measured audio sample is attached; voice profile was not changed.'};

    return {
      success: true,
      entry,
      learningResult
    };
  }

  // -------------------------------------------------------------
  // Post-Meeting Speaker Review Summary Generator
  // -------------------------------------------------------------
  generateSpeakerReview(meetingId) {
    this.core.assertUnlocked();
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    const transcript = meeting.transcript || [];
    const speakerMap = new Map();

    transcript.forEach(entry => {
      const spk = entry.speaker || 'Unknown Speaker';
      const conf = entry.speakerVerified && entry.attribution === 'manual' ? 'strong' : spk === 'Unknown Speaker' ? 'weak' : 'possible';
      if (!speakerMap.has(spk)) {
        speakerMap.set(spk, {
          speaker: spk,
          role: entry.role || 'Attendee',
          count: 0,
          confidenceLevel: conf,
          entries: []
        });
      }
      const data = speakerMap.get(spk);
      if (conf !== 'strong') data.confidenceLevel = conf;
      data.count++;
      data.entries.push(entry.id);
    });

    return {
      meetingId,
      totalEntries: transcript.length,
      speakers: Array.from(speakerMap.values())
    };
  }

  confirmAllHighConfidence(meetingId) {
    this.core.assertUnlocked();
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    // Bulk acceptance cannot turn machine suggestions into verified identities.
    // Use the per-entry correction action to explicitly confirm each speaker.
    if ((meeting.transcript || []).some(t => t.attribution !== 'manual' && !t.speakerVerified))
      throw fail('INVALID');

    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);
    return meeting;
  }
}

module.exports = {
  NON_SPEECH_PATTERNS,
  AudioCaptureService,
  AudioEnhancementService,
  AudioQualityAssessor,
  SpeakerDiarizationService,
  SpeakerRecognitionService
};

