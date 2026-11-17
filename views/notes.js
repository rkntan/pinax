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

function highlightsEl(n, role = null) {
  const list = role ? n.highlights.filter((x) => (x.color || "yellow") === role) : n.highlights;
  return h("div", { class: "nhl" }, list.map((x) => h("blockquote", { style: `--c:${HL_COLORS[x.color] || HL_COLORS.yellow}` },
    h("span", { class: "nhl-role" }, roleOf(x)), x.text, x.comment ? h("div", { class: "nhl-c" }, x.comment) : null)));
}

function noteCard(n, itemByKey) {
  const it = itemByKey.get(n.url);
  const where = it ? (it.stage === "kept" ? pathLabel(it.path) : "Inbox") : null;
  return h("article", { class: "note" },
    h("div", { class: "note-head" },
      h("img", { src: faviconFor(n.url, 16), loading: "lazy", alt: "" }),
      h("a", { class: "title", href: n.url, target: "_blank", title: n.url }, n.title),
      h("span", { class: "muted small" }, [hostOf(n.url), where, stamp(n.updated)].filter(Boolean).join(" · "))),
    n.highlights.length ? highlightsEl(n, state.role) : null,
    n.text.trim() ? h("div", { class: "note-text" }, n.text) : null,
    n.summary?.text ? h("div", { class: "note-sum" },
      h("div", { class: "muted small" }, h("span", { class: "ai-tag" }, "AI"), ` ${n.summary.source === "page" ? "Summary of the page" : "Key ideas from your highlights"} · ${stamp(n.summary.at)}`),
      h("div", { class: "note-sum-text" }, n.summary.text)) : null,
    h("div", { class: "note-foot" },
      h("span", { class: "muted small" }, `${n.highlights.length} highlight${n.highlights.length === 1 ? "" : "s"}${n.text.trim() ? " · notes" : ""}`),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => openWithNotes(n) }, "Open with Notes"),
      n.highlights.length || n.text.trim() ? h("button", {
        class: "link small", title: "Key ideas from your highlights and notes (local AI)",
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = "✦ Summarising…";
          try { await summariseNote(n, "highlights", "", flash); } catch (err) { flash(err.message); e.target.disabled = false; e.target.textContent = "✦ Key ideas"; }
        },
      }, n.summary ? "✦ Redo key ideas" : "✦ Key ideas") : null,
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
  const roles = roleCounts(all);
  if (state.role && !roles.some(([k]) => k === state.role)) state.role = null;
  const list = all.filter((n) => noteHit(n, state.q) && (!state.role || n.highlights.some((x) => (x.color || "yellow") === state.role)));
  const hl = all.reduce((a, n) => a + n.highlights.length, 0);
  setHead("Notes", `${all.length} page${all.length === 1 ? "" : "s"} · ${hl} highlight${hl === 1 ? "" : "s"}`);
  $("tools").replaceChildren(
    ...(roles.length > 1
      ? [["", "All"], ...roles].map(([k, label, c]) => h("button", { class: `chip${(state.role || "") === k ? " on" : ""}`, onclick: () => { state.role = k || null; render(); } },
          k ? h("i", { class: "dot", style: `background:${HL_COLORS[k]}` }) : null, c ? `${label} ${c}` : label))
      : [h("span", { class: "small muted" }, "Select text on any page you allowed: a small bar lets you highlight it as Key point, Idea, Question or Check.")]),
    h("span", { class: "spacer" }),
    list.length ? h("button", {
      class: "btn",
      onclick: () => downloadMd(`Notes ${new Date().toISOString().slice(0, 10)}`, `# Notes\n\n${list.map((n) => noteMarkdown(n, "##")).join("\n")}`),
    }, `Export ${list.length === all.length ? "all" : list.length} (.md)`) : null);
  if (!list.length) {
    return emptyEl(all.length ? "No matches" : "No notes yet", "Open any article, select a passage and highlight it. Your notes and highlights stay linked to the page.");
  }
  const itemByKey = new Map();
  for (const x of data.items) if (!itemByKey.has(pageKey(x.url))) itemByKey.set(pageKey(x.url), x);
  const { shown, more } = pageOf("notes", list);
  return h("div", {}, h("div", { class: "notes" }, shown.map((n) => noteCard(n, itemByKey))), more);
}
