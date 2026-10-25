const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Cipher } = require("../source/security.cjs");
const { Store } = require("../source/database.cjs");
const { Core } = require("../source/core.cjs");
function fixture(t, client) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "Private AI test "));
  const root = path.join(dir, "Local Data");
  fs.mkdirSync(root);
  const cipher = new Cipher(crypto.randomBytes(32));
  const store = new Store(path.join(root, "privateai.db"), cipher);
  const calls = [];
  const fake = client || {
    models: async () => ["test-model"],
    generate: async (key, settings, messages, opts = {}) => {
      calls.push({ key, settings, messages, opts });
      opts.onDelta?.("Synthetic answer.");
      return {
        text: "Synthetic answer.",
        usage: { inputTokens: 8, outputTokens: 3 },
        durationMs: 10,
      };
    },
  };
  const core = new Core({
    root,
    store,
    client: fake,
    machine: "synthetic-machine",
  });
  core.saveKey("sk-synthetic-NOT-A-REAL-KEY");
  core.saveSettings({
    model: "test-model",
    workspace: path.join(dir, "ShareSync Reports"),
  });
  core.saveSettings({ approved: true, approvalFingerprint: core.summary().providerApprovalFingerprint });
  t.after(() => {
    if (core.store.db) core.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { core, dir, root, cipher, calls };
}
module.exports = { fixture };

