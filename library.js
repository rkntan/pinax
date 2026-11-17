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
  $("settings-btn").classList.toggle("on", state.view === "settings");
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
  const views = { inbox: viewInbox, all: viewAll, col: viewCollection, review: viewReview, map: viewMap, history: viewHistory, settings: viewSettings, notes: viewNotes, queue: viewQueue, project: viewProject, phrases: viewPhrasebook };
  const keepFocus = state.view === "review" ? null : document.activeElement?.id;
  $("content").replaceChildren((views[state.view] || viewInbox)());
  if (keepFocus) $(keepFocus)?.focus();
}

document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => go(b.dataset.view)));
$("density").onclick = (e) => { const b = e.target.closest("button"); if (b) { prefs.set("density", b.dataset.d); render(); } };
// Search redraws 150 ms after the last keystroke; Enter redraws at once.
let searchTimer = null;
$("search").oninput = (e) => {
  state.q = e.target.value.toLowerCase();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 150);
};
$("search").onkeydown = (e) => { if (e.key === "Enter") { clearTimeout(searchTimer); render(); } };

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

const BACKUP_KEYS = ["items", "collections", "pins", "projects", "history", "phrases", "notes"];

async function exportBackup() {
  await migrate(); // the file says SCHEMA, so the data must be at SCHEMA
  const [d, settings] = await Promise.all([chrome.storage.local.get(BACKUP_KEYS), chrome.storage.local.get(SETTINGS_KEYS)]);
  const blob = new Blob([JSON.stringify({ app: "tab-organiser", version: SCHEMA, schema: SCHEMA, exported: Date.now(), ...d, settings }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `pinax-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Backup exported");
}

// Plain files you can keep without Pinax: bookmarks for any browser, or a spreadsheet.
async function exportPages(kind) {
  const d = await chrome.storage.local.get(["items", "pins", "projects"]);
  const day = new Date().toISOString().slice(0, 10);
  if (kind === "csv") saveFile(`pinax-pages-${day}.csv`, itemsCsv(d.items || []), "text/csv;charset=utf-8");
  else saveFile(`pinax-bookmarks-${day}.html`, bookmarksHtml(d.items || [], d.pins || [], d.projects || []), "text/html;charset=utf-8");
  showToast(kind === "csv" ? "Spreadsheet exported" : "Bookmarks exported: import the file in any browser");
}
async function importBackup(file) {
  if (!file) return;
  try {
    // older backups are brought up to SCHEMA first; newer ones are refused before any write
    let raw;
    try { raw = JSON.parse(await file.text()); } catch { throw new Error("not a Pinax backup"); }
    const next = mergeBackup(await chrome.storage.local.get(BACKUP_KEYS), raw);
    await chrome.storage.local.set(next);
    if ("autoSession" in next) autoSessionOn = next.autoSession;
    chrome.runtime.sendMessage({ type: "sync-alarms" }).catch(() => {}); // reminder alarms for imported pages
    showToast(`Imported. You now have ${next.items.length} pages, ${next.projects.length} projects and ${next.pins.length} pins.`);
  } catch (err) {
    showToast(`Nothing imported: ${err.message}.`);
  }
}

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
  else if (["inbox", "review", "queue", "all", "map", "history", "phrases", "notes", "settings"].includes(hash)) state.view = hash;
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
  const { autoSession = true } = await chrome.storage.local.get("autoSession");
  autoSessionOn = autoSession;
  tidyPrefs = await tidySettings();
  await render();
  showAi();
  checkUpdateQuietly();
})();
