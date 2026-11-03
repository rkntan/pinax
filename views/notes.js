// Notes: every page you highlighted or wrote notes on, newest first.

function noteRecords() {
  return Object.values(data.notes).sort((a, b) => b.updated - a.updated);
}

function notesForUrl(url) {
  return data.notes[pageKey(url)] || null;
}

// Opens the page with the notes panel beside it (the panel follows the active tab).
async function openWithNotes(n) {
  const me = await chrome.tabs.getCurrent();
  chrome.sidePanel.open({ windowId: me.windowId }).catch(() => {}); // must run right after the click
  await chrome.tabs.create({ url: n.url, windowId: me.windowId });
}

function downloadMd(name, md) {
  navigator.clipboard?.writeText(md).catch(() => {});
  const a = h("a", { href: URL.createObjectURL(new Blob([md], { type: "text/markdown" })), download: `${name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.md` });
  a.click();
  URL.revokeObjectURL(a.href);
}

function highlightsEl(n) {
  return h("div", { class: "nhl" }, n.highlights.map((x) => h("blockquote", { style: `--c:${HL_COLORS[x.color] || HL_COLORS.yellow}` },
    x.text, x.comment ? h("div", { class: "nhl-c" }, x.comment) : null)));
}

function noteCard(n) {
  const it = data.items.find((x) => pageKey(x.url) === n.url);
  const where = it ? (it.stage === "kept" ? pathLabel(it.path) : "Inbox") : null;
  return h("article", { class: "note" },
    h("div", { class: "note-head" },
      h("img", { src: n.favIconUrl || faviconFor(n.url, 16), alt: "" }),
      h("a", { class: "title", href: n.url, target: "_blank", title: n.url }, n.title),
      h("span", { class: "muted small" }, [hostOf(n.url), where, stamp(n.updated)].filter(Boolean).join(" · "))),
    n.highlights.length ? highlightsEl(n) : null,
    n.text.trim() ? h("div", { class: "note-text" }, n.text) : null,
    h("div", { class: "note-foot" },
      h("span", { class: "muted small" }, `${n.highlights.length} highlight${n.highlights.length === 1 ? "" : "s"}${n.text.trim() ? " · notes" : ""}`),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => openWithNotes(n) }, "Open with notes"),
      it ? null : h("button", { class: "link small", onclick: () => saveForLater(n) }, "→ Inbox"),
      h("button", { class: "link small", onclick: () => downloadMd(n.title, noteMarkdown(n, "#")) }, "Export"),
      h("button", {
        class: "link small",
        onclick: () => withUndo(`Notes deleted for “${n.title}”`, ["notes"], async () => {
          const all = await getNotes();
          delete all[n.url];
          await setNotes(all);
        }),
      }, "Delete")));
}

function viewNotes() {
  const all = noteRecords();
  const list = all.filter((n) => noteHit(n, state.q));
  const hl = all.reduce((a, n) => a + n.highlights.length, 0);
  setHead("Notes", `${all.length} page${all.length === 1 ? "" : "s"} · ${hl} highlight${hl === 1 ? "" : "s"}`);
  $("tools").replaceChildren(
    h("span", { class: "small muted" }, "Highlight on a page: select text › right-click › “Highlight (page notes)”, or the ✎ Notes button in the popup."),
    h("span", { class: "spacer" }),
    list.length ? h("button", {
      class: "btn",
      onclick: () => downloadMd(`Notes ${new Date().toISOString().slice(0, 10)}`, `# Notes\n\n${list.map((n) => noteMarkdown(n, "##")).join("\n")}`),
    }, `Export ${list.length === all.length ? "all" : list.length} (.md)`) : null);
  if (!list.length) {
    return emptyEl(all.length ? "No matches" : "No notes yet", "Open any article, select a passage and highlight it. Your notes and highlights stay linked to the page.");
  }
  return h("div", { class: "notes" }, list.map(noteCard));
}
