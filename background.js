// Background worker: right-click "Save for later", Alt+Shift+S, reminders, daily resurface, auto-tidy.
importScripts("core.js", "tidy.js");

const TIDY_ALARM = "auto-tidy";
const RESURFACE_ALARM = "resurface";
const REVIEW_ALARM = "weekly-review";

function next10am() {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function syncAlarms() {
  await migrate();
  await pruneHistory();
  if (!(await chrome.alarms.get(REVIEW_ALARM))) {
    chrome.alarms.create(REVIEW_ALARM, { when: nextReviewTime(), periodInMinutes: 7 * 24 * 60 });
  }
  const { autoTidy } = await tidySettings();
  if (!autoTidy) await chrome.alarms.clear(TIDY_ALARM);
  else if (!(await chrome.alarms.get(TIDY_ALARM))) chrome.alarms.create(TIDY_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });

  const { resurface = true } = await chrome.storage.local.get("resurface");
  if (!resurface) await chrome.alarms.clear(RESURFACE_ALARM);
  else if (!(await chrome.alarms.get(RESURFACE_ALARM))) chrome.alarms.create(RESURFACE_ALARM, { when: next10am(), periodInMinutes: 24 * 60 });

  // Re-create reminder alarms (they are lost if the extension is reloaded).
  for (const it of await getItems()) {
    if (it.remindAt && !it.read && !(await chrome.alarms.get("remind:" + it.id))) {
      chrome.alarms.create("remind:" + it.id, { when: Math.max(it.remindAt, Date.now() + 60_000) });
    }
  }
  refreshBadge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll(); // updates keep old menus; start clean
  chrome.contextMenus.create({ id: "save-page", title: "Save page for later", contexts: ["page"] });
  chrome.contextMenus.create({ id: "save-link", title: "Save link for later", contexts: ["link"] });
  chrome.contextMenus.create({ id: "pin-site", title: "Pin this site to Library", contexts: ["page"] });
  chrome.contextMenus.create({ id: "highlight", title: "Highlight (page notes)", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "save-phrase", title: "Save “%s” to Phrasebook", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "notes-panel", title: "Open notes for this page", contexts: ["page"] });
  syncAlarms();
});
chrome.runtime.onStartup.addListener(syncAlarms);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoTidy || changes.resurface) syncAlarms();
  if (changes.items) refreshBadge();
});

function toast(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message, priority: 0 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-link") {
    await saveForLater({ url: info.linkUrl, title: info.selectionText || info.linkUrl });
    toast("Saved for later", info.selectionText || info.linkUrl);
  } else if (info.menuItemId === "save-page" && tab) {
    addStats((await saveForLater(tab)).id, tab);
    toast("Saved for later", tab.title);
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
  toast(p.kind === "quote" ? "Quote saved" : p.seen > 1 ? `Seen again (${p.seen}×)` : "Saved to Phrasebook",
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
  addStats((await saveForLater(tab)).id, tab);
  toast("Saved for later", tab.title);
});

// ---------- alarms ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TIDY_ALARM) {
    const { autoTidy, tidyDays } = await tidySettings();
    if (autoTidy) await tidyTabs(tidyDays);
  } else if (alarm.name === RESURFACE_ALARM) {
    await pruneHistory();
    await resurfaceOne();
  } else if (alarm.name === REVIEW_ALARM) {
    const n = forReview(await getItems()).length;
    const w = quizQueue(await getPhrases()).length;
    if (n || w) {
      const parts = [n && `${n} page${n > 1 ? "s" : ""} in your Inbox`, w && `${w} word${w > 1 ? "s" : ""} to practise`].filter(Boolean);
      chrome.notifications.create("review", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Weekly review",
        message: parts.join(" · ") + ".",
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
  refreshBadge();
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
    title: "From your Later list",
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
  else await setReminder(id, "tomorrow");
  chrome.notifications.clear(nid);
});

// ---------- auto-session when a window closes ----------
// Chrome gives no tab list once a window is gone, so keep a snapshot of each normal window
// (in session storage) and turn it into a temporary session when the window closes.

const snapTimers = {};

function scheduleSnap(windowId) {
  if (windowId == null || windowId < 0) return;
  clearTimeout(snapTimers[windowId]);
  snapTimers[windowId] = setTimeout(() => snapWindow(windowId), 1500);
}

async function snapWindow(windowId) {
  let win;
  try { win = await chrome.windows.get(windowId, { populate: true }); } catch { return; }
  if (win.type !== "normal" || win.incognito) return;
  const tabs = win.tabs.filter((t) => /^https?:/.test(t.url));
  const { winSnaps = {} } = await chrome.storage.session.get("winSnaps");
  winSnaps[windowId] = await snapshotTabs(tabs);
  await chrome.storage.session.set({ winSnaps });
}

chrome.tabs.onCreated.addListener((t) => scheduleSnap(t.windowId));
chrome.tabs.onUpdated.addListener((id, change, t) => { if (change.status === "complete" || change.title || change.groupId !== undefined) scheduleSnap(t.windowId); });
chrome.tabs.onMoved.addListener((id, info) => scheduleSnap(info.windowId));
chrome.tabs.onAttached.addListener((id, info) => scheduleSnap(info.newWindowId));
chrome.tabs.onDetached.addListener((id, info) => scheduleSnap(info.oldWindowId));
chrome.tabs.onRemoved.addListener((id, info) => { if (!info.isWindowClosing) scheduleSnap(info.windowId); });
chrome.tabGroups.onUpdated.addListener((g) => scheduleSnap(g.windowId));

chrome.windows.onRemoved.addListener(async (windowId) => {
  clearTimeout(snapTimers[windowId]);
  const { winSnaps = {} } = await chrome.storage.session.get("winSnaps");
  const snap = winSnaps[windowId];
  delete winSnaps[windowId];
  await chrome.storage.session.set({ winSnaps });
  const { autoSession = true } = await chrome.storage.local.get("autoSession");
  if (autoSession && snap && snap.length >= 2) {
    await addSession(snap, "auto", `closed window · ${snap.length} tabs`, true);
  }
});

// Snapshot windows that were already open when the worker started.
chrome.windows.getAll({ windowTypes: ["normal"] }).then((wins) => wins.forEach((w) => scheduleSnap(w.id)));

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
    } else {
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

// Badge "●" on the icon while the current window is working on a project.
async function showWorkingBadge(windowId) {
  const on = (await getWorkingOn())[windowId];
  const due = (await getItems()).filter((i) => isDue(i)).length;
  if (!due) chrome.action.setBadgeText({ text: on ? "●" : "" });
}
chrome.windows.onFocusChanged.addListener((w) => { if (w > 0) showWorkingBadge(w); });
chrome.storage.session.onChanged?.addListener?.((c) => {
  if (c.workingOn) chrome.windows.getLastFocused().then((w) => showWorkingBadge(w.id)).catch(() => {});
});

// ---------- auto "read": a saved page counts as read after 2 minutes of real viewing ----------
// Time only counts while the page is the active tab of a focused window and you are not idle.

const READ_AFTER_MS = 2 * 60 * 1000;
const READ_TICK = "read-tick";
let idleState = "active";
let viewQueue = Promise.resolve();
const serialView = (fn) => (viewQueue = viewQueue.then(fn).catch((e) => console.warn("read tracking", e)));

async function currentViewUrl() {
  if (idleState !== "active") return null;
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab && /^https?:/.test(tab.url) ? tab.url : null;
}

// Adds the time since the last check to the page being viewed, then starts timing `next`.
function trackView() {
  return serialView(async () => {
    const next = await currentViewUrl();
    const { viewing = null, viewTime = {} } = await chrome.storage.session.get(["viewing", "viewTime"]);
    const now = Date.now();
    if (viewing?.url) {
      const total = (viewTime[viewing.url] || 0) + Math.min(now - viewing.since, 5 * 60 * 1000);
      viewTime[viewing.url] = total;
      if (total >= READ_AFTER_MS) await markReadByUrl(viewing.url);
    }
    await chrome.storage.session.set({ viewing: next ? { url: next, since: now } : null, viewTime });
  });
}

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((s) => { idleState = s; trackView(); });
chrome.tabs.onActivated.addListener(trackView);
chrome.windows.onFocusChanged.addListener(trackView);
chrome.tabs.onUpdated.addListener((id, change, tab) => { if (change.url && tab.active) trackView(); });
chrome.alarms.get(READ_TICK).then((a) => a || chrome.alarms.create(READ_TICK, { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === READ_TICK) trackView(); });

// ---------- page notes: highlight the selection, show highlights again ----------

async function highlightSelection(tab, fallbackText = "") {
  let got = null;
  try { got = await inPage(tab, readHighlight, [], false); } catch (e) { console.warn("cannot read this page", e); }
  if (!got?.text) got = { text: fallbackText, prefix: "", suffix: "" };
  if (!got.text) return toast("Nothing selected", "Select some text first.");
  await addHighlight(tab, got);
  remark(tab).catch(() => {}); // also puts the bubble and highlight bar on the page
}

// On sites you allowed: the selection bubble is ready and your highlights show again.
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  if (!(await chrome.permissions.contains({ origins: [new URL(tab.url).origin + "/*"] }))) return;
  const n = await noteFor(tab.url);
  (n?.highlights.length ? remark(tab) : pageTools(tab)).catch(() => {});
});

// The highlighter pen and the bar on highlights talk to the extension through messages.
// One at a time: quick selections would otherwise overwrite each other's save.
let penQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((m, sender) => {
  const tab = sender.tab;
  if (!tab || !/^(pen|bubble)-/.test(m?.type || "") || m.type === "pen-off") return;
  penQueue = penQueue.then(async () => {
    if (m.type === "bubble-word") {
      const p = await savePhrase({ ...m.data, url: tab.url, title: tab.title });
      if (p) enrichPhrase(p.id).catch(() => {});
      return;
    }
    if (m.type === "pen-highlight") await addHighlight(tab, m.data);
    else if (m.type === "pen-delete") await deleteHighlight(tab.url, m.id);
    else if (m.type === "pen-color") await updateHighlight(tab.url, m.id, { color: m.color });
    else if (m.type === "pen-comment") await updateHighlight(tab.url, m.id, { comment: m.comment });
    await remark(tab).catch((e) => console.warn("saved, but can't mark this page:", e.message));
  }).catch((e) => console.warn("pen", e));
});

// Saved pages without a length get measured the next time they load, where the extension
// may read the site (sites you allowed for highlights, or "always show highlights").
chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== "complete" || !/^https?:/.test(tab.url || "")) return;
  const it = (await getItems()).find((x) => x.url === tab.url && !x.minutes);
  if (!it) return;
  if (!(await chrome.permissions.contains({ origins: [new URL(tab.url).origin + "/*"] }))) return;
  addStats(it.id, tab);
});
