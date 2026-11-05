// Library page shell: loading, rendering, routing, search, backup. Views live in views/*.js.

function setHead(title, sub) {
  $("title").textContent = title;
  $("subtitle").textContent = sub || "";
  document.title = `${title} · Library`;
}

async function load() {
  const r = await chrome.storage.local.get(["items", "collections", "pins", "projects", "history", "phrases", "notes"]);
  data.items = r.items || [];
  data.cols = r.collections || [];
  data.pins = r.pins || [];
  data.projects = r.projects || [];
  data.history = r.history || [];
  data.phrases = r.phrases || [];
  data.notes = r.notes || {};
}

// Many storage writes can land at once (AI sorting, drag and drop): redraw once per frame.
let renderQueued = null;
function render() {
  renderQueued ||= new Promise((resolve) => requestAnimationFrame(async () => {
    renderQueued = null;
    await renderNow();
    resolve();
  }));
  return renderQueued;
}

// Storage is re-read only after it changed (onChanged sets `stale`), not on every redraw.
let stale = true;
let sideFor = null; // view|col the sidebar was last drawn for

async function renderNow() {
  const reloaded = stale;
  if (stale) { stale = false; await load(); }
  const inbox = data.items.filter((x) => x.stage === "inbox").length;
  const review = forReview(data.items).length;
  $("n-inbox").textContent = inbox || "";
  $("n-review").textContent = review || "";
  $("n-all").textContent = data.items.length || "";
  $("n-queue").textContent = readingQueue(data.items).length || "";
  $("n-notes").textContent = Object.keys(data.notes).length || "";
  $("n-history").textContent = data.history.filter(isTemporary).length || "";
  $("n-phrases").textContent = data.phrases.filter((p) => p.kind !== "quote" && p.created >= weekStart()).length || "";
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  document.querySelectorAll("#density button").forEach((b) => b.classList.toggle("on", b.dataset.d === prefs.get("density", "rows")));
  $("density").style.visibility = ["inbox", "all", "col", "queue"].includes(state.view) ? "visible" : "hidden";

  listOrder = [];
  // the sidebar only changes with the data or the active view / collection / project
  if (reloaded || sideFor !== `${state.view}|${state.col}`) {
    sideFor = `${state.view}|${state.col}`;
    renderPins();
    renderTree();
    renderProjects();
  }
  reviewKeys = null;
  const views = { inbox: viewInbox, all: viewAll, col: viewCollection, review: viewReview, map: viewMap, history: viewHistory, notes: viewNotes, queue: viewQueue, project: viewProject, phrases: viewPhrasebook };
  const keepFocus = state.view === "review" ? null : document.activeElement?.id;
  $("content").replaceChildren((views[state.view] || viewInbox)());
  if (keepFocus) $(keepFocus)?.focus();
}

document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => go(b.dataset.view)));
$("density").onclick = (e) => { const b = e.target.closest("button"); if (b) { prefs.set("density", b.dataset.d); render(); } };
$("search").oninput = (e) => { state.q = e.target.value.toLowerCase(); render(); };

$("add").onsubmit = async (e) => {
  e.preventDefault();
  const url = $("add-url").value.trim();
  $("add-url").value = "";
  const it = await saveForLater({ url, title: url });
  const line = $("ai-line");
  const before = line.textContent;
  line.textContent = "Sorting with local AI…";
  await it.sorted;
  line.textContent = (await aiAvailability()) === "available" ? "Local AI ready" : before;
};

$("export").onclick = async () => {
  const d = await chrome.storage.local.get(["schema", "items", "collections", "pins", "projects", "history", "phrases", "notes"]);
  const blob = new Blob([JSON.stringify({ app: "tab-organiser", version: 4, exported: Date.now(), ...d }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `tab-organiser-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$("import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    // bring any older backup up to the current schema first, then merge without duplicates
    const raw = JSON.parse(await file.text());
    if (raw.app !== "tab-organiser") throw new Error("missing app marker");
    const d = migrateData({ ...raw, schema: raw.schema || (raw.version >= 3 ? 2 : 1) });
    const merge = (mine = [], theirs = [], key = "id") => {
      const ids = new Set(mine.map((x) => x[key]));
      return [...mine, ...(theirs || []).filter((x) => x[key] && !ids.has(x[key]))];
    };
    const cur = await chrome.storage.local.get(["items", "collections", "pins", "projects", "history", "phrases", "notes"]);
    const next = {
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
          mine.highlights = merge(mine.highlights, n.highlights);
          if (!mine.text.trim()) mine.text = n.text || "";
        }
        return acc;
      }, { ...(cur.notes || {}) }),
      collections: sortPaths([...(cur.collections || []), ...(d.collections || [])]),
    };
    await chrome.storage.local.set(next);
    alert(`Imported. You now have ${next.items.length} pages, ${next.projects.length} projects and ${next.pins.length} pins.`);
  } catch (err) {
    alert("That file is not a Tab Organiser backup: " + err.message);
  }
  e.target.value = "";
};

$("resurface").onchange = (e) => chrome.storage.local.set({ resurface: e.target.checked });

async function showAi() {
  const a = await aiAvailability();
  const line = $("ai-line");
  if (a !== "available") {
    line.textContent = a === "downloadable" || a === "downloading"
      ? "AI model not downloaded yet (click Organise in the popup once)."
      : "Local AI not available: simple rules sort your saves.";
    enrichPendingPhrases(); // language + translation can still work without the main model
    return;
  }
  const pending = (await getItems()).filter((x) => x.needsAi).length;
  if (pending) {
    line.textContent = `Sorting ${pending} new save${pending > 1 ? "s" : ""}…`;
    await classifyPending((n, t) => (line.textContent = `Sorting with local AI… ${n}/${t}`));
  }
  await enrichPendingPhrases((n, t) => (line.textContent = `Looking up words… ${n}/${t}`));
  line.textContent = "Local AI ready";
}

chrome.storage.onChanged.addListener((c) => {
  if (c.tidyDays || c.autoTidy) tidySettings().then((t) => (tidyPrefs = t));
  if (c.items || c.projects || c.history || c.collections || c.pins || c.phrases || c.notes || c.tidyDays) {
    stale = true;
    renderAfterTyping();
  }
});

// A storage change while you type in a field of the page waits until you leave the field,
// so the redraw doesn't wipe what you typed (the top search box is redrawn-safe).
// (Selects, checkboxes and radios commit on change, so their own writes redraw at once.)
// Leaving the field with a mouse press waits for that click, so the button you pressed still works.
let renderDeferred = false, pointerDown = false;
addEventListener("pointerdown", () => (pointerDown = true), true);
addEventListener("pointerup", () => setTimeout(() => (pointerDown = false)), true);
function renderAfterTyping() {
  const el = document.activeElement;
  if (el?.matches("textarea, input:not([type=checkbox]):not([type=radio])") && el.id !== "search" && el.closest("#tools, #content")) {
    if (!renderDeferred) {
      renderDeferred = true;
      el.addEventListener("blur", () => {
        const again = () => { renderDeferred = false; renderAfterTyping(); };
        if (pointerDown) addEventListener("click", () => setTimeout(again), { once: true, capture: true });
        else again();
      }, { once: true });
    }
    return;
  }
  render();
}

// Redraw from fresh storage now: for a user action that saved while its field keeps focus.
function reload() {
  stale = true;
  return render();
}

function readHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const i = hash.indexOf(":");
  if (["col", "project", "ws"].includes(hash.slice(0, i))) [state.view, state.col] = [hash.slice(0, i).replace("ws", "project"), hash.slice(i + 1)];
  else if (["inbox", "review", "queue", "all", "map", "history", "phrases", "notes"].includes(hash)) state.view = hash;
  else if (hash === "sessions" || hash === "archive") state.view = "history"; // old links
}
// the popup reuses an open Library tab and just changes its #view
window.addEventListener("hashchange", () => {
  const [view, col] = [state.view, state.col];
  readHash();
  if (state.view !== view || state.col !== col) go(state.view, state.col);
  else render();
});

(async function init() {
  await migrate();
  readHash();
  const { resurface = true, autoSession = true } = await chrome.storage.local.get(["resurface", "autoSession"]);
  $("resurface").checked = resurface;
  autoSessionOn = autoSession;
  tidyPrefs = await tidySettings();
  await render();
  showAi();
})();
