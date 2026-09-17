// Private AI Voice Subsystem — First-Class Voice Architecture
// Hands-free conversational, Push-to-Talk, Always Listening with Hard Mute, Streaming STT, and Multi-Voice TTS

export class VoiceManager {
  constructor({ onSend, onStateChange, getState, getChat }) {
    this.onSend = onSend;
    this.onStateChange = onStateChange;
    this.getState = getState;
    this.getChat = getChat;

    // Operational Settings
    this.mode = 'handsfree'; // 'ptt' | 'handsfree' | 'always'
    this.isHardMuted = false;
    this.state = 'idle'; // 'idle' | 'listening' | 'processing' | 'speaking' | 'muted'
    this.activeAgentId = '';
    this.voiceProfile = 'nova';
    this.speechRate = 1.0;
    this.speechPitch = 1.0;
    this.ttsEnabled = true;
    this.silenceThresholdMs = 1400; // ms of silence before auto-sending in handsfree/always mode

    // Audio & Recognition handles
    this.recognition = null;
    this.mediaStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.animFrameId = null;
    this.silenceTimer = null;
    this.isPttHolding = false;

    // Transcripts
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.lastRecognizedText = '';

    // TTS & Barge-in
    this.currentUtterance = null;
    this.availableVoices = [];

    // Presets definition
    this.voicePresets = {
      nova: { name: 'Nova', desc: 'Calm, balanced & natural', pitch: 1.0, rate: 1.05, preferredGenders: ['female', 'neutral'] },
      atlas: { name: 'Atlas', desc: 'Deep, deliberate & authoritative', pitch: 0.85, rate: 0.95, preferredGenders: ['male'] },
      sage: { name: 'Sage', desc: 'Warm, clear & clinical precision', pitch: 1.05, rate: 1.0, preferredGenders: ['female', 'neutral'] },
      breeze: { name: 'Breeze', desc: 'Fast, expressive & conversational', pitch: 1.15, rate: 1.15, preferredGenders: ['neutral', 'female'] }
    };

    this.initSpeechSynthesis();
    this.initRecognition();
    this.setupKeyboardShortcuts();
  }

  initSpeechSynthesis() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      this.availableVoices = window.speechSynthesis.getVoices() || [];
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  getBestVoiceForPreset(presetKey) {
    if (!this.availableVoices.length && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = window.speechSynthesis.getVoices() || [];
    }
    const preset = this.voicePresets[presetKey] || this.voicePresets.nova;
    const voices = this.availableVoices;
    if (!voices.length) return null;

    // Try finding exact English natural voices
    const enVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
    const pool = enVoices.length ? enVoices : voices;

    if (presetKey === 'atlas') {
      const match = pool.find(v => /male|david|george|daniel|guy|mark|james|alex/i.test(v.name) && !/female/i.test(v.name));
      if (match) return match;
    } else if (presetKey === 'sage') {
      const match = pool.find(v => /natural|aria|samantha|karen|susan|catherine|serena/i.test(v.name));
      if (match) return match;
    } else if (presetKey === 'breeze') {
      const match = pool.find(v => /natural|jenny|victoria|breeze|steffi|fiona/i.test(v.name));
      if (match) return match;
    } else {
      // Nova default
      const match = pool.find(v => /natural|google|zira|samantha|karen|eva/i.test(v.name));
      if (match) return match;
    }
    return pool[0];
  }

  initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not natively available in this browser environment.');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = 'en-US';

      rec.onstart = () => {
        if (!this.isHardMuted) {
          this.setState('listening');
        }
      };

      rec.onresult = (event) => {
        if (this.isHardMuted) return;

        // Barge-in check: If user speaks while assistant is talking, immediately cancel assistant speech!
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          this.setState('listening');
        }

        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (finalChunk) {
          this.finalTranscript += finalChunk;
        }
        this.interimTranscript = interim;
        this.emitTranscriptUpdate();

        // Hands-free & Always Listening: Auto-send on silence detection
        if (this.mode === 'handsfree' || this.mode === 'always') {
          this.resetSilenceTimer();
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Normal silence, continue listening if in handsfree/always
          return;
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.setState('muted', 'Microphone access blocked or denied.');
          return;
        }
        console.warn('SpeechRecognition error:', event.error);
      };

      rec.onend = () => {
        // Automatically restart listening if still in active listening mode and not hard muted
        if (!this.isHardMuted && (this.mode === 'always' || this.mode === 'handsfree') && this.state !== 'processing') {
          try {
            rec.start();
          } catch (e) {
            // Already active or restarting
          }
        } else if (this.state === 'listening' && this.mode === 'ptt') {
          this.setState('idle');
        }
      };

      this.recognition = rec;
    } catch (err) {
      console.warn('Error initializing SpeechRecognition:', err);
    }
  }

  setupKeyboardShortcuts() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Spacebar for Push-To-Talk when PTT is selected and user is NOT typing in an input/textarea
      if (e.code === 'Space' && this.mode === 'ptt' && !this.isHardMuted) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isInput && !this.isPttHolding) {
          e.preventDefault();
          this.startPtt();
        }
      }

      // Quick Mute hotkey: 'M' or 'Ctrl+M' when not in text input
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

  async startAudioVisualizer(canvas) {
    if (typeof window === 'undefined' || !canvas || this.isHardMuted) return;
    try {
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const ctx = canvas.getContext('2d');

      const draw = () => {
        if (!this.analyser || this.isHardMuted) {
          // Flatline when hard muted or inactive
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = this.isHardMuted ? '#e13c3c' : '#8a99b5';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
          return;
        }

        this.animFrameId = requestAnimationFrame(draw);
        this.analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.max(4, (dataArray[i] / 255) * (canvas.height - 8));
          
          let fill = '#3154c8';
          if (this.state === 'listening') {
            fill = '#10b981'; // Emerald
          } else if (this.state === 'speaking') {
            fill = '#6366f1'; // Indigo
          } else if (this.state === 'processing') {
            fill = '#f59e0b'; // Amber
          }

          ctx.fillStyle = fill;
          const y = (canvas.height - barHeight) / 2;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(x, y, barWidth - 2, barHeight, 2) : ctx.rect(x, y, barWidth - 2, barHeight);
          ctx.fill();

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.warn('Could not initialize audio visualizer microphone stream:', err);
    }
  }

  stopAudioVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
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
        this.setState('idle');
      }
    }
    this.notifyState();
  }

  toggleHardMute() {
    this.isHardMuted = !this.isHardMuted;

    if (this.isHardMuted) {
      // Physical cut of all audio streams
      this.stopListening();
      this.stopAudioVisualizer();
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      this.setState('muted', 'HARD MUTED — Microphone hardware disconnected');
    } else {
      this.setState('idle');
      if (this.mode === 'always' || this.mode === 'handsfree') {
        this.startListening();
      }
    }
    this.notifyState();
    return this.isHardMuted;
  }

  startListening() {
    if (this.isHardMuted) return;
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.emitTranscriptUpdate();

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (e) {
        // Recognition already active
      }
    }
    this.setState('listening');
  }

  stopListening() {
    this.cancelSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    if (this.state === 'listening') {
      this.setState('idle');
    }
  }

  startPtt() {
    if (this.isHardMuted || this.isPttHolding) return;
    this.isPttHolding = true;
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    this.startListening();
    this.notifyState();
  }

  stopPtt() {
    if (!this.isPttHolding) return;
    this.isPttHolding = false;
    this.stopListening();
    this.notifyState();

    // Trigger dispatch of whatever was captured
    setTimeout(() => {
      this.dispatchCurrentTranscript();
    }, 150);
  }

  resetSilenceTimer() {
    this.cancelSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      const fullText = (this.finalTranscript + ' ' + this.interimTranscript).trim();
      if (fullText.length > 1) {
        this.dispatchCurrentTranscript();
      }
    }, this.silenceThresholdMs);
  }

  cancelSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  emitTranscriptUpdate() {
    const text = (this.finalTranscript + ' ' + this.interimTranscript).trim();
    if (this.onTranscript) {
      this.onTranscript({
        fullText: text,
        interim: this.interimTranscript,
        final: this.finalTranscript
      });
    }
  }

  async dispatchCurrentTranscript() {
    const text = (this.finalTranscript + ' ' + this.interimTranscript).trim();
    if (!text || this.state === 'processing') return;

    this.cancelSilenceTimer();
    this.stopListening();
    this.setState('processing', 'Routing to AI engine...');
    this.lastRecognizedText = text;
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.emitTranscriptUpdate();

    try {
      // Route through the existing Private AI router with selected Agent context
      const chat = this.getChat ? this.getChat() : null;
      const state = this.getState ? this.getState() : {};
      
      let prompt = text;
      // If an autonomous agent is selected in Voice HUD, layer the agent's instructions
      if (this.activeAgentId && state.agents) {
        const agent = state.agents.find(a => a.id === this.activeAgentId);
        if (agent && agent.prompt) {
          prompt = `[Role Instruction: ${agent.prompt}]\n\nUser Question: ${text}`;
        }
      }

      if (this.onSend) {
        const result = await this.onSend({
          prompt,
          rawVoiceText: text,
          agentId: this.activeAgentId || null
        });

        // Assistant response handling
        if (result && result.text && this.ttsEnabled && !this.isHardMuted) {
          await this.speakResponse(result.text);
        } else {
          this.resumeListeningAfterResponse();
        }
      } else {
        this.resumeListeningAfterResponse();
      }
    } catch (err) {
      console.error('Error during voice dispatch:', err);
      this.setState('idle', err.message);
      this.resumeListeningAfterResponse();
    }
  }

  resumeListeningAfterResponse() {
    if (!this.isHardMuted && (this.mode === 'always' || this.mode === 'handsfree')) {
      setTimeout(() => {
        if (!this.isHardMuted && this.state !== 'speaking') {
          this.startListening();
        }
      }, 400);
    } else {
      this.setState('idle');
    }
  }

  cleanTextForSpeech(text) {
    if (!text) return '';
    return text
      // Strip markdown code fences
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      // Strip inline code backticks
      .replace(/`([^`]+)`/g, '$1')
      // Strip markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Strip bold/italic markdown
      .replace(/[*_~#]/g, '')
      // Strip HTML tags
      .replace(/<[^>]+>/g, '')
      // Clean duplicate whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  speakResponse(text) {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window) || !this.ttsEnabled || this.isHardMuted) {
        this.resumeListeningAfterResponse();
        return resolve();
      }

      window.speechSynthesis.cancel();
      const clean = this.cleanTextForSpeech(text);
      if (!clean) {
        this.resumeListeningAfterResponse();
        return resolve();
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      const voice = this.getBestVoiceForPreset(this.voiceProfile);
      if (voice) utterance.voice = voice;

      const preset = this.voicePresets[this.voiceProfile] || this.voicePresets.nova;
      utterance.rate = this.speechRate * (preset.rate || 1.0);
      utterance.pitch = this.speechPitch * (preset.pitch || 1.0);

      this.setState('speaking', 'Speaking response (speak to interrupt)...');

      utterance.onend = () => {
        this.currentUtterance = null;
        this.resumeListeningAfterResponse();
        resolve();
      };

      utterance.onerror = (e) => {
        this.currentUtterance = null;
        this.resumeListeningAfterResponse();
        resolve();
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  interruptSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.resumeListeningAfterResponse();
  }

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
        isHardMuted: this.isHardMuted,
        isPttHolding: this.isPttHolding,
        voiceProfile: this.voiceProfile,
        activeAgentId: this.activeAgentId,
        ttsEnabled: this.ttsEnabled,
        statusMessage: this.statusMessage
      });
    }
  }
}
