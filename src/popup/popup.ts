// Master enable/disable popup. One checkbox-style toggle bound to the
// `enabled` key in chrome.storage.sync. Content scripts on YouTube pages
// listen for the storage change and hide/show the HUD + gate VAD
// inference accordingly (see src/content/index.ts).

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

async function load(): Promise<void> {
  const cb = $<HTMLInputElement>("enabled");
  if (!cb) return;
  try {
    const s = await chrome.storage.sync.get({ enabled: true });
    cb.checked = s.enabled !== false;
  } catch {
    cb.checked = true;
  }
}

async function save(): Promise<void> {
  const cb = $<HTMLInputElement>("enabled");
  if (!cb) return;
  try {
    await chrome.storage.sync.set({ enabled: cb.checked });
  } catch {
    // ignore
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void load();
  $<HTMLInputElement>("enabled")?.addEventListener("change", () => void save());
});
