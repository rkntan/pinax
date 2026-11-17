// Background worker: right-click "Save to Inbox", Alt+Shift+S, reminders, daily resurface, research trail, read tracking.
importScripts("taxonomy.js", "core.js");

const RESURFACE_ALARM = "resurface";
const REVIEW_ALARM = "weekly-review";

// In-memory copy of the saved items, filled on first use and kept fresh by storage.onChanged,
// so read tracking, page loads and the badge don't read storage each time. Read-only.
let itemsCache = null;
const cachedItems = () => (itemsCache ||= getItems().catch((e) => { itemsCache = null; throw e; }));
const badge = async () => refreshBadge(await cachedItems());

async function syncAlarms() {
  chrome.alarms.clear("read-tick"); // the old 1-minute tick; read tracking now uses READ_CHECK
  await migrate();
  chrome.alarms.clear("auto-tidy"); // the old idle-tab alarm
  if (!(await chrome.alarms.get(REVIEW_ALARM))) {
    chrome.alarms.create(REVIEW_ALARM, { when: nextReviewTime(), periodInMinutes: 7 * 24 * 60 });
  }

  const { resurface = true, nudgeTime = DEFAULT_NUDGE } = await chrome.storage.local.get(["resurface", "nudgeTime"]);
  if (!resurface) await chrome.alarms.clear(RESURFACE_ALARM);
  else if (!(await chrome.alarms.get(RESURFACE_ALARM))) chrome.alarms.create(RESURFACE_ALARM, { when: nextDailyTime(nudgeTime), periodInMinutes: 24 * 60 });

  // Re-create reminder alarms (they are lost if the extension is reloaded).
  for (const it of await getItems()) {
    if (it.remindAt && !it.read && !(await chrome.alarms.get("remind:" + it.id))) {
      chrome.alarms.create("remind:" + it.id, { when: Math.max(it.remindAt, Date.now() + 60_000) });
    }
  }
  badge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll(); // updates keep old menus; start clean
  const web = ["http://*/*", "https://*/*"]; // page menus: not on the extension's own pages
  chrome.contextMenus.create({ id: "save-page", title: "Save page to Inbox", contexts: ["page"], documentUrlPatterns: web });
  chrome.contextMenus.create({ id: "save-link", title: "Save link to Inbox", contexts: ["link"] });
  chrome.contextMenus.create({ id: "pin-site", title: "Pin this site to Library", contexts: ["page"], documentUrlPatterns: web });
  chrome.contextMenus.create({ id: "highlight", title: "Highlight", contexts: ["selection"], documentUrlPatterns: web });
  chrome.contextMenus.create({ id: "save-phrase", title: "Add “%s” to Phrasebook", contexts: ["selection"], documentUrlPatterns: web });
  chrome.contextMenus.create({ id: "notes-panel", title: "Open Notes for this page", contexts: ["page"], documentUrlPatterns: web });
  syncAlarms();
});
chrome.runtime.onStartup.addListener(syncAlarms);
// the Library asks after a backup import, so imported reminders get their alarms
chrome.runtime.onMessage.addListener((m) => { if (m?.type === "sync-alarms") syncAlarms(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.nudgeTime) chrome.alarms.clear(RESURFACE_ALARM).then(syncAlarms); // new time: schedule again
  else if (changes.resurface) syncAlarms();
  if (changes.items && area === "local") {
    const items = changes.items.newValue || [];
    itemsCache = Promise.resolve(items);
    refreshBadge(items);
    // a page saved, removed or marked read: the page in view may need its read check (re)set
    if (unreadKeys(changes.items.oldValue) !== unreadKeys(items)) trackView();
  }
});

function toast(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message, priority: 0 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-link") {
    await saveForLater({ url: info.linkUrl, title: info.selectionText || info.linkUrl });
    toast("Saved to Inbox", info.selectionText || info.linkUrl);
  } else if (info.menuItemId === "save-page" && tab) {
    await addStats((await saveForLater(tab, "", { tab })).id, tab);
    toast("Saved to Inbox", tab.title);
  } else if (info.menuItemId === "pin-site" && tab) {
    await pinSite({ url: tab.url, title: tab.title });
    toast("Pinned", hostOf(tab.url));
  } else if (info.menuItemId === "save-phrase" && tab) {
    await saveSelection(tab, info.selectionText);
  } else if (info.menuItemId === "highlight" && tab) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {}); // must run right after the click
    await highlightSelection(tab, info.selectionText);
  } else if (info.menuItemId === "notes-panel" && tab) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// Runs inside the page (only when you save, via activeTab): the selection, the sentence it
// sits in, and the page language.
function readSelection() {
  const sel = getSelection();
  const text = sel.toString().replace(/\s+/g, " ").trim();
  let node = sel.anchorNode;
  while (node && node.nodeType !== 1) node = node.parentNode;
  const block = node?.closest("p, li, td, th, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, div") || node;
  const full = (block?.innerText || "").replace(/\s+/g, " ");
  let sentence = "";
  const i = full.toLowerCase().indexOf(text.toLowerCase());
  if (text && i >= 0) {
    const before = full.slice(0, i);
    const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
    const rest = full.slice(i + text.length);
    const m = rest.search(/[.!?](\s|$)/);
    sentence = full.slice(start < 0 ? 0 : start + 2, m < 0 ? full.length : i + text.length + m + 1).trim();
  }
  return { text, sentence: sentence.slice(0, 400), pageLang: document.documentElement.lang || "" };
}

async function saveSelection(tab, fallbackText = "") {
  let got = { text: fallbackText, sentence: "", pageLang: "" };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSelection });
    if (res?.result?.text) got = res.result;
  } catch (e) {
    console.warn("cannot read this page, saving the selection only", e); // e.g. Chrome pages, PDFs
  }
  if (!got.text) return toast("Nothing selected", "Select a word or phrase first.");
  if (phraseKind(got.text) === "quote") return highlightSelection(tab, got.text);
  const p = await savePhrase({ ...got, url: tab.url, title: tab.title });
  enrichPhrase(p.id).catch(() => {}); // AI may not exist in the worker; the Library finishes it
  toast(p.kind === "quote" ? "Highlighted" : p.seen > 1 ? `Seen again (${p.seen}×)` : "Added to Phrasebook",
    p.kind === "quote" ? p.text.slice(0, 120) : `${p.text}${p.sentence ? " — “" + p.sentence.slice(0, 90) + "”" : ""}`);
}

chrome.commands.onCommand.addListener(async (command, cmdTab) => {
  // the side panel may only open straight from the key press, before any await
  if (command === "highlight" && cmdTab) chrome.sidePanel.open({ tabId: cmdTab.id }).catch((e) => console.warn("side panel", e));
  const [tab] = cmdTab ? [cmdTab] : await chrome.tabs.query({ active: true, currentWindow: true });
  if (command === "open-library") return openLibraryTab();
  if (command === "organise-window" && tab) {
    const r = await organiseWindow(tab.windowId);
    return toast("Tabs organised", r.how === "none" ? "Not enough tabs" : `${r.groups.length} groups by ${r.how}`);
  }
  if (!tab || !/^https?:/.test(tab.url)) return;
  if (command === "save-phrase") return saveSelection(tab);
  if (command === "highlight") return highlightSelection(tab);
  if (command !== "save-page") return;
  await addStats((await saveForLater(tab, "", { tab })).id, tab);
  toast("Saved to Inbox", tab.title);
});

// ---------- alarms ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === RESURFACE_ALARM) {
    await resurfaceOne();
  } else if (alarm.name === REVIEW_ALARM) {
    const n = forReview(await getItems()).length;
    if (n) {
      chrome.notifications.create("review", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Weekly review",
        message: `${n} page${n > 1 ? "s" : ""} in your Inbox.`,
        buttons: [{ title: "Review now" }],
        requireInteraction: true,
      });
    }
  } else if (alarm.name.startsWith("remind:")) {
    await remind(alarm.name.slice(7));
  }
});

async function remind(id) {
  const it = (await getItems()).find((x) => x.id === id);
  if (!it || it.read) return;
  const extra = it.progress ? ` · unit ${it.progress.done + 1} of ${it.progress.total}` : "";
  chrome.notifications.create("item:" + id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `Reminder: ${it.type.toLowerCase()} to continue`,
    message: it.title + extra,
    contextMessage: it.why || hostOf(it.url),
    buttons: [{ title: "Open" }, { title: "Snooze 1 day" }],
    requireInteraction: true,
  });
  if (it.repeat === "weekly") {
    const when = Date.now() + 7 * DAY_MS;
    chrome.alarms.create("remind:" + id, { when });
    await updateItem(id, { remindAt: when });
  }
  badge();
}

// Once a day: bring back one forgotten kept page (saved 3+ days ago, not done, no reminder).
// Inbox pages are left for the weekly review.
async function resurfaceOne() {
  const old = (await getItems()).filter(
    (x) => x.stage === "kept" && !x.read && !x.remindAt && x.created < Date.now() - 3 * DAY_MS
  );
  if (!old.length) return;
  const it = old[Math.floor(Math.random() * old.length)];
  chrome.notifications.create("item:" + it.id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "From your collections",
    message: it.title,
    contextMessage: `${it.type} · saved ${stamp(it.created)}`,
    buttons: [{ title: "Open" }, { title: "Remind me tomorrow" }],
  });
}

async function openItem(id) {
  const it = (await getItems()).find((x) => x.id === id);
  if (!it) return;
  chrome.tabs.create({ url: it.url });
  // Opening a reminder clears it (unless it repeats weekly).
  if (it.repeat !== "weekly") await updateItem(id, { remindAt: null });
}

function openReview() {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html#review") });
}

chrome.notifications.onClicked.addListener((nid) => {
  if (nid.startsWith("item:")) openItem(nid.slice(5));
  if (nid === "review") openReview();
  chrome.notifications.clear(nid);
});

chrome.notifications.onButtonClicked.addListener(async (nid, button) => {
  if (nid === "review") { openReview(); chrome.notifications.clear(nid); return; }
  if (!nid.startsWith("item:")) return;
  const id = nid.slice(5);
  if (button === 0) await openItem(id);
  else if ((await getItems()).find((x) => x.id === id)?.repeat === "weekly") {
    const { when } = presetTime("tomorrow"); // snooze, but keep it weekly
    chrome.alarms.create("remind:" + id, { when });
    await updateItem(id, { remindAt: when });
  } else await setReminder(id, "tomorrow");
  chrome.notifications.clear(nid);
});

// ---------- research trail: pages opened in a "working on" window join that project ----------
// tabSource[tabId] = the source that tab shows now; openerOf[tabId] = the tab it was opened
// from. Both live in session storage, so they survive the worker sleeping, not a restart.

// One trail update at a time, so quick page loads don't overwrite each other.
let trailQueue = Promise.resolve();
const serial = (fn) => (trailQueue = trailQueue.then(fn).catch((e) => console.warn("trail", e)));

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null) return;
  serial(async () => {
    const { openerOf = {} } = await chrome.storage.session.get("openerOf");
    openerOf[tab.id] = tab.openerTabId;
    await chrome.storage.session.set({ openerOf });
  });
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  serial(async () => {
    const projectId = (await getWorkingOn())[tab.windowId];
    if (!projectId) return;
    const p = (await getProjects()).find((x) => x.id === projectId);
    if (!p || p.status === "finished") return;
    const { tabSource = {}, openerOf = {} } = await chrome.storage.session.get(["tabSource", "openerOf"]);
    const prev = tabSource[tabId];                             // same tab, previous page
    const parent = prev ?? tabSource[openerOf[tabId]] ?? null; // or the tab it came from
    delete openerOf[tabId];
    if (isSearchPage(tab.url)) {
      // a search page is a step: the next page found from it hangs under the page before
      if (parent) tabSource[tabId] = parent;
    } else if (trailMayAdd(p, tab.url)) {
      const src = await addSource(projectId, tab, parent);
      tabSource[tabId] = src.id;
    }
    await chrome.storage.session.set({ tabSource, openerOf });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  serial(async () => {
    const { tabSource = {}, openerOf = {} } = await chrome.storage.session.get(["tabSource", "openerOf"]);
    delete tabSource[tabId];
    delete openerOf[tabId];
    await chrome.storage.session.set({ tabSource, openerOf });
  });
});

chrome.windows.onRemoved.addListener((windowId) => serial(() => setWorkingOn(windowId, null)));

// Badge "●" on the icon while the current window is working on a project (see refreshBadge).
chrome.windows.onFocusChanged.addListener((w) => { if (w > 0) badge(); });
chrome.storage.session.onChanged.addListener((c) => { if (c.workingOn) badge(); });

// ---------- auto "read": a saved page counts as read after 2 minutes of real viewing ----------
// Time only counts while the page is the active tab of a focused window and you are not idle.

const READ_AFTER_MS = 2 * 60 * 1000;
const READ_CHECK = "read-check"; // one-shot, only while a saved unread page is in view
const VIEW_KEYS_MAX = 200; // pages whose viewing time is kept (least recently viewed go first)
let viewQueue = Promise.resolve();
const serialView = (fn) => (viewQueue = viewQueue.then(fn).catch((e) => console.warn("read tracking", e)));

async function currentViewUrl() {
  if ((await chrome.idle.queryState(60)) !== "active") return null; // asked each time: a cold start forgets state
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab && /^https?:/.test(tab.url) ? tab.url : null;
}

// The saved pages not read yet, as one string (to notice when that set changes).
function unreadKeys(items = []) {
  return items.filter((x) => !x.read).map((x) => pageKey(x.url)).sort().join("\n");
}

// Adds the time since the last check to the page being viewed, then starts timing `next`.
// If `next` is a saved unread page, one alarm wakes the worker when it would reach
// READ_AFTER_MS; any other view (or idle, or no focus) clears it. Nothing ticks otherwise.
function trackView() {
  return serialView(async () => {
    const next = await currentViewUrl();
    const { viewing = null, viewTime = {} } = await chrome.storage.session.get(["viewing", "viewTime"]);
    const now = Date.now();
    const unread = async (url) => (await cachedItems()).some((x) => !x.read && pageKey(x.url) === pageKey(url));
    if (viewing?.url) {
      const key = pageKey(viewing.url);
      const prev = viewTime[key] || 0;
      const total = prev + Math.min(now - viewing.since, 5 * 60 * 1000);
      delete viewTime[key]; // re-added last: keys stay in least-recently-viewed order
      viewTime[key] = total;
      // only time spent while it was already saved and unread can mark it read
      if (viewing.unread && prev < READ_AFTER_MS && total >= READ_AFTER_MS) await markReadByUrl(viewing.url);
      const keys = Object.keys(viewTime);
      for (const k of keys.slice(0, Math.max(0, keys.length - VIEW_KEYS_MAX))) delete viewTime[k];
    }
    if (!viewing?.url && !next) return; // nothing was being viewed and nothing is now: no write, no alarm to change
    const nextUnread = !!next && (await unread(next));
    await chrome.storage.session.set({ viewing: next ? { url: next, since: now, unread: nextUnread } : null, viewTime });
    const left = nextUnread ? READ_AFTER_MS - (viewTime[pageKey(next)] || 0) : 0;
    if (left > 0) await chrome.alarms.create(READ_CHECK, { when: now + left });
    else await chrome.alarms.clear(READ_CHECK);
  });
}

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(() => trackView());
chrome.tabs.onActivated.addListener(trackView);
chrome.windows.onFocusChanged.addListener(trackView);
chrome.tabs.onUpdated.addListener((id, change, tab) => { if (change.url && tab.active) trackView(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === READ_CHECK) trackView(); });

// ---------- page notes: highlight the selection, show highlights again ----------

async function highlightSelection(tab, fallbackText = "") {
  let got = null;
  try { got = await inPage(tab, readHighlight, [], false); } catch (e) { console.warn("cannot read this page", e); }
  if (!got?.text) got = { text: fallbackText, prefix: "", suffix: "" };
  if (!got.text) return toast("Nothing selected", "Select some text first.");
  await addHighlight(tab, got);
  remark(tab).catch(() => {}); // also puts the bubble and highlight bar on the page
}

// On sites you allowed (one by one, or "always show highlights"): a saved page without a
// length gets measured, the selection bubble is ready and your highlights show again.
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  if (!(await chrome.permissions.contains({ origins: [new URL(tab.url).origin + "/*"] }))) return;
  const items = await cachedItems(); // no storage read once the cache is warm
  const it = items.find((x) => x.url === tab.url && !x.minutes);
  if (it) await addStats(it.id, tab);
  const n = await noteFor(tab.url);
  const item = items.find((x) => pageKey(x.url) === pageKey(tab.url)) || null; // for the dock
  (n?.highlights.length ? remark(tab, null, false, false, n, item) : pageTools(tab, false, false, n, item)).catch(() => {});
});

// The highlighter pen and the bar on highlights talk to the extension through messages.
// One at a time: quick selections would otherwise overwrite each other's save.
let penQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((m, sender) => {
  const tab = sender.tab;
  if (!tab || !/^(pen|bubble)-/.test(m?.type || "") || m.type === "pen-off") return;
  penQueue = penQueue.then(async () => {
    if (m.type === "bubble-word") {
      if (phraseKind(m.data.text) !== "quote") {
        const p = await savePhrase({ ...m.data, url: tab.url, title: tab.title });
        if (p) enrichPhrase(p.id).catch(() => {});
        return;
      }
      // a whole passage is a highlight, not a word (as with the right-click menu)
      await addHighlight(tab, { text: m.data.text, prefix: m.data.prefix || "", suffix: m.data.suffix || "" });
    } else if (m.type === "pen-highlight") await addHighlight(tab, m.data);
    else if (m.type === "pen-delete") await deleteHighlight(tab.url, m.id);
    else if (m.type === "pen-color") await updateHighlight(tab.url, m.id, { color: m.color });
    else if (m.type === "pen-comment") await updateHighlight(tab.url, m.id, { comment: m.comment });
    await remark(tab).catch((e) => console.warn("saved, but can't mark this page:", e.message));
  }).catch((e) => console.warn("pen", e));
});

// ---------- the page dock and reading position ----------

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const tab = sender.tab;
  if (!tab || !/^(dock-|read-pos|pen-off)/.test(m?.type || "")) return;
  const answers = ["dock-get", "dock-note", "dock-pen"].includes(m.type); // these reply
  if (m.type === "dock-panel") {
    chrome.sidePanel.open({ tabId: tab.id }).catch((e) => console.warn("side panel", e)); // right after the click
    return;
  }
  (async () => {
    if (m.type === "pen-off") return chrome.tabs.sendMessage(tab.id, { type: "pen-state", on: false }).catch(() => {});
    if (m.type === "dock-get") return reply({ text: (await noteFor(tab.url))?.text || "" });
    if (m.type === "dock-note") { await setNoteText(tab, m.text); return reply({ ok: true }); }
    if (m.type === "dock-show") return remark(tab).catch(() => {});
    if (m.type === "dock-pen") {
      const on = await inPage(tab, penIsOn, [], false);
      if (on) await inPage(tab, stopPen, [], false);
      else await inPage(tab, startPen, ["yellow", HL_COLORS.yellow], false);
      chrome.runtime.sendMessage({ type: "pen-changed", tabId: tab.id }).catch(() => {}); // the side panel re-reads it
      return reply({ on: !on });
    }
    if (m.type === "dock-hide-site") {
      const { dockHidden = [] } = await chrome.storage.local.get("dockHidden");
      const origin = new URL(tab.url).origin;
      if (!dockHidden.includes(origin)) await chrome.storage.local.set({ dockHidden: [...dockHidden, origin] });
      return;
    }
    if (m.type === "dock-pos") return chrome.storage.local.set({ dockY: m.y });
    if (m.type === "read-pos") {
      const it = (await getItems()).find((x) => pageKey(x.url) === pageKey(tab.url));
      if (!it || (it.pos && Math.abs(it.pos.pct - m.pct) < 10 && Date.now() - it.pos.at < 60000 && m.pct <= 95)) return; // small, recent move (the end is always saved)
      await updateItem(it.id, { pos: { pct: m.pct, at: Date.now() } });
    }
  })().catch((e) => {
    console.warn("dock", e);
    if (answers) reply({ error: String(e?.message || e) }); // don't leave the page waiting
  });
  return answers;
});
