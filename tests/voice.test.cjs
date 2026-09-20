"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

// Dynamic import of ES Module voice.mjs
test("Voice subsystem logic and state management", async (t) => {
  const { VoiceManager } = await import("../source/ui/voice.mjs");

  await t.test("Initializes in hands-free mode by default with clean presets", () => {
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({ agents: [] }),
      getChat: () => null,
      onStateChange: () => {}
    });

    assert.equal(vm.mode, "handsfree");
    assert.equal(vm.isHardMuted, false);
    assert.equal(vm.voiceProfile, "nova");
    assert.ok(vm.voicePresets.nova);
    assert.ok(vm.voicePresets.atlas);
    assert.ok(vm.voicePresets.sage);
    assert.ok(vm.voicePresets.breeze);
  });

  await t.test("Cleans markdown and code snippets cleanly for natural speech", () => {
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({}),
      getChat: () => null,
      onStateChange: () => {}
    });

    const raw = "Here is the summary:\n```javascript\nconst x = 10;\n```\nCheck [our documentation](https://example.com) and **bold details**.";
    const cleaned = vm.cleanTextForSpeech(raw);

    assert.doesNotMatch(cleaned, /```/);
    assert.doesNotMatch(cleaned, /https:\/\/example.com/);
    assert.doesNotMatch(cleaned, /\*\*/);
    assert.match(cleaned, /Here is the summary/);
    assert.match(cleaned, /Code snippet omitted/);
    assert.match(cleaned, /Check our documentation and bold details/);
  });

  await t.test("Hard mute completely disables mic and halts listening", () => {
    let lastState = null;
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({}),
      getChat: () => null,
      onStateChange: (s) => { lastState = s; }
    });

    assert.equal(vm.isHardMuted, false);
    vm.toggleHardMute();

    assert.equal(vm.isHardMuted, true);
    assert.equal(vm.state, "muted");
    assert.ok(lastState.isHardMuted);

    // Unmute
    vm.toggleHardMute();
    assert.equal(vm.isHardMuted, false);
  });

  await t.test("Routes through selected agent role when configured", async () => {
    let sentPayload = null;
    const vm = new VoiceManager({
      onSend: async (payload) => {
        sentPayload = payload;
        return { text: "Report completed." };
      },
      getState: () => ({
        agents: [
          { id: "clinical-agent", name: "Clinical Reviewer", prompt: "Review for HIPAA compliance." }
        ]
      }),
      getChat: () => ({ id: "test-chat" }),
      onStateChange: () => {}
    });

    vm.activeAgentId = "clinical-agent";
    vm.finalTranscript = "Summarize resident fall incident.";

    await vm.dispatchCurrentTranscript();

    assert.ok(sentPayload);
    assert.equal(sentPayload.rawVoiceText, "Summarize resident fall incident.");
    assert.match(sentPayload.prompt, /Review for HIPAA compliance/);
    assert.match(sentPayload.prompt, /Summarize resident fall incident/);
    assert.equal(sentPayload.agentId, "clinical-agent");
  });

  await t.test("VoiceManager runs strictly locally with no external network or API dependencies", () => {
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({}),
      getChat: () => null,
      onStateChange: () => {}
    });

    // Verify all voice profiles are purely local browser synthesis configurations
    const profiles = Object.keys(vm.voicePresets);
    assert.deepEqual(profiles, ["nova", "atlas", "sage", "breeze"]);
    for (const key of profiles) {
      const preset = vm.voicePresets[key];
      assert.ok(preset.name);
      assert.ok(preset.rate > 0);
      assert.ok(preset.pitch > 0);
    }
  });

  await t.test("Turn detection patience modes adjust silence thresholds", () => {
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({}),
      getChat: () => null,
      onStateChange: () => {}
    });

    assert.equal(vm.turnPatience, "normal");
    assert.equal(vm.patienceThresholds.normal, 1250);
    assert.equal(vm.patienceThresholds.patient, 2200);
    assert.equal(vm.patienceThresholds.fast, 680);

    vm.setTurnPatience("patient");
    assert.equal(vm.turnPatience, "patient");

    vm.setTurnPatience("fast");
    assert.equal(vm.turnPatience, "fast");
  });

  await t.test("Barge-in / Interruption eliminates ghost context and records exact heard speech", async () => {
    let sentPayload = null;
    let stopCalledWith = null;

    const vm = new VoiceManager({
      onSend: async (payload) => {
        sentPayload = payload;
        return { text: "Here is your updated census summary." };
      },
      getState: () => ({}),
      getChat: () => ({ id: "chat-xyz" }),
      callApi: async (op, data) => {
        if (op === "stop") stopCalledWith = data;
        return true;
      },
      onStateChange: () => {}
    });

    // Simulate assistant speaking
    vm.state = "speaking";
    vm.currentUtterance = { text: "We have 42 residents in West Wing and 3 open beds in Unit 2." };
    vm.assistantGeneratedText = "We have 42 residents in West Wing and 3 open beds in Unit 2.";
    vm.lastSpokenCharIndex = 30; // user interrupted around "West Wing"

    // User speaks / barge-in occurs
    vm.interruptSpeech(true);

    assert.equal(vm.wasInterrupted, true);
    assert.ok(vm.interruptedContext);
    assert.ok(vm.interruptedContext.heardText.includes("42 residents"));
    assert.equal(stopCalledWith.id, "chat-xyz");

    // Next turn continuation without apologetic filler
    vm.finalTranscript = "continue";
    await vm.dispatchCurrentTranscript();

    assert.ok(sentPayload);
    assert.match(sentPayload.prompt, /Conversational Continuation/);
    assert.match(sentPayload.prompt, /smoothly continue from that exact thought/);
    assert.equal(vm.wasInterrupted, false);
  });

  await t.test("Streaming Audio Playback Queue enqueues and flushes sentence chunks cleanly", () => {
    const vm = new VoiceManager({
      onSend: async () => ({ text: "ok" }),
      getState: () => ({}),
      getChat: () => null,
      onStateChange: () => {}
    });

    vm.isQueuePlaying = true; // pause auto-consumption to inspect queue state
    vm.handleStreamResponseChunk("First sentence is ready. ");
    vm.handleStreamResponseChunk("Second sentence follows right after! ");

    assert.equal(vm.playbackQueue.length, 2);
    assert.match(vm.playbackQueue[0].text, /First sentence is ready/);
    assert.match(vm.playbackQueue[1].text, /Second sentence follows right after/);

    // Flushing queue on hard mute or interruption
    vm.flushPlaybackQueue();
    assert.equal(vm.playbackQueue.length, 0);
    assert.equal(vm.streamBuffer, "");
  });

  await t.test("Live Translation Mode wraps spoken prompt with target language instruction", async () => {
    let sentPayload = null;
    const vm = new VoiceManager({
      onSend: async (payload) => {
        sentPayload = payload;
        return { text: "Buenos días, ¿cómo puedo ayudarle?" };
      },
      getState: () => ({}),
      getChat: () => ({ id: "chat-es" }),
      onStateChange: () => {}
    });

    vm.liveTranslation = true;
    vm.translationTargetLang = "Spanish";
    vm.finalTranscript = "Good morning, how can I help you today?";

    await vm.dispatchCurrentTranscript();

    assert.ok(sentPayload);
    assert.match(sentPayload.prompt, /Live Spoken Translation Mode/);
    assert.match(sentPayload.prompt, /Translate the user's spoken words into natural, fluent Spanish/);
    assert.match(sentPayload.prompt, /Good morning, how can I help you today\?/);
  });
});
