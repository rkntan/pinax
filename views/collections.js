// Collections tree in the sidebar and the collection view.

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
    h("button", { class: "link small", onclick: async () => { if (confirm(`Delete collection "${pathLabel(path)}"? Its pages move up one level.`)) { await withUndo(`Deleted ${pathLabel(path)}`, ["collections", "items"], () => deleteCollection(path)); go("inbox"); } } }, "Delete"));
  const list = base.filter(byType);
  if (!list.length) return emptyEl("Empty collection", "Drag pages here from the Inbox, or Keep them during the weekly review.");
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
