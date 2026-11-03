// Auto-tidy: tabs not used for N days go to the Archive (Library > Archive), then close.
// Needs core.js loaded first.

const TIDY_DEFAULTS = { tidyDays: 3, autoTidy: false };
const DAY_MS = 24 * 60 * 60 * 1000;

function tidySettings() {
  return chrome.storage.local.get(TIDY_DEFAULTS);
}

// Never touches pinned, active, audible or non-web tabs (settings pages, new tab, files).
async function idleTabs(days) {
  const cutoff = Date.now() - days * DAY_MS;
  const tabs = await chrome.tabs.query({});
  return tabs.filter(
    (t) => !t.pinned && !t.active && !t.audible && t.lastAccessed && t.lastAccessed < cutoff && /^https?:/.test(t.url)
  );
}

async function tidyTabs(days) {
  const tabs = await idleTabs(days);
  if (!tabs.length) return 0;
  await addSession(tabs, "tidied", `${tabs.length} idle tab${tabs.length > 1 ? "s" : ""}`);
  // Only close once the archive entry has been written.
  await chrome.tabs.remove(tabs.map((t) => t.id));
  return tabs.length;
}
