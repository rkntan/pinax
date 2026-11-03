// History: temporary sessions and the tidy archive, plus the tab-set card shared with projects.

// One card for a set of tabs. mode: "session" (temporary, can become a project),
// "archive" (closed by Tidy) or "project" (permanent).
function tabSetEl(s, mode) {
  const isProject = mode === "project";
  const open = isProject || state.openSessions.has(s.id);
  const counts = {};
  for (const t of s.tabs) if (t.group) counts[t.group] = (counts[t.group] || 0) + 1;
  const toggle = () => { open ? state.openSessions.delete(s.id) : state.openSessions.add(s.id); render(); };
  // a session or archive entry with no tabs left disappears; a project may be empty
  const edit = (fn) => (isProject ? editProject(s.id, fn) : editHistory(s.id, fn));
  const remove = () => (isProject ? deleteProject(s.id) : setHistory(data.history.filter((x) => x.id !== s.id)));
  const targets = data.projects.filter((x) => x.id !== s.id);
  const days = isTemporary(s) && !isProject ? expiresInDays(s) : null;

  const tabRow = (t, i) => h("div", { class: "tabrow" },
    h("img", { src: t.favIconUrl || faviconFor(t.url, 16), alt: "" }),
    h("a", { href: t.url, target: "_blank", title: t.url }, t.title || t.url),
    t.group ? h("span", { class: "grp" }, t.group) : null,
    targets.length
      ? h("select", {
          title: "Add to a project",
          onchange: (e) => { if (e.target.value) addSource(e.target.value, t); e.target.value = ""; },
        }, h("option", { value: "" }, "→ Project"), targets.map((w) => h("option", { value: w.id }, w.name)))
      : null,
    h("button", { class: "link small", onclick: () => saveForLater(t) }, "To Inbox"),
    h("button", { class: "link small", onclick: () => pinSite(t) }, "Pin"),
    mode === "archive"
      ? h("button", { class: "link small", onclick: async () => { chrome.tabs.create({ url: t.url }); await edit((x) => x.tabs.splice(i, 1)); } }, "Restore")
      : h("button", { class: "link small", title: "Remove this tab", onclick: () => edit((x) => x.tabs.splice(i, 1)) }, "×"));

  const promote = async () => {
    const n = prompt("Project name:", s.name.replace(/^.*? · /, "").replace(/^closed window.*$/, ""));
    if (!n) return;
    const p = await promoteSession(s.id, n.trim());
    if (p) go("project", p.id);
  };

  return h("div", { class: "session" },
    h("div", { class: "session-head" },
      h("h3", { onclick: isProject ? null : toggle, title: open ? "Hide tabs" : "Show tabs" }, s.name),
      h("span", { class: "muted small" }, `${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`),
      days != null ? h("span", { class: `expires${days <= 5 ? " soon" : ""}`, title: `Temporary sessions are removed after ${SESSION_DAYS} days unless you make them a project` }, `expires in ${days}d`) : null,
      h("button", { class: isProject ? "btn primary" : "btn", disabled: !s.tabs.length, onclick: () => restoreTabs(s.tabs) },
        mode === "archive" ? "Restore all" : isProject ? "Open all" : "Restore"),
      mode === "session" ? h("button", { class: "btn", onclick: promote }, "Make project") : null,
      isProject ? null : h("button", { class: "link small", onclick: toggle }, open ? "Hide" : "Show tabs"),
      // a project's own header has Rename / Delete
      mode === "session" ? h("button", { class: "link small", onclick: () => { const n = prompt("Name", s.name); if (n) edit((x) => (x.name = n)); } }, "Rename") : null,
      isProject ? null : h("button", { class: "link small", onclick: async () => { if (confirm(`Delete "${s.name}"?`)) await remove(); } }, "Delete")),
    Object.keys(counts).length ? h("div", { class: "chips" }, Object.entries(counts).map(([g, n]) => h("span", { class: "chip" }, `${g} ${n}`))) : null,
    open ? h("div", { class: "tablist" },
      s.tabs.length ? s.tabs.map(tabRow) : h("div", { class: "muted small" }, "No tabs yet. Use “Update from this window”, drag pages here from a list, or add from a session.")) : null);
}

function sessionHit(s) {
  return !state.q || (s.name + " " + s.tabs.map((t) => t.title + " " + t.url).join(" ")).toLowerCase().includes(state.q);
}

function viewSessions() {
  const list = data.history.filter((s) => isTemporary(s) && sessionHit(s));
  setHead("Sessions", `temporary · kept ${SESSION_DAYS} days · make the good ones a project`);
  $("tools").replaceChildren(
    h("label", { class: "small check" },
      h("input", { type: "checkbox", checked: autoSessionOn, onchange: (e) => { autoSessionOn = e.target.checked; chrome.storage.local.set({ autoSession: autoSessionOn }); } }),
      "Save a session automatically when I close a window"));
  return list.length ? h("div", {}, list.map((s) => tabSetEl(s, "session")))
    : emptyEl("No sessions", "Use “Save session” in the popup, or close a window with 2+ tabs.");
}
let autoSessionOn = true;

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
  const list = data.history.filter((s) => sessionKind(s) === "tidied" && sessionHit(s));
  setHead("Archive", "tabs closed by Tidy · restore anything");
  $("tools").replaceChildren(...tidyTools());
  if (!list.length) return emptyEl("Archive is empty", "Tabs closed by Tidy (in the popup) land here.");
  const out = [];
  let lastDay = "";
  for (const s of list) {
    const day = new Date(s.saved).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    if (day !== lastDay) { out.push(h("h3", { class: "day" }, day)); lastDay = day; }
    out.push(tabSetEl(s, "archive"));
  }
  return h("div", {}, out);
}
