import {LocalRecognition} from "./local-recognition.mjs";
// Private AI — Real-Time Full-Duplex Conversational Voice Subsystem (GPT-Live-1 Architecture)
// Features: Full-Duplex Audio, Turn Detection (Auto/Patient/Normal/Fast), Barge-In / Interruption Engine,
// Ghost-Context Elimination, Audio Playback Queue, Separation of Conversation vs Task Intelligence,
// Live Translation Mode, WebRTC/Local Provider Abstraction, and Voice HUD State Machine.

export const TurnDetectionMode = {
  AUTO: 'auto',
  PATIENT: 'patient',
  NORMAL: 'normal',
  FAST: 'fast',
  MANUAL: 'manual', // Push-to-Talk
};

export const VoiceMood = {
  PROFESSIONAL: 'professional',
  EMPATHETIC: 'empathetic',
  CONCISE: 'concise',
};

export const VoiceAccent = {
  AMERICAN: 'american',
  BRITISH: 'british',
  AUSTRALIAN: 'australian',
  CANADIAN: 'canadian',
  IRISH: 'irish',
};

export const LiveVoiceState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  USER_SPEAKING: 'user_speaking',
  TURN_EVALUATION: 'turn_evaluation',
  THINKING: 'thinking',
  AI_SPEAKING: 'speaking',
  INTERRUPTED: 'interrupted',
  TOOL_RUNNING: 'tool_running',
  WAITING_FOR_USER: 'waiting_for_user',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
  MUTED: 'muted',
  CLOSED: 'closed',
};

// Common incomplete connector phrases indicating human is still pausing/thinking
const INCOMPLETE_PHRASES = /\b(and|or|but|because|if|when|while|although|though|so|then|that|which|with|about|like|um|uh|er|ah|let me think|wait|hold on|hang on|for example)\s*$/i;

export class VoiceManager {
  constructor({ onSend, onStateChange, onTranscript, onStatusNotice, getState, getChat, callApi, canCapture = () => true }) {
    this.onSend = onSend;
    this.onStateChange = onStateChange;
    this.onTranscript = onTranscript;
    this.onStatusNotice = onStatusNotice;
    this.getState = getState;
    this.getChat = getChat;
    this.callApi = callApi;
    this.canCapture = canCapture;
    this.listeningRequested = false;
    this.voiceGeneration = 0;
    this.captureGeneration = 0;

    // Operational Settings
    this.mode = 'handsfree'; // 'handsfree' | 'ptt' | 'always'
    this.turnPatience = TurnDetectionMode.NORMAL; // 'auto' | 'patient' | 'normal' | 'fast' | 'manual'
    this.isHardMuted = false;
    this.state = LiveVoiceState.IDLE;
    this.statusMessage = '';
    this.activeAgentId = '';
    this.voiceProfile = 'nova';
    this.voiceMood = VoiceMood.PROFESSIONAL;
    this.voiceAccent = VoiceAccent.AMERICAN;
    this.speechRate = 1.0;
    this.speechPitch = 1.0;
    this.ttsEnabled = true;

    // Mood / Personality Configurations
    this.moodConfigs = {
      [VoiceMood.PROFESSIONAL]: {
        id: VoiceMood.PROFESSIONAL,
        name: 'Professional',
        desc: 'Polished, authoritative & objective',
        pitchMultiplier: 1.0,
        rateMultiplier: 1.0,
        promptDirective: '[Voice Personality Mood: Professional. Respond with a polished, respectful, objective, and authoritative tone suitable for professional healthcare and administrative operations. Maintain calm poise, clear structure, and professional assurance.]',
      },
      [VoiceMood.EMPATHETIC]: {
        id: VoiceMood.EMPATHETIC,
        name: 'Empathetic',
        desc: 'Warm, caring & compassionate',
        pitchMultiplier: 1.04,
        rateMultiplier: 0.96,
        promptDirective: '[Voice Personality Mood: Empathetic. Respond with a warm, caring, patient, and compassionate tone. Acknowledge emotional context with understanding and validation, while keeping guidance constructive, supportive, and reassuring.]',
      },
      [VoiceMood.CONCISE]: {
        id: VoiceMood.CONCISE,
        name: 'Concise',
        desc: 'Direct, brief & to the point',
        pitchMultiplier: 1.0,
        rateMultiplier: 1.12,
        promptDirective: '[Voice Personality Mood: Concise. Respond with direct, succinct, and efficient answers. Deliver essential information immediately in brief, clear spoken sentences without pleasantries, preamble, or unnecessary filler.]',
      },
    };

    // Clear Accents Configurations (Easily understandable, native regional diction)
    this.accentConfigs = {
      [VoiceAccent.AMERICAN]: {
        id: VoiceAccent.AMERICAN,
        name: 'American',
        label: 'American (Clear General US)',
        desc: 'Clear General American accent',
        langPrefixes: ['en-US', 'en'],
        namePatterns: [/united states|us english|general|samantha|zira|david|mark|eva/i],
        promptDirective: '[Spoken Accent / Diction: Clear General American. Maintain clean, natural enunciation without heavy regionalisms.]',
      },
      [VoiceAccent.BRITISH]: {
        id: VoiceAccent.BRITISH,
        name: 'British',
        label: 'British (Clear RP / UK)',
        desc: 'Clear Received Pronunciation / British accent',
        langPrefixes: ['en-GB', 'en-UK'],
        namePatterns: [/united kingdom|uk english|great britain|british|george|serena|daniel|hazel|oliver|stephanie/i],
        promptDirective: '[Spoken Accent / Diction: Clear British English. Maintain crisp, natural Received Pronunciation without obscure slang.]',
      },
      [VoiceAccent.AUSTRALIAN]: {
        id: VoiceAccent.AUSTRALIAN,
        name: 'Australian',
        label: 'Australian (Clear AU)',
        desc: 'Clear Australian accent',
        langPrefixes: ['en-AU'],
        namePatterns: [/australia|australian|catherine|russell|karen|lee/i],
        promptDirective: '[Spoken Accent / Diction: Clear Australian English. Maintain clean, accessible, and intelligible enunciation.]',
      },
      [VoiceAccent.CANADIAN]: {
        id: VoiceAccent.CANADIAN,
        name: 'Canadian',
        label: 'Canadian (Clear CA)',
        desc: 'Clear Canadian accent',
        langPrefixes: ['en-CA'],
        namePatterns: [/canada|canadian|heather|linda/i],
        promptDirective: '[Spoken Accent / Diction: Clear Canadian English. Maintain clean, natural, and standard enunciation.]',
      },
      [VoiceAccent.IRISH]: {
        id: VoiceAccent.IRISH,
        name: 'Irish',
        label: 'Irish (Clear IE)',
        desc: 'Clear Irish accent',
        langPrefixes: ['en-IE'],
        namePatterns: [/ireland|irish|moira|emily/i],
        promptDirective: '[Spoken Accent / Diction: Clear Irish English. Maintain gentle, clean, and universally accessible enunciation.]',
      },
    };

    // Live Translation Mode
    this.liveTranslation = false;
    this.translationSourceLang = 'auto';
    this.translationTargetLang = 'Spanish';

    // Provider config
    this.activeProvider = 'local'; // 'local' | 'openai-realtime'
    this.realtimePeerConnection = null;
    this.realtimeDataChannel = null;

    // Timing & Turn Detection Thresholds (in ms)
    this.patienceThresholds = {
      [TurnDetectionMode.PATIENT]: 2200,
      [TurnDetectionMode.NORMAL]: 1250,
      [TurnDetectionMode.FAST]: 680,
      [TurnDetectionMode.AUTO]: 1200,
      [TurnDetectionMode.MANUAL]: 999999,
    };

    // Audio & Recognition handles
    this.recognition = null;
    this.mediaStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.animFrameId = null;
    this.silenceTimer = null;
    this.isPttHolding = false;
    this.micVolume = 0;
    this.lastSpeechStartTime = 0;
    this.speechSampleCount = 0;

    // Transcripts
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.lastRecognizedText = '';

    // Full-Duplex Interruption & Ghost Context Metrics
    this.assistantGeneratedAudioMs = 0;
    this.assistantPlayedAudioMs = 0;
    this.assistantGeneratedText = '';
    this.assistantHeardText = '';
    this.lastSpokenCharIndex = 0;
    this.wasInterrupted = false;
    this.interruptedContext = null;

    // Streaming Audio Playback Queue
    this.playbackQueue = [];
    this.isQueuePlaying = false;
    this.currentUtterance = null;
    this.currentPlayingChunk = null;
    this.speechStartTime = 0;
    this.availableVoices = [];

    // Voice Profiles & Presets
    this.voicePresets = {
      nova: { name: 'Nova', desc: 'Calm, balanced & natural', pitch: 1.0, rate: 1.05, preferredGenders: ['female', 'neutral'] },
      atlas: { name: 'Atlas', desc: 'Deep, deliberate & authoritative', pitch: 0.85, rate: 0.95, preferredGenders: ['male'] },
      sage: { name: 'Sage', desc: 'Warm, clear & clinical precision', pitch: 1.05, rate: 1.0, preferredGenders: ['female', 'neutral'] },
      breeze: { name: 'Breeze', desc: 'Fast, expressive & conversational', pitch: 1.15, rate: 1.15, preferredGenders: ['neutral', 'female'] },
    };

    this.initSpeechSynthesis();
    this.initRecognition();
    this.setupKeyboardShortcuts();
  }

  // --- Speech Synthesis & Voice Presets ---

  initSpeechSynthesis() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      this.availableVoices = (window.speechSynthesis.getVoices() || []).filter(v=>v.localService===true);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  getBestVoiceForPreset(presetKey, accentKey) {
    if (!this.availableVoices.length && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = (window.speechSynthesis.getVoices() || []).filter(v=>v.localService===true);
    }
    const preset = this.voicePresets[presetKey] || this.voicePresets.nova;
    const voices = this.availableVoices.filter(v=>v.localService===true);
    if (!voices.length) return null;

    const enVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
    const pool = enVoices.length ? enVoices : voices;

    const accent = this.accentConfigs[accentKey || this.voiceAccent] || this.accentConfigs.american;

    // Filter by accent language prefix first (e.g., 'en-GB', 'en-AU', 'en-CA', 'en-IE', 'en-US')
    let accentPool = voices.filter(v => v.lang && accent.langPrefixes.some(p => v.lang.toLowerCase().startsWith(p.toLowerCase())));

    // Also check voice name patterns for accent if language tag wasn't specific
    if (!accentPool.length && accent.namePatterns) {
      accentPool = voices.filter(v => accent.namePatterns.some(pattern => pattern.test(v.name)));
    }

    // Target pool prioritizes matching accent, falling back to all English, then all voices
    const targetPool = accentPool.length ? accentPool : pool;

    if (presetKey === 'atlas') {
      const match = targetPool.find(v => /male|david|george|daniel|guy|mark|james|alex/i.test(v.name) && !/female/i.test(v.name));
      if (match) return match;
    } else if (presetKey === 'sage') {
      const match = targetPool.find(v => /natural|aria|samantha|karen|susan|catherine|serena/i.test(v.name));
      if (match) return match;
    } else if (presetKey === 'breeze') {
      const match = targetPool.find(v => /natural|jenny|victoria|breeze|steffi|fiona/i.test(v.name));
      if (match) return match;
    } else if (presetKey === 'cove') {
      const match = targetPool.find(v => /cove|oliver|tom|richard|michael|brian/i.test(v.name));
      if (match) return match;
    } else {
      // Nova default
      const match = targetPool.find(v => /natural|google|zira|samantha|karen|eva/i.test(v.name));
      if (match) return match;
    }
    return targetPool[0] || pool[0];
  }

  // --- Recognition & Turn Detection ---

  initRecognition() {
    if (typeof window === 'undefined') return;
    try {
      const rec = new LocalRecognition({api:this.callApi,allowed:()=>this.recognitionAllowed()});
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = 'en-US';

      rec.onstart = () => {
        if (!this.listeningRequested || !this.recognitionAllowed()) { this.endSession(); return; }
        if (!this.isHardMuted) {
          if (this.state !== LiveVoiceState.AI_SPEAKING && this.state !== LiveVoiceState.THINKING) {
            this.setState(LiveVoiceState.LISTENING, 'Listening for your voice…');
          }
        }
      };

      rec.onspeechstart = () => {
        this.lastSpeechStartTime = Date.now();
        this.speechSampleCount = 0;
      };

      rec.onresult = (event) => {
        if (!this.listeningRequested || !this.recognitionAllowed()) { this.endSession(); return; }

        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcript = res[0].transcript;
          if (res.isFinal) {
            finalChunk += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        const candidateSpeech = (this.finalTranscript + ' ' + finalChunk + ' ' + interim).trim();

        // Check if user spoke enough content to constitute genuine speech vs a brief microphone click or cough
        const speechDurationMs = Date.now() - (this.lastSpeechStartTime || Date.now());
        const hasSubstantialText = (finalChunk + interim).trim().length >= 2 || speechDurationMs > 250;

        // Barge-In Detection: User speaks while assistant is generating or speaking audio!
        if (hasSubstantialText && (this.state === LiveVoiceState.AI_SPEAKING || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking))) {
          this.interruptSpeech(true);
        }

        if (finalChunk) {
          this.finalTranscript += finalChunk;
        }
        this.interimTranscript = interim;

        if (hasSubstantialText && this.state !== LiveVoiceState.USER_SPEAKING && this.state !== LiveVoiceState.AI_SPEAKING) {
          this.setState(LiveVoiceState.USER_SPEAKING, 'Hearing your speech…');
        }

        this.emitTranscriptUpdate();

        // Hands-Free & Always Listening turn taking
        if (this.mode === 'handsfree' || this.mode === 'always') {
          this.evaluateTurnCompletion(candidateSpeech);
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'no-speech') {
          return;
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.endSession();
          this.setState(LiveVoiceState.MUTED, 'Microphone permission blocked or denied.');
          return;
        }
        this.endSession();this.setState(LiveVoiceState.ERROR,event.message||'Local speech is unavailable. Set up local transcription in Meetings.');
      };

      rec.onend = () => {
        if (!this.recognitionAllowed()) { if (this.listeningRequested) this.endSession(); return; }
        if (this.listeningRequested && (this.mode === 'always' || this.mode === 'handsfree') && this.state !== LiveVoiceState.THINKING) {
          try {
            rec.start();
          } catch (e) {
            // Already active or transitioning
          }
        } else if (this.state === LiveVoiceState.LISTENING && this.mode === 'ptt') {
          this.setState(LiveVoiceState.IDLE, 'Ready');
        }
      };

      this.recognition = rec;
    } catch (err) {
      this.setState(LiveVoiceState.ERROR,'Local speech could not be initialized.');
    }
  }

  evaluateTurnCompletion(candidateText) {
    this.cancelSilenceTimer();

    // Determine silence duration based on Turn Detection patience mode
    let silenceDurationMs = this.patienceThresholds[this.turnPatience] || this.patienceThresholds[TurnDetectionMode.NORMAL];

    // Semantic pause adjustment: If the user ended on a conjunction or connector ("and...", "or...", "let me think..."), give them extra room to finish their thought!
    if (INCOMPLETE_PHRASES.test(candidateText.trim())) {
      silenceDurationMs = Math.max(silenceDurationMs, 2400);
      this.setState(LiveVoiceState.TURN_EVALUATION, 'Waiting for you to complete your thought…');
    } else {
      this.setState(LiveVoiceState.TURN_EVALUATION, 'Evaluating natural conversational turn…');
    }

    this.silenceTimer = setTimeout(() => {
      const fullText = (this.finalTranscript + ' ' + this.interimTranscript).trim();
      if (fullText.length > 0) {
        this.dispatchCurrentTranscript();
      } else {
        this.setState(LiveVoiceState.LISTENING, 'Listening…');
      }
    }, silenceDurationMs);
  }

  cancelSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  setupKeyboardShortcuts() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Spacebar for Push-to-Talk when enabled and outside inputs
      if (e.code === 'Space' && this.mode === 'ptt' && !this.isHardMuted) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isInput && !this.isPttHolding) {
          e.preventDefault();
          this.startPtt();
        }
      }

      // Quick Hard Mute: Alt+M or Ctrl+M
      if (e.key === 'm' || e.key === 'M') {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isInput && (e.ctrlKey || e.altKey)) {
          e.preventDefault();
          this.toggleHardMute();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && this.mode === 'ptt' && this.isPttHolding) {
        e.preventDefault();
        this.stopPtt();
      }
    });
  }

  // --- Audio Capture & Visualizer with Echo Cancellation ---

  async startAudioVisualizer(canvas) {
    // Reuse local recognizer measurements; do not open a second microphone.
    if(!canvas?.getContext||!this.recognitionAllowed())return;
    const ctx=canvas.getContext('2d');
    const draw=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#3154c8';const h=Math.max(2,(this.recognition?.level||0)*canvas.height);ctx.fillRect(0,(canvas.height-h)/2,canvas.width,h);if(this.listeningRequested)this.animFrameId=requestAnimationFrame(draw);};draw();
  }

  stopAudioVisualizer() {
    this.captureGeneration++;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    this.analyser = null;
  }

  // --- Operational State & Mode Management ---

  setMode(newMode) {
    this.mode = newMode;
    this.cancelSilenceTimer();
    this.stopListening();

    if (!this.isHardMuted) {
      if (newMode === 'always' || newMode === 'handsfree') {
        this.startListening();
      } else {
        this.setState(LiveVoiceState.IDLE, 'Ready');
      }
    }
    this.notifyState();
  }

  setTurnPatience(patienceMode) {
    this.turnPatience = patienceMode;
    this.notifyState();
  }

  setVoiceMood(mood) {
    if (this.moodConfigs[mood]) {
      this.voiceMood = mood;
      this.notifyState();
    }
  }

  setVoiceAccent(accent) {
    if (this.accentConfigs[accent]) {
      this.voiceAccent = accent;
      this.notifyState();
    }
  }

  toggleHardMute() {
    this.isHardMuted = !this.isHardMuted;

    if (this.isHardMuted) {
      this.stopListening();
      this.stopAudioVisualizer();
      this.flushPlaybackQueue();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      this.setState(LiveVoiceState.MUTED, 'HARD MUTED — Microphone hardware disconnected');
    } else {
      this.setState(LiveVoiceState.IDLE, 'Ready');
      if (this.mode === 'always' || this.mode === 'handsfree') {
        this.startListening();
      }
    }
    this.notifyState();
    return this.isHardMuted;
  }

  recognitionAllowed() {
    const policy=this.getState?.()?.settings;
    return !!(policy && typeof policy.processingMode === 'string' && !this.isHardMuted && this.canCapture());
  }

  enforcePolicy() {
    if (!this.recognitionAllowed()) this.endSession();
  }

  endSession() {
    this.stopListening();
    this.stopAudioVisualizer();
    this.isPttHolding = false;
    this.finalTranscript = this.interimTranscript = '';
    this.flushPlaybackQueue();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    this.currentUtterance = null;
  }

  startListening() {
    if(!this.recognitionAllowed()){
      this.endSession();
      this.setState(LiveVoiceState.ERROR,'Voice capture is unavailable while the app is locked, muted or its settings are unavailable.');return;
    }
    if (!this.recognition) {
      this.endSession();
      this.setState(LiveVoiceState.ERROR, 'Speech recognition is unavailable in this app or browser. Use typed input.');
      return;
    }
    this.listeningRequested = true;
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.emitTranscriptUpdate();

    this.setState(LiveVoiceState.LISTENING, 'Preparing local speech…');
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (e) {
        // Recognition already active
      }
    }
  }

  stopListening({pause = false} = {}) {
    if (!pause) { this.listeningRequested = false; this.voiceGeneration++; }
    this.cancelSilenceTimer();
    if (this.recognition) {
      try {
        if (pause) this.recognition.stop();
        else this.recognition.abort();
      } catch (e) {}
    }
    if (this.state === LiveVoiceState.LISTENING || this.state === LiveVoiceState.USER_SPEAKING) {
      this.setState(LiveVoiceState.IDLE, 'Ready');
    }
  }

  startPtt() {
    if (this.isHardMuted || this.isPttHolding) return;
    this.isPttHolding = true;
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      this.interruptSpeech(true);
    }
    this.startListening();
    this.notifyState();
  }

  async stopPtt() {
    if (!this.isPttHolding) return;
    this.isPttHolding = false;
    await this.recognition?.stop();
    this.notifyState();

    const generation = this.voiceGeneration;
    setTimeout(() => {
      if (generation === this.voiceGeneration && this.recognitionAllowed()) this.dispatchCurrentTranscript();
    }, 120);
  }

  emitTranscriptUpdate() {
    const text = (this.finalTranscript + ' ' + this.interimTranscript).trim();
    if (this.onTranscript) {
      this.onTranscript({
        fullText: text,
        interim: this.interimTranscript,
        final: this.finalTranscript,
        isInterim: !!this.interimTranscript,
      });
    }
  }

  async dispatchTranscriptExplicit(text) {
    if (!text || this.state === LiveVoiceState.THINKING) return;
    this.finalTranscript = text;
    this.interimTranscript = '';
    await this.dispatchCurrentTranscript();
  }

  // --- Conversational Intelligence & Brain Router Dispatch ---

  async dispatchCurrentTranscript() {
    if (!(this.finalTranscript + this.interimTranscript).trim() || this.dispatching || this.state === LiveVoiceState.THINKING) return;
    const generation = this.voiceGeneration;
    this.dispatching = true;
    this.cancelSilenceTimer();
    try { await this.recognition?.stop(); }
    finally { this.dispatching = false; }
    if (generation !== this.voiceGeneration || !this.recognitionAllowed()) return;
    const text = (this.finalTranscript + ' ' + this.interimTranscript).trim();
    if (!text) return;
    this.cancelSilenceTimer();
    this.setState(LiveVoiceState.THINKING, 'Preparing response locally…');
    this.lastRecognizedText = text;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.emitTranscriptUpdate();

    try {
      const state = this.getState ? this.getState() : {};

      // 1. Check for Actionable Tool / Delegated Request
      const isToolRequest = /\b(calendar|schedule|meeting|appointment|email|whatsapp|census|staffing|overtime|sbar|fall incident|report|export|file|search)\b/i.test(text);

      if (isToolRequest) {
        this.setState(LiveVoiceState.TOOL_RUNNING, 'Executing tool / intelligence playbook…');
        if (this.onStatusNotice) {
          this.onStatusNotice(`Analyzing task: ${text}`);
        }
      }

      // 2. Handle Interruption Context vs Continuation (Ghost Context Elimination)
      const isContinuation = /^(continue|go on|keep going|what were you saying|finish|proceed|tell me more|yes continue|and then|finish your thought)/i.test(text.trim());

      let conversationalPrefix = '';
      if (this.wasInterrupted && this.interruptedContext) {
        if (isContinuation) {
          conversationalPrefix = `[Conversational Continuation: You were speaking when interrupted. You had reached: "${this.interruptedContext.heardText}". The user says: "${text}". Please smoothly continue from that exact thought without repeating what was already spoken.]\n\n`;
        } else {
          conversationalPrefix = `[Conversational Interruption: You were speaking: "${this.interruptedContext.heardText}". The user interrupted and changed direction to: "${text}". Address their new instruction directly and naturally without apologizing for the interruption.]\n\n`;
        }
        this.wasInterrupted = false;
        this.interruptedContext = null;
      }

      // 3. Live Translation Mode Prompt Decorator
      let liveTranslationPrompt = '';
      if (this.liveTranslation && this.translationTargetLang) {
        liveTranslationPrompt = `[Live Spoken Translation Mode: Translate the user's spoken words into natural, fluent ${this.translationTargetLang}. Provide the direct translation first followed by a concise spoken response.]\n\n`;
      }

      // 4. Voice Mood / Personality Configuration Layer
      const moodConfig = this.moodConfigs[this.voiceMood] || this.moodConfigs.professional;
      const moodPrompt = moodConfig.promptDirective ? `${moodConfig.promptDirective}\n\n` : '';

      // 5. Clear Spoken Accent Configuration Layer
      const accentConfig = this.accentConfigs[this.voiceAccent] || this.accentConfigs.american;
      const accentPrompt = accentConfig.promptDirective ? `${accentConfig.promptDirective}\n\n` : '';

      let prompt = liveTranslationPrompt + moodPrompt + accentPrompt + conversationalPrefix + text;

      // 6. Role / Agent Instruction Layer
      if (this.activeAgentId && state.agents) {
        const agent = state.agents.find((a) => a.id === this.activeAgentId);
        if (agent && agent.prompt) {
          prompt = `[Role Instruction: ${agent.prompt}]\n\n${prompt}`;
        }
      }

      // 5. Send to Private AI Pipeline & Stream Response Chunks
      if (this.onSend) {
        const result = await this.onSend({
          prompt,
          rawVoiceText: text,
          agentId: this.activeAgentId || null,
          onStreamChunk: (chunk) => {
            // Streaming sentence-level speech playback as tokens generate
            if (generation === this.voiceGeneration) this.handleStreamResponseChunk(chunk);
          },
        });

        if (generation !== this.voiceGeneration) return;
        // Assistant response speech
        if (result && result.text && this.ttsEnabled && !this.isHardMuted) {
          // If streaming chunks didn't already consume the full text, speak response
          if (this.playbackQueue.length === 0 && !this.isQueuePlaying) {
            await this.speakResponse(result.text);
          }
        } else {
          this.resumeListeningAfterResponse();
        }
      } else {
        this.resumeListeningAfterResponse();
      }
    } catch (err) {
      // Error text is handled by the protected UI; do not log voice content.
      this.setState(LiveVoiceState.IDLE, err.message);
      this.resumeListeningAfterResponse();
    }
  }

  resumeListeningAfterResponse() {
    if (this.listeningRequested && this.recognitionAllowed() && (this.mode === 'always' || this.mode === 'handsfree')) {
      const generation = this.voiceGeneration;
      setTimeout(() => {
        if (generation === this.voiceGeneration && this.listeningRequested && this.recognitionAllowed() && this.state !== LiveVoiceState.AI_SPEAKING) {
          this.startListening();
        }
      }, 350);
    } else {
      this.setState(LiveVoiceState.IDLE, 'Ready');
    }
  }

  // --- Text Preprocessing & Cleaning ---

  cleanTextForSpeech(text) {
    if (!text) return '';
    return text
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~#]/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // --- Streaming Audio Playback Queue & Chunking ---

  handleStreamResponseChunk(delta) {
    if (!delta || !this.ttsEnabled || this.isHardMuted) return;
    this.streamBuffer = (this.streamBuffer || '') + delta;

    // Sentence/clause boundary detection: ., !, ?, ;\n
    const match = this.streamBuffer.match(/(.*?([.!?\n]+|\.{3}))(\s+|$)/);
    if (match) {
      const sentence = match[1].trim();
      this.streamBuffer = this.streamBuffer.slice(match[0].length);
      if (sentence.length > 2) {
        this.enqueueAudioChunk(sentence);
      }
    }
  }

  enqueueAudioChunk(textChunk) {
    const clean = this.cleanTextForSpeech(textChunk);
    if (!clean) return;

    const chunk = {
      id: 'chunk_' + Math.random().toString(36).slice(2, 9),
      text: clean,
      rawText: textChunk,
      timestamp: Date.now(),
      status: 'queued',
    };

    this.playbackQueue.push(chunk);
    if (!this.isQueuePlaying) {
      this.processPlaybackQueue();
    }
  }

  async processPlaybackQueue() {
    if (this.isQueuePlaying || this.playbackQueue.length === 0 || this.isHardMuted) return;
    this.isQueuePlaying = true;

    while (this.playbackQueue.length > 0 && !this.isHardMuted) {
      const chunk = this.playbackQueue.shift();
      this.currentPlayingChunk = chunk;
      chunk.status = 'playing';

      try {
        await this.speakUtteranceChunk(chunk.text);
        chunk.status = 'played';
      } catch (e) {
        chunk.status = 'cancelled';
        break;
      }
    }

    this.isQueuePlaying = false;
    this.currentPlayingChunk = null;

    if (this.state === LiveVoiceState.AI_SPEAKING) {
      this.resumeListeningAfterResponse();
    }
  }

  speakUtteranceChunk(cleanText) {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !this.ttsEnabled || this.isHardMuted) {
        return resolve();
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voice = this.getBestVoiceForPreset(this.voiceProfile, this.voiceAccent);
      const policy=this.getState?.()?.settings;
      if(!policy || voice?.localService!==true)return resolve();
      if (voice) utterance.voice = voice;

      const preset = this.voicePresets[this.voiceProfile] || this.voicePresets.nova;
      const mood = this.moodConfigs[this.voiceMood] || this.moodConfigs.professional;
      utterance.rate = this.speechRate * (preset.rate || 1.0) * (mood.rateMultiplier || 1.0);
      utterance.pitch = this.speechPitch * (preset.pitch || 1.0) * (mood.pitchMultiplier || 1.0);

      this.currentUtterance = utterance;
      this.assistantGeneratedText = cleanText;
      this.speechStartTime = Date.now();
      this.setState(LiveVoiceState.AI_SPEAKING, 'Speaking… (speak to barge in)');

      utterance.onboundary = (e) => {
        if (e.name === 'word' || typeof e.charIndex === 'number') {
          this.lastSpokenCharIndex = e.charIndex;
        }
      };

      utterance.onend = () => {
        this.assistantPlayedAudioMs += Date.now() - this.speechStartTime;
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (e) => {
        this.currentUtterance = null;
        if (e.error === 'interrupted' || e.error === 'canceled') {
          reject(new Error('interrupted'));
        } else {
          resolve();
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  speakResponse(fullText) {
    this.flushPlaybackQueue();
    const clean = this.cleanTextForSpeech(fullText);
    if (!clean) {
      this.resumeListeningAfterResponse();
      return Promise.resolve();
    }
    this.enqueueAudioChunk(clean);
    return Promise.resolve();
  }

  flushPlaybackQueue() {
    this.playbackQueue = [];
    this.streamBuffer = '';
    this.isQueuePlaying = false;
  }

  // --- Barge-In & Ghost Context Elimination ---

  interruptSpeech(byUserSpeech = false) {
    const isSpeaking = this.currentUtterance || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) || this.isQueuePlaying;

    if (isSpeaking) {
      // 1. Immediately cut off audio output
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.flushPlaybackQueue();

      // 2. Measure actual heard speech vs ghost context
      const charIdx = this.lastSpokenCharIndex || 0;
      const full = this.currentPlayingChunk ? this.currentPlayingChunk.text : this.assistantGeneratedText;
      const heard = full ? full.slice(0, Math.max(charIdx, 20)) : '';
      const unheard = full ? full.slice(Math.max(charIdx, 20)) : '';

      this.assistantHeardText = heard;
      this.wasInterrupted = true;
      this.interruptedContext = {
        heardText: heard,
        unheardText: unheard,
        fullText: full,
        timestamp: Date.now(),
      };

      this.currentUtterance = null;
      this.isQueuePlaying = false;

      // 3. Inform server to abort pending model stream if active
      if (this.callApi && this.getChat) {
        const c = this.getChat();
        if (c && c.id) {
          this.callApi('stop', { id: c.id }).catch(() => {});
        }
      }

      this.setState(LiveVoiceState.INTERRUPTED, 'Interrupted — listening to your follow-up…');

      setTimeout(() => {
        if (this.state === LiveVoiceState.INTERRUPTED) {
          this.setState(LiveVoiceState.USER_SPEAKING, 'Listening to your instruction…');
        }
      }, 280);

      if (!byUserSpeech) {
        this.resumeListeningAfterResponse();
      }
    }
  }

  // --- State Machine Dispatch ---

  setState(newState, statusMessage = '') {
    this.state = newState;
    this.statusMessage = statusMessage;
    this.notifyState();
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        state: this.state,
        mode: this.mode,
        turnPatience: this.turnPatience,
        isHardMuted: this.isHardMuted,
        isPttHolding: this.isPttHolding,
        voiceProfile: this.voiceProfile,
        voiceMood: this.voiceMood,
        voiceAccent: this.voiceAccent,
        activeAgentId: this.activeAgentId,
        ttsEnabled: this.ttsEnabled,
        liveTranslation: this.liveTranslation,
        translationTargetLang: this.translationTargetLang,
        statusMessage: this.statusMessage,
        micVolume: this.micVolume,
      });
    }
  }
}

