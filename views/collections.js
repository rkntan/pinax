// Collections: the slim sidebar list, the Collections page (organising) and the single-collection view.

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

// Kept pages per collection, sub-collections included; rebuilt when data.items is reloaded.
let pathCountsFor = null, pathCounts = new Map();
function countIn(path) {
  if (pathCountsFor !== data.items) {
    pathCountsFor = data.items;
    pathCounts = new Map();
    for (const it of data.items) {
      if (it.stage !== "kept" || !it.path) continue;
      const parts = it.path.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const p = parts.slice(0, i).join("/");
        pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
      }
    }
  }
  return pathCounts.get(path) || 0;
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

// ---------- collection helpers ----------
const COL_KEYS = ["collections", "items", "collectionOrder"]; // what Undo restores after a collection change
const isInside = (p, anc) => p === anc || p.startsWith(anc + "/");
// A typed name is one level: separators become spaces so "a/b" cannot sneak in a deeper path.
const oneName = (s) => String(s || "").split(/[\/›>]/).map((x) => x.trim()).filter(Boolean).join(" ").slice(0, 40);

// Every existing collection path (refreshed by renderTree, used by drag checks and menus).
let knownPaths = [];
const flatPaths = (node) => Object.values(node.children).flatMap((c) => [c.path, ...flatPaths(c)]);

// Can `from` (with everything under it) live inside `parent` ("" = top level) without passing 3 levels?
function canMove(from, parent) {
  if (isInside(parent, from)) return false; // itself or its own descendant
  const base = collectionDepth(from);
  const height = Math.max(1, ...knownPaths.filter((p) => isInside(p, from)).map((p) => collectionDepth(p) - base + 1));
  return (parent ? collectionDepth(parent) : 0) + height <= 3;
}

// After a collection moved, the page you are looking at follows it.
function followCol(from, to) {
  if (state.view === "col" && isInside(state.col, from)) go("col", to + state.col.slice(from.length));
}

// One place for drag and menu moves. `order` = { siblings, before } also places it among the siblings.
async function moveCol(from, parent, order) {
  const name = lastSegment(from), same = parentOf(from) === parent;
  if (same && !order) return;
  let res = {};
  await withUndo(`Moved ${pathLabel(from)}`, COL_KEYS, async () => {
    if (!same) { res = await moveCollectionTo(from, parent); if (res.error || res.noop) return; }
    if (order && order.before !== name) await reorderCollection(parent, order.siblings, name, order.before);
  });
  if (res.error) return showToast(res.error);
  if (res.to) followCol(from, res.to);
}

async function mergeCol(from, into) {
  try {
    await withUndo(`Merged ${pathLabel(from)} into ${pathLabel(into)}`, COL_KEYS, () => renameCollection(from, into));
    followCol(from, into);
  } catch (e) { showToast(e.message); }
}

async function renameCol(path, typed) {
  const name = oneName(typed);
  if (!name || name === lastSegment(path)) return;
  const parent = parentOf(path), to = parent ? parent + "/" + name : name;
  try {
    await withUndo(`Renamed to ${name}`, COL_KEYS, () => renameCollection(path, to));
    followCol(path, to);
  } catch (e) { showToast(e.message); }
}

async function addSubCol(parent, typed) {
  const name = oneName(typed);
  if (!name) return;
  if (collectionDepth(parent) >= 3) return showToast("Collections go 3 levels deep");
  const path = parent + "/" + name;
  if (!knownPaths.includes(path)) await withUndo(`Added ${pathLabel(path)}`, COL_KEYS, () => addCollection(path));
  go("col", path);
}

async function deleteCol(path) {
  await withUndo(`Deleted ${pathLabel(path)} (its pages moved up one level)`, COL_KEYS, () => deleteCollection(path));
  if (state.view === "col" && isInside(state.col, path)) go("inbox");
}

// ---------- inline editing in the tree (rename, new sub-collection) ----------
// Kept in a variable so a redraw of the tree keeps the open input and what was typed.
let treeEdit = null; // { kind: "rename" | "sub", path, text }
let drawing = false; // blur fires when a redraw removes the input: ignore that one

function beginEdit(kind, path) {
  const collapsed = new Set(prefs.get("collapsed", []));
  // the row must be visible: open its ancestors (and itself when adding inside it)
  const parts = path.split("/");
  for (let i = 1; i < parts.length + (kind === "sub" ? 1 : 0); i++) collapsed.delete(parts.slice(0, i).join("/"));
  prefs.set("collapsed", [...collapsed]);
  treeEdit = { kind, path, text: kind === "rename" ? lastSegment(path) : "" };
  if (state.view !== "collections") go("collections");
  else redrawCols();
}

function editInput() {
  const input = h("input", {
    class: "tree-input", type: "text", maxlength: "40", value: treeEdit.text,
    placeholder: treeEdit.kind === "sub" ? "New sub-collection" : "",
    "aria-label": treeEdit.kind === "sub" ? "New sub-collection name" : "Collection name",
    onclick: (e) => e.stopPropagation(),
    oninput: () => (treeEdit.text = input.value),
    onkeydown: async (e) => {
      if (e.key === "Escape") { e.stopPropagation(); treeEdit = null; redrawCols(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const { kind, path } = treeEdit, v = input.value;
        treeEdit = null;
        redrawCols();
        if (kind === "rename") await renameCol(path, v); else await addSubCol(path, v);
      }
    },
    onblur: () => { if (!drawing && treeEdit) { treeEdit = null; redrawCols(); } },
  });
  return input;
}

// ---------- small menu (row actions, move/merge lists) ----------
let menuEl = null;
const closeMenu = () => { menuEl?.remove(); menuEl = null; };
document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuEl) { e.stopPropagation(); closeMenu(); } }, true);

function showMenu(anchor, kids) {
  closeMenu();
  menuEl = h("div", { class: "col-menu", role: "menu" }, kids);
  document.body.append(menuEl);
  const r = anchor.getBoundingClientRect();
  menuEl.style.left = Math.max(4, Math.min(r.left, innerWidth - menuEl.offsetWidth - 8)) + "px";
  menuEl.style.top = Math.max(4, Math.min(r.bottom + 2, innerHeight - menuEl.offsetHeight - 8)) + "px";
  menuEl.querySelector("button:not([disabled])")?.focus();
}
const menuItem = (label, onclick, opts = {}) => h("button", { class: "col-menu-item", role: "menuitem", disabled: opts.disabled, title: opts.title, onclick }, label);

// Destinations for Move to / Merge into: existing collections only, never itself, its own
// descendants or anything that would push it past 3 levels.
function showTargets(anchor, from, merge) {
  const kids = [];
  if (merge) {
    const base = collectionDepth(from);
    const height = Math.max(1, ...knownPaths.filter((p) => isInside(p, from)).map((p) => collectionDepth(p) - base + 1));
    const list = knownPaths.filter((p) => !isInside(p, from) && collectionDepth(p) + height - 1 <= 3);
    kids.push(...list.map((p) => menuItem(pathLabel(p), () => { closeMenu(); mergeCol(from, p); })));
  } else {
    if (parentOf(from) && canMove(from, "")) kids.push(menuItem("Top level", () => { closeMenu(); moveCol(from, ""); }));
    const list = knownPaths.filter((p) => p !== parentOf(from) && canMove(from, p));
    kids.push(...list.map((p) => menuItem(pathLabel(p), () => { closeMenu(); moveCol(from, p); })));
  }
  if (!kids.length) kids.push(h("div", { class: "col-menu-empty" }, "Nowhere to go"));
  showMenu(anchor, [h("div", { class: "col-menu-head" }, merge ? `Merge ${lastSegment(from)} into…` : `Move ${lastSegment(from)} to…`), h("div", { class: "col-menu-list" }, kids)]);
}

function rowMenu(anchor, path) {
  const locked = isLockedName(path);
  showMenu(anchor, [
    menuItem("New sub-collection", () => { closeMenu(); beginEdit("sub", path); },
      collectionDepth(path) >= 3 ? { disabled: true, title: "Collections go 3 levels deep" } : {}),
    menuItem("Rename", () => { closeMenu(); beginEdit("rename", path); },
      locked ? { disabled: true, title: "Suggested collections keep their names" } : {}),
    menuItem("Move to…", () => showTargets(anchor, path, false)),
    menuItem("Merge into…", () => showTargets(anchor, path, true)),
    menuItem("Delete", () => { closeMenu(); deleteCol(path); }),
  ]);
}

// ---------- dragging collections ----------
let dragCol = null; // path being dragged (dataTransfer cannot be read while hovering)
function endColDrag() {
  dragCol = null;
  document.body.classList.remove("dragging-col");
  document.querySelectorAll(".drop-ok, .drop-before, .drop-after").forEach((el) => el.classList.remove("drop-ok", "drop-before", "drop-after"));
}
document.addEventListener("dragend", endColDrag, true);
document.addEventListener("drop", () => setTimeout(endColDrag), true);

// Middle of a row nests the dragged collection inside it; top or bottom quarter places it next to the row.
function colDropOnRow(row, path, siblings) {
  const zoneOf = (e) => {
    const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    return y < 0.25 ? "before" : y > 0.75 ? "after" : "in";
  };
  const okFor = (zone) => zone === "in"
    ? parentOf(dragCol) !== path && canMove(dragCol, path)
    : !isInside(path, dragCol) && canMove(dragCol, parentOf(path));
  const clear = () => row.classList.remove("drop-ok", "drop-before", "drop-after");
  row.addEventListener("dragover", (e) => {
    if (!dragCol || !e.dataTransfer.types.includes("text/col")) return;
    const zone = zoneOf(e);
    clear();
    if (!okFor(zone)) return; // no preventDefault: the cursor shows "not allowed"
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    row.classList.add(zone === "in" ? "drop-ok" : "drop-" + zone);
  });
  row.addEventListener("dragleave", (e) => { if (!row.contains(e.relatedTarget)) clear(); });
  row.addEventListener("drop", (e) => {
    const from = e.dataTransfer.getData("text/col");
    if (!from) return;
    dragCol = from; // the tree may have been redrawn mid-drag; the dropped data is the truth
    const zone = zoneOf(e);
    clear();
    if (!okFor(zone)) return;
    e.preventDefault();
    if (zone === "in") return moveCol(from, path);
    const parent = parentOf(path), name = lastSegment(from), i = siblings.indexOf(lastSegment(path));
    const before = zone === "before" ? lastSegment(path) : (siblings[i + 1] ?? null);
    const list = siblings.includes(name) ? siblings : [...siblings, name];
    moveCol(from, parent, { siblings: list, before });
  });
}

// One collection row. `slim` (the sidebar) is a plain link that also takes dropped pages;
// the full row (Collections page) also drags, nests, renames and has a ⋯ menu.
function colRow(child, depth, names, collapsed, slim) {
  const kids = Object.keys(child.children).length;
  const isOpen = !collapsed.has(child.path);
  const renaming = !slim && treeEdit?.kind === "rename" && treeEdit.path === child.path;
  const row = h("div", {
    class: `node-row${state.view === "col" && (slim ? isInside(state.col, child.path) : state.col === child.path) ? " on" : ""}`,
    style: slim ? null : `padding-left:${8 + depth * 14}px`,
    draggable: slim || renaming ? null : "true",
    onclick: () => go("col", child.path),
    title: pathLabel(child.path),
    ondragstart: slim ? null : (e) => {
      dragCol = child.path;
      e.dataTransfer.setData("text/col", child.path);
      e.dataTransfer.effectAllowed = "move";
      document.body.classList.add("dragging-col");
    },
  },
    slim ? null : h("span", {
      class: "caret",
      onclick: (e) => {
        if (!kids) return;
        e.stopPropagation();
        isOpen ? collapsed.add(child.path) : collapsed.delete(child.path);
        prefs.set("collapsed", [...collapsed]);
        redrawCols();
      },
    }, kids ? (isOpen ? "▾" : "▸") : "•"),
    renaming ? editInput() : h("span", { class: "node-name" }, child.name),
    h("span", { class: "n" }, String(countIn(child.path) || "")),
    slim ? null : h("button", {
      class: "row-menu", title: "Collection actions", "aria-label": `Actions for ${child.name}`, "aria-haspopup": "menu",
      onclick: (e) => { e.stopPropagation(); rowMenu(e.currentTarget, child.path); },
    }, "⋯"));
  dropTarget(row, (id) => keepItem(id, child.path));
  if (!slim) colDropOnRow(row, child.path, names);
  return row;
}

// Sidebar: only the top-level subjects, for quick jumping. Organising lives on the Collections page.
function renderTree() {
  const box = $("tree");
  const root = buildTree();
  knownPaths = flatPaths(root);
  if (treeEdit && !knownPaths.includes(treeEdit.path)) treeEdit = null; // the collection went away
  const collapsed = new Set(prefs.get("collapsed", []));
  const names = orderedChildren("", Object.keys(root.children), data.order);
  box.replaceChildren(...names.map((name) => colRow(root.children[name], 0, names, collapsed, true)));
  if (!names.length) box.append(h("div", { class: "empty-tree" }, "No collections yet."));
  $("n-cols").textContent = knownPaths.length || "";
  // the picker offers every standard subject too, so typing "Elec" suggests it before you have used it
  $("paths").replaceChildren(...[...new Set([...data.cols, ...data.items.map((i) => i.path), ...taxonomyPaths()])]
    .filter((p) => p && p !== UNSORTED).sort().map((p) => h("option", { value: pathLabel(p) })));
}

// Redraw after a tree edit: the sidebar, and the page when you are on it.
function redrawCols() {
  renderTree();
  if (state.view === "collections") render();
}

// The Collections page: one card per top-level subject with its whole subtree.
function viewCollections() {
  const root = buildTree();
  knownPaths = flatPaths(root);
  if (treeEdit && !knownPaths.includes(treeEdit.path)) treeEdit = null;
  drawing = true;
  const collapsed = new Set(prefs.get("collapsed", []));
  const names = orderedChildren("", Object.keys(root.children), data.order);
  const newRow = (depth) => h("div", { class: "node-row new-row", style: `padding-left:${8 + depth * 14}px` }, h("span", { class: "caret" }, "•"), editInput());
  const drawKids = (node, depth, into) => {
    const sibs = orderedChildren(node.path, Object.keys(node.children), data.order);
    for (const name of sibs) {
      const child = node.children[name];
      into.append(colRow(child, depth, sibs, collapsed, false));
      if (treeEdit?.kind === "sub" && treeEdit.path === child.path) into.append(newRow(depth + 1));
      if (Object.keys(child.children).length && !collapsed.has(child.path)) drawKids(child, depth + 1, into);
    }
  };
  const cards = names.map((name) => {
    const top = root.children[name];
    const card = h("div", { class: "col-card" }, colRow(top, 0, names, collapsed, false));
    if (treeEdit?.kind === "sub" && treeEdit.path === top.path) card.append(newRow(1));
    if (Object.keys(top.children).length && !collapsed.has(top.path)) drawKids(top, 1, card);
    return card;
  });
  const pages = data.items.filter((it) => it.stage === "kept").length;
  setHead("Collections", `${knownPaths.length} collection${knownPaths.length === 1 ? "" : "s"} · ${pages} kept page${pages === 1 ? "" : "s"}`);
  const plan = alignPlan(data.items, data.cols);
  const n = Object.keys(plan).length;
  setTools(
    h("button", { class: "btn primary", onclick: openNewPanel }, "+ New collection"),
    n ? h("button", {
      class: "btn", title: Object.entries(plan).slice(0, 12).map(([a, b]) => `${pathLabel(a)} → ${pathLabel(b)}`).join(" · ") + (n > 12 ? " …" : "") + ". Deeper levels merge into the subject. Undo is offered.",
      onclick: () => withUndo(`Aligned ${n} collection${n > 1 ? "s" : ""}`, COL_KEYS, alignCollections),
    }, `Align ${n} with suggested collections`) : null);
  // shown only while a collection is dragged: the way to un-nest one
  const strip = h("div", { class: "top-drop" }, "Drop here for top level");
  strip.addEventListener("dragover", (e) => {
    if (!dragCol || !e.dataTransfer.types.includes("text/col") || !parentOf(dragCol)) return;
    e.preventDefault();
    strip.classList.add("drop-ok");
  });
  strip.addEventListener("dragleave", () => strip.classList.remove("drop-ok"));
  strip.addEventListener("drop", (e) => {
    const from = e.dataTransfer.getData("text/col");
    strip.classList.remove("drop-ok");
    if (!from || !canMove(from, "")) return;
    e.preventDefault();
    moveCol(from, "");
  });
  const page = h("div", { class: "col-page" },
    h("div", { id: "col-new" }),
    strip,
    cards.length ? h("div", { class: "col-grid" }, cards) : emptyEl("No collections yet", "Keep pages from the Inbox, or press + New collection."));
  setTimeout(() => {
    drawing = false;
    const input = page.querySelector(".tree-input");
    if (input) { input.focus(); input.select(); input.scrollIntoView({ block: "nearest" }); }
  });
  return page;
}

// ---------- "+ New" panel under the Collections header ----------
function closeNewPanel() { $("col-new")?.replaceChildren(); }

async function createCol(path) {
  if (!knownPaths.includes(path)) await withUndo(`Added ${pathLabel(path)}`, COL_KEYS, () => addCollection(path));
  closeNewPanel();
  go("col", path);
}

function openNewPanel() {
  const box = $("col-new");
  if (!box) { go("collections"); return setTimeout(openNewPanel); }
  if (box.firstChild) return closeNewPanel(); // the + button toggles
  const input = h("input", { type: "text", list: "paths", maxlength: "130", placeholder: "e.g. AI › Agents", "aria-label": "New collection name" });
  const parent = h("select", { "aria-label": "Parent collection" },
    h("option", { value: "" }, "Top level"),
    knownPaths.filter((p) => collectionDepth(p) < 3).map((p) => h("option", { value: p }, pathLabel(p))));
  if (state.view === "col" && collectionDepth(state.col) < 3 && knownPaths.includes(state.col)) parent.value = state.col;
  const submit = async () => {
    const segs = input.value.split(/[\/›>]/).map((s) => s.trim()).filter(Boolean);
    if (!segs.length) return input.focus();
    const full = [...(parent.value ? parent.value.split("/") : []), ...segs];
    if (full.length > 3) return showToast("Collections go 3 levels deep");
    await createCol(cleanPath(full.join("/")));
  };
  const subjects = TAXONOMY.filter((s) => s.id !== "other").map((s) =>
    h("details", { class: "std-subject" },
      h("summary", {}, s.label),
      h("button", { class: "std-pick", onclick: () => createCol(s.label) }, `${s.label} (the subject)`),
      s.children.map((c) => h("button", { class: "std-pick", onclick: () => createCol(`${s.label}/${c.label}`) }, c.label))));
  const panel = h("div", { class: "new-panel", onkeydown: (e) => { if (e.key === "Escape") { e.stopPropagation(); closeNewPanel(); } } },
    input,
    h("label", { class: "new-parent" }, h("span", {}, "Parent"), parent),
    h("details", { class: "std-list" }, h("summary", {}, "Suggested collections"), h("div", { class: "std-body" }, subjects)),
    h("div", { class: "new-actions" },
      h("button", { class: "link small", onclick: closeNewPanel }, "Cancel"),
      h("button", { class: "btn primary", onclick: submit }, "Create")));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  box.append(panel);
  input.focus();
}
$("col-add").onclick = openNewPanel;

dropTarget(document.querySelector('[data-drop="inbox"]'), (id) => updateItem(id, { stage: "inbox" }));

function viewCollection() {
  const path = state.col;
  const base = data.items.filter((it) => it.stage === "kept" && inPath(it.path, path) && matches(it) && byStatus(it));
  const node = path.split("/").reduce((n, part) => n?.children[part], buildTree());
  const subs = node ? Object.values(node.children) : [];
  setHead(pathLabel(path), `${base.length} page${base.length === 1 ? "" : "s"}`);
  setTools(
    ...subs.map((s) => h("button", { class: "chip", onclick: () => go("col", s.path) }, `${s.name} ${countIn(s.path)}`)),
    subs.length ? h("span", { class: "sep" }) : null,
    ...typeChips(base),
    h("span", { class: "spacer" }),
    statusSeg(),
    h("button", { class: "icon-btn", title: "Collection actions", "aria-label": "Collection actions", onclick: (e) => rowMenu(e.currentTarget, path) }, "⋯"));
  const list = base.filter(byType);
  if (!list.length) return emptyEl("Empty collection", "Drag pages here from the Inbox.");
  // group direct pages first, then each sub-collection
  const direct = list.filter((it) => it.path === path);
  return h("div", {},
    selBar(),
    direct.length ? listEl(direct, "direct") : null,
    subs.map((s) => {
      const inSub = list.filter((it) => inPath(it.path, s.path));
      return inSub.length ? [sectionEl(s.name, inSub.length), listEl(inSub, "sub:" + s.path)] : null;
    }));
}
