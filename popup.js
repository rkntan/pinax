// Popup: save the current page (Inbox / a collection / a project), pins, and window tools.
// Uses core.js (loaded first).

const $ = (id) => document.getElementById(id);
const msg = (t) => { $("msg").textContent = t; $("msg").title = t; };

const ui = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem("popup") || "{}"); } catch {}
  return {
    get: (k, d) => (k in p ? p[k] : d),
    set: (k, v) => { p[k] = v; try { localStorage.setItem("popup", JSON.stringify(p)); } catch {} },
  };
})();

let tab = null;          // the current tab
let existing = null;     // its saved item, if any
let projectList = [];
let dest = ui.get("dest", "inbox").replace("workspace", "project");

const isWeb = (t) => t && /^https?:/.test(t.url);

function busy(on) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = on));
}

async function openLibrary(hash = "") {
  await openLibraryTab(hash);
  window.close();
}

// ---------- current page ----------

async function showPage() {
  const [items, cols, projects] = await Promise.all([getItems(), getCollections(), getProjects()]);
  projectList = projects.filter((x) => x.status !== "finished").sort((a, b) => a.name.localeCompare(b.name));
  existing = isWeb(tab) ? items.find((x) => x.url === tab.url) : null;

  $("cur-title").textContent = isWeb(tab) ? tab.title : "This page can't be saved";
  $("cur-fav").src = isWeb(tab) ? tab.favIconUrl || faviconFor(tab.url) : "icons/icon32.png";
  const where = $("cur-where");
  where.replaceChildren();
  if (isWeb(tab)) {
    const inWs = projectList.filter((w) => w.tabs.some((t) => t.url === tab.url) || (w.sources || []).some((x) => x.url === tab.url)).map((w) => w.name);
    const bits = [hostOf(tab.url)];
    if (existing) bits.push(existing.stage === "kept" ? `in ${pathLabel(existing.path)}` : "in Inbox");
    if (inWs.length) bits.push(`in ${inWs.join(", ")}`);
    const n = await noteFor(tab.url);
    if (n) bits.push(`${n.highlights.length} highlight${n.highlights.length === 1 ? "" : "s"}${n.text.trim() ? " + notes" : ""}`);
    where.textContent = bits.join(" · ");
  }

  $("paths").replaceChildren(...cols.filter((p) => p !== UNSORTED).map((p) => new Option(pathLabel(p))));
  if (existing && existing.path !== UNSORTED && !$("col-input").value) $("col-input").value = pathLabel(existing.path);

  const wsSel = $("ws-select");
  wsSel.replaceChildren(...projectList.map((w) => new Option(`${w.name} (${w.tabs.length})`, w.id)), new Option("+ New project…", "__new"));
  const lastWs = ui.get("project");
  if (projectList.some((w) => w.id === lastWs)) wsSel.value = lastWs;
  else if (!projectList.length) wsSel.value = "__new";
  $("ws-new").hidden = wsSel.value !== "__new";

  setDest(dest);
  showBell();
}

function setDest(d) {
  dest = d;
  ui.set("dest", d);
  document.querySelectorAll("#dest button").forEach((b) => b.classList.toggle("on", b.dataset.dest === d));
  document.querySelectorAll(".dest-body").forEach((el) => (el.hidden = el.dataset.for !== d));
  updateSaveLabel();
}

function updateSaveLabel() {
  const b = $("save");
  b.disabled = !isWeb(tab);
  $("bell").parentElement.hidden = dest === "project"; // project sources have no reminders
  if (dest === "inbox") {
    b.textContent = existing ? (existing.stage === "kept" ? `Saved in ${pathLabel(existing.path)}` : "Saved in Inbox ✓") : "Save to Inbox";
    b.disabled = !isWeb(tab) || !!existing;
  }
  else if (dest === "collection") {
    const p = $("col-input").value.trim();
    b.textContent = p ? `Save to ${pathLabel(cleanPath(p))}` : "Save to collection";
  } else {
    const sel = $("ws-select").value;
    const w = projectList.find((x) => x.id === sel);
    b.textContent = w ? `Add to ${w.name}` : "Create project";
  }
}

$("dest").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  setDest(b.dataset.dest);
  if (b.dataset.dest === "collection") $("col-input").focus();
};
$("col-input").oninput = updateSaveLabel;
$("ws-select").onchange = () => {
  $("ws-new").hidden = $("ws-select").value !== "__new";
  if (!$("ws-new").hidden) $("ws-new").focus();
  updateSaveLabel();
};
$("ws-new").oninput = updateSaveLabel;
document.querySelectorAll(".dest-body input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") $("save").click(); }));

$("save").onclick = async () => {
  if (!isWeb(tab)) return;
  busy(true);
  try {
    if (dest === "inbox") {
      const it = await saveForLater(tab, remindKey);
      addStats(it.id, tab);
      msg(remindKey ? `Saved to Inbox · reminder ${presetLabel(remindKey)}` : "Saved to Inbox");
      if (!existing) it.sorted.then((p) => p?.path && p.path !== UNSORTED && msg(`Saved · AI suggests ${pathLabel(p.path)}`));
    } else if (dest === "collection") {
      const p = $("col-input").value.trim();
      if (!p) { msg("Type a collection first"); $("col-input").focus(); return; }
      const it = await saveForLater(tab, remindKey);
      addStats(it.id, tab);
      await keepItem(it.id, p);
      msg(`Saved in ${pathLabel(cleanPath(p))}`);
    } else {
      let id = $("ws-select").value;
      if (id === "__new") {
        const name = $("ws-new").value.trim();
        if (!name) { msg("Name the new project"); $("ws-new").focus(); return; }
        id = (await addProject(name, [], true)).id;
        await addSource(id, tab);
        msg(`Project "${name}" created`);
      } else {
        await addSource(id, tab);
        msg(`Added to ${projectList.find((w) => w.id === id)?.name}`);
      }
      ui.set("project", id);
    }
    remindKey = "";
    await showPage();
    showProjects();
  } catch (e) {
    msg("Error: " + e.message);
  } finally {
    busy(false);
    updateSaveLabel();
  }
};

// ---------- reminder bell ----------
// Before saving it picks the reminder for the save; for a page already saved it sets it at once.

let remindKey = "";
const presetLabel = (key) => REMIND_PRESETS.find(([v]) => v === key)?.[1] || "";

function showBell() {
  const set = existing?.remindAt ? `Reminder ${new Date(existing.remindAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : remindKey ? `Reminder: ${presetLabel(remindKey)}` : "";
  $("bell").classList.toggle("on", !!set);
  $("bell").title = set || "Remind me…";
  const current = existing?.remindAt ? "set" : remindKey;
  $("bell-menu").replaceChildren(
    ...REMIND_PRESETS.filter(([v]) => v).map(([v, label]) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.className = remindKey === v ? "on" : "";
      b.onclick = () => pickReminder(v);
      return b;
    }),
    ...(current ? [Object.assign(document.createElement("button"), { className: "clear", textContent: "No reminder", onclick: () => pickReminder("") })] : []));
}

async function pickReminder(key) {
  $("bell-menu").hidden = true;
  if (existing) {
    await setReminder(existing.id, key);
    existing = (await getItems()).find((x) => x.id === existing.id);
    msg(key ? `Reminder: ${presetLabel(key)}` : "Reminder removed");
  } else {
    remindKey = key;
    msg(key ? `Reminder: ${presetLabel(key)} (set when you save)` : "No reminder");
  }
  showBell();
}

$("bell").onclick = (e) => {
  e.stopPropagation();
  $("bell-menu").hidden = !$("bell-menu").hidden;
};
document.addEventListener("click", (e) => { if (!e.target.closest(".bell-wrap")) $("bell-menu").hidden = true; });

// ---------- pin star (the pinned sites themselves live in the Library) ----------

async function showPinStar() {
  const pins = await getPins();
  const on = isWeb(tab) && pins.some((p) => p.url === tab.url);
  $("pin-cur").classList.toggle("on", on);
  $("pin-cur").textContent = on ? "★" : "☆";
  $("pin-cur").title = on ? "Unpin" : "Pin to dock";
}

$("open-panel").onclick = () => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}); // must run right after the click
  window.close();
};

$("pin-cur").onclick = async () => {
  if (!isWeb(tab)) return;
  if (await isPinned(tab.url)) await unpinSite(tab.url);
  else await pinSite(tab);
  showPinStar();
};

// ---------- window ----------

async function showSummary() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set(tabs.map((t) => t.groupId).filter((g) => g !== -1)).size;
  const seen = new Set();
  let dupes = 0;
  for (const t of tabs) {
    const key = t.url.split("#")[0];
    seen.has(key) ? dupes++ : seen.add(key);
  }
  $("summary").textContent = `${tabs.length} tabs · ${groups} groups`;
  $("dedupe").textContent = dupes ? `Close ${dupes} duplicate${dupes > 1 ? "s" : ""}` : "No duplicates";
  $("dedupe").disabled = !dupes;
}

async function aiTitle(tabs) {
  try {
    if ((await aiAvailability()) !== "available") return null;
    const s = await aiSession();
    const t = await s.prompt(
      "Give a short name (max 5 words, no quotes) for a browsing session with these tabs:\n" +
        tabs.slice(0, 30).map((t) => "- " + t.title).join("\n")
    );
    s.destroy();
    return t.trim().replace(/^["']|["']$/g, "");
  } catch { return null; }
}

$("organise").onclick = async () => {
  busy(true);
  try {
    const r = await organiseWindow(tab.windowId, msg);
    msg(r.how === "none" ? "Not enough tabs to organise" : `${r.groups.length} groups by ${r.how}`);
  } catch (e) {
    msg("Error: " + e.message);
  } finally {
    busy(false);
    showAiStatus();
    showSummary();
    updateSaveLabel();
  }
};

// Everything into the Inbox, then close: a snapshot also goes to History (with groups) just in case.
$("all-inbox").onclick = async () => {
  busy(true);
  try {
    const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => isWeb(t) && !t.pinned);
    if (!tabs.length) return msg("No web tabs to send");
    await addSession(tabs, "saved", `${tabs.length} tabs sent to Inbox`);
    // the AI sorts them one by one when the Library opens (not 30 at once here)
    for (const t of tabs) {
      const it = await saveForLater(t, "", { sort: false });
      addStats(it.id, t); // works where Chrome lets the extension read the tab
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL("library.html#inbox"), windowId: tab.windowId });
    await chrome.tabs.remove(tabs.map((t) => t.id));
  } finally {
    busy(false);
  }
};

$("dedupe").onclick = async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const seen = new Set(), dupes = [];
  for (const t of tabs) {
    const key = t.url.split("#")[0];
    seen.has(key) ? dupes.push(t.id) : seen.add(key);
  }
  if (dupes.length) await chrome.tabs.remove(dupes);
  msg(`Closed ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"}`);
  showSummary();
};

$("ungroup").onclick = async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  await chrome.tabs.ungroup(tabs.map((t) => t.id)).catch(() => {});
  msg("Ungrouped");
  showSummary();
};

$("save-session").onclick = async () => {
  busy(true);
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    msg("Naming session…");
    const s = await addSession(tabs, "saved", await aiTitle(tabs));
    msg(`Session saved to History for ${SESSION_DAYS} days`);
    $("msg").title = s.name;
  } finally {
    busy(false);
    showSummary();
  }
};

// Chips that open a project's working tabs.
async function showProjects() {
  const list = (await getProjects()).filter((p) => p.tabs.length && p.status !== "finished").sort((a, b) => a.name.localeCompare(b.name));
  $("ws").replaceChildren(...list.map((s) => {
    const b = document.createElement("button");
    b.title = `Open ${s.tabs.length} tabs in a new window`;
    b.textContent = s.name;
    const n = document.createElement("span");
    n.textContent = s.tabs.length;
    b.append(n);
    b.onclick = () => restoreTabs(s.tabs);
    return b;
  }));
}

// ---------- projects: working on, park, reading ----------

function projectOptions(sel, current, noneLabel) {
  sel.replaceChildren(
    ...(noneLabel ? [new Option(noneLabel, "")] : []),
    ...projectList.map((p) => new Option(p.name, p.id)),
    new Option("+ New project…", "__new"));
  sel.value = current && projectList.some((p) => p.id === current) ? current : noneLabel ? "" : projectList[0]?.id || "__new";
}

async function showWorking() {
  const current = (await getWorkingOn())[tab.windowId] || "";
  projectOptions($("working"), current, "Not tracking");
  $("working").classList.toggle("on", !!$("working").value);
}

$("working").onchange = async () => {
  const v = $("working").value;
  $("working-new").hidden = v !== "__new";
  if (v === "__new") return $("working-new").focus();
  await setWorkingOn(tab.windowId, v || null);
  msg(v ? "New pages in this window join the trail" : "Stopped tracking");
  showWorking();
};

$("working-new").onkeydown = async (e) => {
  if (e.key !== "Enter" || !$("working-new").value.trim()) return;
  const p = await addProject($("working-new").value.trim(), [], true);
  await setWorkingOn(tab.windowId, p.id);
  $("working-new").hidden = true;
  $("working-new").value = "";
  await showPage();
  showWorking();
  msg(`Tracking “${p.name}”`);
};

$("park").onclick = () => {
  $("park-form").hidden = !$("park-form").hidden;
  projectOptions($("park-proj"), ui.get("project"));
  $("park-name").hidden = $("park-proj").value !== "__new";
};
$("park-proj").onchange = () => {
  $("park-name").hidden = $("park-proj").value !== "__new";
  if (!$("park-name").hidden) $("park-name").focus();
};

$("park-form").onsubmit = async (e) => {
  e.preventDefault();
  let id = $("park-proj").value;
  if (id === "__new") {
    const name = $("park-name").value.trim();
    if (!name) return $("park-name").focus();
    id = (await addProject(name, [], true)).id;
  }
  ui.set("project", id);
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const n = await parkTabs(id, tabs);
  if ($("park-close").checked) {
    // open the project in the Library first, so the window stays open
    await chrome.tabs.create({ url: chrome.runtime.getURL(`library.html#project:${id}`), windowId: tab.windowId });
    await chrome.tabs.remove(tabs.filter((t) => isWeb(t) && !t.pinned).map((t) => t.id));
  } else {
    await setWorkingOn(tab.windowId, id);
    msg(`Parked ${n} page${n === 1 ? "" : "s"}; tracking this window`);
    $("park-form").hidden = true;
    showWorking();
  }
};

// Reading card: the current tab is a source of an active project.
let reading = null; // { project, source }

async function showSource() {
  reading = isWeb(tab) ? sourceForUrl(await getProjects(), tab.url) : null;
  $("src-card").hidden = !reading;
  if (!reading) return;
  const { project: p, source: s } = reading;
  const c = projectProgress(p);
  $("src-proj").textContent = p.name;
  $("src-prog").textContent = ` · ${c.sorted}/${c.total} sorted`;
  $("src-note").value = s.note || "";
  $("src-auto").checked = ui.get("autoNext", true);
  document.querySelectorAll(".sbtn").forEach((b) => b.classList.toggle("on", b.dataset.st === s.status));
  $("src-next").disabled = !nextUnread(p.sources, s.id);
}

// Read & close: this tab moves on to the next unread source.
async function openNext() {
  const p = (await getProjects()).find((x) => x.id === reading.project.id);
  const next = p && nextUnread(p.sources, reading.source.id);
  if (!next) { msg("All sorted in this project"); await showSource(); return; }
  await chrome.tabs.update(tab.id, { url: next.url });
  window.close();
}

document.querySelectorAll(".sbtn").forEach((b) => (b.onclick = async () => {
  if (!reading) return;
  const { project: p, source: s } = reading;
  const note = $("src-note").value.trim();
  if (note !== (s.note || "")) await setSourceNote(p.id, s.id, note);
  if (b.dataset.st === "skip") {
    const kids = descendants(p.sources, s.id).filter((id) => p.sources.find((x) => x.id === id)?.status === "unread").length;
    if (kids) {
      // ask inline (popups can't show confirm boxes reliably)
      $("prune").hidden = false;
      $("prune").firstElementChild.textContent = `${kids} unread page${kids > 1 ? "s were" : " was"} opened from it.`;
      $("prune-one").onclick = () => mark("skip", false);
      $("prune-all").onclick = () => mark("skip", true);
      return;
    }
  }
  mark(b.dataset.st, false);
}));

async function mark(status, prune) {
  const { project: p, source: s } = reading;
  await setSourceStatus(p.id, s.id, status, prune);
  $("prune").hidden = true;
  if ($("src-auto").checked) return openNext();
  msg(`Marked: ${status === "skip" ? "not needed" : status}`);
  showSource();
}

$("src-note").onchange = () => reading && setSourceNote(reading.project.id, reading.source.id, $("src-note").value.trim());
$("src-auto").onchange = () => ui.set("autoNext", $("src-auto").checked);
$("src-next").onclick = () => reading && openNext();

// ---------- header / footer ----------

async function showAiStatus() {
  const a = await aiAvailability();
  const labels = {
    available: "Local AI ready",
    downloadable: "AI model not downloaded: click Organise once",
    downloading: "AI model downloading",
    unavailable: "No local AI: sorting by simple rules",
    unsupported: "No local AI: sorting by simple rules",
  };
  const dot = $("ai-status");
  dot.title = labels[a] || a;
  dot.classList.toggle("ok", a === "available");
  dot.classList.toggle("warn", a !== "available");
}

$("open-library").onclick = () => openLibrary();

(async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await migrate();
  if (isWeb(tab)) pageTools(tab, false, true).catch(() => {}); // bubble + dock on this page from now on
  await showPage();
  showPinStar();
  showProjects();
  showWorking();
  showSource();
  showSummary();
  showAiStatus();
})();
