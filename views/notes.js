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

function highlightsEl(n, role = null) {
  const list = role ? n.highlights.filter((x) => (x.color || "yellow") === role) : n.highlights;
  return h("div", { class: "nhl" }, list.map((x) => h("blockquote", { style: `--c:${HL_COLORS[x.color] || HL_COLORS.yellow}` },
    h("span", { class: "nhl-role" }, roleOf(x)), x.text, x.comment ? h("div", { class: "nhl-c" }, x.comment) : null,
    h("button", { class: "link small", title: "Add to my research note", onclick: () => addHighlightToNote(n, x) }, "+ Note"))));
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
      moreMenu([
        n.highlights.length || n.text.trim() ? { label: n.summary ? "Redo key ideas (local AI)" : "Key ideas (local AI)", onclick: async () => {
          flash("Summarising…");
          try { await summariseNote(n, "highlights", "", flash); } catch (err) { flash(err.message); }
        } } : null,
        it ? null : { label: "Save to Inbox", onclick: () => saveForLater(n) },
        { label: "Delete notes", danger: true, onclick: () => withUndo(`Notes deleted for “${n.title}”`, ["notes"], async () => {
          const all = await getNotes();
          delete all[n.url];
          await setNotes(all);
        }) },
      ])));
}

function exportAllNotes() {
  const all = noteRecords();
  if (!all.length) return showToast("No notes to export");
  const where = new Map(data.items.map((x) => [pageKey(x.url), x.stage === "kept" ? pathLabel(x.path) : ""]));
  saveFile(`pinax-notes-${new Date().toISOString().slice(0, 10)}.zip`, notesZip(all, (n) => where.get(n.url) || ""), "application/zip");
  showToast("Notes exported: one file per page, ready for Obsidian");
}

function viewNotes() {
  const all = noteRecords();
  const roles = roleCounts(all);
  if (state.role && !roles.some(([k]) => k === state.role)) state.role = null;
  const list = all.filter((n) => noteHit(n, state.q) && (!state.role || n.highlights.some((x) => (x.color || "yellow") === state.role)));
  const hl = all.reduce((a, n) => a + n.highlights.length, 0);
  setHead("Notes", `${all.length} page${all.length === 1 ? "" : "s"} · ${hl} highlight${hl === 1 ? "" : "s"}`);
  setTools(
    ...(roles.length > 1
      ? [["", "All"], ...roles].map(([k, label, c]) => h("button", { class: `chip${(state.role || "") === k ? " on" : ""}`, onclick: () => { state.role = k || null; render(); } },
          k ? h("i", { class: "dot", style: `background:${HL_COLORS[k]}` }) : null, c ? `${label} ${c}` : label))
      : []),
    h("span", { class: "spacer" }));
  if (!list.length) {
    return emptyEl(all.length ? "No matches" : "No notes yet", "Highlight a passage on any page.");
  }
  const itemByKey = new Map();
  for (const x of data.items) if (!itemByKey.has(pageKey(x.url))) itemByKey.set(pageKey(x.url), x);
  const { shown, more } = pageOf("notes", list);
  return h("div", {}, h("div", { class: "notes" }, shown.map((n) => noteCard(n, itemByKey))), more);
}

// Puts a highlight into the note you are collecting in (else the project used last).
async function addHighlightToNote(n, hl) {
  const p = pickNoteProject(data.projects, null, await getNoteTarget());
  if (!p) return showToast("Make a project first, then collect clips into it");
  await addClip(p.id, { kind: "text", text: hl.text, caption: hl.comment || "", url: n.url, title: n.title });
  showToast(`Added to “${p.name}”`);
}
