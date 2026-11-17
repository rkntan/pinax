// Library page: shared state and small DOM helpers. Loaded before views/*.js and library.js.

const $ = (id) => document.getElementById(id);
const PLURAL = { Course: "Courses", Video: "Videos", Tool: "Tools", Article: "Articles", Docs: "Docs", Paper: "Papers", Other: "Other" };

const state = { view: "inbox", col: "", type: "All", status: "all", q: "", open: null, lang: "All", tag: "", favOnly: false, psort: "new", editing: null, sfilter: "all", finishing: null, sel: new Set(), focusId: null, bundle: null, budget: null, videos: false, role: null, limit: {} };
const data = { items: [], cols: [], pins: [], projects: [], phrases: [], notes: {} };

// Per-viewer UI prefs (layout, collapsed tree branches). Storage may be blocked: never required.
const prefs = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem("prefs") || "{}"); } catch {}
  return {
    get: (k, d) => (k in p ? p[k] : d),
    set: (k, v) => { p[k] = v; try { localStorage.setItem("prefs", JSON.stringify(p)); } catch {} },
  };
})();

// Tiny DOM builder: h("div", { class: "x", onclick }, child, "text", ...)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// Long lists draw the first 100 entries, then a quiet "Show N more" button that adds 100.
// The count per list lives in state.limit[key]: go() resets it, storage-triggered redraws keep it.
// `keep` is an index that must be drawn (J/K focus moving past the last drawn row).
const LIST_STEP = 100;
function pageOf(key, list, keep = -1) {
  const n = Math.max(state.limit[key] || LIST_STEP, Math.ceil((keep + 1) / LIST_STEP) * LIST_STEP);
  if (n > LIST_STEP) state.limit[key] = n;
  const left = list.length - n;
  if (left <= 0) return { shown: list, more: null };
  return {
    shown: list.slice(0, n),
    more: h("div", { class: "more", style: "margin:10px 2px" },
      h("button", { class: "link small", title: `${left} not shown yet`, onclick: () => { state.limit[key] = n + LIST_STEP; render(); } }, `Show ${Math.min(LIST_STEP, left)} more`)),
  };
}

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

// Section heading with a muted count: "Continue reading 3".
function sectionEl(label, n) {
  return h("h3", { class: "section-title" }, label, h("span", { class: "muted small" }, String(n)));
}

function matches(it) {
  const q = state.q;
  return !q || [it.title, it.url, it.path, it.why, it.type, ...(it.tags || [])].join(" ").toLowerCase().includes(q);
}

const DAY = 24 * 60 * 60 * 1000;
function shortWhen(ts) {
  const d = new Date(ts);
  const days = Math.round((new Date(ts).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "short" }) + " " + time;
  return stamp(ts);
}

function go(view, col = "") {
  state.view = view;
  state.col = col;
  state.type = "All";
  state.open = null;
  state.sel.clear();
  state.bundle = null;
  state.focusId = null;
  state.limit = {};
  history.replaceState(null, "", "#" + (view === "col" || view === "project" ? `${view}:${encodeURIComponent(col)}` : view));
  render();
}

// Undo: remember the storage keys an action changes, then offer to put them back for 8 s
// (button or Ctrl+Z). Small deletes use this instead of "Are you sure?" boxes.
let undoTimer = null, undoFn = null;
async function withUndo(label, keys, fn) {
  const before = await chrome.storage.local.get(keys);
  await fn();
  showToast(label, () => chrome.storage.local.set(before));
}

// Short message at the bottom of the sidebar.
let flashBase = null, flashTimer = null;
function flash(text) {
  const line = $("ai-line");
  if (flashBase === null) flashBase = line.textContent;
  line.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (line.textContent === text) line.textContent = flashBase; flashBase = null; }, 2500);
}

// Saves text as a file download.
function saveFile(name, text, type) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

function showToast(text, undo) {
  document.querySelector(".toast")?.remove();
  clearTimeout(undoTimer);
  undoFn = undo || null;
  const close = () => { el.remove(); undoFn = null; };
  const el = h("div", { class: "toast", role: "status" },
    h("span", {}, text),
    undo ? h("button", { class: "link", onclick: async () => { const fn = undoFn; close(); await fn?.(); } }, "Undo") : null,
    h("button", { class: "x", title: "Close", onclick: close }, "×"));
  document.body.append(el);
  undoTimer = setTimeout(close, 8000);
}

document.addEventListener("keydown", async (e) => {
  if (!undoFn || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.target.matches("input, textarea")) return;
  e.preventDefault();
  const fn = undoFn;
  document.querySelector(".toast")?.remove();
  undoFn = null;
  await fn();
});

// Fills the top search box (used when jumping to a word from quick search).
function setSearch(q) {
  $("search").value = q;
  state.q = q.toLowerCase();
}
