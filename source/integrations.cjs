"use strict";
const { fail } = require("./security.cjs");

const DEFINITIONS = Object.freeze({ pcc: { name: "PointClickCare" } });

// Optional data sources only. This service never enables/disables domain
// reasoning, owns clinical rules, or interprets absence of a feed as a finding.
// Adapter registration is internal,
// not renderer-supplied code, credentials, URLs or arbitrary module paths.
class Integrations {
  constructor(core) {
    this.core = core;
    this.adapters = new Map();
    this.active = new Map();
    this.generations = new Map();
    this.errors = new Set();
  }
  definition(id) {
    if (!Object.hasOwn(DEFINITIONS, id)) throw fail("INVALID");
    return DEFINITIONS[id];
  }
  register(id, adapter) {
    this.definition(id);
    if (!adapter || this.adapters.has(id) ||
        !["readImport", "readSync"].some(k => typeof adapter[k] === "function")) throw fail("INVALID");
    this.adapters.set(id, adapter);
  }
  status(id) {
    const definition = this.definition(id);
    const config = this.core.store.get("integration", id);
    const adapter = this.adapters.get(id);
    const enabled = config?.enabled === true;
    const mode = config?.mode === "sync" ? "sync" : "manual";
    const canImport = enabled && typeof adapter?.readImport === "function";
    const canSync = enabled && mode === "sync" && typeof adapter?.readSync === "function";
    const state = !config ? "not_configured" : !enabled ? "disabled"
      : !canImport && !canSync ? "not_configured"
      : canSync ? (this.active.get(id)?.operation === "sync" ? "sync_active"
        : this.errors.has(id) ? "sync_error" : "sync_configured") : "manual_import";
    return { id, name: definition.name, state, enabled, mode,
      adapterAvailable: !!adapter, canImport, canSync,
      supportsImport: typeof adapter?.readImport === "function", supportsSync: typeof adapter?.readSync === "function",
      canSchedule: canSync, showDashboard: canImport || canSync,
      // This describes source availability, never a resident's clinical status.
      sourceAvailability: !canImport && !canSync ? "unavailable" : "unknown" };
  }
  summary() { return Object.keys(DEFINITIONS).map(id => this.status(id)); }
  configure(id, input) {
    this.core.assertUnlocked();
    this.definition(id);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(k => !["enabled", "mode"].includes(k))) throw fail("INVALID");
    const previous = this.core.store.get("integration", id) || {};
    const next = { ...previous, enabled: previous.enabled === true, mode: previous.mode || "manual", ...input };
    if (typeof next.enabled !== "boolean" || !["manual", "sync"].includes(next.mode)) throw fail("INVALID");
    const adapter = this.adapters.get(id);
    if (next.enabled && adapter && typeof adapter[next.mode === "manual" ? "readImport" : "readSync"] !== "function") throw fail("INTEGRATION_UNAVAILABLE");
    this.core.store.put("integration", id, next);
    this.generations.set(id, (this.generations.get(id) || 0) + 1);
    this.active.get(id)?.controller.abort();
    this.errors.delete(id);
    this.core.store.audit("settings");
    this.onChange?.(id);
    return this.status(id);
  }
  assert(id, operation) {
    const status = this.status(id);
    const allowed = { import: status.canImport, sync: status.canSync, scheduled: status.canSchedule };
    if (!Object.hasOwn(allowed, operation)) throw fail("INVALID");
    if (!allowed[operation]) throw fail("INTEGRATION_UNAVAILABLE");
  }
  // Future file/API/relay adapters read and normalize here, then their caller
  // passes the returned data to the SAME domain engine as general imports.
  // Adapter reads must honor signal and must not publish alerts or persist data.
  // A disabled/reconfigured source cannot return a late result for publication.
  async read(id, operation, input, { signal } = {}) {
    this.core.assertUnlocked();
    this.assert(id, operation);
    if (this.active.has(id)) throw fail("BUSY");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const generation = this.generations.get(id) || 0;
    const method = operation === "import" ? "readImport" : "readSync";
    this.active.set(id, { controller, operation: operation === "scheduled" ? "sync" : operation });
    try {
      if (controller.signal.aborted) throw fail("CANCELLED");
      const result = await this.adapters.get(id)[method](input, { signal: controller.signal });
      this.core.assertUnlocked();
      if (controller.signal.aborted || generation !== (this.generations.get(id) || 0)) throw fail("CANCELLED");
      this.assert(id, operation);
      this.errors.delete(id);
      return result;
    } catch (e) {
      if (controller.signal.aborted) throw fail("CANCELLED");
      if (operation !== "import") this.errors.add(id);
      throw e;
    } finally {
      signal?.removeEventListener("abort", abort);
      this.active.delete(id);
    }
  }
  close() { for (const operation of this.active.values()) operation.controller.abort(); }
}

module.exports = { Integrations };
