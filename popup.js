// Popup: save the current page (Inbox / a collection / a workspace), pins, and window tools.
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
let workspaces = [];
let dest = ui.get("dest", "inbox");

const isWeb = (t) => t && /^https?:/.test(t.url);

function busy(on) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = on));
}

// Focus an open Library tab instead of opening a new one each time.
async function openLibrary(hash = "") {
  const url = chrome.runtime.getURL("library.html");
  const [open] = await chrome.tabs.query({ url: url + "*" });
  if (open) {
    await chrome.tabs.update(open.id, { active: true, url: url + hash });
    await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + hash });
  }
  window.close();
}

// ---------- current page ----------

async function showPage() {
  const [items, cols, lib] = await Promise.all([getItems(), getCollections(), getSessions()]);
  workspaces = lib.filter((s) => sessionKind(s) === "workspace").sort((a, b) => a.name.localeCompare(b.name));
  existing = isWeb(tab) ? items.find((x) => x.url === tab.url) : null;

  $("cur-title").textContent = isWeb(tab) ? tab.title : "This page can't be saved";
  $("cur-fav").src = isWeb(tab) ? tab.favIconUrl || faviconFor(tab.url) : "icons/icon32.png";
  const where = $("cur-where");
  where.replaceChildren();
  if (isWeb(tab)) {
    const inWs = workspaces.filter((w) => w.tabs.some((t) => t.url === tab.url)).map((w) => w.name);
    const bits = [hostOf(tab.url)];
    if (existing) bits.push(existing.stage === "kept" ? `in ${pathLabel(existing.path)}` : "in Inbox");
    if (inWs.length) bits.push(`in ${inWs.join(", ")}`);
    where.textContent = bits.join(" · ");
  }

  $("paths").replaceChildren(...cols.filter((p) => p !== UNSORTED).map((p) => new Option(pathLabel(p))));
  if (existing && existing.path !== UNSORTED && !$("col-input").value) $("col-input").value = pathLabel(existing.path);

  const wsSel = $("ws-select");
  wsSel.replaceChildren(...workspaces.map((w) => new Option(`${w.name} (${w.tabs.length})`, w.id)), new Option("+ New workspace…", "__new"));
  const lastWs = ui.get("ws");
  if (workspaces.some((w) => w.id === lastWs)) wsSel.value = lastWs;
  else if (!workspaces.length) wsSel.value = "__new";
  $("ws-new").hidden = wsSel.value !== "__new";

  setDest(dest);
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
  if (dest === "inbox") b.textContent = existing ? "Update reminder" : "Save to Inbox";
  else if (dest === "collection") {
    const p = $("col-input").value.trim();
    b.textContent = p ? `Save to ${pathLabel(cleanPath(p))}` : "Save to collection";
  } else {
    const sel = $("ws-select").value;
    const w = workspaces.find((x) => x.id === sel);
    b.textContent = w ? `Add to ${w.name}` : "Create workspace";
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
      const it = await saveForLater(tab, $("remind").value);
      msg(existing ? "Reminder updated" : "Saved to Inbox");
      if (!existing) it.sorted.then((p) => p?.path && p.path !== UNSORTED && msg(`Saved · AI suggests ${pathLabel(p.path)}`));
    } else if (dest === "collection") {
      const p = $("col-input").value.trim();
      if (!p) { msg("Type a collection first"); $("col-input").focus(); return; }
      const it = await saveForLater(tab);
      await keepItem(it.id, p);
      msg(`Saved in ${pathLabel(cleanPath(p))}`);
    } else {
      let id = $("ws-select").value;
      if (id === "__new") {
        const name = $("ws-new").value.trim();
        if (!name) { msg("Name the new workspace"); $("ws-new").focus(); return; }
        id = (await addSession([tab], "workspace", name)).id;
        msg(`Workspace "${name}" created`);
      } else {
        await addTabToWorkspace(id, tab);
        msg(`Added to ${workspaces.find((w) => w.id === id)?.name}`);
      }
      ui.set("ws", id);
    }
    if ($("close-after").checked) chrome.tabs.remove(tab.id);
    await showPage();
    showFooter();
    showWorkspaces();
  } catch (e) {
    msg("Error: " + e.message);
  } finally {
    busy(false);
    updateSaveLabel();
  }
};

// ---------- pins ----------

async function showPins() {
  const pins = await getPins();
  $("pins").replaceChildren(...pins.map((p) => {
    const b = document.createElement("button");
    b.className = "pin";
    b.title = `${p.title} · ${hostOf(p.url)}`;
    const img = document.createElement("img");
    img.src = faviconFor(p.url, 32);
    img.alt = "";
    b.append(img);
    b.onclick = () => chrome.tabs.create({ url: p.url });
    return b;
  }));
  const on = isWeb(tab) && pins.some((p) => p.url === tab.url);
  $("pin-cur").classList.toggle("on", on);
  $("pin-cur").textContent = on ? "★" : "☆";
  $("pin-cur").title = on ? "Unpin" : "Pin to dock";
}

$("pin-cur").onclick = async () => {
  if (!isWeb(tab)) return;
  if (await isPinned(tab.url)) await unpinSite(tab.url);
  else await pinSite(tab);
  showPins();
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

async function aiGroups(tabs) {
  const downloading = (await aiAvailability()) !== "available";
  const session = await aiSession(downloading ? {
    monitor(m) { m.addEventListener("downloadprogress", (e) => msg(`Downloading AI model… ${Math.round(e.loaded * 100)}%`)); },
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
  const out = await session.prompt(prompt, { responseConstraint: schema });
  session.destroy();
  return JSON.parse(out).groups;
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

$("organise").onclick = async () => {
  busy(true);
  try {
    const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => !t.pinned);
    if (tabs.length < 2) return msg("Not enough tabs to organise");
    let groups, how;
    const a = await aiAvailability();
    if (a === "available" || a === "downloadable" || a === "downloading") {
      msg("Thinking…");
      try { groups = await aiGroups(tabs); how = "AI"; }
      catch (e) { console.warn("AI failed, using domains", e); }
    }
    if (!groups) { groups = domainGroups(tabs); how = "site"; }
    // ungroup only once the new grouping is ready, so the window doesn't flicker while the AI thinks
    await chrome.tabs.ungroup(tabs.map((t) => t.id)).catch(() => {});
    await applyGroups(tabs, groups);
    msg(`${groups.length} groups by ${how}`);
  } catch (e) {
    msg("Error: " + e.message);
  } finally {
    busy(false);
    showAiStatus();
    showSummary();
    updateSaveLabel();
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
    msg(`Session saved for ${SESSION_DAYS} days`);
    $("msg").title = s.name;
  } finally {
    busy(false);
    showSummary();
  }
};

async function showWorkspaces() {
  const list = (await getSessions()).filter((s) => sessionKind(s) === "workspace").sort((a, b) => a.name.localeCompare(b.name));
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

$("save-ws").onclick = () => {
  $("ws-form").hidden = !$("ws-form").hidden;
  if (!$("ws-form").hidden) $("ws-name").focus();
};

$("ws-form").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("ws-name").value.trim();
  if (!name) return;
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(isWeb);
  await addSession(tabs, "workspace", name);
  msg(`Workspace "${name}" saved`);
  $("ws-name").value = "";
  $("ws-form").hidden = true;
  showWorkspaces();
  showPage();
};

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

async function showFooter() {
  const items = await getItems();
  const inbox = items.filter((i) => i.stage === "inbox").length;
  const due = items.filter((i) => isDue(i)).length;
  const review = forReview(items).length;
  $("n-inbox").textContent = inbox;
  $("due-chip").hidden = !due;
  $("due-chip").textContent = `${due} due`;
  $("go-review").hidden = !review;
  $("go-review").textContent = `Review ${review}`;
}

$("open-library").onclick = () => openLibrary();
$("go-inbox").onclick = () => openLibrary("#inbox");
$("go-review").onclick = () => openLibrary("#review");

(async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("remind").replaceChildren(...REMIND_PRESETS.map(([v, l]) => new Option(l, v)));
  await migrate();
  await showPage();
  showPins();
  showFooter();
  showWorkspaces();
  showSummary();
  showAiStatus();
})();
