// Projects: named tab sets in the sidebar and the project view (formerly "workspaces").
// Phase 3 adds sources, the trail tree and reading mode.

// The tabs of the window this Library tab is in, without the Library tab itself.
async function thisWindowTabs() {
  const me = await chrome.tabs.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: me.windowId });
  return tabs.filter((t) => t.id !== me.id && /^https?:/.test(t.url));
}

function viewProject() {
  const p = data.projects.find((x) => x.id === state.col);
  if (!p) { setHead("Project", ""); $("tools").replaceChildren(); return emptyEl("Project not found", "It may have been deleted."); }
  setHead(p.name, `project · ${p.tabs.length} tabs · updated ${stamp(p.updated || p.created)}`);
  $("tools").replaceChildren(
    h("button", {
      class: "btn",
      onclick: async () => {
        const tabs = await thisWindowTabs();
        if (!tabs.length) return alert("No web tabs in this window besides the Library.");
        if (confirm(`Replace the tabs of "${p.name}" with the ${tabs.length} tabs in this window?`)) await updateProject(p.id, tabs);
      },
    }, "Update from this window"),
    h("button", {
      class: "link small",
      onclick: async () => {
        const url = prompt("Add a page (paste its address):", "https://");
        if (url && /^https?:\/\/.+/.test(url)) await addTabToProject(p.id, { url, title: hostOf(url) });
      },
    }, "+ Add page"));
  return tabSetEl(p, "project");
}

function renderProjects() {
  const box = $("ws-list");
  box.replaceChildren();
  const list = [...data.projects].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) box.append(h("div", { class: "ws-empty" }, "Make one from a session, or press +."));
  for (const p of list) {
    const row = h("div", { class: "ws-row" },
      h("button", { class: `nav${state.view === "project" && state.col === p.id ? " on" : ""}`, onclick: () => go("project", p.id), title: p.name },
        h("span", { class: "node-name" }, p.name), h("span", { class: "n" }, String(p.tabs.length))),
      h("button", { class: "ws-open", title: "Open all tabs in a new window", onclick: () => restoreTabs(p.tabs) }, "Open"));
    // drop a page row here to add it to the project
    dropTarget(row, (id) => { const it = data.items.find((x) => x.id === id); if (it) addTabToProject(p.id, it); });
    box.append(row);
  }
}

$("ws-add").onclick = async () => {
  const name = prompt("New project name (it starts with the tabs of this window):");
  if (!name) return;
  const p = await addProject(name.trim(), await thisWindowTabs());
  go("project", p.id);
};
