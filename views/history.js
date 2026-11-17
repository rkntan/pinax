// History: one timeline of closed windows, snapshots and tidied tabs (kept 30 days),
// plus the tab-set card shared with projects' working tabs.

// One card for a set of tabs. mode: "history" (temporary entry) or "project" (working tabs).
function tabSetEl(s, mode) {
  const isProject = mode === "project";
  const open = isProject || state.openSessions.has(s.id);
  const counts = {};
  for (const t of s.tabs) if (t.group) counts[t.group] = (counts[t.group] || 0) + 1;
  const toggle = () => { open ? state.openSessions.delete(s.id) : state.openSessions.add(s.id); render(); };
  // a history entry with no tabs left disappears; a project may be empty
  const edit = (fn) => (isProject ? editProject(s.id, fn) : editHistory(s.id, fn));
  const remove = async () => setHistory((await getHistory()).filter((x) => x.id !== s.id));
  const targets = data.projects.filter((x) => x.id !== s.id && x.status !== "finished");
  const cols = data.cols.filter((c) => c !== UNSORTED);
  const days = isProject ? null : expiresInDays(s);
  const kind = sessionKind(s);

  // moving a tab out of History takes it out of the entry (it now lives elsewhere)
  const moved = async (i, what) => {
    if (!isProject) await edit((x) => x.tabs.splice(i, 1));
    flash(what);
  };

  const tabRow = (t, i) => h("div", { class: "tabrow" },
    h("img", { src: faviconFor(t.url, 16), loading: "lazy", alt: "" }),
    h("a", { href: t.url, target: "_blank", title: t.url }, t.title || t.url),
    t.group ? h("span", { class: "grp" }, t.group) : null,
    isProject ? null : h("button", {
      class: "link small", title: "Open it and take it out of History",
      onclick: async () => { chrome.tabs.create({ url: t.url, active: false }); await moved(i, "Restored"); },
    }, "Restore"),
    h("button", { class: "link small", onclick: async () => { await saveForLater(t); await moved(i, "Saved to Inbox"); } }, "→ Inbox"),
    targets.length
      ? h("select", {
          title: "Add to a project's sources",
          onchange: async (e) => {
            const id = e.target.value;
            e.target.value = "";
            if (!id) return;
            await addSource(id, t);
            await moved(i, `Added to ${targets.find((p) => p.id === id)?.name}`);
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
        await moved(i, `Kept in ${pathLabel(cleanPath(path))}`);
      },
    }, h("option", { value: "" }, "→ Collection"), cols.map((c) => h("option", { value: c }, pathLabel(c))), h("option", { value: "__new" }, "+ New…")),
    h("button", { class: "link small", onclick: () => { pinSite(t); flash("Pinned"); } }, "Pin"),
    h("button", { class: "link small", title: isProject ? "Remove this tab" : "Delete this tab", onclick: () => withUndo(isProject ? "Tab removed" : "Tab deleted", [isProject ? "projects" : "history"], () => edit((x) => x.tabs.splice(i, 1))) }, "×"));

  const promote = async () => {
    const n = prompt("Project name:", s.name.replace(/^.*? · /, "").replace(/^(closed window|\d+ idle tab).*$/, ""));
    if (!n) return;
    const p = await promoteSession(s.id, n.trim());
    if (p) go("project", p.id);
  };

  return h("div", { class: `session k-${kind}` },
    h("div", { class: "session-head" },
      isProject ? null : h("span", { class: "kind" }, HISTORY_KINDS[kind] || kind),
      h("h3", { onclick: isProject ? null : toggle, title: open ? "Hide tabs" : "Show tabs" }, s.name),
      h("span", { class: "muted small" }, `${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`),
      days != null ? h("span", { class: `expires${days <= 5 ? " soon" : ""}`, title: `History keeps things ${SESSION_DAYS} days. Move what you want to keep to a project, the Inbox or a collection.` }, `expires in ${days}d`) : null,
      h("button", { class: isProject ? "btn primary" : "btn", disabled: !s.tabs.length, onclick: () => restoreTabs(s.tabs) }, isProject ? "Open all" : "Restore all"),
      isProject ? null : h("button", { class: "btn", onclick: promote }, "Make project"),
      isProject ? null : h("button", { class: "link small", onclick: toggle }, open ? "Hide" : "Show tabs"),
      // a project's own header has Rename / Delete
      isProject ? null : h("button", { class: "link small", onclick: () => { const n = prompt("Name", s.name); if (n) edit((x) => (x.name = n)); } }, "Rename"),
      isProject ? null : h("button", { class: "link small", onclick: () => withUndo(`Deleted “${s.name}”`, ["history"], remove) }, "Delete")),
    Object.keys(counts).length ? h("div", { class: "chips" }, Object.entries(counts).map(([g, n]) => h("span", { class: "chip" }, `${g} ${n}`))) : null,
    open ? h("div", { class: "tablist" },
      s.tabs.length ? s.tabs.map(tabRow) : h("div", { class: "muted small" }, "No tabs yet. Use “Update from this window”, or mark sources with ▣.")) : null);
}

// Short message at the bottom of the sidebar.
let flashBase = null, flashTimer = null;
function flash(text) {
  const line = $("ai-line");
  if (flashBase === null) flashBase = line.textContent;
  line.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (line.textContent === text) line.textContent = flashBase; flashBase = null; }, 2500);
}

function sessionHit(s) {
  return !state.q || (s.name + " " + s.tabs.map((t) => t.title + " " + t.url).join(" ")).toLowerCase().includes(state.q);
}

// Tidy controls (shown in Settings).
function tidyTools() {
  const days = h("select", {
    onchange: async (e) => { tidyPrefs.tidyDays = Number(e.target.value); await chrome.storage.local.set({ tidyDays: tidyPrefs.tidyDays }); },
  }, [1, 3, 7, 14, 30].map((d) => h("option", { value: d, selected: d === tidyPrefs.tidyDays }, `${d} day${d > 1 ? "s" : ""}`)));
  const now = h("button", {
    class: "btn", disabled: true,
    onclick: async () => {
      now.disabled = true;
      const n = await tidyTabs(tidyPrefs.tidyDays);
      now.textContent = n ? `Tidied ${n}` : "Nothing idle";
    },
  }, "Checking…");
  idleTabs(tidyPrefs.tidyDays).then((list) => {
    now.textContent = list.length ? `Tidy ${list.length} idle tab${list.length > 1 ? "s" : ""} now` : "No idle tabs";
    now.disabled = !list.length;
  });
  return [
    h("label", { class: "small" }, "Tidy tabs idle for ", days),
    h("label", { class: "small check" },
      h("input", { type: "checkbox", checked: tidyPrefs.autoTidy, onchange: (e) => { tidyPrefs.autoTidy = e.target.checked; chrome.storage.local.set({ autoTidy: e.target.checked }); } }),
      "automatically (hourly)"),
    now,
  ];
}
let tidyPrefs = { ...TIDY_DEFAULTS };
let autoSessionOn = true;

function viewHistory() {
  const all = data.history.filter((s) => isTemporary(s) && sessionHit(s));
  const counts = {};
  all.forEach((s) => (counts[sessionKind(s)] = (counts[sessionKind(s)] || 0) + 1));
  const kind = state.hkind || "all";
  const list = all.filter((s) => kind === "all" || sessionKind(s) === kind).sort((a, b) => b.saved - a.saved);
  setHead("History", `kept ${SESSION_DAYS} days · restore anything, or move it somewhere to keep it`);

  $("tools").replaceChildren(
    ...[["all", "All"], ...Object.entries(HISTORY_KINDS)].map(([k, label]) =>
      h("button", { class: `chip${kind === k ? " on" : ""}`, onclick: () => { state.hkind = k; render(); } },
        `${label}${k === "all" || k === "tidied" ? "" : "s"} ${k === "all" ? all.length : counts[k] || 0}`)),
    h("span", { class: "spacer" }),
    h("button", { class: "link small", onclick: () => go("settings") }, "Tidy and history settings"));

  if (!list.length) {
    return emptyEl("Nothing in History", "Closed windows (2+ tabs), “Snapshot window” from the popup and tabs closed by Tidy land here for 30 days.");
  }
  const out = [];
  let lastDay = "";
  for (const s of list) {
    const day = new Date(s.saved).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    if (day !== lastDay) { out.push(h("h3", { class: "day" }, day)); lastDay = day; }
    out.push(tabSetEl(s, "history"));
  }
  return h("div", {}, out);
}
