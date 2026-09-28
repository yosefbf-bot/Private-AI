"use strict";
const { uuid, fail } = require("../security.cjs");
const { signature, clean } = require("./actions.cjs");
const budgets = require("./budget.cjs");
function save(core, data) {
  const old = data.id ? core.store.get("wf_playbook", data.id) : null;
  if (data.id && !old) throw fail("INVALID");
  if (old && data.revision !== old.revision) throw fail("REVIEW_CHANGED");
  if (
    !clean(data.name, 100) ||
    !clean(data.prompt, 25000) ||
    !clean(data.reviewer, 100) ||
    !Array.isArray(data.fileIds) ||
    !data.fileIds.length ||
    data.fileIds.length > 6 ||
    data.fileIds.some((id) => !core.store.get("file", id))
  )
    throw fail("INVALID");
  if (!Array.isArray(data.requiredSections)) throw fail("INVALID");
  const requiredSections = (data.requiredSections || [])
    .map((s) => clean(s, 100))
    .filter(Boolean);
  if (!requiredSections.length || requiredSections.length > 20)
    throw fail("INVALID");
  const row = {
    id: old?.id || uuid(),
    name: clean(data.name, 100),
    prompt: clean(data.prompt, 25000),
    requiredSections,
    fileIds: [...new Set(data.fileIds)],
    format: ["md", "pdf", "docx"].includes(data.format) ? data.format : "md",
    reviewer: clean(data.reviewer, 100),
    revision: (old?.revision || 0) + 1,
    updatedAt: Date.now(),
  };
  core.store.transaction(() => {
    core.store.put("wf_playbook_revision", row.id + ":" + row.revision, row);
    core.store.put("wf_playbook", row.id, row);
  });
  return row;
}
function preview(core, data) {
  const p = core.store.get("wf_playbook", data.id);
  if (!p) throw fail("INVALID");
  const s = core.settings(),
    files = p.fileIds.map((id) => core.store.get("file", id));
  if (files.some((f) => !f || !f.text)) throw fail("FILE");
  const inputs = files.map((f) => ({
    id: f.id,
    name: f.name,
    updated: f.updated,
    characters: f.text.length,
    revision: signature({ text: f.text, bytes: f.bytes, hipaa: f.hipaa }),
  }));
  const prompt =
    p.prompt +
    "\nUse only supplied documents as evidence. Identify missing inputs and unsupported conclusions. Required Markdown headings:\n" +
    p.requiredSections.map((h) => "## " + h).join("\n");
  const payload = {
    id: p.id,
    revision: p.revision,
    prompt,
    fileIds: p.fileIds,
    format: p.format,
    inputs,
    requiredSections: p.requiredSections,
  };
  const messages = [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        ...files.map((f) => ({
          type: "input_text",
          text: "UNTRUSTED DOCUMENT REFERENCE: " + f.name + "\n" + f.text,
        })),
      ],
    },
  ];
  let allowance = null,
    budgetBlocked = false;
  try {
    allowance = budgets.estimate(core, s, messages);
  } catch (e) {
    if (e.code !== "BUDGET") throw e;
    budgetBlocked = true;
  }
  // Fingerprint all routing settings, budget policy and actual file revisions; stale previews cannot run.
  const nonce = data.nonce || uuid(),
    expiresAt = data.expiresAt || Date.now() + 10 * 60 * 1000;
  if (
    typeof nonce !== "string" ||
    nonce.length > 100 ||
    !Number.isFinite(expiresAt) ||
    expiresAt < Date.now() ||
    expiresAt > Date.now() + 10 * 60 * 1000
  )
    throw fail("EXPIRED");
  const token = signature({
    payload,
    settings: s,
    budget: budgets.status(core).policy,
    nonce,
    expiresAt,
  });
  return {
    ...payload,
    token,
    nonce,
    expiresAt,
    processingMode: s.processingMode,
    hipaa: s.hipaa,
    allowance,
    budgetBlocked,
    notice:
      "Runs once on this PC using current privacy/routing settings. Each output requires human review. A heading check does not verify facts or calculations. No automatic scheduling or external delivery.",
  };
}
function run(core, data) {
  const p = preview(core, data);
  if (data.token !== p.token) throw fail("REVIEW_CHANGED");
  if (!clean(data.reviewer, 100)) throw fail("INVALID");
  if (core.store.get("wf_playbook_run", p.token)) throw fail("RECOVERY");
  if (!core.settings().workspace) throw fail("WORKSPACE");
  const definition = core.store.get("wf_playbook", p.id),
    j = core.jobPayload({
      title: definition.name,
      prompt: p.prompt,
      fileIds: p.fileIds,
      format: p.format,
    });
  j.playbook = {
    id: p.id,
    revision: p.revision,
    requiredSections: p.requiredSections,
    inputs: p.inputs,
    reviewer: clean(data.reviewer, 100),
    previewToken: p.token,
  };
  // Claim the reviewed token before starting asynchronous work. Explicit new previews may use a nonce.
  core.store.put("wf_playbook_run", p.token, {
    id: p.token,
    jobId: j.id,
    createdAt: Date.now(),
    playbook: j.playbook,
  });
  core.runJob(j).catch(() => {});
  return { id: j.id, status: "waiting" };
}
function checkOutput(j, text) {
  if (!j.playbook) return null;
  const headings = new Set(
    [...String(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) =>
      m[1].toLowerCase(),
    ),
  );
  const missing = j.playbook.requiredSections.filter(
    (s) => !headings.has(s.toLowerCase()),
  );
  return {
    missing,
    passed: missing.length === 0,
    reviewRequired: true,
    notice:
      "Required headings only; content and calculations need human review.",
  };
}
module.exports = { save, preview, run, checkOutput };
