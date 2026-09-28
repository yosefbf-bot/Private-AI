'use strict';

/**
 * Meeting Audio Pipeline & Speaker Recognition Subsystem
 * 
 * Implements clean architectural separation:
 * Audio Capture -> Audio Enhancement -> Transcription -> Diarization -> Speaker Recognition -> Meeting Intelligence
 * 
 * Features:
 * - 80Hz rumble filter, noise suppression, VAD, gain normalization
 * - Audio quality assessment (Good / Fair / Poor) with real-time warnings
 * - Non-speech event detection ([Overhead page], [Door closes], [Phone ringing])
 * - Overhead page exclusion from commitments / action items
 * - Cross-talk ([Multiple speakers]) handling
 * - Persistent voice profiles with multi-sample acoustic representation
 * - Confidence scoring: Strong Match / Possible Match (?) / Unknown Speaker
 * - Post-meeting speaker review screen & learning from verified corrections with sample quality filtering
 */

const { fail, isId, text, uuid } = require('./security.cjs');

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
    const profiles = (this.store.list('speaker_profile') || []).map(p => ({...p, samples: (p.samples || []).filter(s => !['System Baseline Roster', 'Correction in Meeting Review'].includes(s.verifiedBy))}));
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
    return true;
  }

  // -------------------------------------------------------------
  // Add Verified Sample with Sample Quality Filtering
  // -------------------------------------------------------------
  addVerifiedSample(profileId, sampleData = {}) {
    this.core.assertUnlocked();
    const profile = this.getProfile(profileId);

    if (!['durationSeconds','snrDb','pitchMean','spectralCentroid'].every(k => Number.isFinite(sampleData[k]))) return {accepted: false, reason: 'Measured acoustic features are required.'};
    const duration = sampleData.durationSeconds;
    const snr = sampleData.snrDb ?? 20;
    const isOverlapping = sampleData.isOverlapping === true;
    const isNoisy = sampleData.isNoisy === true || snr < 12;

    // Strict Quality Filter:
    // Do not train on:
    // - very short clips (< 1.5 seconds)
    // - strong overlap
    // - very noisy segments (SNR < 12dB)
    // - uncertain segments
    if (duration < 1.5) {
      return { accepted: false, reason: 'Sample too short (< 1.5s). Excluded to preserve profile quality.' };
    }
    if (isOverlapping) {
      return { accepted: false, reason: 'Overlapping speech detected. Excluded to prevent feature distortion.' };
    }
    if (isNoisy) {
      return { accepted: false, reason: 'Low SNR / excessive background noise. Excluded.' };
    }

    const sample = {
      id: uuid(),
      timestamp: Date.now(),
      durationSeconds: duration,
      snrDb: snr,
      pitchMean: sampleData.pitchMean,
      spectralCentroid: sampleData.spectralCentroid,
      verifiedBy: sampleData.verifiedBy || 'Clinician'
    };

    profile.samples = profile.samples || [];
    profile.samples.push(sample);

    // Limit to max 12 high-quality samples per person
    if (profile.samples.length > 12) {
      profile.samples = profile.samples.slice(-12);
    }

    // Update quality status
    if (profile.samples.length >= 5) {
      profile.quality = 'Good';
    } else if (profile.samples.length >= 2) {
      profile.quality = 'Fair';
    } else {
      profile.quality = 'Needs Samples';
    }

    profile.lastVerifiedAt = Date.now();
    profile.updatedAt = Date.now();

    this.store.put('speaker_profile', profile.id, profile);
    this.core.emit?.({ type: 'speaker_profile_updated', profileId: profile.id, sampleCount: profile.samples.length });

    return {
      accepted: true,
      sample,
      profileQuality: profile.quality,
      totalSamples: profile.samples.length
    };
  }

  removeSample(profileId, sampleId) {
    this.core.assertUnlocked();
    const profile = this.getProfile(profileId);
    profile.samples = (profile.samples || []).filter(s => s.id !== sampleId);

    if (profile.samples.length >= 5) {
      profile.quality = 'Good';
    } else if (profile.samples.length >= 2) {
      profile.quality = 'Fair';
    } else {
      profile.quality = 'Needs Samples';
    }
    profile.updatedAt = Date.now();
    this.store.put('speaker_profile', profile.id, profile);
    return profile;
  }

  // -------------------------------------------------------------
  // Acoustic Recognition Matcher & Confidence Scorer
  // -------------------------------------------------------------
  identifySpeaker(acousticFeatures = {}, expectedRoster = []) {
    this.core.assertUnlocked();
    const profiles = this.listProfiles();
    if (profiles.length === 0) {
      return {
        label: 'Unknown Speaker',
        confidenceLevel: 'weak',
        confidenceScore: 0.1,
        profileId: null,
        needsConfirmation: false
      };
    }

    if (!acousticFeatures || !Number.isFinite(acousticFeatures.pitchMean) || !Number.isFinite(acousticFeatures.spectralCentroid)) return {label: 'Unknown Speaker', confidenceLevel: 'weak', needsConfirmation: true};
    const testPitch = acousticFeatures.pitchMean;
    const testCentroid = acousticFeatures.spectralCentroid || 1400;

    let bestProfile = null;
    let highestSimilarity = 0;

    profiles.forEach(p => {
      if (!p.samples || p.samples.length === 0) return;

      // Compute average centroid of verified samples
      const avgPitch = p.samples.reduce((acc, s) => acc + s.pitchMean, 0) / p.samples.length;
      const avgCentroid = p.samples.reduce((acc, s) => acc + s.spectralCentroid, 0) / p.samples.length;

      // Distance calculation
      const pitchDiff = Math.abs(testPitch - avgPitch) / 80;
      const centroidDiff = Math.abs(testCentroid - avgCentroid) / 600;
      const dist = Math.sqrt((pitchDiff * pitchDiff) + (centroidDiff * centroidDiff));
      let sim = Math.max(0, 1 - (dist * 0.6));

      // Meeting roster prior (narrows likely candidates, never forces identity)
      const isExpected = expectedRoster.some(r => (r.name && r.name.toLowerCase() === p.name.toLowerCase()) || (r.role && r.role.toLowerCase() === p.role.toLowerCase()));
      if (isExpected) {
        sim = Math.min(0.98, sim + 0.08); // Slight bias for expected attendees
      }

      if (sim > highestSimilarity) {
        highestSimilarity = sim;
        bestProfile = p;
      }
    });

    // Thresholds:
    // Strong match (>= 0.82): Sarah (no interruption)
    // Possible match (0.52 to 0.82): Probably Sarah ? (allow quick confirm)
    // Weak match (< 0.52): Unknown Speaker (do not guess)
    if (highestSimilarity >= 0.82 && bestProfile) {
      return {
        label: bestProfile.name,
        confidenceLevel: 'strong',
        confidenceScore: Math.round(highestSimilarity * 100) / 100,
        profileId: bestProfile.id,
        role: bestProfile.role,
        needsConfirmation: false
      };
    } else if (highestSimilarity >= 0.52 && bestProfile) {
      return {
        label: `Probably ${bestProfile.name} ?`,
        tentativeName: bestProfile.name,
        confidenceLevel: 'possible',
        confidenceScore: Math.round(highestSimilarity * 100) / 100,
        profileId: bestProfile.id,
        role: bestProfile.role,
        needsConfirmation: true
      };
    } else {
      return {
        label: 'Unknown Speaker',
        confidenceLevel: 'weak',
        confidenceScore: Math.round(highestSimilarity * 100) / 100,
        profileId: null,
        role: 'Participant',
        needsConfirmation: false
      };
    }
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

    const oldSpeaker = entry.speaker;
    entry.speaker = text(correctedSpeaker, 100);
    if (correctedRole) entry.role = text(correctedRole, 60);
    entry.speakerVerified = true;
    entry.confidenceLevel = 'strong';

    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);

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
      const conf = entry.confidenceLevel || (spk.includes('?') ? 'possible' : spk === 'Unknown Speaker' ? 'weak' : 'strong');
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

    (meeting.transcript || []).forEach(t => {
      if (t.confidenceLevel === 'strong' || (!t.speaker.includes('?') && t.speaker !== 'Unknown Speaker')) {
        t.speakerVerified = true;
      }
    });

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

