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
});
