// Page rows (compact list / cards), filters, and the Inbox and All pages views.

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
      updateItem(it.id, { progress: { done: n, total }, ...(n >= total ? { read: true, readAt: Date.now() } : {}) });
    };
    return h("span", { class: "progress" },
      h("button", { class: "icon-btn", title: "Back one unit", onclick: () => step(-1) }, "−"),
      h("span", { class: "bar-mini" }, h("i", { style: `width:${(done / total) * 100}%` })),
      `${done}/${total}`,
      h("button", { class: "icon-btn", title: "Finished one unit", onclick: () => step(1) }, "+"));
  }
  if (it.type !== "Course") return null;
  return h("input", {
    class: "input", type: "number", min: "1", style: "width:150px", placeholder: "Units / lessons: Enter", "aria-label": "Number of units or lessons",
    onkeydown: (e) => {
      if (e.key !== "Enter") return;
      const n = parseInt(e.target.value, 10);
      if (n > 0) updateItem(it.id, { progress: { done: 0, total: n } });
    },
  });
}

function detailEl(it) {
  const pathIn = h("input", { class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path), placeholder: "Collection, e.g. AI › Agents" });
  const tagsIn = h("input", {
    class: "input", value: (it.tags || []).join(", "), placeholder: "tags, comma separated",
    onchange: (e) => updateItem(it.id, { tags: mergeTags([], e.target.value.split(",")) }),
  });
  const note = notesForUrl(it.url);
  return h("div", { class: "detail" },
    it.why ? h("p", { class: "why-full" }, it.why) : null,
    note
      ? h("div", { class: "quotes" },
          highlightsEl(note),
          note.text.trim() ? h("div", { class: "note-text" }, note.text) : null,
          h("button", { class: "link small", onclick: () => openWithNotes(note) }, "Open with Notes"))
      : null,
    h("label", { class: "check", title: "Pages are marked read after 2 minutes of viewing" }, "Read",
      h("input", { type: "checkbox", checked: !!it.read, onchange: (e) => updateItem(it.id, { read: e.target.checked, readAt: e.target.checked ? Date.now() : null }) })),
    h("label", {}, "Type",
      h("select", { onchange: (e) => updateItem(it.id, { type: e.target.value }) },
        TYPES.map((t) => h("option", { value: t, selected: it.type === t }, t)))),
    remindSelect(it),
    progressEl(it),
    h("label", {}, "Keep in", pathIn,
      h("button", { class: "qbtn keep", onclick: () => keepItem(it.id, pathIn.value) }, "Keep")),
    h("label", {}, "Tags", tagsIn),
    h("span", { style: "flex:1" }),
    it.stage === "kept" ? h("button", { class: "link", onclick: () => updateItem(it.id, { stage: "inbox" }) }, "Back to Inbox") : null,
    h("button", { class: "link", onclick: () => withUndo(`Deleted “${it.title}”`, ["items"], () => deleteItem(it.id)) }, "Delete"));
}

function rowEl(it, pinned) {
  const open = state.open === it.id;
  const inbox = it.stage === "inbox";
  const suggested = inbox && it.path !== UNSORTED;
  const selected = state.sel.has(it.id);
  const note = notesForUrl(it.url);
  const pct = resumePct(it);
  const row = h("div", {
    class: `row t-${it.type}${open ? " open" : ""}${it.read ? " read" : " unread"}${selected ? " sel" : ""}${state.focusId === it.id ? " focus" : ""}`,
    "data-id": it.id,
    draggable: "true",
    ondragstart: (e) => { e.dataTransfer.setData("text/item", it.id); e.currentTarget.classList.add("dragging"); },
    ondragend: (e) => e.currentTarget.classList.remove("dragging"),
  },
    h("div", {
      class: "row-main",
      onclick: (e) => { if (e.target.closest("a, button, select, input")) return; state.open = open ? null : it.id; render(); },
    },
      h("input", { type: "checkbox", class: "pick", checked: selected, title: "Select (X)", onclick: () => toggleSel(it.id) }),
      h("img", { class: "fav", src: faviconFor(it.url, 16), loading: "lazy", alt: "" }),
      h("div", { class: "line" },
        h("a", { class: "title", href: it.url, target: "_blank", title: it.url }, it.title),
        h("span", { class: "why" }, it.why || hostOf(it.url))),
      h("div", { class: "right" },
        note ? h("span", { class: "small", title: "Has Notes" }, "✎") : null,
        isOld(it) ? h("span", { class: "chip", title: "In the Inbox for more than 2 weeks" }, "old") : null,
        isDue(it) ? h("span", { class: "chip lime" }, "due") : null,
        it.remindAt && !isDue(it) ? h("span", { class: "small remind-on", title: "Reminder" }, shortWhen(it.remindAt)) : null,
        it.progress ? h("span", { class: "small muted" }, `${it.progress.done}/${it.progress.total}`) : null,
        it.minutes ? h("span", { class: "small muted len", title: it.words ? `${it.words} words` : "video length" }, lengthLabel(it)) : null,
        pct ? h("span", { class: "chip resume", title: "Where you stopped reading" }, `${pct}% read`) : null,
        state.view !== "col" || inbox
          ? h("button", {
              class: `chip path-chip${inbox ? " suggest" : ""}`,
              title: inbox ? "AI suggestion" : "Open collection",
              onclick: () => (inbox ? (state.open = it.id, render()) : go("col", it.path)),
            }, pathLabel(it.path))
          : null,
        // nothing fit clearly: the two likeliest subjects, one click to keep there
        inbox && !suggested ? (it.alts || []).map((a) => h("button", {
          class: "chip suggest", title: `Maybe: keep in ${pathLabel(a)}`, onclick: () => keepItem(it.id, a),
        }, `Maybe ${pathLabel(a).split(" › ").pop()}`)) : null,
        h("i", { class: "dot", style: "background:var(--type)", title: it.type }),
        suggested ? h("button", { class: "qbtn keep", title: `Keep in ${pathLabel(it.path)}`, onclick: () => keepItem(it.id, it.path) }, "Keep") : null,
        h("button", {
          class: `star${pinned ? " on" : ""}`,
          title: pinned ? "Unpin" : "Pin to Library",
          onclick: () => (pinned ? withUndo("Unpinned", ["pins"], () => unpinSite(it.url)) : pinSite(it)),
        }, pinned ? "★" : "☆"))),
    open ? detailEl(it) : null);
  return row;
}

// `key` names the list within its view, for its own "Show more" count.
function listEl(items, key) {
  const pinned = new Set(data.pins.map((p) => p.url));
  for (const it of items) listOrder.push(it.id); // J/K and * work on the whole list, not only the drawn rows
  const { shown, more } = pageOf(key, items, items.findIndex((it) => it.id === state.focusId));
  return [h("div", { class: `list ${prefs.get("density", "rows")}` }, shown.map((it) => rowEl(it, pinned.has(it.url)))), more];
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
  return h("div", { class: "seg" }, [["all", "All"], ["unread", "Unread"], ["read", "Read"]].map(([v, l]) =>
    h("button", { class: state.status === v ? "on" : null, onclick: () => { state.status = v; render(); } }, l)));
}

const byStatus = (it) => state.status === "all" || (state.status === "read" ? !!it.read : !it.read);
const byType = (it) => state.type === "All" || it.type === state.type;

function emptyEl(title, text) {
  return h("div", { class: "empty" }, h("h3", {}, title), text ? h("p", {}, text) : null);
}

// ---------- selecting many, bundles, keys ----------

let listOrder = []; // ids of every listed page in order (drawn or behind "Show more"), for J/K and * (reset on each render)

function toggleSel(id) {
  state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id);
  render();
}

function selected() {
  const ids = new Set(data.items.map((x) => x.id));
  return [...state.sel].filter((id) => ids.has(id));
}

function countMessage(n, what) {
  state.sel.clear();
  return `${what} ${n} page${n === 1 ? "" : "s"}`;
}

// Bar shown while pages are selected.
function selBar() {
  const ids = selected();
  if (!ids.length) return null;
  const pathIn = h("input", { class: "input", list: "paths", placeholder: "Collection, e.g. AI › Agents" });
  const projects = data.projects.filter((p) => p.status !== "finished");
  return h("div", { class: "selbar" },
    h("b", {}, `${ids.length} selected`),
    pathIn,
    h("button", { class: "qbtn keep", onclick: () => pathIn.value.trim() && withUndo(countMessage(ids.length, "Kept"), ["items", "collections"], () => keepMany(ids, pathIn.value)) }, "Keep here"),
    h("button", { class: "qbtn", title: "Each page into its AI suggestion", onclick: () => withUndo(countMessage(ids.length, "Kept"), ["items", "collections"], () => keepSuggested(ids)) }, "Keep suggested"),
    projects.length ? h("select", {
      onchange: async (e) => {
        const id = e.target.value;
        if (!id) return;
        for (const it of data.items.filter((x) => ids.includes(x.id))) await addSource(id, it);
        flash(countMessage(ids.length, "Added to project:"));
        render();
      },
    }, h("option", { value: "" }, "→ Project"), projects.map((p) => h("option", { value: p.id }, p.name))) : null,
    h("button", { class: "qbtn", onclick: () => withUndo(countMessage(ids.length, "Marked read:"), ["items"], () => markReadMany(ids, true)) }, "Read"),
    h("button", { class: "qbtn", onclick: () => withUndo(countMessage(ids.length, "Marked unread:"), ["items"], () => markReadMany(ids, false)) }, "Unread"),
    h("button", { class: "qbtn danger", onclick: () => withUndo(countMessage(ids.length, "Deleted"), ["items"], () => deleteMany(ids)) }, "Delete"),
    h("button", { class: "link small", onclick: () => { state.sel.clear(); render(); } }, "Clear"));
}

const BUNDLE_FILTER = {
  path: (b) => (it) => it.path === b.path,
  dupes: () => { const ids = new Set(inboxBundles(data.items).duplicates.map((x) => x.id)); return (it) => ids.has(it.id); },
  old: () => (it) => isOld(it) && !it.read,
  unsorted: () => (it) => !it.path || it.path === UNSORTED,
};

function bundleCard(title, list, actions, filter) {
  return h("div", { class: "bundle" },
    h("div", { class: "b-head" }, h("b", {}, title), h("span", { class: "muted small" }, String(list.length))),
    h("div", { class: "b-favs" }, list.slice(0, 8).map((it) => h("img", { src: faviconFor(it.url, 16), title: it.title, loading: "lazy", alt: "" }))),
    h("div", { class: "b-act" }, actions, h("button", { class: "link small", onclick: () => { state.bundle = filter; render(); } }, "Show")));
}

function bundlesEl() {
  const b = inboxBundles(data.items);
  const ids = (l) => l.map((x) => x.id);
  const cards = [];
  if (b.duplicates.length) cards.push(bundleCard("Duplicates", b.duplicates,
    h("button", { class: "qbtn danger", onclick: () => withUndo(`Deleted ${b.duplicates.length} duplicates`, ["items"], () => deleteMany(ids(b.duplicates))) }, "Delete all"), { kind: "dupes" }));
  for (const g of b.byPath.slice(0, 6)) cards.push(bundleCard(`→ ${pathLabel(g.path)}`, g.items, [
    h("button", { class: "qbtn keep", onclick: () => withUndo(`Kept ${g.items.length} in ${pathLabel(g.path)}`, ["items", "collections"], () => keepMany(ids(g.items), g.path)) }, "Keep all"),
    h("button", {
      class: "link small", title: "Keep them all in another collection",
      onclick: () => { const p = prompt("Keep these pages in:", pathLabel(g.path)); if (p) withUndo(`Kept ${g.items.length} in ${pathLabel(cleanPath(p))}`, ["items", "collections"], () => keepMany(ids(g.items), p)); },
    }, "Elsewhere…")], { kind: "path", path: g.path }));
  if (b.old.length) cards.push(bundleCard("Old & never read", b.old,
    h("button", { class: "qbtn danger", onclick: () => withUndo(`Deleted ${b.old.length} old pages`, ["items"], () => deleteMany(ids(b.old))) }, "Delete all"), { kind: "old" }));
  if (b.unsorted.length) cards.push(bundleCard("No suggestion yet", b.unsorted,
    h("button", {
      class: "qbtn", title: "Ask the local AI to suggest collections",
      onclick: async () => {
        if ((await aiAvailability()) !== "available") return flash("Local AI not available right now");
        const set = new Set(ids(b.unsorted));
        const items = await getItems();
        items.forEach((it) => { if (set.has(it.id)) it.needsAi = true; });
        await setItems(items);
        flash("Sorting with local AI…");
        await classifyPending((n, t) => flash(`Sorting with local AI… ${n}/${t}`));
      },
    }, "Sort with AI"), { kind: "unsorted" }));
  return cards.length ? h("div", { class: "bundles" }, cards) : null;
}

function bundleLabel(f) {
  return f.kind === "path" ? `→ ${pathLabel(f.path)}` : { dupes: "Duplicates", old: "Old & never read", unsorted: "No suggestion yet" }[f.kind];
}

const KEYS_HINT = "J/K move · X select · E keep · # delete · O open · M read/unread · * select all · Esc clear";

function viewInbox() {
  const base = data.items.filter((it) => it.stage === "inbox" && matches(it));
  const f = state.bundle;
  const list = base.filter(byType).filter(f ? BUNDLE_FILTER[f.kind](f) : () => true);
  const waiting = forReview(data.items).length;
  const suggested = base.filter((it) => it.path && it.path !== UNSORTED);
  setHead("Inbox", `${base.length} waiting`);
  setTools(
    ...(f ? [h("button", { class: "chip on", title: "Show all", onclick: () => { state.bundle = null; render(); } }, `${bundleLabel(f)} ×`)] : typeChips(base)),
    h("span", { class: "spacer" }),
    waiting ? h("button", { class: "btn primary", onclick: () => go("review") }, `Review ${waiting} one by one`) : null);
  if (!base.length) return emptyEl("Inbox is clear", "Save a page with Alt+Shift+S.");
  return h("div", {},
    f || base.length < 3 ? null : bundlesEl(),
    selBar(),
    list.length ? listEl(list, "inbox") : emptyEl("Nothing here", ""));
}

function viewAll() {
  const base = data.items.filter((it) => matches(it) && byStatus(it));
  setHead("All pages", `${data.items.length} saved`);
  setTools(...typeChips(base), h("span", { class: "spacer" }), statusSeg());
  const due = base.filter((it) => isDue(it));
  const rest = base.filter(byType);
  return h("div", {},
    selBar(),
    due.length ? [sectionEl("Due now", due.length), listEl(due, "due")] : null,
    rest.length ? listEl(rest, "all") : emptyEl("Nothing here", ""));
}

// Gmail-style keys in page lists (Inbox, All pages, collections, queue).
document.addEventListener("keydown", async (e) => {
  if (!["inbox", "all", "col", "queue"].includes(state.view)) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches("input, select, textarea") || document.querySelector(".quick-back")) return;
  const order = [...new Set(listOrder)];
  if (!order.length) return;
  let i = order.indexOf(state.focusId);
  const it = data.items.find((x) => x.id === state.focusId);
  const targets = state.sel.size ? selected() : it ? [it.id] : [];
  const moveTo = (j) => {
    state.focusId = order[Math.max(0, Math.min(order.length - 1, j))];
    render().then(() => document.querySelector(`.row[data-id="${state.focusId}"]`)?.scrollIntoView({ block: "nearest" }));
  };
  // after removing the focused page, focus the next one
  const next = () => order.filter((id) => !targets.includes(id))[Math.min(i, order.length - targets.length - 1)] || null;
  const k = e.key;
  if (k === "j") moveTo(i + 1);
  else if (k === "k") moveTo(i < 0 ? 0 : i - 1);
  else if (k === "x" && it) toggleSel(it.id);
  else if (k === "*") { order.forEach((id) => state.sel.add(id)); render(); }
  else if (k === "Escape") { state.sel.clear(); state.bundle = null; render(); }
  else if (k === "Enter" && it) { state.open = state.open === it.id ? null : it.id; render(); }
  else if (k === "o" && it) window.open(it.url, "_blank");
  else if (k === "m" && targets.length) {
    const read = !data.items.find((x) => x.id === targets[0])?.read;
    await withUndo(countMessage(targets.length, read ? "Marked read:" : "Marked unread:"), ["items"], () => markReadMany(targets, read));
  } else if ((k === "#" || k === "Delete") && targets.length) {
    const n = next();
    await withUndo(countMessage(targets.length, "Deleted"), ["items"], () => deleteMany(targets));
    state.focusId = n;
  } else if (k === "e" && targets.length) {
    const keepable = data.items.filter((x) => targets.includes(x.id) && x.stage === "inbox" && x.path && x.path !== UNSORTED);
    if (!keepable.length) { if (it) { state.open = it.id; render(); } return flash("No suggestion: type a collection in the details"); }
    const n = next();
    await withUndo(countMessage(keepable.length, "Kept"), ["items", "collections"], () => keepSuggested(keepable.map((x) => x.id)));
    state.focusId = n;
  } else return;
  e.preventDefault();
});
