// Auto-tidy: tabs not used for N days go to History (kind "tidied", kept 30 days), then close.
// Needs core.js loaded first.

const TIDY_DEFAULTS = { tidyDays: 3, autoTidy: false };

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
  // Only close once the History entry has been written.
  await chrome.tabs.remove(tabs.map((t) => t.id));
  return tabs.length;
}
