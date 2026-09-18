'use strict';
const os = require('node:os');

/**
 * Dynamically evaluates host system RAM and available memory.
 * Adapts model tiers, thread allocation, and cache retention on the fly
 * so users do not have to change settings before or after a RAM upgrade.
 */
function getRAMProfile({ totalBytes = os.totalmem(), freeBytes = Math.min(os.freemem(), process.availableMemory?.() || Infinity) } = {}) {
  const totalGB = Math.round((totalBytes / (1024 ** 3)) * 10) / 10;
  const availableGB = Math.round((freeBytes / (1024 ** 3)) * 10) / 10;

  let profile = 'conservative';
  let tierCap = 'medium';
  let keepAlive = '0s';
  let threadBudget = 4;
  let recommendedModels = ['qwen2.5:1.5b', 'llama3.2:1b'];
  let statusBadge = 'Conservative Mode (Compact Models)';
  let description = 'System RAM is conserved for foreground applications. Fast compact models run safely with immediate memory reclamation to prevent freezing or swapping.';

  if (totalGB >= 24 && availableGB >= 8) {
    profile = 'expanded';
    tierCap = 'extra';
    keepAlive = '5m';
    threadBudget = Math.max(4, Math.min(8, (os.availableParallelism?.() || os.cpus().length) - 2));
    recommendedModels = ['qwen2.5:7b', 'llama3.1:8b', 'qwen2.5:3b', 'deepseek-r1:7b'];
    statusBadge = 'Expanded Mode (Full Tiers Unlocked)';
    description = 'High RAM detected. Full multi-step reasoning models (7B/8B) and warm-cache memory retention are active automatically.';
  } else if (totalGB > 16 || availableGB >= 5) {
    profile = 'balanced';
    tierCap = 'high';
    keepAlive = '2m';
    threadBudget = Math.max(3, Math.min(6, Math.floor((os.availableParallelism?.() || os.cpus().length) * 0.6)));
    recommendedModels = ['llama3.2:3b', 'qwen2.5:3b', 'qwen2.5:1.5b'];
    statusBadge = 'Balanced Mode (Medium & High Tiers)';
    description = 'Comfortable headroom detected. Medium (3B) and High (4B) models active with 2-minute memory cache.';
  } else {
    // Under conservative mode: if available RAM is tight (< 2.2 GB), cap to Small
    if (availableGB < 2.2) {
      tierCap = 'small';
      keepAlive = '0s';
      threadBudget = Math.max(2, Math.min(4, Math.floor((os.availableParallelism?.() || os.cpus().length) / 2)));
      recommendedModels = ['qwen2.5:1.5b', 'llama3.2:1b'];
      statusBadge = 'Ultra-Conserve Mode (< 2.2 GB Free)';
      description = 'Tight RAM headroom. Enforcing Small model tier and zero-lingering cache flush to protect system responsiveness.';
    }
  }

  return {
    totalGB,
    availableGB,
    profile,
    tierCap,
    keepAlive,
    threadBudget,
    recommendedModels,
    statusBadge,
    description
  };
}

module.exports = { getRAMProfile };
