// Ctrl+K quick search: jump to any page, collection, project, trail source or word.

// Pure: scores a label against the query words (all words must match; earlier matches rank higher).
function quickScore(text, words) {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) return -1;
    score += i === 0 ? 30 : /\W/.test(t[i - 1] || " ") ? 20 : 10 - Math.min(i, 9) / 10;
  }
  return score;
}

function quickEntries() {
  const out = [];
  for (const c of data.cols) out.push({ kind: "Collection", label: pathLabel(c), go: () => go("col", c) });
  for (const p of data.projects) {
    out.push({ kind: "Project", label: p.name, go: () => go("project", p.id) });
    for (const s of p.sources || []) out.push({ kind: "Source", label: s.title, sub: `${p.name} · ${hostOf(s.url)}`, fav: s.url, go: () => window.open(s.url, "_blank") });
  }
  for (const it of data.items) out.push({ kind: it.stage === "inbox" ? "Inbox" : "Page", label: it.title, sub: `${pathLabel(it.path)} · ${hostOf(it.url)}`, extra: `${it.url} ${(it.tags || []).join(" ")} ${it.why}`, fav: it.url, go: () => window.open(it.url, "_blank") });
  for (const n of Object.values(data.notes)) out.push({ kind: "Note", label: n.title, sub: n.highlights[0]?.text || n.text.slice(0, 80), extra: `${n.text} ${n.summary?.text || ""} ${n.highlights.map((x) => `${x.text} ${x.comment}`).join(" ")}`, fav: n.url, go: () => { setSearch(n.title); go("notes"); } });
  for (const p of data.pins) out.push({ kind: "Pin", label: p.title, sub: hostOf(p.url), fav: p.url, go: () => window.open(p.url, "_blank") });
  for (const w of data.phrases) out.push({ kind: w.kind === "quote" ? "Quote" : "Word", label: w.text, sub: w.translation || w.ai?.definition || w.title, go: () => { state.pkind = w.kind === "quote" ? "quotes" : "vocab"; setSearch(w.text); go("phrases"); } });
  const views = [["Inbox", "inbox"], ["Weekly review", "review"], ["All pages", "all"], ["Notes", "notes"], ["Phrasebook", "phrases"], ["History", "history"], ["Mind map", "map"]];
  for (const [label, v] of views) out.push({ kind: "View", label, go: () => go(v) });
  return out;
}

function openQuick() {
  if (document.querySelector(".quick-back")) return;
  const entries = quickEntries();
  let sel = 0, shown = [];
  const input = h("input", { class: "input", placeholder: "Jump to a page, collection, project or word…", spellcheck: "false" });
  const list = h("div", { class: "quick-list" });
  const close = () => back.remove();
  const pick = (e) => { close(); e?.go(); };
  const draw = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = words.length
      ? entries.map((e) => ({ e, s: Math.max(quickScore(e.label, words), quickScore(`${e.label} ${e.sub || ""} ${e.extra || ""}`, words) - 15) }))
          .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.e)
      : entries.filter((e) => e.kind === "View" || e.kind === "Project").slice(0, 20);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((e, i) => h("div", {
      class: `quick-row${i === sel ? " on" : ""}`,
      onmousemove: () => { if (sel !== i) { sel = i; draw(); } },
      onclick: () => pick(e),
    },
      e.fav ? h("img", { src: faviconFor(e.fav, 16), alt: "" }) : h("span", { class: "qi" }),
      h("span", { class: "ql" }, e.label),
      e.sub ? h("span", { class: "qs" }, e.sub) : null,
      h("span", { class: "qk" }, e.kind))) : [h("div", { class: "quick-empty" }, "No matches")]));
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[sel]); }
    else if (e.key === "Escape") close();
  });
  const back = h("div", { class: "quick-back", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "quick" }, input, list,
      h("div", { class: "quick-foot small muted" }, "↑↓ move · Enter open · Esc close")));
  document.body.append(back);
  draw();
  input.focus();
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openQuick(); }
});
