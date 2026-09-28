"use strict";
const { fail, uuid } = require("../security.cjs");
const { clean } = require("./actions.cjs");
const month = () => new Date().toISOString().slice(0, 7);
function status(core) {
  const policy = core.store.get("wf_budget", "policy") || {
    enabled: false,
    maxRequests: null,
    maxAllowance: null,
  };
  const ledger = core.store.get("wf_budget_ledger", month()) || {
    id: month(),
    requests: 0,
    allowance: 0,
  };
  return {
    policy,
    ledger,
    notice:
      "Per-PC UTC calendar month. Allowance uses configured rates and conservative text estimates, not an invoice guarantee. Reservations remain charged after failures. Other apps, external workers and direct provider use are outside this ledger. Realtime is disabled while limits are enabled.",
  };
}
function save(core, data) {
  const limit = (v) => (v === "" || v == null ? null : Number(v)),
    maxRequests = limit(data.maxRequests),
    maxAllowance = limit(data.maxAllowance);
  if (
    (maxRequests !== null &&
      (!Number.isSafeInteger(maxRequests) || maxRequests < 0)) ||
    (maxAllowance !== null &&
      (!Number.isFinite(maxAllowance) || maxAllowance < 0))
  )
    throw fail("INVALID");
  if (data.enabled === true && maxRequests === null && maxAllowance === null)
    throw fail("INVALID");
  const row = {
    id: "policy",
    enabled: data.enabled === true,
    maxRequests,
    maxAllowance,
    provider: clean(data.provider, 40),
    model: clean(data.model, 100),
    inputRate: limit(data.inputRate),
    outputRate: limit(data.outputRate),
    updatedAt: Date.now(),
  };
  if (
    row.maxAllowance !== null &&
    (!row.provider ||
      !row.model ||
      ![row.inputRate, row.outputRate].every(
        (n) => Number.isFinite(n) && n > 0,
      ))
  )
    throw fail("INVALID");
  core.store.put("wf_budget", "policy", row);
  return status(core);
}
function estimate(core, s, messages, options = {}) {
  const { policy: p, ledger } = status(core);
  if (!p.enabled || ["local", "ollama"].includes(s.provider))
    return { enabled: false, allowance: 0 };
  let allowance = 0;
  if (p.maxAllowance !== null) {
    if (
      p.provider !== s.provider ||
      p.model !== s.model ||
      options.web ||
      messages.some(
        (m) =>
          Array.isArray(m.content) &&
          m.content.some((x) => x.type === "input_image"),
      )
    )
      throw fail("BUDGET");
    const output = Number(s.maxOutput);
    if (!Number.isSafeInteger(output) || output < 1) throw fail("BUDGET");
    // One token per UTF-8 byte, plus fixed overhead; do not claim this is billing accuracy.
    const input =
      Buffer.byteLength(JSON.stringify(messages)) +
      Buffer.byteLength(options.instructions || "") +
      4096;
    allowance = (input * p.inputRate + output * p.outputRate) / 1e6;
  }
  if (
    (p.maxRequests !== null && ledger.requests + 1 > p.maxRequests) ||
    (p.maxAllowance !== null && ledger.allowance + allowance > p.maxAllowance)
  )
    throw fail("BUDGET");
  return { enabled: true, allowance };
}
async function generate(core, key, s, messages, options = {}) {
  const reservation = core.store.transaction(() => {
    const e = estimate(core, s, messages, options);
    if (!e.enabled) return null;
    const { ledger } = status(core);
    core.store.put("wf_budget_ledger", ledger.id, {
      ...ledger,
      requests: ledger.requests + 1,
      allowance: ledger.allowance + e.allowance,
      lastReservedAt: Date.now(),
    });
    return { id: uuid(), month: ledger.id, allowance: e.allowance };
  });
  // Reserve synchronously before yielding: concurrent requests cannot share a remaining slot.
  const result = await core.client.generate(key, s, messages, options);
  return reservation ? { ...result, budgetReservation: reservation } : result;
}
module.exports = { status, save, estimate, generate };
