// Shared by the popup, the Library page and the background worker (plain script, no modules).
// Items: pages you saved. They land in the Inbox (stage "inbox") with an AI-suggested collection
// path such as "AI/Agents"; the weekly review files them (stage "kept") or discards them.

const TYPES = ["Course", "Video", "Tool", "Article", "Docs", "Paper", "Other"];
const TAB_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];
const UNSORTED = "Unsorted";

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

let aiAvail = null;
async function aiAvailability() {
  if (!aiSupported()) return "unsupported";
  if (aiAvail === "available") return aiAvail; // cached once ready
  try { aiAvail = await LanguageModel.availability(); } catch { aiAvail = "unsupported"; }
  return aiAvail;
}

// Creating a model session is the slow part (loads the model), so create one per page and
// hand out cheap clones for each prompt.
let aiBase = null;
async function aiSession(options) {
  if (options) return LanguageModel.create(options);
  aiBase ||= LanguageModel.create();
  const base = await aiBase;
  try { return await base.clone(); } catch { return LanguageModel.create(); }
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
  return item.status !== "done" && item.remindAt && item.remindAt <= now;
}

const OLD_INBOX_MS = 14 * 24 * 60 * 60 * 1000;
function isOld(item, now = Date.now()) {
  return item.stage === "inbox" && item.created < now - OLD_INBOX_MS;
}

// Inbox items the weekly review should show (not pushed to next week).
function forReview(items, now = Date.now()) {
  return items.filter((x) => x.stage === "inbox" && !(x.reviewAfter > now));
}

async function refreshBadge() {
  const due = (await getItems()).filter((i) => isDue(i)).length;
  chrome.action.setBadgeBackgroundColor({ color: "#8959FF" });
  chrome.action.setBadgeText({ text: due ? String(due) : "" });
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

async function deleteItem(id) {
  await chrome.alarms.clear("remind:" + id);
  await setItems((await getItems()).filter((x) => x.id !== id));
}

// Files an inbox item into a collection (creates the collection if new).
async function keepItem(id, path) {
  const p = cleanPath(path);
  await addCollection(p);
  await updateItem(id, { stage: "kept", path: p, reviewAfter: null });
}

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
async function saveForLater({ url, title, favIconUrl }, remindKey = "") {
  const items = await getItems();
  let it = items.find((x) => x.url === url);
  if (!it) {
    it = {
      id: crypto.randomUUID(),
      url,
      title: title || url,
      favIconUrl: favIconUrl || "",
      type: guessType(url, title),
      stage: "inbox",
      path: UNSORTED,
      tags: [],
      why: "",
      status: "todo",
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
  it.sorted = it.needsAi
    ? aiAvailability().then((a) => (a === "available" ? classifyItem(it.id) : null)).catch((e) => console.warn("AI sort failed", e))
    : Promise.resolve();
  return it;
}

async function aiClassify(item, paths) {
  const session = await aiSession();
  const schema = {
    type: "object",
    properties: {
      type: { type: "string", enum: TYPES },
      path: { type: "string" },
      why: { type: "string" },
      units: { type: "integer" },
    },
    required: ["type", "path", "why", "units"],
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
    `- units: if it is a course with a known number of units/lessons, that number, else 0`;
  const out = JSON.parse(await session.prompt(prompt, { responseConstraint: schema }));
  session.destroy();
  return out;
}

async function classifyItem(id) {
  const items = await getItems();
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const paths = (await getCollections()).filter((p) => p !== UNSORTED).slice(0, 60);
  const r = await aiClassify(it, paths);
  // re-read: the user may have filed it while the AI was thinking
  const now = (await getItems()).find((x) => x.id === id);
  if (!now) return;
  const patch = {
    type: TYPES.includes(r.type) ? r.type : now.type,
    why: (r.why || "").trim().slice(0, 120),
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

// ---------- pins (favourite sites dock) ----------

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

async function isPinned(url) {
  return (await getPins()).some((p) => p.url === url);
}

// ---------- storage schema and migration ----------
// v1: items with `topic`.  v2: Inbox + collection paths; sessions, workspaces and the
// archive mixed in `library`.  v3: `library` split into `projects` (was workspaces) and
// `history` (sessions + archive).

const SCHEMA = 3;
const DATA_KEYS = ["schema", "items", "collections", "pins", "projects", "history", "library"];

function sessionKind(s) {
  return s.kind || (s.tidied ? "tidied" : "saved");
}

const byIdUnique = (list) => [...new Map(list.map((x) => [x.id, x])).values()];

// Pure: upgrades stored data to the current schema; never changes its input.
function migrateData(input) {
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
  d.schema = schema;
  return d;
}

// Runs once per upgrade. Keeps a copy of the old data in `backupV2` first.
async function migrate() {
  const d = await chrome.storage.local.get(DATA_KEYS);
  if ((d.schema || 1) >= SCHEMA) return;
  const { backupV2 } = await chrome.storage.local.get("backupV2");
  if (!backupV2 && (d.items?.length || d.library?.length)) {
    await chrome.storage.local.set({ backupV2: { ...d, savedAt: Date.now() } });
  }
  await chrome.storage.local.set(migrateData(d));
  await chrome.storage.local.remove("library");
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
    favIconUrl: t.favIconUrl || "",
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

// Temporary sessions ("saved" and "auto") expire; tidied tabs stay (until Phase 4).
const SESSION_DAYS = 30;
function isTemporary(s) {
  return ["saved", "auto"].includes(sessionKind(s));
}
function expiresInDays(s, now = Date.now()) {
  return Math.max(0, Math.ceil((s.saved + SESSION_DAYS * 864e5 - now) / 864e5));
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

// Replaces a project's tabs with the given chrome tabs.
async function updateProject(id, tabs) {
  const snap = await snapshotTabs(tabs);
  await editProject(id, (p) => (p.tabs = snap));
}

async function addTabToProject(id, { url, title, favIconUrl }) {
  await editProject(id, (p) => {
    if (!p.tabs.some((t) => t.url === url)) p.tabs.push({ url, title, favIconUrl: favIconUrl || "", group: "", color: "" });
  });
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
    .filter((p) => p.created >= now - 7 * 864e5 || p.again)
    .filter((p) => !(p.quizzedAt > now - 3 * 864e5))
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

// Adds language detection, an AI definition and a translation, using whichever of Chrome's
// built-in APIs exist here. Leaves `needsAi` on if the main model isn't ready yet.
async function enrichPhrase(id) {
  const p = (await getPhrases()).find((x) => x.id === id);
  if (!p) return;
  const patch = { detected: true };
  // language + translation run once; only the AI definition is retried while the model loads
  if (!p.detected && typeof LanguageDetector !== "undefined") {
    try {
      const det = await LanguageDetector.create();
      const [top] = await det.detect(p.sentence || p.text);
      if (top && top.confidence > 0.6 && top.detectedLanguage !== "und") patch.lang = top.detectedLanguage.split("-")[0];
    } catch (e) { console.warn("language detect", e); }
  }
  const lang = patch.lang || p.lang;
  if (!p.detected && lang !== "en" && typeof Translator !== "undefined") {
    try {
      const opts = { sourceLanguage: lang, targetLanguage: "en" };
      if ((await Translator.availability(opts)) !== "unavailable") {
        const tr = await Translator.create(opts);
        patch.translation = (await tr.translate(p.text)).slice(0, 300);
        tr.destroy?.();
      }
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
      const out = JSON.parse(await s.prompt(
        `Explain the ${langName(lang)} ${p.kind} "${p.text}" like a learner's dictionary, in English.\n` +
        (p.sentence ? `It appeared in this sentence: "${p.sentence}"\nGive the meaning used there.\n` : "") +
        `Return: definition (max 20 words), example (one new short sentence in ${langName(lang)} using it), ` +
        `pos (noun, verb, adjective, adverb, phrase, idiom or other).`,
        { responseConstraint: schema }));
      s.destroy();
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
  for (const p of pending) { await enrichPhrase(p.id); onProgress?.(++n, pending.length); }
  return n;
}
