// Library page: shared state and small DOM helpers. Loaded before views/*.js and library.js.

const $ = (id) => document.getElementById(id);
const MAP_COLORS = { Course: "#8959ff", Video: "#ff5a5f", Tool: "#12b886", Article: "#f59f00", Docs: "#228be6", Paper: "#e64980", Other: "#868e96" };
const PLURAL = { Course: "Courses", Video: "Videos", Tool: "Tools", Article: "Articles", Docs: "Docs", Paper: "Papers", Other: "Other" };

const state = { view: "inbox", col: "", type: "All", status: "active", q: "", open: null, openSessions: new Set(), pkind: "vocab", lang: "All", rtab: "pages", sfilter: "all", finishing: null };
const data = { items: [], cols: [], pins: [], projects: [], history: [], phrases: [] };

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
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
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
  history.replaceState(null, "", "#" + (view === "col" || view === "project" ? `${view}:${encodeURIComponent(col)}` : view));
  render();
}
