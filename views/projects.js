// Projects: research / work with a trail of sources (who opened whom), statuses, notes,
// reading mode, finishing, and working tabs ("Open tabs", formerly "workspaces").

const STATUS_LABEL = { unread: "Unread", useful: "Used", later: "Later", skip: "Not needed" };

// The tabs of the window this Library tab is in, without the Library tab itself.
async function thisWindowTabs() {
  const me = await chrome.tabs.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: me.windowId });
  return tabs.filter((t) => t.id !== me.id && /^https?:/.test(t.url));
}

async function thisWindowId() {
  return (await chrome.tabs.getCurrent()).windowId;
}

// Opens the next unread source in a new tab (reading mode). The popup then shows
// Used / Remove / Next for it.
async function readNext(p, afterId = null) {
  const s = nextUnread(p.sources, afterId);
  if (!s) return showToast("Nothing unread left in this project");
  await chrome.tabs.create({ url: s.url, active: true });
}

function sourceRow(p, node, collapsed) {
  const { s, depth, children } = node;
  const done = p.status === "finished";
  const working = p.tabs.some((t) => t.url === s.url);
  const mark = () => setSourceStatus(p.id, s.id, s.status === "useful" ? "unread" : "useful", false);
  const editNote = () => {
    const n = prompt("Comment (why it matters):", s.note || "");
    if (n !== null) setSourceNote(p.id, s.id, n.trim());
  };
  const isCollapsed = collapsed.has(s.id);
  return h("div", { class: `src st-${s.status}`, style: `--depth:${depth}` },
    h("span", {
      class: "caret",
      title: children ? (isCollapsed ? "Show pages opened from here" : "Hide pages opened from here") : "",
      onclick: () => {
        if (!children) return;
        isCollapsed ? collapsed.delete(s.id) : collapsed.add(s.id);
        prefs.set("trailCollapsed", [...collapsed]);
        render();
      },
    }, children ? (isCollapsed ? `▸ ${children}` : "▾") : ""),
    h("i", { class: "sdot", title: STATUS_LABEL[s.status] }),
    h("img", { class: "fav", src: faviconFor(s.url, 16), loading: "lazy", alt: "" }),
    h("div", { class: "src-main" },
      h("a", { class: "title", href: s.url, target: "_blank", title: s.url }, s.title),
      h("span", { class: "why" }, s.note ? s.note : hostOf(s.url))),
    done ? h("span", { class: "small muted" }, STATUS_LABEL[s.status]) : h("div", { class: "src-act" },
      h("button", { class: `sb ok${s.status === "useful" ? " on" : ""}`, title: "Mark as used", onclick: mark }, "✓ Used"),
      h("button", { class: "sb no", title: "Remove from project", onclick: () => withUndo("Removed from project", ["projects"], () => removeSource(p.id, s.id)) }, "✕"),
      moreMenu([
        { label: working ? "Remove from working tabs" : "Add to working tabs", onclick: () => toggleWorkingTab(p.id, s) },
        { label: s.note ? "Edit comment" : "Add comment", onclick: editNote },
      ])));
}

function finishView(p) {
  const c = projectProgress(p);
  const useful = sourceTree(p.sources).map((n) => n.s).filter((s) => s.status === "useful");
  const inputs = {};
  const all = h("input", {
    class: "input", list: "paths", placeholder: "Collection for all, e.g. AI › Agents", value: p.collection ? pathLabel(p.collection) : "",
    oninput: (e) => Object.values(inputs).forEach((i) => (i.value = e.target.value)),
  });
  let rest = "skip";
  return h("div", { class: "finish" },
    h("h3", {}, "Finish project"),
    c.unread ? h("div", { class: "finish-rest" },
      `${c.unread} page${c.unread > 1 ? "s" : ""} still unread:`,
      h("label", { class: "check small" }, h("input", { type: "radio", name: "rest", checked: true, onchange: () => (rest = "skip") }), "mark not needed"),
      h("label", { class: "check small" }, h("input", { type: "radio", name: "rest", onchange: () => (rest = "inbox") }), "send to Inbox")) : null,
    useful.length
      ? h("div", {},
          h("p", { class: "small muted" }, `Keep the ${useful.length} used source${useful.length > 1 ? "s" : ""} in collections (leave empty for this project only):`),
          all,
          h("div", { class: "finish-list" }, useful.map((s) => h("div", { class: "tabrow" },
            h("img", { src: faviconFor(s.url, 16), loading: "lazy", alt: "" }),
            h("a", { href: s.url, target: "_blank" }, s.title),
            (inputs[s.id] = h("input", { class: "input", list: "paths", value: p.collection ? pathLabel(p.collection) : "", placeholder: "Collection" }))))))
      : h("p", { class: "small muted" }, "No sources marked used."),
    h("div", { class: "finish-go" },
      h("button", { class: "btn", onclick: () => { state.finishing = null; render(); } }, "Cancel"),
      h("button", {
        class: "btn primary",
        onclick: async (e) => {
          e.target.disabled = true;
          const filing = {};
          for (const [id, i] of Object.entries(inputs)) if (i.value.trim()) filing[id] = i.value.trim();
          if (all.value.trim()) await editProject(p.id, (x) => (x.collection = cleanPath(all.value)));
          await finishProject(p.id, filing, rest);
          state.finishing = null;
          render();
        },
      }, "Finish")));
}

// One folder per project: note.md plus its images, in a .zip.
async function exportAllProjects() {
  if (!data.projects.length) return showToast("No projects to export");
  const marks = Object.values(data.notes).flatMap((n) => n.highlights.map((x) => ({ url: n.url, text: x.text })));
  saveFile(`pinax-projects-${new Date().toISOString().slice(0, 10)}.zip`, projectsZip(data.projects, marks, await allImages()), "application/zip");
  showToast("Projects exported");
}

// ---------- the board: clips arranged in themes ----------
// Drag a card to another column or between cards; drop it on the middle of a card to merge the two.

let dragClip = null;

function inlineEdit(box, text, save) {
  const t = h("textarea", { class: "input", rows: "4", "aria-label": "Edit note" });
  t.value = text;
  const done = (keep) => { if (keep && t.value.trim() !== text) save(t.value.trim()); else render(); };
  t.onkeydown = (e) => { if (e.key === "Escape") done(false); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) done(true); };
  t.onblur = () => done(true);
  box.replaceChildren(t);
  t.focus();
}

function cardEl(p, c, done) {
  const img = c.kind === "image" ? h("img", { class: "clip-img", alt: c.caption || "", loading: "lazy", src: c.src || "" }) : null;
  if (img && c.imgId) chrome.storage.local.get(IMG_PREFIX + c.imgId).then((r) => { if (r[IMG_PREFIX + c.imgId]) img.src = r[IMG_PREFIX + c.imgId]; });
  const body = h("div", { class: "bcard-text", title: done ? "" : "Double-click to edit" }, c.text);
  if (!done && !img) body.ondblclick = () => inlineEdit(body, c.text, (t) => setClipText(p.id, c.id, t));
  const srcs = [c, ...(c.also || [])].filter((x) => x.url);
  const card = h("article", { class: "bcard", draggable: done ? null : "true", "data-id": c.id },
    img || body,
    c.caption ? h("div", { class: "clip-cap small" }, c.caption) : null,
    h("div", { class: "bcard-foot" },
      srcs.length
        ? h("span", { class: "bcard-src" }, srcs.map((x) => h("a", { class: "small muted", href: x.url, target: "_blank", title: x.title || x.url }, hostOf(x.url))))
        : h("span", { class: "small muted" }, "My note"),
      done ? null : moreMenu([
        { label: c.caption ? "Edit caption" : "Add caption", onclick: () => { const t = prompt("Caption:", c.caption || ""); if (t !== null) setClipCaption(p.id, c.id, t.trim()); } },
        { label: "Remove from note", danger: true, onclick: () => withUndo("Removed from note", ["projects"], () => removeClip(p.id, c.id)) },
      ])));
  if (done) return card;
  card.addEventListener("dragstart", (e) => { dragClip = c.id; e.dataTransfer.setData("text/clip", c.id); e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging"); });
  card.addEventListener("dragend", () => { dragClip = null; card.classList.remove("dragging"); document.querySelectorAll(".drop-before,.drop-after,.drop-merge,.drop-ok").forEach((x) => x.classList.remove("drop-before", "drop-after", "drop-merge", "drop-ok")); });
  const zone = (e) => { const r = card.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; return y < 0.3 ? "before" : y > 0.7 ? "after" : "merge"; };
  card.addEventListener("dragover", (e) => {
    if (!dragClip || dragClip === c.id) return;
    e.preventDefault(); e.stopPropagation();
    card.classList.remove("drop-before", "drop-after", "drop-merge");
    card.classList.add("drop-" + zone(e));
  });
  card.addEventListener("dragleave", () => card.classList.remove("drop-before", "drop-after", "drop-merge"));
  card.addEventListener("drop", async (e) => {
    const id = e.dataTransfer.getData("text/clip");
    if (!id || id === c.id) return;
    e.preventDefault(); e.stopPropagation();
    const z = zone(e);
    card.classList.remove("drop-before", "drop-after", "drop-merge");
    if (z === "merge") {
      const into = p.clips.find((k) => k.id === id);
      if (c.kind === "image" || into?.kind === "image") return showToast("Only text notes can be merged");
      await withUndo("Notes merged", ["projects"], () => mergeClips(p.id, id, c.id));
      return;
    }
    const cols = boardColumns(p);
    const col = cols.find((x) => x.clips.some((k) => k.id === c.id));
    const i = col.clips.findIndex((k) => k.id === c.id);
    const before = z === "before" ? c.id : col.clips[i + 1]?.id || null;
    await moveClip(p.id, id, col.id, before === id ? null : before);
  });
  return card;
}

function columnEl(p, col, done) {
  const head = h("div", { class: "bcol-head" },
    h("span", { class: "bcol-name", title: col.id && !done ? "Click to rename" : "" }, col.name),
    h("span", { class: "muted small" }, col.clips.length || ""),
    col.id && !done ? moreMenu([
      { label: "Rename", onclick: () => { const n = prompt("Theme name:", col.name); if (n) renameTheme(p.id, col.id, n); } },
      { label: "Delete theme (notes go to Unsorted)", danger: true, onclick: () => withUndo("Theme deleted", ["projects"], () => deleteTheme(p.id, col.id)) },
    ]) : null);
  const list = h("div", { class: "bcol-list" }, col.clips.map((c) => cardEl(p, c, done)));
  const el = h("section", { class: "bcol" }, head, list,
    done ? null : h("button", { class: "link small bcol-add", onclick: (e) => {
      const box = h("div", {});
      e.target.replaceWith(box);
      inlineEdit(box, "", (t) => t && addOwnNote(p.id, t, col.id));
    } }, "+ Write a note"));
  if (!done) {
    el.addEventListener("dragover", (e) => { if (!dragClip) return; e.preventDefault(); el.classList.add("drop-ok"); });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop-ok"); });
    el.addEventListener("drop", async (e) => {
      const id = e.dataTransfer.getData("text/clip");
      el.classList.remove("drop-ok");
      if (id) { e.preventDefault(); await moveClip(p.id, id, col.id, null); }
    });
  }
  return el;
}

function boardEl(p) {
  const done = p.status === "finished";
  const cols = boardColumns(p).filter((c) => !c.id || true);
  return h("div", { class: "board" },
    cols.map((c) => columnEl(p, c, done)),
    done ? null : h("button", { class: "bcol-new", onclick: async () => {
      const n = prompt("Theme name (e.g. Basics, Memory, Questions):");
      if (n && n.trim()) await addTheme(p.id, n);
    } }, "+ Theme"));
}

// Highlights and typed notes on pages of this project that are not in the note yet.
function unclippedNotes(p) {
  const keys = new Set([...(p.clips || []).map((c) => c.url), ...(p.sources || []).map((s) => s.url)].filter(Boolean).map(pageKey));
  const out = [];
  for (const n of Object.values(data.notes)) {
    if (!keys.has(n.url)) continue;
    const have = new Set((p.clips || []).flatMap((c) => [c.hl, c.text]).filter(Boolean));
    for (const x of n.highlights) if (!have.has(x.id) && !have.has(x.text)) out.push({ n, hl: x });
    if (n.text.trim() && !have.has(n.text.trim())) out.push({ n, text: n.text.trim() });
  }
  return out;
}

async function importPageNotes(p) {
  for (const x of unclippedNotes(p)) {
    if (x.hl) await clipHighlight(p.id, x.hl, x.n);
    else await addClip(p.id, { kind: "text", text: x.text, url: x.n.url, title: x.n.title });
  }
}

// Click the title to rename the project.
function editableTitle(p) {
  const t = $("title");
  t.classList.add("editable");
  t.title = "Click to rename";
  const edit = t.onclick = () => {
    const i = h("input", { class: "input title-edit", value: p.name, "aria-label": "Project name" });
    const save = async (keep) => {
      const name = i.value.trim();
      if (keep && name && name !== p.name) await editProject(p.id, (x) => (x.name = name));
      render();
    };
    i.onkeydown = (e) => { if (e.key === "Enter") save(true); if (e.key === "Escape") save(false); };
    i.onblur = () => save(true);
    t.replaceChildren(i);
    t.onclick = null;
    i.focus(); i.select();
  };
  t.append(h("button", { class: "icon-btn", title: "Rename", "aria-label": "Rename project", onclick: (e) => { e.stopPropagation(); edit(); } }, "✎"));
}

function viewProject() {
  const p = data.projects.find((x) => x.id === state.col);
  if (!p) { setHead("Project", ""); setTools(); return emptyEl("Project not found", ""); }
  const c = projectProgress(p);
  const done = p.status === "finished";
  setHead(p.name, done
    ? `finished ${stamp(p.finishedAt)} · ${c.useful} used of ${c.total}`
    : c.total ? `${c.sorted} of ${c.total} sorted · ${c.useful} useful` : `${p.tabs.length} working tabs`);

  if (!done) editableTitle(p);
  // One switch: pages opened in this window join the sources, and highlights, clips and screenshots go to the board.
  const collectBtn = h("button", { class: "btn", disabled: done }, "…");
  Promise.all([getWorkingOn(), thisWindowId(), getNoteTarget()]).then(([w, win, t]) => {
    const on = w[win] === p.id && t === p.id;
    collectBtn.textContent = on ? "● Collecting · stop" : "Start collecting";
    collectBtn.title = on ? "Stop adding pages and notes to this project" : "Pages you open in this window and everything you highlight or clip go into this project";
    collectBtn.classList.toggle("primary", on);
    collectBtn.onclick = async () => { await setWorkingOn(win, on ? null : p.id); await setNoteTarget(on ? null : p.id); render(); };
  });

  setTools(
    done ? null : h("button", { class: "btn primary", disabled: !c.unread, onclick: () => readNext(p) }, c.unread ? `▶ Read next (${c.unread})` : "All read"),
    done ? null : collectBtn,
    done || !unclippedNotes(p).length ? null : h("button", { class: "btn", title: "Highlights and notes you made on this project's pages in Notes", onclick: async () => { await importPageNotes(p); } }, `Bring in notes (${unclippedNotes(p).length})`),
    h("button", { class: "btn", disabled: !p.tabs.length, onclick: () => restoreTabs(p.tabs) }, `Open tabs (${p.tabs.length})`),
    h("span", { class: "spacer" }),
    moreMenu([
      done ? null : { label: "+ This window's tabs", onclick: async () => {
        const tabs = await thisWindowTabs();
        if (!tabs.length) return showToast("No web tabs in this window besides the Library");
        const n = await parkTabs(p.id, tabs);
        showToast(`Added ${n} page${n === 1 ? "" : "s"} from this window`);
      } },
      done ? null : { label: "+ Page", onclick: async () => {
        const url = prompt("Add a page (paste its address):", "https://");
        if (url && /^https?:\/\/.+/.test(url)) await addSource(p.id, { url, title: hostOf(url) });
      } },
      done ? { label: "Reopen", onclick: () => reopenProject(p.id) } : { label: "Finish…", onclick: () => { state.finishing = p.id; render(); } },
      { label: "Rename", onclick: () => { const n = prompt("Name", p.name); if (n) editProject(p.id, (x) => (x.name = n.trim())); } },
      { label: "Delete", danger: true, onclick: async () => { await withUndo(`Deleted project “${p.name}”`, ["projects"], () => deleteProject(p.id)); go("inbox"); } },
    ]));

  if (state.finishing === p.id) return finishView(p);

  const pct = c.total ? Math.round((c.sorted / c.total) * 100) : 0;
  const filters = h("div", { class: "seg" }, [["all", `All ${c.total}`], ["unread", `Unread ${c.unread}`], ["useful", `Used ${c.useful}`]].map(([v, l]) =>
    h("button", { class: (state.sfilter || "all") === v ? "on" : null, onclick: () => { state.sfilter = v; render(); } }, l)));

  const collapsed = new Set(prefs.get("trailCollapsed", []));
  const tree = sourceTree(p.sources).filter(({ s }) => !state.q || (s.title + " " + s.url + " " + s.note).toLowerCase().includes(state.q));
  let rows;
  if ((state.sfilter || "all") === "all") {
    // hide pages under collapsed branches
    const hidden = new Set();
    for (const { s } of tree) if (collapsed.has(s.id)) descendants(p.sources, s.id).forEach((id) => hidden.add(id));
    rows = tree.filter(({ s }) => !hidden.has(s.id));
  } else {
    rows = tree.filter(({ s }) => s.status === state.sfilter).map((n) => ({ ...n, depth: 0 }));
  }

  const clips = (p.clips || []).length;
  const sources = !c.total ? null : h("details", { class: "src-fold", open: clips ? null : true },
    h("summary", {}, `Sources · ${c.sorted} of ${c.total} sorted`),
    h("div", { class: "pbar", title: `${pct}% sorted` },
      ["useful", "later", "skip"].map((k) => h("i", { class: `pb-${k}`, style: `width:${(c[k] / c.total) * 100}%` }))),
    h("div", { class: "trail-head" }, filters, h("span", { class: "small muted" }, "✓ used · ✕ remove · ▣ working tab · ✎ comment")),
    rows.length ? h("div", { class: "trail" }, rows.map((n) => sourceRow(p, n, collapsed))) : emptyEl("Nothing here", ""));
  return h("div", {},
    boardEl(p),
    sources,
    p.tabs.length ? [h("h3", { class: "section-title" }, "Working tabs"), workingTabsEl(p)] : null);
}

// A project's working tabs: open them all, or send single tabs to the Inbox, a project, a collection or the pins.
function workingTabsEl(p) {
  const counts = {};
  for (const t of p.tabs) if (t.group) counts[t.group] = (counts[t.group] || 0) + 1;
  const targets = data.projects.filter((x) => x.id !== p.id && x.status !== "finished");
  const cols = data.cols.filter((c) => c !== UNSORTED);

  const row = (t, i) => h("div", { class: "tabrow" },
    h("img", { src: faviconFor(t.url, 16), loading: "lazy", alt: "" }),
    h("a", { href: t.url, target: "_blank", title: t.url }, t.title || t.url),
    t.group ? h("span", { class: "grp" }, t.group) : null,
    h("button", { class: "link small", onclick: async () => { await saveForLater(t); flash("Saved to Inbox"); } }, "→ Inbox"),
    targets.length
      ? h("select", {
          title: "Add to a project's sources",
          onchange: async (e) => {
            const id = e.target.value;
            e.target.value = "";
            if (!id) return;
            await addSource(id, t);
            flash(`Added to ${targets.find((x) => x.id === id)?.name}`);
          },
        }, h("option", { value: "" }, "→ Project"), targets.map((w) => h("option", { value: w.id }, w.name)))
      : null,
    h("select", {
      title: "Keep it in a collection",
      onchange: async (e) => {
        let path = e.target.value;
        e.target.value = "";
        if (path === "__new") path = prompt("Collection (e.g. AI › Agents):") || "";
        if (!path) return;
        const it = await saveForLater(t);
        await keepItem(it.id, path);
        flash(`Kept in ${pathLabel(cleanPath(path))}`);
      },
    }, h("option", { value: "" }, "→ Collection"), cols.map((c) => h("option", { value: c }, pathLabel(c))), h("option", { value: "__new" }, "+ New…")),
    moreMenu([
      { label: "Pin to Library", onclick: () => { pinSite(t); flash("Pinned"); } },
      { label: "Remove tab", danger: true, onclick: () => withUndo("Tab removed", ["projects"], () => editProject(p.id, (x) => x.tabs.splice(i, 1))) },
    ]));

  return h("div", { class: "tabset" },
    h("div", { class: "tabset-head" },
      h("h3", {}, p.name),
      h("span", { class: "muted small" }, `${p.tabs.length} tab${p.tabs.length === 1 ? "" : "s"}`),
      h("button", { class: "btn primary", disabled: !p.tabs.length, onclick: () => restoreTabs(p.tabs) }, "Open tabs")),
    Object.keys(counts).length ? h("div", { class: "chips" }, Object.entries(counts).map(([g, n]) => h("span", { class: "chip" }, `${g} ${n}`))) : null,
    h("div", { class: "tablist" }, p.tabs.map(row)));
}

function renderProjects() {
  const box = $("ws-list");
  box.replaceChildren();
  const list = [...data.projects].sort((a, b) => (a.status === "finished") - (b.status === "finished") || a.name.localeCompare(b.name));
  if (!list.length) box.append(h("div", { class: "ws-empty" }, "Park a window from the popup, or press +."));
  for (const p of list) {
    const c = projectProgress(p);
    const row = h("div", { class: `ws-row${p.status === "finished" ? " finished" : ""}` },
      h("button", { class: `nav${state.view === "project" && state.col === p.id ? " on" : ""}`, onclick: () => { state.finishing = null; state.sfilter = "all"; go("project", p.id); }, title: p.name },
        h("span", { class: "node-name" }, (p.status === "finished" ? "✓ " : "") + p.name),
        h("span", { class: "n" }, c.total ? `${c.sorted}/${c.total}` : String(p.tabs.length || ""))),
      p.tabs.length ? h("button", { class: "ws-open", title: "Open working tabs in a new window", onclick: () => restoreTabs(p.tabs) }, "Open tabs") : null);
    // drop a page row here to add it as a source
    dropTarget(row, (id) => { const it = data.items.find((x) => x.id === id); if (it) addSource(p.id, it); });
    box.append(row);
  }
}

$("ws-add").onclick = async () => {
  const name = prompt("New project name:");
  if (!name) return;
  const p = await addProject(name.trim(), [], true);
  go("project", p.id);
};
