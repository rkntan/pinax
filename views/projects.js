// Projects: research / work with a trail of sources (who opened whom), statuses, notes,
// reading mode, finishing, and working tabs ("Open tabs", formerly "workspaces").

const STATUS_LABEL = { unread: "Unread", useful: "Useful", later: "Later", skip: "Not needed" };

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
// Useful / Later / Not needed / Next for it.
async function readNext(p, afterId = null) {
  const s = nextUnread(p.sources, afterId);
  if (!s) return showToast("Nothing unread left in this project");
  await chrome.tabs.create({ url: s.url, active: true });
}

function sourceRow(p, node, collapsed) {
  const { s, depth, children } = node;
  const done = p.status === "finished";
  const working = p.tabs.some((t) => t.url === s.url);
  const mark = async (status) => {
    const unreadKids = descendants(p.sources, s.id).filter((id) => p.sources.find((x) => x.id === id)?.status === "unread").length;
    const prune = status === "skip" && unreadKids > 0
      && confirm(`Also mark the ${unreadKids} unread page${unreadKids > 1 ? "s" : ""} opened from it as not needed?`);
    const next = s.status === status ? "unread" : status;
    if (prune) await withUndo("Branch marked not needed", ["projects"], () => setSourceStatus(p.id, s.id, next, true));
    else await setSourceStatus(p.id, s.id, next, false);
  };
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
      h("button", { class: `sb ok${s.status === "useful" ? " on" : ""}`, title: "Useful", onclick: () => mark("useful") }, "✓"),
      h("button", { class: `sb${s.status === "later" ? " on" : ""}`, title: "Later (also saves to the Inbox)", onclick: () => mark("later") }, "Later"),
      h("button", { class: `sb no${s.status === "skip" ? " on" : ""}`, title: "Not needed", onclick: () => mark("skip") }, "✕"),
      moreMenu([
        { label: working ? "Remove from working tabs" : "Add to working tabs", onclick: () => toggleWorkingTab(p.id, s) },
        { label: s.note ? "Edit comment" : "Add comment", onclick: editNote },
        { label: "Remove from project", danger: true, onclick: () => withUndo("Removed from project", ["projects"], () => removeSource(p.id, s.id)) },
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
          h("p", { class: "small muted" }, `Keep the ${useful.length} useful source${useful.length > 1 ? "s" : ""} in collections (leave empty for this project only):`),
          all,
          h("div", { class: "finish-list" }, useful.map((s) => h("div", { class: "tabrow" },
            h("img", { src: faviconFor(s.url, 16), loading: "lazy", alt: "" }),
            h("a", { href: s.url, target: "_blank" }, s.title),
            (inputs[s.id] = h("input", { class: "input", list: "paths", value: p.collection ? pathLabel(p.collection) : "", placeholder: "Collection" }))))))
      : h("p", { class: "small muted" }, "No sources marked useful."),
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

function exportAllProjects() {
  if (!data.projects.length) return showToast("No projects to export");
  const marks = Object.values(data.notes).flatMap((n) => n.highlights.map((x) => ({ url: n.url, text: x.text })));
  downloadMd(`Projects ${new Date().toISOString().slice(0, 10)}`, data.projects.map((p) => projectMarkdown(p, marks)).join("\n\n---\n\n"));
}

function viewProject() {
  const p = data.projects.find((x) => x.id === state.col);
  if (!p) { setHead("Project", ""); setTools(); return emptyEl("Project not found", ""); }
  const c = projectProgress(p);
  const done = p.status === "finished";
  setHead(p.name, done
    ? `finished ${stamp(p.finishedAt)} · ${c.useful} useful of ${c.total}`
    : c.total ? `${c.sorted} of ${c.total} sorted · ${c.useful} useful` : `${p.tabs.length} working tabs`);

  const workingBtn = h("button", { class: "btn", disabled: done }, "…");
  Promise.all([getWorkingOn(), thisWindowId()]).then(([w, win]) => {
    const on = w[win] === p.id;
    workingBtn.textContent = on ? "● Tracking this window" : "Track this window";
    workingBtn.title = on ? "New pages in this window join this project's sources. Click to stop." : "New pages you open in this window join this project's sources";
    workingBtn.classList.toggle("primary", on);
    workingBtn.onclick = async () => { await setWorkingOn(win, on ? null : p.id); render(); };
  });

  setTools(
    done ? null : h("button", { class: "btn primary", disabled: !c.unread, onclick: () => readNext(p) }, c.unread ? `▶ Read next (${c.unread})` : "All read"),
    done ? null : workingBtn,
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
  const filters = h("div", { class: "seg" }, [["all", `All ${c.total}`], ["unread", `Unread ${c.unread}`], ["useful", `Useful ${c.useful}`], ["later", `Later ${c.later}`], ["skip", `Not needed ${c.skip}`]].map(([v, l]) =>
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

  return h("div", {},
    c.total ? h("div", { class: "pbar", title: `${pct}% sorted` },
      ["useful", "later", "skip"].map((k) => h("i", { class: `pb-${k}`, style: `width:${(c[k] / c.total) * 100}%` }))) : null,
    c.total ? h("div", { class: "trail-head" }, filters, h("span", { class: "small muted" }, "✓ useful · Later = Inbox · ✕ not needed · ▣ working tab · ✎ comment")) : null,
    c.total
      ? (rows.length ? h("div", { class: "trail" }, rows.map((n) => sourceRow(p, n, collapsed))) : emptyEl("Nothing here", ""))
      : emptyEl("No sources yet", done ? "" : "Press “Track this window”."),
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
