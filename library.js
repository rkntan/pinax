// Library page: pins dock, Inbox, weekly review, collections tree, mind map, sessions, archive.

const $ = (id) => document.getElementById(id);
const MAP_COLORS = { Course: "#8959ff", Video: "#ff5a5f", Tool: "#12b886", Article: "#f59f00", Docs: "#228be6", Paper: "#e64980", Other: "#868e96" };
const PLURAL = { Course: "Courses", Video: "Videos", Tool: "Tools", Article: "Articles", Docs: "Docs", Paper: "Papers", Other: "Other" };

const state = { view: "inbox", col: "", type: "All", status: "active", q: "", open: null, openSessions: new Set() };
const data = { items: [], cols: [], pins: [], lib: [] };

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
  history.replaceState(null, "", "#" + (view === "col" || view === "ws" ? `${view}:${encodeURIComponent(col)}` : view));
  render();
}

// ---------- pins dock ----------

let tip;
function showTip(el, text) {
  hideTip();
  const r = el.getBoundingClientRect();
  tip = h("div", { class: "pin-tip", style: `left:${r.right + 10}px;top:${r.top + 9}px` }, text);
  document.body.append(tip);
}
function hideTip() { tip?.remove(); tip = null; }

function renderPins() {
  const box = $("pins");
  box.replaceChildren();
  let dragId = null;
  for (const p of data.pins) {
    const el = h("div", {
      class: "pin",
      draggable: "true",
      onclick: () => chrome.tabs.create({ url: p.url }),
      onmouseenter: (e) => showTip(e.currentTarget, `${p.title} · ${hostOf(p.url)}`),
      onmouseleave: hideTip,
      ondragstart: () => { dragId = p.id; hideTip(); },
      ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drag-over"),
      ondrop: async (e) => {
        e.preventDefault();
        const pins = data.pins.filter((x) => x.id !== dragId);
        const moved = data.pins.find((x) => x.id === dragId);
        if (!moved) return;
        pins.splice(pins.findIndex((x) => x.id === p.id), 0, moved);
        await setPins(pins);
      },
    },
      h("img", { src: faviconFor(p.url, 32), alt: "" }),
      h("button", { class: "x", title: "Unpin", onclick: (e) => { e.stopPropagation(); hideTip(); unpinSite(p.url); } }, "×"));
    box.append(el);
  }
}

$("pin-add").onclick = async () => {
  const url = prompt("Pin a site (paste its address):", "https://");
  if (!url || !/^https?:\/\/.+/.test(url)) return;
  await pinSite({ url, title: hostOf(url) });
};

// ---------- collections tree ----------

function buildTree() {
  const all = new Set(data.cols);
  data.items.filter((it) => it.stage === "kept" && it.path !== UNSORTED).forEach((it) => {
    const parts = it.path.split("/");
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
  });
  const root = { children: {} };
  [...all].sort((a, b) => a.localeCompare(b)).forEach((path) => {
    let node = root;
    path.split("/").forEach((part, i, arr) => {
      node = node.children[part] ||= { name: part, path: arr.slice(0, i + 1).join("/"), children: {} };
    });
  });
  return root;
}

function countIn(path) {
  return data.items.filter((it) => it.stage === "kept" && inPath(it.path, path)).length;
}

function dropTarget(el, onDrop) {
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/item")) return;
    e.preventDefault();
    el.classList.add("drop-ok");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-ok"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-ok");
    const id = e.dataTransfer.getData("text/item");
    if (id) { e.preventDefault(); onDrop(id); }
  });
}

function renderTree() {
  const box = $("tree");
  box.replaceChildren();
  const collapsed = new Set(prefs.get("collapsed", []));
  const root = buildTree();
  const draw = (node, depth) => {
    for (const child of Object.values(node.children)) {
      const kids = Object.keys(child.children).length;
      const isOpen = !collapsed.has(child.path);
      const row = h("div", {
        class: `node-row${state.view === "col" && state.col === child.path ? " on" : ""}`,
        style: `padding-left:${8 + depth * 14}px`,
        onclick: () => go("col", child.path),
        title: pathLabel(child.path),
      },
        h("span", {
          class: "caret",
          onclick: (e) => {
            if (!kids) return;
            e.stopPropagation();
            isOpen ? collapsed.add(child.path) : collapsed.delete(child.path);
            prefs.set("collapsed", [...collapsed]);
            renderTree();
          },
        }, kids ? (isOpen ? "▾" : "▸") : "•"),
        h("span", { class: "node-name" }, child.name),
        h("span", { class: "n" }, String(countIn(child.path) || "")));
      dropTarget(row, (id) => keepItem(id, child.path));
      box.append(row);
      if (kids && isOpen) draw(child, depth + 1);
    }
  };
  draw(root, 0);
  if (!box.children.length) box.append(h("div", { class: "empty-tree" }, "No collections yet. Keep pages from the Inbox or press +."));
  $("paths").replaceChildren(...[...new Set([...data.cols, ...data.items.map((i) => i.path)])]
    .filter((p) => p && p !== UNSORTED).sort().map((p) => h("option", { value: pathLabel(p) })));
}

$("col-add").onclick = async () => {
  const p = prompt("New collection (use › or / for levels, e.g. AI › Agents › Papers):", state.view === "col" ? pathLabel(state.col) + " › " : "");
  if (p) { await addCollection(p); go("col", cleanPath(p)); }
};

dropTarget(document.querySelector('[data-drop="inbox"]'), (id) => updateItem(id, { stage: "inbox" }));

// ---------- rows ----------

function remindSelect(it) {
  return h("select", {
    class: it.remindAt ? "remind-on" : null,
    onchange: (e) => setReminder(it.id, e.target.value === "keep" ? "" : e.target.value),
  },
    it.remindAt ? h("option", { value: "keep", selected: true }, `Remind ${shortWhen(it.remindAt)}${it.repeat === "weekly" ? " · weekly" : ""}`) : null,
    REMIND_PRESETS.map(([v, label]) => h("option", { value: v }, it.remindAt && !v ? "Clear reminder" : label)));
}

function progressEl(it) {
  if (it.progress) {
    const { done, total } = it.progress;
    const step = (d) => {
      const n = Math.max(0, Math.min(total, done + d));
      updateItem(it.id, { progress: { done: n, total }, status: n >= total ? "done" : n > 0 ? "doing" : it.status });
    };
    return h("span", { class: "progress" },
      h("button", { class: "icon-btn", title: "Back one unit", onclick: () => step(-1) }, "−"),
      h("span", { class: "bar-mini" }, h("i", { style: `width:${(done / total) * 100}%` })),
      `${done}/${total}`,
      h("button", { class: "icon-btn", title: "Finished one unit", onclick: () => step(1) }, "+"));
  }
  if (it.type !== "Course") return null;
  return h("button", {
    class: "link",
    onclick: () => {
      const n = parseInt(prompt("How many units / lessons does this course have?", "5"), 10);
      if (n > 0) updateItem(it.id, { progress: { done: 0, total: n } });
    },
  }, "Track units");
}

function detailEl(it) {
  const pathIn = h("input", { class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path), placeholder: "Collection, e.g. AI › Agents" });
  const tagsIn = h("input", {
    class: "input", value: (it.tags || []).join(", "), placeholder: "tags, comma separated",
    onchange: (e) => updateItem(it.id, { tags: e.target.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean) }),
  });
  return h("div", { class: "detail" },
    it.why ? h("p", { class: "why-full" }, it.why) : null,
    h("label", {}, "Status",
      h("select", { onchange: (e) => updateItem(it.id, { status: e.target.value }) },
        [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(([v, l]) => h("option", { value: v, selected: it.status === v }, l)))),
    h("label", {}, "Type",
      h("select", { onchange: (e) => updateItem(it.id, { type: e.target.value }) },
        TYPES.map((t) => h("option", { value: t, selected: it.type === t }, t)))),
    remindSelect(it),
    progressEl(it),
    h("label", {}, it.stage === "inbox" ? "Keep in" : "Move to", pathIn,
      h("button", { class: "quick keep", onclick: () => keepItem(it.id, pathIn.value) }, it.stage === "inbox" ? "Keep" : "Move")),
    h("label", {}, "Tags", tagsIn),
    h("span", { style: "flex:1" }),
    it.stage === "kept" ? h("button", { class: "link", onclick: () => updateItem(it.id, { stage: "inbox" }) }, "Back to Inbox") : null,
    h("button", { class: "link", onclick: () => confirm(`Remove "${it.title}"?`) && deleteItem(it.id) }, "Remove"));
}

function rowEl(it, pinned) {
  const open = state.open === it.id;
  const inbox = it.stage === "inbox";
  const suggested = inbox && it.path !== UNSORTED;
  const row = h("div", {
    class: `row t-${it.type}${open ? " open" : ""}${it.status === "done" ? " done" : ""}`,
    draggable: "true",
    ondragstart: (e) => { e.dataTransfer.setData("text/item", it.id); e.currentTarget.classList.add("dragging"); },
    ondragend: (e) => e.currentTarget.classList.remove("dragging"),
  },
    h("div", {
      class: "row-main",
      onclick: (e) => { if (e.target.closest("a, button, select, input")) return; state.open = open ? null : it.id; render(); },
    },
      h("img", { class: "fav", src: it.favIconUrl || faviconFor(it.url, 16), alt: "" }),
      h("div", { class: "line" },
        h("a", { class: "title", href: it.url, target: "_blank", title: it.url }, it.title),
        h("span", { class: "why" }, it.why || hostOf(it.url))),
      h("div", { class: "right" },
        isOld(it) ? h("span", { class: "chip", title: "In the Inbox for more than 2 weeks" }, "old") : null,
        isDue(it) ? h("span", { class: "chip lime" }, "due") : null,
        it.remindAt && !isDue(it) ? h("span", { class: "small remind-on", title: "Reminder" }, shortWhen(it.remindAt)) : null,
        it.progress ? h("span", { class: "small muted" }, `${it.progress.done}/${it.progress.total}`) : null,
        state.view !== "col" || inbox
          ? h("button", {
              class: `chip path-chip${inbox ? " suggest" : ""}`,
              title: inbox ? "AI suggestion" : "Open collection",
              onclick: () => (inbox ? (state.open = it.id, render()) : go("col", it.path)),
            }, pathLabel(it.path))
          : null,
        h("span", { class: "type" }, h("i", { class: "dot", style: "background:var(--type)" }), it.type),
        suggested ? h("button", { class: "quick keep", title: `Keep in ${pathLabel(it.path)}`, onclick: () => keepItem(it.id, it.path) }, "Keep") : null,
        h("button", {
          class: `star${pinned ? " on" : ""}`,
          title: pinned ? "Unpin" : "Pin to dock",
          onclick: () => (pinned ? unpinSite(it.url) : pinSite(it)),
        }, pinned ? "★" : "☆"))),
    open ? detailEl(it) : null);
  return row;
}

function listEl(items) {
  const pinned = new Set(data.pins.map((p) => p.url));
  return h("div", { class: `list ${prefs.get("density", "rows")}` }, items.map((it) => rowEl(it, pinned.has(it.url))));
}

function typeChips(base) {
  const counts = {};
  base.forEach((it) => (counts[it.type] = (counts[it.type] || 0) + 1));
  return ["All", ...TYPES].filter((t) => t === "All" || counts[t]).map((t) =>
    h("button", { class: `chip t-${t}${state.type === t ? " on" : ""}`, onclick: () => { state.type = t; render(); } },
      t !== "All" ? h("i", { class: "dot", style: "background:var(--type)" }) : null,
      `${t === "All" ? "All" : PLURAL[t]} ${t === "All" ? base.length : counts[t]}`));
}

function statusSeg() {
  return h("div", { class: "seg" }, [["active", "Active"], ["done", "Done"], ["all", "All"]].map(([v, l]) =>
    h("button", { class: state.status === v ? "on" : null, onclick: () => { state.status = v; render(); } }, l)));
}

const byStatus = (it) => state.status === "all" || (state.status === "done" ? it.status === "done" : it.status !== "done");
const byType = (it) => state.type === "All" || it.type === state.type;

function emptyEl(title, text) {
  return h("div", { class: "empty" }, h("h3", {}, title), h("p", {}, text));
}

// ---------- views ----------

function viewInbox() {
  const base = data.items.filter((it) => it.stage === "inbox" && matches(it));
  const list = base.filter(byType);
  const waiting = forReview(data.items).length;
  setHead("Inbox", `${base.length} waiting · AI suggests a collection, you decide`);
  $("tools").replaceChildren(...typeChips(base), h("span", { class: "spacer" }),
    waiting ? h("button", { class: "btn primary", onclick: () => go("review") }, `Review ${waiting} now`) : null);
  return list.length ? listEl(list)
    : emptyEl("Inbox is clear", "Save pages from the popup, right-click → “Save link for later”, or press Alt+Shift+S.");
}

function viewAll() {
  const base = data.items.filter((it) => matches(it) && byStatus(it));
  setHead("All pages", `${data.items.length} saved`);
  $("tools").replaceChildren(...typeChips(base), h("span", { class: "spacer" }), statusSeg());
  const due = base.filter((it) => isDue(it));
  const rest = base.filter(byType);
  return h("div", {},
    due.length ? [h("h3", { class: "section-title" }, h("span", { class: "chip lime" }, "Due now"), String(due.length)), listEl(due), h("br")] : null,
    rest.length ? listEl(rest) : emptyEl("Nothing here", "Try another filter or search."));
}

function viewCollection() {
  const path = state.col;
  const base = data.items.filter((it) => it.stage === "kept" && inPath(it.path, path) && matches(it) && byStatus(it));
  const node = path.split("/").reduce((n, part) => n?.children[part], buildTree());
  const subs = node ? Object.values(node.children) : [];
  setHead(pathLabel(path), `${base.length} page${base.length === 1 ? "" : "s"}`);
  $("tools").replaceChildren(
    ...subs.map((s) => h("button", { class: "chip", onclick: () => go("col", s.path) }, `${s.name} ${countIn(s.path)}`)),
    subs.length ? h("span", { style: "width:8px" }) : null,
    ...typeChips(base),
    h("span", { class: "spacer" }),
    statusSeg(),
    h("button", { class: "link small", onclick: async () => { const n = prompt("New sub-collection name:"); if (n) await addCollection(path + "/" + n); } }, "+ Sub"),
    h("button", { class: "link small", onclick: async () => { const n = prompt("Rename or move (e.g. AI › Agents):", pathLabel(path)); if (n) { await renameCollection(path, n); go("col", cleanPath(n)); } } }, "Rename"),
    h("button", { class: "link small", onclick: async () => { if (confirm(`Delete collection "${pathLabel(path)}"? Its pages move up one level.`)) { await deleteCollection(path); go("inbox"); } } }, "Delete"));
  const list = base.filter(byType);
  if (!list.length) return emptyEl("Empty collection", "Drag pages here from the Inbox, or Keep them during the weekly review.");
  // group direct pages first, then each sub-collection
  const direct = list.filter((it) => it.path === path);
  return h("div", {},
    direct.length ? listEl(direct) : null,
    subs.map((s) => {
      const inSub = list.filter((it) => inPath(it.path, s.path));
      return inSub.length ? [h("h3", { class: "section-title" }, s.name, h("span", { class: "muted small" }, String(inSub.length))), listEl(inSub)] : null;
    }));
}

// Weekly review: one page at a time — keep / discard / next week / pin.
let reviewPath = null;
function viewReview() {
  const queue = forReview(data.items).sort((a, b) => a.created - b.created);
  setHead("Weekly review", queue.length ? `${queue.length} to decide` : "");
  $("tools").replaceChildren();
  if (!queue.length) {
    const later = data.items.filter((x) => x.stage === "inbox").length;
    return emptyEl("All reviewed", later
      ? `${later} page${later > 1 ? "s" : ""} pushed to next week. Next review: Friday 16:00.`
      : "Your Inbox is empty. Next review: Friday 16:00.");
  }
  const it = queue[0];
  const pinned = data.pins.some((p) => p.url === it.url);
  reviewPath = h("input", {
    class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path),
    placeholder: "Collection, e.g. AI › Agents",
    onkeydown: (e) => { if (e.key === "Enter") act("keep"); },
  });
  const act = async (what) => {
    if (what === "keep") await keepItem(it.id, reviewPath.value || UNSORTED);
    else if (what === "discard") await deleteItem(it.id);
    else if (what === "later") await laterItem(it.id);
    else if (what === "pin") await (pinned ? unpinSite(it.url) : pinSite(it));
  };
  reviewAct = act;
  return h("div", { class: "review" },
    h("div", { class: "count" }, `1 of ${queue.length} · saved ${stamp(it.created)}${isOld(it) ? " · old" : ""}`),
    h("div", { class: `rcard t-${it.type}` },
      h("div", { class: "head" },
        h("img", { src: faviconFor(it.url, 64), alt: "" }),
        h("div", {},
          h("h3", {}, it.title),
          h("div", { class: "meta" }, hostOf(it.url), "·", h("span", { class: "type" }, h("i", { class: "dot", style: "background:var(--type)" }), it.type)))),
      h("span", { class: "why" }, it.why || "No AI note yet."),
      h("div", { class: "meta" },
        h("a", { class: "link", href: it.url, target: "_blank" }, "Open page ↗"),
        it.progress ? `· ${it.progress.done}/${it.progress.total} units` : null,
        it.remindAt ? `· reminder ${shortWhen(it.remindAt)}` : null),
      h("div", { class: "file" }, h("span", { class: "small muted" }, "Keep in"), reviewPath),
      h("div", { class: "decide" },
        h("button", { class: "btn discard", onclick: () => act("discard") }, "Discard", h("kbd", {}, "←")),
        h("button", { class: "btn", onclick: () => act("later") }, "Next week", h("kbd", {}, "↓")),
        h("button", { class: "btn", onclick: () => act("pin") }, pinned ? "Unpin" : "Pin", h("kbd", {}, "P")),
        h("button", { class: "btn primary", onclick: () => act("keep") }, "Keep", h("kbd", {}, "→ / Enter")))));
}
let reviewAct = null;

document.addEventListener("keydown", (e) => {
  if (state.view !== "review" || !reviewAct) return;
  if (e.target.matches("input, select, textarea")) return;
  const k = { ArrowRight: "keep", ArrowLeft: "discard", ArrowDown: "later", p: "pin", P: "pin" }[e.key];
  if (k) { e.preventDefault(); reviewAct(k); }
});

// ---------- mind map: left-to-right tree, click a branch to open it ----------
// Library -> top-level collections (+ Inbox) -> sub-collections -> pages (site icons).
// Pages that share a tag are joined by dotted "related" lines.

const COL_W = 230, ROW_H = 30;
const view = { x: 0, y: 0, w: 1200, h: 800 };
let mapFitted = false;

function mapTree() {
  const live = data.items.filter((it) => it.status !== "done" && matches(it));
  const tree = buildTree();
  const toNode = (t) => {
    const pages = live.filter((it) => it.stage === "kept" && it.path === t.path);
    const kids = Object.values(t.children).map(toNode).filter((n) => n.count);
    return {
      id: "c:" + t.path, label: t.name, kind: "col", path: t.path,
      children: [...kids, ...pages.map(pageNode)],
      count: pages.length + kids.reduce((a, k) => a + k.count, 0),
    };
  };
  const pageNode = (it) => ({ id: "p:" + it.id, label: it.title, kind: "page", item: it, children: [], count: 1 });
  const top = Object.values(tree.children).map(toNode).filter((n) => n.count);
  const unsorted = live.filter((it) => it.stage === "kept" && it.path === UNSORTED);
  if (unsorted.length) top.push({ id: "c:" + UNSORTED, label: UNSORTED, kind: "col", path: UNSORTED, children: unsorted.map(pageNode), count: unsorted.length });
  const inbox = live.filter((it) => it.stage === "inbox");
  if (inbox.length) top.push({ id: "inbox", label: "Inbox", kind: "inbox", children: inbox.map(pageNode), count: inbox.length });
  return { id: "root", label: "Library", kind: "root", children: top, count: live.length };
}

function viewMap() {
  const expanded = new Set(prefs.get("mapOpen", ["root"]));
  expanded.add("root");
  const root = mapTree();
  const toggleAll = (open) => {
    const ids = [];
    const walk = (n) => { if (n.kind !== "page" && n.children.length) { ids.push(n.id); n.children.forEach(walk); } };
    walk(root);
    prefs.set("mapOpen", open ? ids : ["root"]);
    mapFitted = false;
    render();
  };
  setHead("Mind map", "click a branch to open it · drag to move · scroll to zoom");
  $("tools").replaceChildren(
    h("button", { class: "link small", onclick: () => toggleAll(true) }, "Expand all"),
    h("button", { class: "link small", onclick: () => toggleAll(false) }, "Collapse all"),
    h("button", { class: "link small", onclick: () => { mapFitted = false; render(); } }, "Fit"),
    h("span", { class: "spacer" }),
    h("span", { class: "small muted" }, "dotted line = pages sharing a tag"));

  // layout: y from leaf order, x from depth
  let row = 0;
  const placed = [];
  const place = (n, depth) => {
    n.x = depth * COL_W;
    const open = expanded.has(n.id) && n.children.length;
    if (open) {
      n.children.forEach((c) => place(c, depth + 1));
      n.y = (n.children[0].y + n.children[n.children.length - 1].y) / 2;
    } else {
      n.y = row++ * ROW_H;
    }
    n.open = !!open;
    placed.push(n);
  };
  place(root, 0);

  const map = svg("svg", { id: "map", xmlns: "http://www.w3.org/2000/svg" });
  const edges = svg("g"), related = svg("g"), nodes = svg("g");
  map.append(edges, related, nodes);

  const toggle = (n) => {
    expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id);
    prefs.set("mapOpen", [...expanded]);
    render();
  };

  for (const n of placed) {
    if (n.open) for (const c of n.children) {
      const x1 = n.x + nodeWidth(n), mx = (x1 + c.x) / 2;
      edges.append(svg("path", { class: `edge${n.kind === "root" ? " main" : ""}`, d: `M${x1} ${n.y} C${mx} ${n.y} ${mx} ${c.y} ${c.x - 4} ${c.y}` }));
    }
    nodes.append(nodeEl(n, toggle));
  }

  // related pages: visible pages that share a tag
  const visiblePages = placed.filter((n) => n.kind === "page");
  const byTag = {};
  visiblePages.forEach((n) => (n.item.tags || []).forEach((t) => (byTag[t] ||= []).push(n)));
  for (const [tag, list] of Object.entries(byTag)) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const bend = Math.max(40, Math.abs(b.y - a.y) * 0.35);
      related.append(svg("path", {
        class: "related",
        d: `M${a.x - 8} ${a.y} C${a.x - 8 - bend} ${a.y} ${b.x - 8 - bend} ${b.y} ${b.x - 8} ${b.y}`,
      }, svg("title", {}, "#" + tag)));
    }
  }

  // fit the whole tree once, then keep the user's pan/zoom
  const maxX = Math.max(...placed.map((n) => n.x + nodeWidth(n))) + 40;
  const maxY = Math.max(ROW_H, row * ROW_H);
  if (!mapFitted) {
    Object.assign(view, { x: -40, y: -60, w: Math.max(900, maxX + 80), h: Math.max(500, maxY + 120) });
    mapFitted = true;
  }
  const apply = () => map.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  map.setAttribute("preserveAspectRatio", "xMinYMin meet");
  apply();
  panZoom(map, apply);
  return map;
}

function nodeWidth(n) {
  if (n.kind === "page") return 0;
  return Math.max(70, (n.label.length + String(n.count).length) * 7.6 + 44);
}

function nodeEl(n, toggle) {
  if (n.kind === "page") {
    const it = n.item;
    const label = it.title.length > 46 ? it.title.slice(0, 45) + "…" : it.title;
    return svg("g", {
      class: `leaf${isDue(it) ? " due" : ""}`, style: `--type:${MAP_COLORS[it.type]}`,
      transform: `translate(${n.x} ${n.y})`, onclick: () => window.open(it.url, "_blank"),
    },
      svg("title", {}, `${it.title}\n${pathLabel(it.path)} · ${it.type}${it.why ? "\n" + it.why : ""}${it.tags?.length ? "\n#" + it.tags.join(" #") : ""}`),
      svg("rect", { class: "leaf-bg", x: -2, y: -11, width: 22, height: 22, rx: 6 }),
      svg("image", { href: it.favIconUrl || faviconFor(it.url, 32), x: 1, y: -8, width: 16, height: 16 }),
      svg("circle", { class: "type-dot", cx: 20, cy: -9, r: 3.5 }),
      svg("text", { x: 28, y: 4 }, label));
  }
  const w = nodeWidth(n);
  const cls = n.kind === "root" ? "root" : n.kind === "inbox" ? "topic inbox" : "topic";
  return svg("g", {
    class: cls, transform: `translate(${n.x} ${n.y})`,
    onclick: () => toggle(n),
    ondblclick: () => (n.kind === "col" && n.path !== UNSORTED ? go("col", n.path) : n.kind === "inbox" ? go("inbox") : null),
  },
    svg("title", {}, n.kind === "col" ? `${pathLabel(n.path)} · double-click to open the list` : n.label),
    svg("rect", { x: 0, y: -14, width: w, height: 28, rx: 14 }),
    svg("text", { x: 14, y: 5 }, n.label),
    svg("text", { class: "cnt", x: w - 26, y: 5, "text-anchor": "end" }, String(n.count)),
    n.children.length ? svg("text", { class: "caret-t", x: w - 12, y: 5, "text-anchor": "middle" }, n.open ? "‹" : "›") : null);
}

function panZoom(map, apply) {
  let drag = null;
  map.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".leaf, .topic, .root")) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    map.classList.add("drag");
    map.setPointerCapture(e.pointerId);
  });
  map.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = Math.max(view.w / map.clientWidth, view.h / map.clientHeight);
    view.x = drag.vx - (e.clientX - drag.x) * k;
    view.y = drag.vy - (e.clientY - drag.y) * k;
    apply();
  });
  map.addEventListener("pointerup", () => { drag = null; map.classList.remove("drag"); });
  map.addEventListener("wheel", (e) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const k = Math.max(view.w / map.clientWidth, view.h / map.clientHeight);
    const rect = map.getBoundingClientRect();
    const px = view.x + (e.clientX - rect.left) * k;
    const py = view.y + (e.clientY - rect.top) * k;
    view.w *= f; view.h *= f;
    view.x = px - (px - view.x) * f;
    view.y = py - (py - view.y) * f;
    apply();
  }, { passive: false });
}

// ---------- sessions & archive ----------

// mode: "session" (temporary, can be promoted), "archive" (tidied) or "workspace" (permanent).
function sessionEl(s, mode) {
  const open = mode === "workspace" || state.openSessions.has(s.id);
  const counts = {};
  for (const t of s.tabs) if (t.group) counts[t.group] = (counts[t.group] || 0) + 1;
  const toggle = () => { open ? state.openSessions.delete(s.id) : state.openSessions.add(s.id); render(); };
  const edit = async (fn) => {
    const lib = await getSessions();
    fn(lib.find((x) => x.id === s.id));
    // an archive or session with no tabs left disappears; a workspace may be empty
    await setSessions(lib.filter((x) => x.tabs.length || sessionKind(x) === "workspace"));
  };
  const workspaces = data.lib.filter((x) => sessionKind(x) === "workspace" && x.id !== s.id);
  const days = isTemporary(s) ? expiresInDays(s) : null;

  const tabRow = (t, i) => h("div", { class: "tabrow" },
    h("img", { src: t.favIconUrl || faviconFor(t.url, 16), alt: "" }),
    h("a", { href: t.url, target: "_blank", title: t.url }, t.title || t.url),
    t.group ? h("span", { class: "grp" }, t.group) : null,
    workspaces.length
      ? h("select", {
          title: "Add to a workspace",
          onchange: (e) => { if (e.target.value) addTabToWorkspace(e.target.value, t); e.target.value = ""; },
        }, h("option", { value: "" }, "→ Workspace"), workspaces.map((w) => h("option", { value: w.id }, w.name)))
      : null,
    h("button", { class: "link small", onclick: () => saveForLater(t) }, "To Inbox"),
    h("button", { class: "link small", onclick: () => pinSite(t) }, "Pin"),
    mode === "archive"
      ? h("button", { class: "link small", onclick: async () => { chrome.tabs.create({ url: t.url }); await edit((x) => x.tabs.splice(i, 1)); } }, "Restore")
      : h("button", { class: "link small", title: "Remove this tab", onclick: () => edit((x) => x.tabs.splice(i, 1)) }, "×"));

  const promote = async () => {
    const n = prompt("Workspace name:", s.name.replace(/^.*? · /, "").replace(/^closed window.*$/, ""));
    if (!n) return;
    await promoteSession(s.id, n.trim());
    go("ws", s.id);
  };

  return h("div", { class: "session" },
    h("div", { class: "session-head" },
      h("h3", { onclick: mode === "workspace" ? null : toggle, title: open ? "Hide tabs" : "Show tabs" }, s.name),
      h("span", { class: "muted small" }, `${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`),
      days != null ? h("span", { class: `expires${days <= 5 ? " soon" : ""}`, title: "Temporary sessions are removed after 30 days unless you make them a workspace" }, `expires in ${days}d`) : null,
      h("button", { class: mode === "workspace" ? "btn primary" : "btn", disabled: !s.tabs.length, onclick: () => restoreTabs(s.tabs) },
        mode === "archive" ? "Restore all" : mode === "workspace" ? "Open all" : "Restore"),
      mode === "session" ? h("button", { class: "btn", onclick: promote }, "Make workspace") : null,
      mode === "workspace" ? null : h("button", { class: "link small", onclick: toggle }, open ? "Hide" : "Show tabs"),
      mode !== "archive" ? h("button", { class: "link small", onclick: () => { const n = prompt("Name", s.name); if (n) edit((x) => (x.name = n)); } }, "Rename") : null,
      h("button", {
        class: "link small",
        onclick: async () => { if (confirm(`Delete "${s.name}"?`)) { await setSessions(data.lib.filter((x) => x.id !== s.id)); if (mode === "workspace") go("sessions"); } },
      }, "Delete")),
    Object.keys(counts).length ? h("div", { class: "chips" }, Object.entries(counts).map(([g, n]) => h("span", { class: "chip" }, `${g} ${n}`))) : null,
    open ? h("div", { class: "tablist" },
      s.tabs.length ? s.tabs.map(tabRow) : h("div", { class: "muted small" }, "No tabs yet. Use “Update from this window”, drag pages here from a list, or add from a session.")) : null);
}

function sessionHit(s) {
  return !state.q || (s.name + " " + s.tabs.map((t) => t.title + " " + t.url).join(" ")).toLowerCase().includes(state.q);
}

function viewSessions() {
  const list = data.lib.filter((s) => isTemporary(s) && sessionHit(s));
  setHead("Sessions", `temporary · kept ${SESSION_DAYS} days · make the good ones a workspace`);
  $("tools").replaceChildren(
    h("label", { class: "small check" },
      h("input", { type: "checkbox", checked: autoSessionOn, onchange: (e) => { autoSessionOn = e.target.checked; chrome.storage.local.set({ autoSession: autoSessionOn }); } }),
      "Save a session automatically when I close a window"));
  return list.length ? h("div", {}, list.map((s) => sessionEl(s, "session")))
    : emptyEl("No sessions", "Use “Save window” in the popup, or close a window with 2+ tabs.");
}
let autoSessionOn = true;

// The tabs of the window this Library tab is in, without the Library tab itself.
async function thisWindowTabs() {
  const me = await chrome.tabs.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: me.windowId });
  return tabs.filter((t) => t.id !== me.id && /^https?:/.test(t.url));
}

function viewWorkspace() {
  const s = data.lib.find((x) => x.id === state.col && sessionKind(x) === "workspace");
  if (!s) { setHead("Workspace", ""); $("tools").replaceChildren(); return emptyEl("Workspace not found", "It may have been deleted."); }
  setHead(s.name, `workspace · ${s.tabs.length} tabs · updated ${stamp(s.updated || s.saved)}`);
  $("tools").replaceChildren(
    h("button", {
      class: "btn",
      onclick: async () => {
        const tabs = await thisWindowTabs();
        if (!tabs.length) return alert("No web tabs in this window besides the Library.");
        if (confirm(`Replace the tabs of "${s.name}" with the ${tabs.length} tabs in this window?`)) await updateWorkspace(s.id, tabs);
      },
    }, "Update from this window"),
    h("button", {
      class: "link small",
      onclick: async () => {
        const url = prompt("Add a page (paste its address):", "https://");
        if (url && /^https?:\/\/.+/.test(url)) await addTabToWorkspace(s.id, { url, title: hostOf(url) });
      },
    }, "+ Add page"));
  return sessionEl(s, "workspace");
}

function renderWorkspaces() {
  const box = $("ws-list");
  box.replaceChildren();
  const list = data.lib.filter((s) => sessionKind(s) === "workspace").sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) box.append(h("div", { class: "ws-empty" }, "Make one from a session, or press +."));
  for (const s of list) {
    const row = h("div", { class: "ws-row" },
      h("button", { class: `nav${state.view === "ws" && state.col === s.id ? " on" : ""}`, onclick: () => go("ws", s.id), title: s.name },
        h("span", { class: "node-name" }, s.name), h("span", { class: "n" }, String(s.tabs.length))),
      h("button", { class: "ws-open", title: "Open all tabs in a new window", onclick: () => restoreTabs(s.tabs) }, "Open"));
    // drop a page row here to add it to the workspace
    dropTarget(row, (id) => { const it = data.items.find((x) => x.id === id); if (it) addTabToWorkspace(s.id, it); });
    box.append(row);
  }
}

$("ws-add").onclick = async () => {
  const name = prompt("New workspace name (it starts with the tabs of this window):");
  if (!name) return;
  const s = await addSession(await thisWindowTabs(), "workspace", name.trim());
  go("ws", s.id);
};

// Tidy settings live here (moved out of the popup).
function tidyTools() {
  const days = h("select", {
    onchange: async (e) => { tidyPrefs.tidyDays = Number(e.target.value); await chrome.storage.local.set({ tidyDays: tidyPrefs.tidyDays }); },
  }, [1, 3, 7, 14, 30].map((d) => h("option", { value: d, selected: d === tidyPrefs.tidyDays }, `${d} day${d > 1 ? "s" : ""}`)));
  const now = h("button", {
    class: "btn primary", disabled: true,
    onclick: async () => {
      now.disabled = true;
      const n = await tidyTabs(tidyPrefs.tidyDays);
      now.textContent = n ? `Archived ${n}` : "Nothing idle";
    },
  }, "Checking…");
  idleTabs(tidyPrefs.tidyDays).then((list) => {
    now.textContent = list.length ? `Archive ${list.length} idle tab${list.length > 1 ? "s" : ""} now` : "No idle tabs";
    now.disabled = !list.length;
  });
  return [
    h("label", { class: "small" }, "Tidy tabs idle for ", days),
    h("label", { class: "small check" },
      h("input", { type: "checkbox", checked: tidyPrefs.autoTidy, onchange: (e) => { tidyPrefs.autoTidy = e.target.checked; chrome.storage.local.set({ autoTidy: e.target.checked }); } }),
      "automatically (hourly)"),
    h("span", { class: "spacer" }),
    now,
  ];
}
let tidyPrefs = { ...TIDY_DEFAULTS };

function viewArchive() {
  const list = data.lib.filter((s) => sessionKind(s) === "tidied" && sessionHit(s));
  setHead("Archive", "tabs closed by Tidy · restore anything");
  $("tools").replaceChildren(...tidyTools());
  if (!list.length) return emptyEl("Archive is empty", "Tabs closed by Tidy (in the popup) land here.");
  const out = [];
  let lastDay = "";
  for (const s of list) {
    const day = new Date(s.saved).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    if (day !== lastDay) { out.push(h("h3", { class: "day" }, day)); lastDay = day; }
    out.push(sessionEl(s, "archive"));
  }
  return h("div", {}, out);
}

// ---------- shell ----------

function setHead(title, sub) {
  $("title").textContent = title;
  $("subtitle").textContent = sub || "";
  document.title = `${title} · Library`;
}

async function load() {
  const r = await chrome.storage.local.get(["items", "collections", "pins", "library"]);
  data.items = r.items || [];
  data.cols = r.collections || [];
  data.pins = r.pins || [];
  data.lib = r.library || [];
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

async function renderNow() {
  await load();
  const inbox = data.items.filter((x) => x.stage === "inbox").length;
  const review = forReview(data.items).length;
  $("n-inbox").textContent = inbox || "";
  $("n-review").textContent = review || "";
  $("n-all").textContent = data.items.length || "";
  $("n-sessions").textContent = data.lib.filter(isTemporary).length || "";
  $("n-archive").textContent = data.lib.filter((s) => sessionKind(s) === "tidied").length || "";
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
  document.querySelectorAll("#density button").forEach((b) => b.classList.toggle("on", b.dataset.d === prefs.get("density", "rows")));
  $("density").style.visibility = ["inbox", "all", "col"].includes(state.view) ? "visible" : "hidden";

  renderPins();
  renderTree();
  renderWorkspaces();
  reviewAct = null;
  const views = { inbox: viewInbox, all: viewAll, col: viewCollection, review: viewReview, map: viewMap, sessions: viewSessions, archive: viewArchive, ws: viewWorkspace };
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
  $("ai-line").textContent = "Sorting with local AI…";
  await it.sorted;
  $("ai-line").textContent = "Local AI ready";
};

$("export").onclick = async () => {
  const d = await chrome.storage.local.get(["items", "library", "collections", "pins"]);
  const blob = new Blob([JSON.stringify({ app: "tab-organiser", version: 3, exported: Date.now(), ...d }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `tab-organiser-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$("import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    const merge = (mine = [], theirs = [], key = "id") => {
      const ids = new Set(mine.map((x) => x[key]));
      return [...mine, ...(theirs || []).filter((x) => x[key] && !ids.has(x[key]))];
    };
    const cur = await chrome.storage.local.get(["items", "library", "collections", "pins"]);
    const items = merge(cur.items, d.items);
    const library = merge(cur.library, d.library);
    const pins = merge(cur.pins, d.pins, "url");
    const collections = [...new Set([...(cur.collections || []), ...(d.collections || [])])].sort();
    await chrome.storage.local.set({ items, library, pins, collections, schema: d.version >= 3 ? 2 : 1 });
    await migrate();
    alert(`Imported. You now have ${items.length} pages, ${library.length} sessions and ${pins.length} pins.`);
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
    return;
  }
  const pending = data.items.filter((x) => x.needsAi).length || (await getItems()).filter((x) => x.needsAi).length;
  if (!pending) { line.textContent = "Local AI ready"; return; }
  line.textContent = `Sorting ${pending} new save${pending > 1 ? "s" : ""}…`;
  await classifyPending((n, t) => (line.textContent = `Sorting with local AI… ${n}/${t}`));
  line.textContent = "Local AI ready";
}

chrome.storage.onChanged.addListener((c) => {
  if (c.tidyDays || c.autoTidy) tidySettings().then((t) => (tidyPrefs = t));
  if (c.items || c.library || c.collections || c.pins || c.tidyDays) render();
});

function readHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("col:") || hash.startsWith("ws:")) { [state.view, state.col] = [hash.slice(0, hash.indexOf(":")), hash.slice(hash.indexOf(":") + 1)]; }
  else if (["inbox", "review", "all", "map", "sessions", "archive"].includes(hash)) state.view = hash;
}
// the popup reuses an open Library tab and just changes its #view
window.addEventListener("hashchange", () => { readHash(); render(); });

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
