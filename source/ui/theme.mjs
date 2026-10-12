// Only a non-sensitive device appearance preference is stored outside the vault.
const key = 'private-ai-appearance';
const choices = ['system', 'light', 'dark'];
const system = window.matchMedia('(prefers-color-scheme: dark)');
let selected = 'system';
try { const saved = localStorage.getItem(key); if (choices.includes(saved)) selected = saved; } catch {}
export const appearance = () => selected;
function apply() {
  document.documentElement.dataset.theme = selected === 'system' ? (system.matches ? 'dark' : 'light') : selected;
}
export function setAppearance(value) {
  if (!choices.includes(value)) return;
  selected = value;
  try { localStorage.setItem(key, value); } catch {}
  apply();
}
system.addEventListener('change', apply);
apply();
