// ---------- mind map: left-to-right tree, click a branch to open it ----------
// Library -> top-level collections (+ Inbox) -> sub-collections -> pages (site icons).
// Pages that share a tag are joined by dotted "related" lines.

const COL_W = 230, ROW_H = 30;
const view = { x: 0, y: 0, w: 1200, h: 800 };
let mapFitted = false;

function mapTree() {
  const live = data.items.filter((it) => matches(it));
  const tree = buildTree();
  const keptByPath = {};
  for (const it of live) if (it.stage === "kept") (keptByPath[it.path] ||= []).push(it);
  const toNode = (t) => {
    const pages = keptByPath[t.path] || [];
    const kids = Object.values(t.children).map(toNode).filter((n) => n.count);
    return {
      id: "c:" + t.path, label: t.name, kind: "col", path: t.path,
      children: [...kids, ...pages.map(pageNode)],
      count: pages.length + kids.reduce((a, k) => a + k.count, 0),
    };
  };
  const pageNode = (it) => ({ id: "p:" + it.id, label: it.title, kind: "page", item: it, children: [], count: 1 });
  const top = Object.values(tree.children).map(toNode).filter((n) => n.count);
  const unsorted = keptByPath[UNSORTED] || [];
  if (unsorted.length) top.push({ id: "c:" + UNSORTED, label: UNSORTED, kind: "col", path: UNSORTED, children: unsorted.map(pageNode), count: unsorted.length });
  const inbox = live.filter((it) => it.stage === "inbox");
  if (inbox.length) top.push({ id: "inbox", label: "Inbox", kind: "inbox", children: inbox.map(pageNode), count: inbox.length });
  // annotated pages you never saved get their own branch
  const saved = new Set(data.items.map((it) => pageKey(it.url)));
  const loose = Object.values(data.notes).filter((n) => !saved.has(n.url) && noteHit(n, state.q))
    .map((n) => ({ id: "n:" + n.url, title: n.title, url: n.url, type: "Other", path: "Notes", tags: [], why: n.highlights[0]?.text || "" }));
  if (loose.length) top.push({ id: "c:__notes", label: "Notes", kind: "col", notes: true, path: "__notes", children: loose.map(pageNode), count: loose.length });
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

// Tooltip lines for a page's notes: how many highlights, the first one, the summary.
function noteTip(url) {
  const n = data.notes[pageKey(url)];
  if (!n) return "";
  const first = n.highlights[0]?.text;
  return `\n✎ ${n.highlights.length} highlight${n.highlights.length === 1 ? "" : "s"}${first ? `: “${first.slice(0, 90)}${first.length > 90 ? "…" : ""}”` : ""}${n.summary?.text ? "\n" + n.summary.text.slice(0, 160) : ""}`;
}

function nodeEl(n, toggle) {
  if (n.kind === "page") {
    const it = n.item;
    const label = it.title.length > 46 ? it.title.slice(0, 45) + "…" : it.title;
    return svg("g", {
      class: `leaf t-${it.type}${isDue(it) ? " due" : ""}${it.read ? " read" : ""}`,
      transform: `translate(${n.x} ${n.y})`, onclick: () => window.open(it.url, "_blank"),
    },
      svg("title", {}, `${it.title}\n${pathLabel(it.path)} · ${it.type}${it.why ? "\n" + it.why : ""}${it.tags?.length ? "\n#" + it.tags.join(" #") : ""}${noteTip(it.url)}`),
      svg("rect", { class: "leaf-bg", x: -2, y: -11, width: 22, height: 22, rx: 6 }),
      svg("image", { href: faviconFor(it.url, 32), x: 1, y: -8, width: 16, height: 16 }),
      svg("circle", { class: "type-dot", cx: 20, cy: -9, r: 3.5 }),
      svg("text", { x: 28, y: 4 }, label),
      data.notes[pageKey(it.url)] ? svg("text", { class: "has-note", x: 28 + label.length * 6.4 + 6, y: 4 }, "✎") : null);
  }
  const w = nodeWidth(n);
  const cls = n.kind === "root" ? "root" : n.kind === "inbox" ? "topic inbox" : n.notes ? "topic notes" : "topic";
  return svg("g", {
    class: cls, transform: `translate(${n.x} ${n.y})`,
    onclick: () => toggle(n),
    ondblclick: () => (n.notes ? go("notes") : n.kind === "col" && n.path !== UNSORTED ? go("col", n.path) : n.kind === "inbox" ? go("inbox") : null),
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
