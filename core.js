// Shared by the popup, the side panel, the Library page and the background worker (plain script, no modules).
// Items: pages you saved. They land in the Inbox (stage "inbox") with an AI-suggested collection
// path such as "AI/Agents"; the weekly review files them (stage "kept") or discards them.

const TYPES = ["Course", "Video", "Tool", "Article", "Docs", "Paper", "Other"];
const TAB_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];
const UNSORTED = "Unsorted";
const DAY_MS = 864e5;

// ---------- small helpers ----------

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "other"; }
}

// "3 Nov 14:20" — used for session names and dates everywhere.
function stamp(ts = Date.now()) {
  const d = new Date(ts);
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

// "AI/Agents" -> "AI › Agents"
function pathLabel(path) {
  return (path || UNSORTED).split("/").join(" › ");
}

// Tidies user input like " ai › agents / " into "ai/agents" (max 3 levels).
function cleanPath(p) {
  const parts = String(p || "").split(/[\/›>]/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  return parts.length ? parts.map((s) => s.slice(0, 40)).join("/") : UNSORTED;
}

function aiSupported() {
  return typeof LanguageModel !== "undefined";
}

// Chrome asks every session to declare its languages (supported outputs: de, en, es, fr, ja).
// All prompts and answers are English; page titles in other languages still work as input.
const AI_LANGS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

let aiAvail = null;
async function aiAvailability() {
  if (!aiSupported()) return "unsupported";
  if (aiAvail === "available") return aiAvail; // cached once ready
  try { aiAvail = await LanguageModel.availability(AI_LANGS); } catch { aiAvail = "unsupported"; }
  return aiAvail;
}

// Creating a model session is the slow part (loads the model), so create one per page and
// hand out cheap clones for each prompt.
let aiBase = null;
async function aiSession(options) {
  if (options) return LanguageModel.create({ ...AI_LANGS, ...options });
  aiBase ||= LanguageModel.create(AI_LANGS).catch((e) => { aiBase = null; throw e; });
  const base = await aiBase;
  try { return await base.clone(); } catch { return LanguageModel.create(AI_LANGS); }
}

// ---------- reminders ----------

const REMIND_PRESETS = [
  ["", "No reminder"],
  ["tonight", "Tonight 20:00"],
  ["tomorrow", "Tomorrow 09:00"],
  ["saturday", "Saturday 10:00"],
  ["week", "In a week"],
  ["weekly", "Every week"],
];

// Returns { when, repeat } for a preset key, or null for "no reminder".
function presetTime(key, now = new Date()) {
  const d = new Date(now);
  if (key === "tonight") {
    d.setHours(20, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
  } else if (key === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (key === "saturday") {
    d.setDate(d.getDate() + (((6 - d.getDay()) + 7) % 7 || 7));
    d.setHours(10, 0, 0, 0);
  } else if (key === "week" || key === "weekly") {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  } else {
    return null;
  }
  return { when: d.getTime(), repeat: key === "weekly" ? "weekly" : "none" };
}

// Next Friday 16:00 (the weekly review), strictly after `now`.
function nextReviewTime(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  d.setHours(16, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d.getTime();
}

async function setReminder(id, key) {
  const r = presetTime(key);
  await chrome.alarms.clear("remind:" + id);
  if (r) chrome.alarms.create("remind:" + id, { when: r.when });
  await updateItem(id, { remindAt: r?.when || null, repeat: r?.repeat || "none" });
}

function isDue(item, now = Date.now()) {
  return !item.read && item.remindAt && item.remindAt <= now;
}

const OLD_INBOX_MS = 14 * DAY_MS;
function isOld(item, now = Date.now()) {
  return item.stage === "inbox" && item.created < now - OLD_INBOX_MS;
}

// Inbox items the weekly review should show (not pushed to next week).
function forReview(items, now = Date.now()) {
  return items.filter((x) => x.stage === "inbox" && !(x.reviewAfter > now));
}

// The number of due reminders, else "●" while the last focused window works on a project.
// items: optional, the worker passes its in-memory copy so a badge update reads no storage.
async function refreshBadge(items) {
  const due = (items || (await getItems())).filter((i) => isDue(i)).length;
  let text = due ? String(due) : "";
  if (!due) {
    try {
      const w = await chrome.windows.getLastFocused();
      if ((await getWorkingOn())[w.id]) text = "●";
    } catch {}
  }
  chrome.action.setBadgeBackgroundColor({ color: "#6C38FF" });
  chrome.action.setBadgeText({ text });
}

// ---------- items ----------

async function getItems() {
  const { items = [] } = await chrome.storage.local.get("items");
  return items;
}

async function setItems(items) {
  await chrome.storage.local.set({ items });
}

async function updateItem(id, patch) {
  const items = await getItems();
  const it = items.find((x) => x.id === id);
  if (it) Object.assign(it, patch);
  await setItems(items);
  return it;
}

// Marks a saved page read (auto after real viewing, see background.js). True if it changed.
async function markReadByUrl(url) {
  const items = await getItems();
  const it = items.find((x) => pageKey(x.url) === pageKey(url) && !x.read);
  if (!it) return false;
  it.read = true;
  it.readAt = Date.now();
  await setItems(items);
  return true;
}

const deleteItem = (id) => deleteMany([id]);

// Files an inbox item into a collection (creates the collection if new).
const keepItem = (id, path) => keepMany([id], path);

async function laterItem(id) {
  await updateItem(id, { reviewAfter: nextReviewTime() });
}

// Quick guess without AI, so a save is never empty. The AI refines it later.
function guessType(url, title = "") {
  const s = (url + " " + title).toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|\bvideo\b/.test(s)) return "Video";
  if (/arxiv\.org|\.pdf\b|doi\.org|semanticscholar|researchgate|paperswithcode|openreview|\bpaper\b/.test(s)) return "Paper";
  if (/course|\/learn\/|udemy|coursera|edx\.org|tutorial|lesson|bootcamp|\bunit\s?\d/.test(s)) return "Course";
  if (/docs\.|\/docs\b|\/documentation|readthedocs|reference|\bapi\b/.test(s)) return "Docs";
  if (/github\.com|gitlab\.com|npmjs\.com|pypi\.org|chromewebstore|\.app\b|\btool\b/.test(s)) return "Tool";
  if (/blog|medium\.com|substack|news|article|\/post\//.test(s)) return "Article";
  return "Other";
}

// Saves a page into the Inbox (dedupes by URL) and returns at once. The AI sort runs after,
// without blocking; if it can't finish here (popup closed, no AI in the worker) the Library
// page sorts it on next open. `sorted` resolves when the AI is done (or skipped).
async function saveForLater({ url, title }, remindKey = "", { sort = true } = {}) {
  const items = await getItems();
  let it = items.find((x) => x.url === url);
  if (!it) {
    it = {
      id: crypto.randomUUID(),
      url,
      title: title || url,
      type: guessType(url, title),
      stage: "inbox",
      path: UNSORTED,
      tags: [],
      why: "",
      read: false,
      readAt: null,
      progress: null,
      remindAt: null,
      repeat: "none",
      reviewAfter: null,
      created: Date.now(),
      needsAi: true,
    };
    items.unshift(it);
    await setItems(items);
  }
  if (remindKey) await setReminder(it.id, remindKey);
  it.sorted = it.needsAi && sort
    ? aiAvailability().then((a) => (a === "available" ? classifyItem(it.id) : null)).catch((e) => console.warn("AI sort failed", e))
    : Promise.resolve();
  return it;
}

// Pure: tidies tags ("#Deep Research" -> "deep-research") and merges them, max 5.
function mergeTags(have = [], add = []) {
  const clean = (t) => String(t).toLowerCase().replace(/^#/, "").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 30);
  return [...new Set([...have, ...add].map(clean).filter(Boolean))].slice(0, 5);
}

function allTags(items) {
  const n = {};
  items.forEach((it) => (it.tags || []).forEach((t) => (n[t] = (n[t] || 0) + 1)));
  return Object.keys(n).sort((a, b) => n[b] - n[a]);
}

async function aiClassify(item, paths, tags = []) {
  const session = await aiSession();
  const schema = {
    type: "object",
    properties: {
      type: { type: "string", enum: TYPES },
      path: { type: "string" },
      why: { type: "string" },
      units: { type: "integer" },
      tags: { type: "array", items: { type: "string" }, maxItems: 2 },
    },
    required: ["type", "path", "why", "units", "tags"],
  };
  const prompt =
    `A user saved this web page to come back to later.\n` +
    `Title: ${item.title}\nURL: ${item.url}\n\n` +
    `The user's collections (a tree, "/" separates levels):\n${paths.join("\n") || "(none yet)"}\n\n` +
    `Return:\n- type: one of ${TYPES.join(", ")}\n` +
    `- path: the best collection for it. Reuse an existing one if it fits; go one level deeper only if the ` +
    `page is clearly about a narrower subject. Otherwise make a new path of 1-3 short levels, broad first, ` +
    `e.g. "AI/Agents" or "Electronics/PCB".\n` +
    `- why: max 12 words, what this is and why it is worth coming back to\n` +
    `- units: if it is a course with a known number of units/lessons, that number, else 0\n` +
    `- tags: 0-2 short lowercase tags that link it to related pages in other collections ` +
    `(reuse these if they fit: ${tags.slice(0, 40).join(", ") || "none yet"}); no tag that only repeats the path`;
  try {
    return JSON.parse(await session.prompt(prompt, { responseConstraint: schema }));
  } finally {
    session.destroy();
  }
}

async function classifyItem(id) {
  const items = await getItems();
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const paths = (await getCollections()).filter((p) => p !== UNSORTED).slice(0, 60);
  const r = await aiClassify(it, paths, allTags(items));
  // re-read: the user may have filed it while the AI was thinking
  const now = (await getItems()).find((x) => x.id === id);
  if (!now?.needsAi) return;
  const patch = {
    type: TYPES.includes(r.type) ? r.type : now.type,
    why: (r.why || "").trim().slice(0, 120),
    tags: mergeTags(now.tags, Array.isArray(r.tags) ? r.tags.slice(0, 2) : []),
    needsAi: false,
  };
  if (now.stage === "inbox") patch.path = cleanPath(r.path || now.path); // never move a page the user filed
  if (patch.type === "Course" && r.units > 0 && !now.progress) patch.progress = { done: 0, total: Math.min(r.units, 200) };
  await updateItem(id, patch);
  return patch;
}

// Sorts everything still waiting for the AI. Returns how many were sorted.
async function classifyPending(onProgress) {
  if ((await aiAvailability()) !== "available") return 0;
  const pending = (await getItems()).filter((x) => x.needsAi);
  let n = 0;
  for (const it of pending) {
    try { await classifyItem(it.id); n++; onProgress?.(n, pending.length); } catch (e) { console.warn(e); }
  }
  return n;
}

// ---------- collections (a tree of "A/B/C" paths) ----------
// The pure helpers (withPath, renamePaths, deletePaths) do the work; the async ones store it.

const sortPaths = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

function inPath(itemPath, path) {
  return itemPath === path || (itemPath || "").startsWith(path + "/");
}

// Adds a path and every parent of it, so the tree has no gaps.
function withPath(cols, path) {
  const p = cleanPath(path);
  if (p === UNSORTED) return sortPaths(cols);
  const parts = p.split("/");
  const out = [...cols];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return sortPaths(out);
}

// Renames a branch in collections and pages (also used to merge one branch into another).
function renamePaths(cols, items, from, to) {
  const target = cleanPath(to);
  const move = (p) => (inPath(p, from) ? target + p.slice(from.length) : p);
  return {
    collections: withPath(cols.map(move), target),
    items: items.map((it) => (inPath(it.path, from) ? { ...it, path: move(it.path) } : it)),
  };
}

// Deletes a branch; its pages move up to the parent (or Unsorted).
function deletePaths(cols, items, path) {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : UNSORTED;
  return {
    collections: cols.filter((p) => !inPath(p, path)),
    items: items.map((it) => (inPath(it.path, path) ? { ...it, path: parent } : it)),
  };
}

async function getCollections() {
  const { collections = [] } = await chrome.storage.local.get("collections");
  return collections;
}

async function addCollection(path) {
  await chrome.storage.local.set({ collections: withPath(await getCollections(), path) });
}

async function renameCollection(from, to) {
  await chrome.storage.local.set(renamePaths(await getCollections(), await getItems(), from, to));
}

async function deleteCollection(path) {
  await chrome.storage.local.set(deletePaths(await getCollections(), await getItems(), path));
}

// ---------- pins (pinned sites, Library pins row) ----------

async function getPins() {
  const { pins = [] } = await chrome.storage.local.get("pins");
  return pins;
}

async function setPins(pins) {
  await chrome.storage.local.set({ pins });
}

async function pinSite({ url, title }) {
  const pins = await getPins();
  if (!pins.some((p) => p.url === url)) pins.push({ id: crypto.randomUUID(), url, title: title || hostOf(url) });
  await setPins(pins);
}

async function unpinSite(url) {
  await setPins((await getPins()).filter((p) => p.url !== url));
}

// ---------- storage schema and migration ----------
// v1: items with `topic`.  v2: Inbox + collection paths; sessions, workspaces and the
// archive mixed in `library`.  v3: `library` split into `projects` (was workspaces) and
// `history` (sessions + archive).  v4: everything in history expires after 30 days; tidied
// entries from before v4 get 30 days from the upgrade (`keepFrom`) instead of vanishing.
// v5: page `status` (todo / doing / done) replaced by `read` (done = read).
// v6: Phrasebook quotes move into page notes (`notes`) as highlights.
// v7: no stored favicon URLs (shown with faviconFor(url)); the old `backupV2` copy is dropped.

const SCHEMA = 7;
const DATA_KEYS = ["schema", "items", "collections", "pins", "projects", "history", "library", "phrases", "notes"];
// user settings in chrome.storage.local (go into backups; caches and session data do not)
const SETTINGS_KEYS = ["resurface", "autoSession", "autoTidy", "tidyDays", "dockHidden", "dockY"];

function sessionKind(s) {
  return s.kind || (s.tidied ? "tidied" : "saved");
}

const byIdUnique = (list) => [...new Map(list.map((x) => [x.id, x])).values()];

// Pure: upgrades stored data to the current schema; never changes its input.
function migrateData(input, now = Date.now()) {
  const d = structuredClone(input);
  let schema = d.schema || 1;
  if (schema < 2) {
    const cols = new Set(d.collections || []);
    for (const it of d.items || []) {
      if (!it.stage) it.stage = "inbox";
      if (!it.path) it.path = it.topic ? cleanPath(it.topic) : UNSORTED;
      if (!it.tags) it.tags = [];
      if (it.path !== UNSORTED) cols.add(it.path);
      delete it.topic;
    }
    d.collections = sortPaths([...cols]);
    schema = 2;
  }
  if (schema < 3) {
    const lib = d.library || [];
    const ws = lib.filter((s) => sessionKind(s) === "workspace");
    const rest = lib.filter((s) => sessionKind(s) !== "workspace");
    d.projects = byIdUnique([
      ...(d.projects || []),
      ...ws.map((s) => ({ id: s.id, name: s.name, created: s.saved, updated: s.updated || s.saved, tabs: s.tabs || [] })),
    ]);
    d.history = byIdUnique([
      ...(d.history || []),
      ...rest.map((s) => ({ id: s.id, name: s.name, saved: s.saved, kind: sessionKind(s), tabs: s.tabs || [] })),
    ]);
    delete d.library;
    schema = 3;
  }
  if (schema < 4) {
    for (const s of d.history || []) if (sessionKind(s) === "tidied" && !s.keepFrom) s.keepFrom = now;
    schema = 4;
  }
  if (schema < 5) {
    for (const it of d.items || []) {
      if (!("read" in it)) {
        it.read = it.status === "done";
        it.readAt = it.read ? it.readAt || now : null;
      }
      delete it.status;
    }
    schema = 5;
  }
  if (schema < 6) {
    const notes = d.notes || {};
    for (const q of (d.phrases || []).filter((p) => p.kind === "quote")) {
      const k = pageKey(q.url || "");
      const n = (notes[k] ||= { url: k, title: q.title || k, favIconUrl: "", highlights: [], text: "", created: q.created, updated: q.created });
      if (!n.highlights.some((x) => x.id === q.id)) {
        n.highlights.push({ id: q.id, text: q.text, prefix: "", suffix: "", color: "yellow", comment: q.note || "", created: q.created });
      }
    }
    if (d.phrases) d.phrases = d.phrases.filter((p) => p.kind !== "quote");
    if (Object.keys(notes).length) d.notes = notes;
    schema = 6;
  }
  if (schema < 7) {
    const strip = (list) => (list || []).forEach((x) => delete x.favIconUrl);
    strip(d.items);
    strip(d.pins);
    for (const s of d.history || []) strip(s.tabs);
    for (const p of d.projects || []) { strip(p.tabs); strip(p.sources); }
    strip(Object.values(d.notes || {}));
    delete d.backupV2;
    schema = 7;
  }
  d.schema = schema;
  return d;
}

// Runs once per upgrade (export a backup from the Library to keep a copy).
async function migrate() {
  const { schema = 1 } = await chrome.storage.local.get("schema");
  if (schema >= SCHEMA) return; // cheap check first: most calls find nothing to do
  const d = await chrome.storage.local.get(DATA_KEYS);
  await chrome.storage.local.set(migrateData(d));
  await chrome.storage.local.remove(["library", "backupV2"]);
}

// Pure: a backup file (any older schema) merged into the current data without duplicates,
// plus the settings it carries. Throws before merging anything if the file can't be used.
function mergeBackup(cur, raw, now = Date.now()) {
  if (raw?.app !== "tab-organiser") throw new Error("not a Tab Organiser backup");
  const schema = raw.schema || (raw.version >= 3 ? 2 : 1);
  if (schema > SCHEMA) throw new Error(`this backup is from a newer Tab Organiser (schema ${schema}, this one reads up to ${SCHEMA}); update the extension first`);
  const d = migrateData({ ...raw, schema }, now);
  const merge = (mine = [], theirs = [], key = "id") => {
    const ids = new Set(mine.map((x) => x[key]));
    return [...mine, ...(theirs || []).filter((x) => x[key] && !ids.has(x[key]))];
  };
  const settings = Object.fromEntries(SETTINGS_KEYS.filter((k) => raw.settings?.[k] !== undefined).map((k) => [k, raw.settings[k]]));
  return {
    ...settings,
    items: merge(cur.items, d.items),
    pins: merge(cur.pins, d.pins, "url"),
    projects: merge(cur.projects, d.projects),
    history: merge(cur.history, d.history),
    phrases: merge(cur.phrases, d.phrases),
    // notes merge per page: keep yours, add highlights you don't have
    notes: Object.entries(d.notes || {}).reduce((acc, [k, n]) => {
      const mine = acc[k];
      if (!mine) acc[k] = n;
      else {
        acc[k] = { ...mine, highlights: merge(mine.highlights, n.highlights) };
        if (!mine.text?.trim()) acc[k].text = n.text || "";
      }
      return acc;
    }, { ...(cur.notes || {}) }),
    collections: sortPaths([...(cur.collections || []), ...(d.collections || [])]),
  };
}

// ---------- history: temporary window snapshots and tidied tabs ----------
// kind: "saved" (Save session), "auto" (a window you closed) or "tidied" (closed by Tidy).

async function getHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  return history;
}

async function setHistory(history) {
  await chrome.storage.local.set({ history });
}

async function snapshotTabs(tabs) {
  const groups = await chrome.tabGroups.query({});
  const groupOf = Object.fromEntries(groups.map((g) => [g.id, g]));
  return tabs.map((t) => ({
    url: t.url,
    title: t.title,
    group: groupOf[t.groupId]?.title || "",
    color: groupOf[t.groupId]?.color || "",
  }));
}

// Names always start with the date. `tabs` are chrome tabs, or snapshots when `snap` is true.
async function addSession(tabs, kind, label, snap = false) {
  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    name: label ? `${stamp(now)} · ${label}` : stamp(now),
    saved: now,
    kind,
    tabs: snap ? tabs : await snapshotTabs(tabs),
  };
  const history = await getHistory();
  history.unshift(entry);
  await setHistory(history);
  return entry;
}

// Everything in History is temporary: 30 days, unless you move it somewhere (a project,
// the Inbox, a collection).
const SESSION_DAYS = 30;
const HISTORY_KINDS = { auto: "Closed window", saved: "Saved session", tidied: "Tidied" };
function isTemporary(s) {
  return sessionKind(s) in HISTORY_KINDS;
}
function expiresInDays(s, now = Date.now()) {
  const from = Math.max(s.saved || 0, s.keepFrom || 0);
  return Math.max(0, Math.ceil((from + SESSION_DAYS * DAY_MS - now) / DAY_MS));
}
function freshHistory(list, now = Date.now()) {
  return list.filter((s) => !isTemporary(s) || expiresInDays(s, now) > 0);
}

async function pruneHistory(now = Date.now()) {
  const list = await getHistory();
  const keep = freshHistory(list, now);
  if (keep.length !== list.length) await setHistory(keep);
  return list.length - keep.length;
}

async function editHistory(id, fn) {
  const list = await getHistory();
  const s = list.find((x) => x.id === id);
  if (!s) return;
  fn(s);
  await setHistory(list.filter((x) => x.tabs.length));
}

// ---------- projects (today: named tab sets, formerly "workspaces") ----------

async function getProjects() {
  const { projects = [] } = await chrome.storage.local.get("projects");
  return projects;
}

async function setProjects(projects) {
  await chrome.storage.local.set({ projects });
}

async function addProject(name, tabs, snap = false) {
  const now = Date.now();
  const p = { id: crypto.randomUUID(), name, created: now, updated: now, tabs: snap ? tabs : await snapshotTabs(tabs) };
  const list = await getProjects();
  list.unshift(p);
  await setProjects(list);
  return p;
}

async function editProject(id, fn) {
  const list = await getProjects();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  fn(p);
  p.updated = Date.now();
  await setProjects(list);
}

async function deleteProject(id) {
  await setProjects((await getProjects()).filter((x) => x.id !== id));
}

// A temporary session becomes a permanent project.
async function promoteSession(id, name) {
  const s = (await getHistory()).find((x) => x.id === id);
  if (!s) return null;
  const p = await addProject(name, s.tabs, true);
  await setHistory((await getHistory()).filter((x) => x.id !== id));
  return p;
}

// Opens tabs in a new window and rebuilds their groups and colours.
async function restoreTabs(tabs) {
  const win = await chrome.windows.create({ url: tabs.map((t) => t.url) });
  const byGroup = {};
  win.tabs.forEach((t, i) => {
    const saved = tabs[i];
    if (saved?.group) (byGroup[saved.group] ||= { ids: [], color: saved.color }).ids.push(t.id);
  });
  let k = 0;
  for (const [title, { ids, color }] of Object.entries(byGroup)) {
    const gid = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId: win.id } });
    await chrome.tabGroups.update(gid, { title, color: TAB_COLORS.includes(color) ? color : TAB_COLORS[k++ % TAB_COLORS.length] });
  }
}

function faviconFor(url, size = 32) {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

// ---------- phrasebook: words, phrases and quotes you select on pages ----------
// A selection of up to 5 words is vocabulary ("word" or "phrase"); longer is a "quote"
// that belongs to the page it came from.

const QUOTE_WORDS = 5;

function phraseKind(text) {
  const n = String(text).trim().split(/\s+/).filter(Boolean).length;
  return n <= 1 ? "word" : n <= QUOTE_WORDS ? "phrase" : "quote";
}

// Language without AI: Polish letters, then the page's lang attribute, else English.
function guessLang(text, pageLang = "") {
  if (/[ąćęłńśźż]/i.test(text)) return "pl";
  if (/[çğış]/i.test(text) && /[ğış]/i.test(text)) return "tr";
  const page = String(pageLang).toLowerCase().split("-")[0];
  return /^[a-z]{2,3}$/.test(page) ? page : "en";
}

function langName(code) {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code; } catch { return code; }
}

// Dictionary links for a word in its language (opened by the user, nothing is fetched).
function dictLinks(text, lang) {
  const w = String(text).trim().toLowerCase();
  const q = encodeURIComponent(w);
  const dashed = encodeURIComponent(w.replace(/\s+/g, "-"));
  if (lang === "en") {
    return [
      ["Cambridge", `https://dictionary.cambridge.org/dictionary/english/${dashed}`],
      ["Collins", `https://www.collinsdictionary.com/dictionary/english/${dashed}`],
      ["Google", `https://www.google.com/search?q=define+${q}`],
    ];
  }
  if (lang === "pl") {
    return [
      ["PWN", `https://sjp.pwn.pl/szukaj/${q}.html`],
      ["Wiktionary", `https://pl.wiktionary.org/wiki/${q}`],
      ["Cambridge PL-EN", `https://dictionary.cambridge.org/dictionary/polish-english/${dashed}`],
    ];
  }
  return [
    ["Wiktionary", `https://en.wiktionary.org/wiki/${q}`],
    ["Google Translate", `https://translate.google.com/?sl=${encodeURIComponent(lang)}&tl=en&text=${q}`],
  ];
}

// Splits a sentence around the saved text (case-insensitive) so the view can bold it.
function highlightParts(sentence, text) {
  const s = String(sentence || ""), t = String(text || "").trim();
  const i = t ? s.toLowerCase().indexOf(t.toLowerCase()) : -1;
  return i < 0 ? [s, "", ""] : [s.slice(0, i), s.slice(i, i + t.length), s.slice(i + t.length)];
}

// Monday 00:00 of the week `ts` is in (local time).
function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// The weekly quiz: up to 10 words saved in the last 7 days or marked "again",
// not already quizzed in the last 3 days. Newest first, "again" words first of all.
function quizQueue(phrases, now = Date.now(), max = 10) {
  return phrases
    .filter((p) => p.kind !== "quote")
    .filter((p) => p.created >= now - 7 * DAY_MS || p.again)
    .filter((p) => !(p.quizzedAt > now - 3 * DAY_MS))
    .sort((a, b) => (b.again ? 1 : 0) - (a.again ? 1 : 0) || b.created - a.created)
    .slice(0, max);
}

async function getPhrases() {
  const { phrases = [] } = await chrome.storage.local.get("phrases");
  return phrases;
}

async function setPhrases(phrases) {
  await chrome.storage.local.set({ phrases });
}

async function updatePhrase(id, patch) {
  const list = await getPhrases();
  const p = list.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  await setPhrases(list);
  return p;
}

async function deletePhrase(id) {
  await setPhrases((await getPhrases()).filter((x) => x.id !== id));
}

// Saves a selection. Same word again (same language) just counts another sighting.
async function savePhrase({ text, sentence = "", url = "", title = "", pageLang = "" }) {
  const clean = String(text).replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!clean) return null;
  const kind = phraseKind(clean);
  const lang = guessLang(sentence || clean, pageLang);
  const list = await getPhrases();
  const same = kind !== "quote" && list.find((p) => p.kind !== "quote" && p.text.toLowerCase() === clean.toLowerCase() && p.lang === lang);
  if (same) {
    same.seen = (same.seen || 1) + 1;
    same.lastSeen = Date.now();
    if (!same.sentence && sentence) same.sentence = sentence;
    await setPhrases(list);
    return same;
  }
  const p = {
    id: crypto.randomUUID(),
    text: clean,
    kind,
    lang,
    sentence: kind === "quote" ? "" : String(sentence).replace(/\s+/g, " ").trim().slice(0, 400),
    url,
    title,
    note: "",          // your own note
    ai: null,          // { definition, example, pos } from the local AI
    translation: "",   // into English, when not English
    seen: 1,
    created: Date.now(),
    again: false,
    quizzedAt: null,
    needsAi: true,
  };
  list.unshift(p);
  await setPhrases(list);
  return p;
}

// The language detector and translators (one per language) for a batch of phrases, each made
// once on first use; done() destroys them.
function phraseTools() {
  let det = null;
  const trs = new Map();
  return {
    detector: () => (det ||= LanguageDetector.create()),
    translator(lang) {
      if (!trs.has(lang)) {
        const opts = { sourceLanguage: lang, targetLanguage: "en" };
        trs.set(lang, Translator.availability(opts).then((a) => (a !== "unavailable" ? Translator.create(opts) : null)));
      }
      return trs.get(lang);
    },
    async done() {
      for (const x of [det, ...trs.values()]) { try { (await x)?.destroy?.(); } catch {} }
    },
  };
}

// Adds language detection, an AI definition and a translation, using whichever of Chrome's
// built-in APIs exist here. Leaves `needsAi` on if the main model isn't ready yet.
async function enrichPhrase(id, tools) {
  if (!tools) {
    const own = phraseTools();
    try { return await enrichPhrase(id, own); } finally { await own.done(); }
  }
  const p = (await getPhrases()).find((x) => x.id === id);
  if (!p) return;
  const patch = { detected: true };
  // language + translation run once; only the AI definition is retried while the model loads
  if (!p.detected && typeof LanguageDetector !== "undefined") {
    try {
      const det = await tools.detector();
      const [top] = await det.detect(p.sentence || p.text);
      if (top && top.confidence > 0.6 && top.detectedLanguage !== "und") patch.lang = top.detectedLanguage.split("-")[0];
    } catch (e) { console.warn("language detect", e); }
  }
  const lang = patch.lang || p.lang;
  if (!p.detected && lang !== "en" && typeof Translator !== "undefined") {
    try {
      const tr = await tools.translator(lang);
      if (tr) patch.translation = (await tr.translate(p.text)).slice(0, 300);
    } catch (e) { console.warn("translate", e); }
  }
  let aiDone = p.kind === "quote";
  if (!aiDone && (await aiAvailability()) === "available") {
    try {
      const s = await aiSession();
      const schema = {
        type: "object",
        properties: { definition: { type: "string" }, example: { type: "string" }, pos: { type: "string" } },
        required: ["definition", "example", "pos"],
      };
      let out;
      try {
        out = JSON.parse(await s.prompt(
          `Explain the ${langName(lang)} ${p.kind} "${p.text}" like a learner's dictionary, in English.\n` +
          (p.sentence ? `It appeared in this sentence: "${p.sentence}"\nGive the meaning used there.\n` : "") +
          `Return: definition (max 20 words), example (one new short sentence in ${langName(lang)} using it), ` +
          `pos (noun, verb, adjective, adverb, phrase, idiom or other).`,
          { responseConstraint: schema }));
      } finally {
        s.destroy();
      }
      patch.ai = { definition: String(out.definition).slice(0, 200), example: String(out.example).slice(0, 200), pos: String(out.pos).slice(0, 20) };
      aiDone = true;
    } catch (e) { console.warn("AI define", e); }
  }
  patch.needsAi = !aiDone;
  await updatePhrase(id, patch);
}

async function enrichPendingPhrases(onProgress) {
  const ready = (await aiAvailability()) === "available";
  const pending = (await getPhrases()).filter((x) => x.needsAi && (ready || !x.detected));
  let n = 0;
  const tools = phraseTools();
  try {
    for (const p of pending) { await enrichPhrase(p.id, tools); onProgress?.(++n, pending.length); }
  } finally {
    await tools.done();
  }
  return n;
}

// ---------- project sources: the research trail ----------
// A project's `sources` are the pages of a research trail. `parent` is the source the page
// was opened from (Chrome's "opener", or the previous page in the same tab).
// status: "unread" | "useful" | "later" (sent to Inbox) | "skip" (not needed).
// `tabs` stay the project's working tabs ("Open all").

// Search result pages are steps, not sources: they are skipped but keep the chain going.
function isSearchPage(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return (/^google\./.test(host) && u.pathname === "/search")
      || (host === "bing.com" && u.pathname === "/search")
      || (host === "duckduckgo.com" && u.searchParams.has("q"))
      || host === "search.brave.com";
  } catch { return false; }
}

// Pure: sources in trail order (depth-first, oldest first) with their depth.
// Sources whose parent is missing become roots.
function sourceTree(sources = []) {
  const ids = new Set(sources.map((s) => s.id));
  const kids = {};
  for (const s of sources) (kids[s.parent && ids.has(s.parent) ? s.parent : "_root"] ||= []).push(s);
  Object.values(kids).forEach((l) => l.sort((a, b) => a.added - b.added));
  const out = [];
  const seen = new Set(); // guards against loops
  const walk = (key, depth) => {
    for (const s of kids[key] || []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ s, depth, children: (kids[s.id] || []).length });
      walk(s.id, depth + 1);
    }
  };
  walk("_root", 0);
  return out;
}

// Pure: ids of everything opened from `id`, at any depth.
function descendants(sources, id) {
  const out = [];
  const walk = (pid) => sources.filter((s) => s.parent === pid && !out.includes(s.id)).forEach((s) => { out.push(s.id); walk(s.id); });
  walk(id);
  return out;
}

// Next unread source in trail order, starting after `afterId` and wrapping around.
function nextUnread(sources = [], afterId = null) {
  const order = sourceTree(sources).map((n) => n.s);
  const start = afterId ? order.findIndex((s) => s.id === afterId) + 1 : 0;
  return [...order.slice(start), ...order.slice(0, start)].find((s) => s.status === "unread" && s.id !== afterId) || null;
}

function projectProgress(p) {
  const c = { total: 0, unread: 0, useful: 0, later: 0, skip: 0 };
  for (const s of p.sources || []) { c.total++; c[s.status] = (c[s.status] || 0) + 1; }
  c.sorted = c.total - c.unread;
  return c;
}

// The trail stops adding visited pages by itself at this many sources (adding by hand still works).
const TRAIL_MAX_SOURCES = 300;

// Pure: may the trail add this visited page? (A page already in the project always matches.)
function trailMayAdd(p, url) {
  const sources = p.sources || [];
  return sources.length < TRAIL_MAX_SOURCES || sources.some((s) => s.url === url);
}

// Pure: adds a page as a source (or returns the existing one with that URL).
function withSource(p, { url, title }, parent = null, now = Date.now()) {
  const sources = p.sources || [];
  const found = sources.find((s) => s.url === url);
  if (found) return { project: p, source: found, added: false };
  const source = {
    id: crypto.randomUUID(), url, title: title || url,
    parent: parent && sources.some((s) => s.id === parent) ? parent : null,
    status: "unread", note: "", added: now,
  };
  return { project: { ...p, sources: [...sources, source] }, source, added: true };
}

// Pure: Markdown list of the useful sources, with notes and highlights.
function projectMarkdown(p, quotes = [], now = Date.now()) {
  const c = projectProgress(p);
  const useful = sourceTree(p.sources).map((n) => n.s).filter((s) => s.status === "useful");
  const date = new Date(p.finishedAt || now).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const lines = [
    `# ${p.name}`,
    "",
    `${p.status === "finished" ? "Finished" : "Exported"} ${date} · ${c.useful} useful of ${c.total} pages`,
    "",
    "## Sources",
    "",
  ];
  for (const s of useful) {
    lines.push(`- [${s.title.replace(/[[\]]/g, "")}](${s.url})${s.note ? " — " + s.note : ""}`);
    for (const q of quotes.filter((x) => pageKey(x.url) === pageKey(s.url))) lines.push(`  > ${q.text}`);
  }
  if (!useful.length) lines.push("_No useful sources marked yet._");
  return lines.join("\n") + "\n";
}

async function addSource(projectId, page, parent = null) {
  let result = null;
  await editProject(projectId, (p) => {
    const r = withSource(p, page, parent);
    p.sources = r.project.sources;
    result = r.source;
  });
  return result;
}

// Marks a source; "later" also saves the page to the Inbox. `prune` gives the same "skip"
// to the unread pages opened from it.
async function setSourceStatus(projectId, sourceId, status, prune = false) {
  let page = null;
  await editProject(projectId, (p) => {
    const s = (p.sources || []).find((x) => x.id === sourceId);
    if (!s) return;
    s.status = status;
    s.readAt = Date.now();
    page = { url: s.url, title: s.title };
    if (prune && status === "skip") {
      const ids = new Set(descendants(p.sources, sourceId));
      p.sources.forEach((x) => { if (ids.has(x.id) && x.status === "unread") x.status = "skip"; });
    }
  });
  if (status === "later" && page) await saveForLater(page);
}

async function setSourceNote(projectId, sourceId, note) {
  await editProject(projectId, (p) => {
    const s = (p.sources || []).find((x) => x.id === sourceId);
    if (s) s.note = note;
  });
}

async function removeSource(projectId, sourceId) {
  await editProject(projectId, (p) => {
    const gone = (p.sources || []).find((x) => x.id === sourceId);
    if (!gone) return;
    // children move up to the removed page's parent
    p.sources = p.sources.filter((x) => x.id !== sourceId).map((x) => (x.parent === sourceId ? { ...x, parent: gone.parent } : x));
  });
}

// Puts a source in or out of the project's working tabs.
async function toggleWorkingTab(projectId, source) {
  await editProject(projectId, (p) => {
    const i = p.tabs.findIndex((t) => t.url === source.url);
    if (i >= 0) p.tabs.splice(i, 1);
    else p.tabs.push({ url: source.url, title: source.title, group: "", color: "" });
  });
}

// Pure: turns window tabs into sources, keeping who-opened-whom (Chrome's openerTabId).
function parkedSources(p, tabs, now = Date.now()) {
  const web = tabs.filter((t) => /^https?:/.test(t.url) && !isSearchPage(t.url));
  const byId = new Map(web.map((t) => [t.id, t]));
  const srcOfTab = {};
  let proj = p, count = 0, i = 0;
  const add = (t) => {
    if (t.id in srcOfTab) return srcOfTab[t.id];
    srcOfTab[t.id] = null; // mark as in progress (stops opener loops)
    const opener = byId.get(t.openerTabId);
    const parent = opener ? add(opener) : null;
    const r = withSource(proj, t, parent, now + i++); // +i keeps the window's order
    proj = r.project;
    if (r.added) count++;
    return (srcOfTab[t.id] = r.source.id);
  };
  web.forEach(add);
  return { sources: proj.sources || [], count };
}

async function parkTabs(projectId, tabs) {
  let count = 0;
  await editProject(projectId, (p) => {
    const r = parkedSources(p, tabs);
    p.sources = r.sources;
    count = r.count;
  });
  return count;
}

// Finishes a project: files useful sources into collections, handles what is left, and
// makes it read-only. filing: { [sourceId]: "AI/Agents" }; rest: "skip" | "inbox".
async function finishProject(projectId, filing = {}, rest = "skip") {
  const p = (await getProjects()).find((x) => x.id === projectId);
  if (!p) return;
  for (const s of p.sources || []) {
    if (s.status === "useful" && filing[s.id]) {
      const it = await saveForLater(s, "", { sort: false });
      await keepItem(it.id, filing[s.id]);
      if (s.note) await updateItem(it.id, { why: s.note, needsAi: false });
    }
    if (s.status === "unread" && rest === "inbox") await saveForLater(s, "", { sort: false });
  }
  await editProject(projectId, (x) => {
    (x.sources || []).forEach((s) => { if (s.status === "unread") s.status = rest === "inbox" ? "later" : "skip"; });
    x.status = "finished";
    x.finishedAt = Date.now();
  });
}

async function reopenProject(projectId) {
  await editProject(projectId, (x) => { x.status = "active"; delete x.finishedAt; });
}

// Finds the active project source for a URL (for the popup's reading card).
function sourceForUrl(projects, url) {
  for (const p of projects) {
    if (p.status === "finished") continue;
    const s = (p.sources || []).find((x) => x.url === url);
    if (s) return { project: p, source: s };
  }
  return null;
}

// "Working on": which project each window's new pages go to (cleared when Chrome restarts).
async function getWorkingOn() {
  const { workingOn = {} } = await chrome.storage.session.get("workingOn");
  return workingOn;
}

async function setWorkingOn(windowId, projectId) {
  const workingOn = await getWorkingOn();
  if (projectId) workingOn[windowId] = projectId;
  else delete workingOn[windowId];
  await chrome.storage.session.set({ workingOn });
}

// ---------- organise a window into tab groups (popup button and Alt+Shift+O) ----------

async function aiGroups(tabs, onProgress) {
  const downloading = (await aiAvailability()) !== "available";
  const session = await aiSession(downloading ? {
    monitor(m) { m.addEventListener("downloadprogress", (e) => onProgress?.(`Downloading AI model… ${Math.round(e.loaded * 100)}%`)); },
  } : undefined);
  const list = tabs.map((t, i) => `${i}. ${t.title} — ${hostOf(t.url)}`).join("\n");
  const schema = {
    type: "object",
    properties: {
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            color: { type: "string", enum: TAB_COLORS },
            tabs: { type: "array", items: { type: "integer" } },
          },
          required: ["name", "color", "tabs"],
        },
      },
    },
    required: ["groups"],
  };
  const prompt =
    `Sort these browser tabs into 2-8 groups by topic or task (not just by website).\n` +
    `Give each group a short name (1-3 words) and a color. Every tab number must appear in exactly one group.\n\n${list}`;
  let out;
  try {
    out = await session.prompt(prompt, { responseConstraint: schema });
  } finally {
    session.destroy();
  }
  return JSON.parse(out).groups;
}

// Pure: groups of 2+ tabs from the same site (the fallback without AI).
function domainGroups(tabs) {
  const by = {};
  tabs.forEach((t, i) => (by[hostOf(t.url)] ||= []).push(i));
  return Object.entries(by)
    .filter(([, idx]) => idx.length > 1)
    .map(([name, idx], k) => ({ name, color: TAB_COLORS[k % TAB_COLORS.length], tabs: idx }));
}

async function applyGroups(tabs, groups) {
  const used = new Set();
  for (const g of groups) {
    const ids = g.tabs.filter((i) => tabs[i] && !used.has(i)).map((i) => (used.add(i), tabs[i].id));
    if (!ids.length) continue;
    const groupId = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(groupId, { title: g.name, color: TAB_COLORS.includes(g.color) ? g.color : "grey" });
  }
}

// Groups a window's unpinned tabs with the local AI if it can, else by site.
async function organiseWindow(windowId, onProgress) {
  const tabs = (await chrome.tabs.query({ windowId })).filter((t) => !t.pinned);
  if (tabs.length < 2) return { groups: [], how: "none", count: tabs.length };
  let groups, how;
  if (["available", "downloadable", "downloading"].includes(await aiAvailability())) {
    onProgress?.("Thinking…");
    try { groups = await aiGroups(tabs, onProgress); how = "AI"; }
    catch (e) { console.warn("AI failed, using sites", e); }
  }
  if (!groups) { groups = domainGroups(tabs); how = "site"; }
  // ungroup only once the new grouping is ready, so the window doesn't flicker while the AI thinks
  await chrome.tabs.ungroup(tabs.map((t) => t.id)).catch(() => {});
  await applyGroups(tabs, groups);
  return { groups, how, count: tabs.length };
}

// Focuses an open Library tab (optionally at #view) or opens one.
async function openLibraryTab(hash = "") {
  const url = chrome.runtime.getURL("library.html");
  const [open] = await chrome.tabs.query({ url: url + "*" });
  if (open) {
    await chrome.tabs.update(open.id, { active: true, ...(hash ? { url: url + hash } : {}) });
    await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + hash });
  }
}

// ---------- page notes: highlights + your own notes, one record per page ----------
// notes = { [pageKey]: { url, title, highlights: [...], text, created, updated } }
// A highlight keeps a little text before and after it (prefix / suffix) so it can be found
// again on the page even if the page changes a bit.

const HL_COLORS = { yellow: "#ffe066", green: "#b2f2bb", blue: "#a5d8ff", pink: "#fcc2d7" };

// The page without its #fragment: one record per article, wherever you scrolled.
function pageKey(url) {
  try { const u = new URL(url); u.hash = ""; return u.href; } catch { return String(url || ""); }
}

async function getNotes() {
  const { notes = {} } = await chrome.storage.local.get("notes");
  return notes;
}

async function setNotes(notes) {
  await chrome.storage.local.set({ notes });
}

async function noteFor(url) {
  return (await getNotes())[pageKey(url)] || null;
}

// Edits (or creates) a page's record; an empty record is removed.
async function editNote(page, fn) {
  const notes = await getNotes();
  const k = pageKey(page.url);
  const now = Date.now();
  const n = (notes[k] ||= { url: k, title: page.title || k, highlights: [], text: "", created: now, updated: now });
  if (page.title && page.title !== k) n.title = page.title;
  fn(n);
  n.updated = now;
  if (!n.highlights.length && !n.text.trim() && !n.summary) delete notes[k]; // nothing left
  await setNotes(notes);
  return notes[k] || null;
}

async function addHighlight(page, { text, prefix = "", suffix = "", color = "yellow", comment = "" }) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 5000);
  if (!clean) return null;
  let added = null;
  await editNote(page, (n) => {
    added = n.highlights.find((x) => x.text === clean && x.prefix === prefix);
    if (added) return; // same passage saved twice
    added = { id: crypto.randomUUID(), text: clean, prefix, suffix, color, comment, created: Date.now() };
    n.highlights.push(added);
  });
  return added;
}

async function updateHighlight(url, id, patch) {
  await editNote({ url }, (n) => Object.assign(n.highlights.find((x) => x.id === id) || {}, patch));
}

async function deleteHighlight(url, id) {
  await editNote({ url }, (n) => (n.highlights = n.highlights.filter((x) => x.id !== id)));
}

async function setNoteText(page, text) {
  await editNote(page, (n) => (n.text = String(text)));
}

// Pure: one page's notes as Markdown (title, link, highlights as quotes, your notes).
function noteMarkdown(n, heading = "##") {
  const lines = [`${heading} [${String(n.title).replace(/[[\]]/g, "")}](${n.url})`, ""];
  for (const hl of n.highlights) {
    lines.push(...hl.text.split("\n").map((l) => `> ${l}`));
    if (hl.comment) lines.push(">", `> — ${hl.comment}`);
    lines.push("");
  }
  if (n.text.trim()) lines.push(n.text.trim(), "");
  if (n.summary?.text) lines.push(`**${n.summary.source === "page" ? "Summary" : "Key ideas"} (AI)**`, "", n.summary.text.trim(), "");
  return lines.join("\n");
}

function noteHit(n, q) {
  return !q || [n.title, n.url, n.text, n.summary?.text || "", ...n.highlights.flatMap((x) => [x.text, x.comment])].join(" ").toLowerCase().includes(q);
}

// ---------- functions injected into pages (must be self-contained) ----------

// The selection plus ~48 characters before and after it, for finding it again later.
function readHighlight() {
  const sel = getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const norm = (s) => s.replace(/\s+/g, " ");
  const before = document.createRange();
  before.setStart(document.body, 0);
  before.setEnd(r.startContainer, r.startOffset);
  const after = document.createRange();
  after.setStart(r.endContainer, r.endOffset);
  after.setEnd(document.body, document.body.childNodes.length);
  return {
    text: norm(sel.toString()).trim(),
    prefix: norm(before.toString()).slice(-48),
    suffix: norm(after.toString()).slice(0, 48),
    title: document.title,
  };
}

// Marks highlights in the page: [{ id, text, prefix, suffix, color, comment }].
// Returns how many were found. `scrollTo` scrolls to one of them.
function markHighlights(list, scrollTo) {
  // remove earlier marks
  document.querySelectorAll("mark[data-tohl]").forEach((m) => {
    const parent = m.parentNode;
    m.replaceWith(...m.childNodes);
    parent.normalize();
  });
  // the page text with whitespace collapsed, and where each character lives
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && !n.parentElement.closest("script, style, noscript, textarea") ? 1 : 2),
  });
  let text = "";
  const map = [];
  let space = true;
  for (let n; (n = walker.nextNode());) {
    const v = n.nodeValue;
    for (let i = 0; i < v.length; i++) {
      const ws = /\s/.test(v[i]);
      if (ws && space) continue;
      text += ws ? " " : v[i];
      map.push([n, i]);
      space = ws;
    }
  }
  const tailMatch = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++; return k; };
  const headMatch = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
  const found = [];
  for (const hl of list) {
    const needle = hl.text.replace(/\s+/g, " ").trim();
    if (!needle) continue;
    let best = -1, bestScore = -1;
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
      const score = tailMatch(text.slice(Math.max(0, i - 60), i), hl.prefix || "") + headMatch(text.slice(i + needle.length, i + needle.length + 60), hl.suffix || "");
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) found.push({ hl, start: best, end: best + needle.length });
  }
  // wrap from the end of the page backwards, so earlier positions stay valid
  found.sort((a, b) => b.start - a.start);
  let limit = Infinity;
  for (const f of found) {
    if (f.end > limit) continue; // overlaps a later highlight
    limit = f.start;
    const segs = [];
    for (let i = f.start; i < f.end; i++) {
      const [node, off] = map[i];
      const last = segs[segs.length - 1];
      if (last && last[0] === node) last[2] = off + 1;
      else segs.push([node, off, off + 1]);
    }
    for (let j = segs.length - 1; j >= 0; j--) {
      const [node, from, to] = segs[j];
      let mid = from > 0 ? node.splitText(from) : node;
      if (to - from < mid.nodeValue.length) mid.splitText(to - from);
      const m = document.createElement("mark");
      m.dataset.tohl = f.hl.id;
      m.style.cssText = `background:${f.hl.color};color:#130537;border-radius:2px;padding:0 1px;box-shadow:0 1px 0 rgba(0,0,0,.15);`;
      if (f.hl.comment) m.title = f.hl.comment;
      mid.replaceWith(m);
      m.append(mid);
    }
  }
  if (scrollTo) {
    const m = document.querySelector(`mark[data-tohl="${scrollTo}"]`);
    if (m) {
      m.scrollIntoView({ block: "center", behavior: "smooth" });
      m.animate([{ outline: "3px solid #6c38ff" }, { outline: "3px solid transparent" }], { duration: 1600 });
    }
  }
  return found.length;
}

// Runs a function in a tab. If the extension may not touch that site yet, asks Chrome for
// access to just that site (only works right after a click). Returns the result or throws.
async function inPage(tab, func, args = [], askAccess = true) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return r?.result;
  } catch (e) {
    if (!askAccess || !/^https?:/.test(tab.url || "")) throw e;
    const origins = [new URL(tab.url).origin + "/*"];
    if (!(await chrome.permissions.request({ origins }))) throw e;
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
    return r?.result;
  }
}

// Highlights for the page marker, with colours resolved.
function markList(n) {
  return (n?.highlights || []).map((x) => ({ id: x.id, text: x.text, prefix: x.prefix, suffix: x.suffix, comment: x.comment, color: HL_COLORS[x.color] || HL_COLORS.yellow }));
}

// ---------- Inbox triage: bundles and bulk actions ----------

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|igshid|si)$/i;

// Pure: the same page written differently (www, http, tracking params, trailing slash, #).
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let s = u.href;
    if (u.pathname !== "/" && s.endsWith("/") && !u.search) s = s.slice(0, -1);
    return s.replace(/\/\?/, "?");
  } catch { return String(url || ""); }
}

// Pure: groups Inbox pages for one-click decisions.
//  duplicates: Inbox pages already saved (Inbox or kept) under another way of writing the URL
//  byPath:     same AI-suggested collection, 2+ pages, biggest first
//  old:        in the Inbox 2+ weeks and never read
//  unsorted:   no suggestion yet
function inboxBundles(items, now = Date.now()) {
  const inbox = items.filter((x) => x.stage === "inbox");
  const seen = new Map();
  // kept pages and older saves win; newer Inbox copies are the duplicates
  for (const it of [...items].sort((a, b) => (a.stage === "kept" ? -1 : 0) - (b.stage === "kept" ? -1 : 0) || a.created - b.created)) {
    const k = normalizeUrl(it.url);
    if (!seen.has(k)) seen.set(k, it.id);
  }
  const duplicates = inbox.filter((it) => seen.get(normalizeUrl(it.url)) !== it.id);
  const dupIds = new Set(duplicates.map((x) => x.id));
  const rest = inbox.filter((it) => !dupIds.has(it.id));
  const groups = {};
  for (const it of rest) if (it.path && it.path !== UNSORTED) (groups[it.path] ||= []).push(it);
  const byPath = Object.entries(groups)
    .filter(([, list]) => list.length >= 2)
    .map(([path, list]) => ({ path, items: list }))
    .sort((a, b) => b.items.length - a.items.length || a.path.localeCompare(b.path));
  const old = rest.filter((it) => isOld(it, now) && !it.read);
  const unsorted = rest.filter((it) => !it.path || it.path === UNSORTED);
  return { duplicates, byPath, old, unsorted };
}

// Files many pages into one collection in a single write.
async function keepMany(ids, path) {
  const p = cleanPath(path);
  const set = new Set(ids);
  await addCollection(p);
  const items = await getItems();
  items.forEach((it) => { if (set.has(it.id)) Object.assign(it, { stage: "kept", path: p, reviewAfter: null }); });
  await setItems(items);
}

// Keeps each page in its own suggested collection.
async function keepSuggested(ids) {
  const set = new Set(ids);
  const items = await getItems();
  const cols = await getCollections();
  const add = [];
  for (const it of items) {
    if (!set.has(it.id) || !it.path || it.path === UNSORTED) continue;
    Object.assign(it, { stage: "kept", reviewAfter: null });
    const p = cleanPath(it.path);
    if (p === UNSORTED) continue;
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) add.push(parts.slice(0, i).join("/"));
  }
  await chrome.storage.local.set({ items, collections: add.length ? sortPaths([...cols, ...add]) : cols });
}

async function deleteMany(ids) {
  const set = new Set(ids);
  for (const id of ids) chrome.alarms.clear("remind:" + id);
  await setItems((await getItems()).filter((x) => !set.has(x.id)));
}

async function markReadMany(ids, read = true) {
  const set = new Set(ids);
  const items = await getItems();
  items.forEach((it) => { if (set.has(it.id)) Object.assign(it, { read, readAt: read ? Date.now() : null }); });
  await setItems(items);
}

// ---------- reading: page length, queue, stats ----------

const WORDS_PER_MIN = 230;

// Injected into a page: words in the main text, or the length of a video (seconds).
function readPageStats() {
  const v = document.querySelector("video");
  if (v && isFinite(v.duration) && v.duration > 30) return { video: Math.round(v.duration) };
  const root = document.querySelector("article") || document.querySelector("main") || document.body;
  return { words: ((root.innerText || "").match(/[\p{L}\p{N}]+/gu) || []).length };
}

// Pure: minutes for a page's stats (null if too short to count as an article).
function minutesFor(stats) {
  if (stats?.video) return Math.max(1, Math.round(stats.video / 60));
  if (stats?.words >= 150) return Math.max(1, Math.round(stats.words / WORDS_PER_MIN));
  return null;
}

function lengthLabel(it) {
  return it.minutes ? `${it.minutes} min${it.video ? " video" : ""}` : "";
}

function fmtMinutes(m) {
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60), rest = m % 60;
  return rest ? `${hrs} h ${rest} min` : `${hrs} h`;
}

// Measures a saved page while it is open in `tab` (needs access to the page; fails quietly).
async function addStats(itemId, tab) {
  try {
    const s = await inPage(tab, readPageStats, [], false);
    const m = minutesFor(s);
    if (m) await updateItem(itemId, { minutes: m, words: s.words || null, video: !!s.video });
  } catch { /* Chrome pages, PDFs, no access */ }
}

// Pure: unread pages to read now, shortest first. budget = minutes you have (null = any);
// pages of unknown length come last (and are left out when a budget is set).
// Courses are left out (they take many sittings); videos only when asked.
function readingQueue(items, { budget = null, videos = false } = {}) {
  return items
    .filter((it) => !it.read && it.type !== "Course")
    .filter((it) => videos || !(it.type === "Video" || it.video))
    .filter((it) => !budget || (it.minutes && it.minutes <= budget))
    .sort((a, b) => (a.minutes || Infinity) - (b.minutes || Infinity) || b.created - a.created);
}

// Pure: what you read and saved this week (from Monday) and this month.
function readingStats(items, now = Date.now()) {
  const week = weekStart(now);
  const d = new Date(now);
  const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const s = { weekRead: 0, weekMinutes: 0, weekSaved: 0, monthRead: 0, monthMinutes: 0, monthSaved: 0, unread: 0, unreadMinutes: 0 };
  for (const it of items) {
    if (it.read && it.readAt >= month) { s.monthRead++; s.monthMinutes += it.minutes || 0; }
    if (it.read && it.readAt >= week) { s.weekRead++; s.weekMinutes += it.minutes || 0; }
    if (it.created >= month) s.monthSaved++;
    if (it.created >= week) s.weekSaved++;
    if (!it.read) { s.unread++; s.unreadMinutes += it.minutes || 0; }
  }
  return s;
}

// ---------- summaries of your notes (Chrome's built-in Summarizer, else the Prompt API) ----------
// kind: "key-points" (key ideas as bullets) or "tldr" (a few sentences).

// Pure: your highlights, their comments and your notes as one text to summarise.
function highlightsText(n) {
  const parts = (n?.highlights || []).map((x) => `- ${x.text}${x.comment ? ` (my comment: ${x.comment})` : ""}`);
  if (n?.text?.trim()) parts.push("", "My notes:", n.text.trim());
  return parts.join("\n");
}

async function aiSummary(text, kind = "key-points", context = "", onProgress) {
  const input = String(text).slice(0, 12000);
  if (typeof Summarizer !== "undefined") {
    try {
      const opts = { type: kind, format: "markdown", length: "medium", expectedInputLanguages: ["en"], outputLanguage: "en", sharedContext: context };
      if ((await Summarizer.availability(opts)) !== "unavailable") {
        const s = await Summarizer.create({
          ...opts,
          monitor(m) { m.addEventListener("downloadprogress", (e) => onProgress?.(`Downloading summariser… ${Math.round(e.loaded * 100)}%`)); },
        });
        const out = await s.summarize(input);
        s.destroy?.();
        return out.trim();
      }
    } catch (e) { console.warn("Summarizer failed, using the Prompt API", e); }
  }
  if ((await aiAvailability()) !== "available") throw new Error("No local AI available on this computer right now.");
  const s = await aiSession();
  const ask = kind === "key-points"
    ? "List the 3-7 key ideas as short Markdown bullets (- ...). Use only what is in the text."
    : "Summarise it in 2-3 plain sentences. Use only what is in the text.";
  try {
    return (await s.prompt(`${context ? context + "\n\n" : ""}${ask}\n\nText:\n${input.slice(0, 8000)}`)).trim();
  } finally {
    s.destroy();
  }
}

// Summarises a page's highlights + notes (source "highlights") or given page text ("page"),
// and keeps the result on the page's notes record.
async function summariseNote(page, source = "highlights", pageText = "", onProgress) {
  const n = await noteFor(page.url);
  const text = source === "page" ? pageText : highlightsText(n);
  if (!text.trim()) throw new Error(source === "page" ? "Couldn't read this page's text." : "No highlights or notes to summarise yet.");
  const kind = source === "page" ? "tldr" : "key-points";
  const context = source === "page"
    ? `A web page titled "${page.title}".`
    : `Passages a reader highlighted (and their own notes) from "${page.title || n?.title}".`;
  const summary = await aiSummary(text, kind, context, onProgress);
  await editNote(page, (x) => (x.summary = { text: summary, source, at: Date.now() }));
  return summary;
}

// Injected into a page: its main text for a summary.
function readPageText() {
  const root = document.querySelector("article") || document.querySelector("main") || document.body;
  return (root.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 20000);
}

// ---------- highlighter pen and on-page highlight tools (injected, self-contained) ----------

// Pen mode: while on, any text you select in the page becomes a highlight. Esc (or the
// badge, or the panel) turns it off. Calling it again just changes the colour.
function startPen(colorName, colorHex) {
  // always rebuild: a pen left over from an older copy of the extension (after a reload) has
  // listeners that can no longer reach it
  window.__toPen?.teardown?.();
  const S = (window.__toPen = { on: true, color: colorName });
  // after the extension is reloaded, messages throw: then the old pen switches itself off
  const send = (m) => { try { chrome.runtime.sendMessage(m)?.catch?.(() => {}); } catch { S.teardown(); } };
  const norm = (s) => s.replace(/\s+/g, " ");
  const grab = () => {
    const sel = getSelection();
    if (!S.on || !sel || sel.isCollapsed || !sel.rangeCount) return;
    if (sel.anchorNode?.parentElement?.closest("#__to-ui, #__to-pen")) return;
    const r = sel.getRangeAt(0);
    const text = norm(sel.toString()).trim();
    if (text.length < 2) return;
    const before = document.createRange();
    before.setStart(document.body, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(document.body, document.body.childNodes.length);
    send({
      type: "pen-highlight",
      data: { text, prefix: norm(before.toString()).slice(-48), suffix: norm(after.toString()).slice(0, 48), color: S.color },
    });
    sel.removeAllRanges();
  };
  S.up = () => setTimeout(grab, 10);
  S.key = (e) => { if (e.key === "Escape") S.stop(); };
  S.teardown = () => {
    S.on = false;
    document.removeEventListener("mouseup", S.up, true);
    document.removeEventListener("keydown", S.key, true);
    S.badge?.remove();
  };
  S.stop = () => { S.teardown(); send({ type: "pen-off" }); };
  document.addEventListener("mouseup", S.up, true);
  document.addEventListener("keydown", S.key, true);

  const badge = document.createElement("div");
  badge.id = "__to-pen";
  badge.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;";
  badge.attachShadow({ mode: "open" }).innerHTML = `<style>
    button{display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:7px 12px;background:#130537;color:#fff;
      font:600 12px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
    .dot{width:10px;height:10px;border-radius:50%;background:${colorHex}}
    span.k{opacity:.6;font-weight:500}</style>
    <button title="Stop highlighting"><i class="dot"></i>Highlighter on · select text <span class="k">Esc to stop</span></button>`;
  badge.shadowRoot.querySelector("button").onclick = () => S.stop();
  document.documentElement.append(badge);
  S.badge = badge;
  grab(); // text already selected when the pen was picked up
  return true;
}

function stopPen() {
  window.__toPen?.on && window.__toPen.stop();
  return false;
}

function penIsOn() {
  return !!window.__toPen?.on;
}

// Click a highlight in the page: a small bar to recolour, comment on or delete it.
function installMarkTools() {
  // rebuild every time (cheap), so tools from an older copy of the extension don't linger
  window.__toTools?.teardown?.();
  const send = (m) => { try { chrome.runtime.sendMessage(m)?.catch?.(() => {}); } catch { /* extension reloaded */ } };
  const host = document.createElement("div");
  host.id = "__to-ui";
  host.style.cssText = "position:absolute;top:0;left:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    .bar{position:absolute;display:flex;gap:6px;align-items:center;background:#130537;padding:6px 8px;border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,.3);font:600 12px system-ui,sans-serif;white-space:nowrap}
    .bar[hidden]{display:none}
    .c{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.7);padding:0;cursor:pointer}
    .t{border:0;background:none;color:#fff;cursor:pointer;padding:2px 4px;font:inherit}
    .t:hover{color:#c7ff01}
    .sep{width:1px;height:16px;background:rgba(255,255,255,.25)}</style>
    <div class="bar" hidden>
      <button class="c" data-c="yellow" style="background:#ffe066" title="Key point"></button>
      <button class="c" data-c="green" style="background:#b2f2bb" title="Idea"></button>
      <button class="c" data-c="blue" style="background:#a5d8ff" title="Question"></button>
      <button class="c" data-c="pink" style="background:#fcc2d7" title="Check"></button>
      <span class="sep"></span>
      <button class="t" data-a="comment">Comment</button>
      <button class="t" data-a="copy">Copy</button>
      <button class="t" data-a="delete">Delete</button>
    </div>`;
  document.querySelectorAll("#__to-ui").forEach((x) => x.remove());
  document.documentElement.append(host);
  const bar = root.querySelector(".bar");
  let current = null;
  const onClick = (e) => {
    if (e.composedPath().includes(host)) return;
    const m = e.target.closest?.("mark[data-tohl]");
    if (!m || e.ctrlKey || e.metaKey || String(getSelection())) { bar.hidden = true; return; }
    e.preventDefault(); // a highlight inside a link: show the tools instead of following it
    e.stopPropagation();
    current = m;
    const r = m.getBoundingClientRect();
    bar.hidden = false;
    bar.style.left = `${Math.max(4, window.scrollX + r.left)}px`;
    bar.style.top = `${Math.max(4, window.scrollY + r.top - 42)}px`;
  };
  document.addEventListener("click", onClick, true);
  window.__toTools = { teardown: () => { document.removeEventListener("click", onClick, true); host.remove(); } };
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !current) return;
    const id = current.dataset.tohl;
    if (b.dataset.c) send({ type: "pen-color", id, color: b.dataset.c });
    else if (b.dataset.a === "delete") send({ type: "pen-delete", id });
    else if (b.dataset.a === "copy") navigator.clipboard.writeText([...document.querySelectorAll(`mark[data-tohl="${id}"]`)].map((x) => x.textContent).join(""));
    else if (b.dataset.a === "comment") {
      const t = prompt("Comment on this highlight:", current.title || "");
      if (t !== null) send({ type: "pen-comment", id, comment: t.trim() });
    }
    bar.hidden = true;
  });
  return true;
}

// Puts the selection bubble, the highlight bar and the dock into a page we may access.
// used: you just used the extension on this page (icon, panel, bubble), so the dock shows.
// note / item: pass them when already known (null = none), so storage isn't read again.
async function pageTools(tab, askAccess = false, used = false, note, item) {
  await inPage(tab, installBubble, [], askAccess);
  await inPage(tab, installMarkTools, [], false);
  const [items, n, prefs] = await Promise.all([item !== undefined ? null : getItems(), note !== undefined ? note : noteFor(tab.url), chrome.storage.local.get(["dockHidden", "dockY"])]);
  const cfg = dockConfig({
    item: item !== undefined ? item : items.find((x) => pageKey(x.url) === pageKey(tab.url)) || null,
    note: n, used, hiddenSites: prefs.dockHidden || [], origin: new URL(tab.url).origin, y: prefs.dockY ?? 40,
  });
  await inPage(tab, installDock, [cfg], false);
}

// Shows the page's highlights and their tools (background and panel use this).
async function remark(tab, scrollTo = null, askAccess = false, used = false, note, item) {
  const n = note !== undefined ? note : await noteFor(tab.url);
  await pageTools(tab, askAccess, used, n, item);
  return inPage(tab, markHighlights, [markList(n), scrollTo], false);
}

// ---------- highlight roles: each colour means something ----------

const HL_ROLES = { yellow: "Key point", green: "Idea", blue: "Question", pink: "Check" };

function roleOf(hl) {
  return HL_ROLES[hl?.color] || HL_ROLES.yellow;
}

// Pure: how many highlights of each role a list of note records has (only roles in use).
function roleCounts(notes) {
  const c = {};
  for (const n of notes) for (const x of n.highlights || []) c[x.color || "yellow"] = (c[x.color || "yellow"] || 0) + 1;
  return Object.keys(HL_ROLES).filter((k) => c[k]).map((k) => [k, HL_ROLES[k], c[k]]);
}

// ---------- selection bubble (injected, self-contained) ----------
// Select text on the page → a small dark bubble: 4 role colours, Note, Word, Copy.

function installBubble() {
  window.__toBubble?.teardown?.(); // rebuild: an older copy may belong to a reloaded extension
  const ROLES = [["yellow", "#ffe066", "Key point"], ["green", "#b2f2bb", "Idea"], ["blue", "#a5d8ff", "Question"], ["pink", "#fcc2d7", "Check"]];
  const norm = (s) => s.replace(/\s+/g, " ");
  let dead = false;
  const send = (m) => { try { chrome.runtime.sendMessage(m)?.catch?.(() => {}); return true; } catch { dead = true; teardown(); return false; } };

  const host = document.createElement("div");
  host.id = "__to-bubble";
  host.style.cssText = "position:fixed;top:0;left:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    .b{position:fixed;display:flex;align-items:center;gap:4px;padding:5px 6px;background:#130537;color:#fff;border-radius:10px;
       box-shadow:0 8px 24px rgba(19,5,55,.28);font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transform:translateY(4px);
       transition:opacity .12s,transform .12s;pointer-events:auto}
    .b.show{opacity:1;transform:none}
    .b[hidden]{display:none}
    .d{width:18px;height:18px;border-radius:50%;border:0;padding:0;margin:0 1px;cursor:pointer;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}
    .d:hover{transform:scale(1.15)}
    .s{width:1px;height:16px;background:rgba(255,255,255,.22);margin:0 3px}
    .t{border:0;background:none;color:#fff;cursor:pointer;padding:5px 7px;border-radius:6px;font:inherit}
    .t:hover{background:rgba(255,255,255,.1);color:#c7ff01}
    .i{width:220px;border:0;border-radius:6px;padding:6px 8px;font:500 12.5px system-ui,sans-serif;background:rgba(255,255,255,.1);color:#fff;outline:none}
    .i::placeholder{color:rgba(255,255,255,.55)}
    .ok{padding:5px 8px;color:#c7ff01}
    svg{display:block}</style>
    <div class="b" hidden role="toolbar" aria-label="Highlight">
      ${ROLES.map(([c, hex, role]) => `<button class="d" data-c="${c}" style="background:${hex}" title="${role}${c === "yellow" ? " (H)" : ""}" aria-label="Highlight as ${role}"></button>`).join("")}
      <span class="s"></span>
      <button class="t" data-a="note" title="Highlight with a note (N)">Note</button>
      <button class="t" data-a="word" title="Save to the Phrasebook (W)">Word</button>
      <button class="t" data-a="copy" title="Copy with source" aria-label="Copy"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M8 3h9a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h9V9H5Z"/></svg></button>
    </div>`;
  document.documentElement.append(host);
  const bar = root.querySelector(".b");
  const original = bar.innerHTML;
  let grabbed = null; // { text, prefix, suffix, sentence }

  const inEditable = (n) => {
    const e = n?.nodeType === 1 ? n : n?.parentElement;
    return !!e?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], #__to-ui, #__to-pen, #__to-bubble");
  };

  function read() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || inEditable(sel.anchorNode)) return null;
    const text = norm(sel.toString()).trim();
    if (text.length < 2) return null;
    const r = sel.getRangeAt(0);
    const before = document.createRange();
    before.setStart(document.body, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(document.body, document.body.childNodes.length);
    const pre = norm(before.toString()), suf = norm(after.toString());
    // the sentence around it, for the Phrasebook
    const s0 = Math.max(pre.lastIndexOf(". "), pre.lastIndexOf("? "), pre.lastIndexOf("! "));
    const m = suf.search(/[.!?](\s|$)/);
    const sentence = (pre.slice(s0 < 0 ? Math.max(0, pre.length - 200) : s0 + 2) + text + suf.slice(0, m < 0 ? 200 : m + 1)).trim().slice(0, 400);
    return { text, prefix: pre.slice(-48), suffix: suf.slice(0, 48), sentence, rect: r.getBoundingClientRect() };
  }

  function place(rect) {
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const vw = innerWidth || document.documentElement.clientWidth || 1024;
    let x = rect.left + rect.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, vw - w - 8));
    let y = rect.top - h - 10;
    if (y < 8) y = rect.bottom + 10; // no room above: below the selection
    bar.style.left = `${x}px`;
    bar.style.top = `${y}px`;
    requestAnimationFrame(() => bar.classList.add("show"));
  }

  function hide() {
    bar.classList.remove("show");
    bar.hidden = true;
    bar.innerHTML = original;
    grabbed = null;
  }

  function done(label) {
    bar.innerHTML = `<span class="ok">${label}</span>`;
    getSelection()?.removeAllRanges();
    setTimeout(hide, 700);
  }

  const onUp = (e) => {
    if (e.composedPath?.().includes(host) || window.__toPen?.on) return; // the pen highlights by itself
    setTimeout(() => {
      const g = read();
      if (!g) return hide();
      grabbed = g;
      bar.innerHTML = original;
      place(g.rect);
    }, 10);
  };
  const onDown = (e) => { if (!e.composedPath?.().includes(host)) hide(); };
  const KEYS = { h: '[data-c="yellow"]', n: '[data-a="note"]', w: '[data-a="word"]' };
  const onKey = (e) => {
    if (e.key === "Escape" && !bar.hidden) return hide();
    const sel = KEYS[e.key?.toLowerCase()];
    if (!sel || e.ctrlKey || e.metaKey || e.altKey || bar.hidden || !grabbed || inEditable(document.activeElement)) return;
    if (e.composedPath?.().includes(host)) return; // typing in the note box
    e.preventDefault();
    e.stopPropagation();
    root.querySelector(sel)?.click();
  };
  const onScroll = () => { if (!bar.hidden && !root.querySelector(".i")) hide(); };

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !grabbed) return;
    const g = grabbed;
    const data = { text: g.text, prefix: g.prefix, suffix: g.suffix };
    if (b.dataset.c) {
      if (send({ type: "pen-highlight", data: { ...data, color: b.dataset.c } })) done("Highlighted");
    } else if (b.dataset.a === "word") {
      const long = g.text.split(/\s+/).filter(Boolean).length > 5; // QUOTE_WORDS: a passage becomes a highlight
      if (send({ type: "bubble-word", data: { text: g.text, prefix: g.prefix, suffix: g.suffix, sentence: g.sentence, pageLang: document.documentElement.lang || "" } })) done(long ? "Highlighted" : "Saved to Phrasebook");
    } else if (b.dataset.a === "copy") {
      navigator.clipboard.writeText(`“${g.text}” — ${document.title} (${location.href})`).then(() => done("Copied"));
    } else if (b.dataset.a === "note") {
      bar.innerHTML = `<input class="i" placeholder="Your note… Enter to save" aria-label="Note">`;
      const input = root.querySelector(".i");
      input.focus();
      input.addEventListener("keydown", (k) => {
        k.stopPropagation();
        if (k.key === "Escape") return hide();
        if (k.key !== "Enter") return;
        if (send({ type: "pen-highlight", data: { ...data, color: "yellow", comment: input.value.trim() } })) done("Saved with note");
      });
    }
  });

  document.addEventListener("mouseup", onUp, true);
  const onKeyUp = (e) => { if (e.shiftKey && !window.__toPen?.on) onUp(e); }; // keyboard selection
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);

  function teardown() {
    document.removeEventListener("mouseup", onUp, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    host.remove();
  }
  window.__toBubble = { teardown };
  return !dead;
}

// ---------- page dock, note card, continue reading ----------

// Pure: where to pick up a saved page again (null if not started, finished, or too old).
function resumePct(item, now = Date.now()) {
  const p = item?.pos;
  if (!p || item.read || p.pct < 5 || p.pct > 95 || now - p.at > 30 * DAY_MS) return null;
  return Math.round(p.pct);
}

// Pure: what the dock should do on a page.
function dockConfig({ item = null, note = null, used = false, hiddenSites = [], origin = "", y = 40 } = {}) {
  const hasNotes = !!(note && (note.highlights?.length || note.text?.trim()));
  return {
    show: (hasNotes || used || !!item) && !hiddenSites.includes(origin),
    y: Math.max(10, Math.min(85, y)),
    resume: resumePct(item),
    track: !!item, // remember how far you read saved pages
  };
}

// Injected: the dock on the page edge (highlighter, note card, show/hide highlights, side
// panel, ⋯ hide on this site), the "Continue at N%" pill and reading-position tracking.
function installDock(cfg) {
  window.__toDock?.teardown?.();
  const send = (m) => { try { return chrome.runtime.sendMessage(m) || Promise.resolve(); } catch { teardown(); return Promise.resolve(); } };
  const cleanups = [];

  // reading position (saved pages only), at most every 2 s
  if (cfg.track) {
    let last = 0, timer = null;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        if (max < 400) return;
        const pct = Math.round((scrollY / max) * 100);
        if (Math.abs(pct - last) < 3) return;
        last = pct;
        send({ type: "read-pos", pct });
      }, 2000);
    };
    addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => removeEventListener("scroll", onScroll));
  }

  if (!cfg.show && !cfg.resume) {
    window.__toDock = { teardown };
    return true;
  }

  const I = {
    pen: '<path d="m15.2 4.3 4.5 4.5L9 19.5l-5.3.8.8-5.3L15.2 4.3Zm1.4-1.4 1.6-1.6a1.5 1.5 0 0 1 2.1 0l2.4 2.4a1.5 1.5 0 0 1 0 2.1l-1.6 1.6-4.5-4.5Z"/>',
    note: '<path d="M5 3h10l4 4v14H5V3Zm2 2v14h10V8h-3V5H7Zm2 6h6v2H9v-2Zm0 4h6v2H9v-2Z"/>',
    eye: '<path d="M12 5C6.5 5 2.7 9.4 1.6 11.4a1.3 1.3 0 0 0 0 1.2C2.7 14.6 6.5 19 12 19s9.3-4.4 10.4-6.4a1.3 1.3 0 0 0 0-1.2C21.3 9.4 17.5 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>',
    panel: '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13ZM5.5 5a.5.5 0 0 0-.5.5v13c0 .3.2.5.5.5H13V5H5.5ZM15 5v14h3.5c.3 0 .5-.2.5-.5v-13a.5.5 0 0 0-.5-.5H15Z"/>',
    more: '<path d="M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${I[k]}</svg>`;

  const host = document.createElement("div");
  host.id = "__to-dock";
  host.style.cssText = "position:fixed;top:0;right:0;z-index:2147483646;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .dock{position:fixed;right:0;display:flex;flex-direction:column;gap:2px;padding:6px 4px;background:#130537;color:#fff;
      border:1px solid rgba(255,255,255,.35);border-right:0;border-radius:12px 0 0 12px;box-shadow:0 8px 24px rgba(19,5,55,.25);transform:translateX(calc(100% - 7px));transition:transform .15s ease}
    .dock:hover,.dock.open{transform:none}
    .grip{height:10px;cursor:grab;display:grid;place-items:center}
    .grip::before{content:"";width:16px;height:3px;border-radius:2px;background:rgba(255,255,255,.3)}
    button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:8px;background:none;color:#fff;cursor:pointer;padding:0}
    button:hover{background:rgba(255,255,255,.1);color:#c7ff01}
    button.on{background:#6c38ff;color:#fff}
    .menu{position:fixed;right:46px;background:#130537;border-radius:10px;padding:4px;box-shadow:0 8px 24px rgba(19,5,55,.25)}
    .menu[hidden],.card[hidden],.pill[hidden]{display:none}
    .menu button{width:auto;height:auto;padding:8px 10px;font:600 12px/1 inherit;white-space:nowrap}
    .card{position:fixed;right:52px;width:300px;background:#fff;color:#130537;border-radius:12px;box-shadow:0 14px 40px rgba(19,5,55,.25);
      border-top:4px solid #6c38ff;padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}
    .card .h{display:flex;align-items:center;gap:8px;font:700 13px/1 inherit}
    .card .h span{flex:1}
    .card .h small{font:500 11px/1 inherit;color:rgba(19,5,55,.6)}
    .card .h button{width:24px;height:24px;color:rgba(19,5,55,.6)}
    .card .h button:hover{background:#ece9ff;color:#130537}
    textarea{width:100%;min-height:150px;resize:vertical;border:1px solid rgba(19,5,55,.46);border-radius:8px;padding:8px 10px;
      font:13px/1.5 inherit;color:#130537;background:#fafaf7;outline:none}
    textarea:focus{border-color:#6c38ff;background:#fff}
    .pill{position:fixed;right:16px;bottom:18px;display:flex;align-items:center;gap:8px;background:#130537;color:#fff;border-radius:999px;
      padding:8px 8px 8px 14px;box-shadow:0 8px 24px rgba(19,5,55,.25);font:600 12px/1 inherit}
    .pill button{width:auto;height:auto;padding:5px 10px;border-radius:999px;background:#6c38ff;font:600 12px/1 inherit}
    .pill .x{background:none;padding:4px 6px;color:rgba(255,255,255,.6)}</style>
    <div class="dock" role="toolbar" aria-label="Page notes">
      <div class="grip" title="Drag up or down"></div>
      <button data-a="pen" title="Highlighter: select text to highlight (Esc stops)">${icon("pen")}</button>
      <button data-a="note" title="Notes for this page">${icon("note")}</button>
      <button data-a="eye" title="Show / hide my highlights" class="on">${icon("eye")}</button>
      <button data-a="panel" title="Open the side panel (summary, all highlights)">${icon("panel")}</button>
      <button data-a="more" title="More">${icon("more")}</button>
    </div>
    <div class="menu" hidden><button data-a="hide-site">Hide the dock on this site</button></div>
    <div class="card" hidden>
      <div class="h"><span>Notes</span><small class="st"></small><button data-a="close" title="Close" aria-label="Close">✕</button></div>
      <textarea placeholder="Your notes for this page… saved as you type"></textarea>
    </div>
    <div class="pill" hidden><span class="pt"></span><button data-a="resume">Continue</button><button class="x" data-a="pill-x" aria-label="Dismiss">✕</button></div>`;
  document.documentElement.append(host);
  const $ = (s) => root.querySelector(s);
  const dock = $(".dock"), card = $(".card"), menu = $(".menu"), area = $("textarea"), pill = $(".pill");
  if (!cfg.show) dock.hidden = true;

  let y = cfg.y; // % of the window height
  const placeAll = () => {
    dock.style.top = `${y}%`;
    const top = dock.getBoundingClientRect().top;
    card.style.top = `${Math.max(12, Math.min(top, innerHeight - 260))}px`;
    menu.style.top = `${top + 150}px`;
  };
  placeAll();

  // drag the dock up / down
  const grip = $(".grip");
  grip.addEventListener("pointerdown", (e) => {
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => { y = Math.max(10, Math.min(85, (ev.clientY / innerHeight) * 100)); placeAll(); };
    const up = () => { grip.removeEventListener("pointermove", move); send({ type: "dock-pos", y: Math.round(y) }); };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up, { once: true });
  });

  // note card: same notes as the side panel
  let saveT = null;
  area.addEventListener("input", () => {
    $(".st").textContent = "…";
    clearTimeout(saveT);
    saveT = setTimeout(() => send({ type: "dock-note", text: area.value }).then(() => ($(".st").textContent = "saved")), 500);
  });
  area.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") card.hidden = true; });

  const unmark = () => document.querySelectorAll("mark[data-tohl]").forEach((m) => { const p = m.parentNode; m.replaceWith(...m.childNodes); p.normalize(); });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "pen") {
      const r = await send({ type: "dock-pen" });
      b.classList.toggle("on", !!r?.on);
    } else if (a === "note") {
      if (!card.hidden) { card.hidden = true; dock.classList.remove("open"); return; }
      const r = await send({ type: "dock-get" });
      area.value = r?.text || "";
      $(".st").textContent = "";
      card.hidden = false;
      dock.classList.add("open");
      placeAll();
      area.focus();
    } else if (a === "close") {
      card.hidden = true;
      dock.classList.remove("open");
    } else if (a === "eye") {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      if (on) send({ type: "dock-show" }); else unmark();
    } else if (a === "panel") {
      send({ type: "dock-panel" });
    } else if (a === "more") {
      menu.hidden = !menu.hidden;
    } else if (a === "hide-site") {
      send({ type: "dock-hide-site" });
      dock.hidden = true;
      menu.hidden = true;
      card.hidden = true;
    } else if (a === "resume") {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: (max * cfg.resume) / 100, behavior: "smooth" });
      pill.hidden = true;
    } else if (a === "pill-x") {
      pill.hidden = true;
    }
  });

  if (cfg.resume) {
    $(".pt").textContent = `You read ${cfg.resume}% of this`;
    pill.hidden = false;
    setTimeout(() => (pill.hidden = true), 15000);
  }

  const onPenOff = (m) => { if (m?.type === "pen-state") $('[data-a="pen"]').classList.toggle("on", !!m.on); };
  try { chrome.runtime.onMessage.addListener(onPenOff); cleanups.push(() => chrome.runtime.onMessage.removeListener(onPenOff)); } catch {}

  function teardown() {
    cleanups.forEach((f) => { try { f(); } catch {} });
    host.remove();
  }
  window.__toDock = { teardown };
  return true;
}
