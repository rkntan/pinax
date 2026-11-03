// Phrasebook: words, phrases and quotes saved from pages, grouped by week.

function phraseHit(p) {
  const q = state.q;
  return !q || [p.text, p.sentence, p.note, p.translation, p.ai?.definition, p.title, p.url].join(" ").toLowerCase().includes(q);
}

function sentenceEl(p) {
  const [a, b, c] = highlightParts(p.sentence, p.text);
  return h("blockquote", { class: "ph-ctx" }, a, b ? h("mark", {}, b) : null, c);
}

function noteEl(p) {
  const edit = () => {
    const n = prompt("Your note:", p.note || "");
    if (n !== null) updatePhrase(p.id, { note: n.trim() });
  };
  return p.note
    ? h("div", { class: "ph-note", title: "Edit note", onclick: edit }, p.note)
    : h("button", { class: "link small", onclick: edit }, "+ Note");
}

function sourceEl(p) {
  if (!p.url) return h("span", { class: "muted small" }, stamp(p.created));
  return h("span", { class: "ph-src" },
    h("img", { src: faviconFor(p.url, 16), alt: "" }),
    h("a", { href: p.url, target: "_blank", title: p.url }, p.title || hostOf(p.url)),
    h("span", { class: "muted" }, ` · ${stamp(p.created)}`));
}

function wordCard(p, fresh) {
  const def = p.ai?.definition
    ? h("div", { class: "ph-def" }, h("span", { class: "ai-tag", title: "Written by the local AI; check a dictionary if unsure" }, "AI"), p.ai.definition)
    : h("div", { class: "ph-def muted" }, p.needsAi ? "Looking up with local AI when it's ready…" : "No AI note: use a dictionary below.");
  return h("article", { class: `phrase${fresh ? " fresh" : ""}${p.again ? " again" : ""}` },
    h("div", { class: "ph-head" },
      h("span", { class: "ph-text" }, p.text),
      h("span", { class: "lang", title: langName(p.lang) }, p.lang.toUpperCase()),
      p.ai?.pos ? h("span", { class: "muted small" }, p.ai.pos) : null,
      p.seen > 1 ? h("span", { class: "chip", title: "Times you saved it" }, `${p.seen}×`) : null,
      p.again ? h("span", { class: "chip lime", title: "Marked “Again” in the quiz" }, "again") : null),
    def,
    p.translation ? h("div", { class: "ph-tr" }, "→ ", p.translation) : null,
    p.sentence ? sentenceEl(p) : null,
    p.ai?.example ? h("div", { class: "ph-ex" }, h("span", { class: "muted" }, "e.g. "), p.ai.example) : null,
    noteEl(p),
    h("div", { class: "ph-foot" },
      sourceEl(p),
      h("span", { class: "spacer" }),
      dictLinks(p.text, p.lang).map(([name, url]) => h("a", { class: "dict", href: url, target: "_blank" }, name)),
      h("button", { class: "link small", title: "Delete", onclick: () => withUndo(`Deleted “${p.text}”`, ["phrases"], () => deletePhrase(p.id)) }, "×")));
}

function quoteCard(p) {
  return h("article", { class: "phrase quote" },
    h("blockquote", { class: "ph-quote" }, p.text),
    noteEl(p),
    h("div", { class: "ph-foot" },
      sourceEl(p),
      h("span", { class: "spacer" }),
      h("button", { class: "link small", onclick: () => navigator.clipboard.writeText(`"${p.text}" (${p.title || ""} ${p.url})`) }, "Copy"),
      h("button", { class: "link small", title: "Delete", onclick: () => withUndo("Quote deleted", ["phrases"], () => deletePhrase(p.id)) }, "×")));
}

function byWeek(list, render) {
  const out = [];
  const thisWeek = weekStart();
  let last = null;
  for (const p of list) {
    const w = weekStart(p.created);
    if (w !== last) {
      const label = w === thisWeek ? "This week"
        : w === thisWeek - 7 * 864e5 ? "Last week"
        : "Week of " + new Date(w).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      out.push(h("h3", { class: "section-title" }, label));
      out.push(h("div", { class: "ph-grid" }));
      last = w;
    }
    out[out.length - 1].append(render(p));
  }
  return out;
}

function viewPhrasebook() {
  const all = data.phrases;
  const vocab = all.filter((p) => p.kind !== "quote");
  const quotes = all.filter((p) => p.kind === "quote");
  const thisWeek = vocab.filter((p) => p.created >= weekStart()).length;
  setHead("Phrasebook", `${vocab.length} words · ${quotes.length} quotes · ${thisWeek} this week`);

  const kindSeg = h("div", { class: "seg" }, [["vocab", "Words"], ["quotes", "Quotes"]].map(([v, l]) =>
    h("button", { class: state.pkind === v ? "on" : null, onclick: () => { state.pkind = v; state.lang = "All"; render(); } }, l)));
  const base = (state.pkind === "quotes" ? quotes : vocab).filter(phraseHit);
  const langs = {};
  base.forEach((p) => (langs[p.lang] = (langs[p.lang] || 0) + 1));
  const langChips = Object.keys(langs).length > 1
    ? ["All", ...Object.keys(langs).sort((a, b) => langs[b] - langs[a])].map((l) =>
        h("button", { class: `chip${state.lang === l ? " on" : ""}`, title: l === "All" ? "" : langName(l), onclick: () => { state.lang = l; render(); } },
          l === "All" ? `All ${base.length}` : `${l.toUpperCase()} ${langs[l]}`))
    : [];
  const addIn = h("input", { class: "input", placeholder: "Add a word or phrase…", style: "width:200px" });
  const add = h("form", {
    class: "add",
    onsubmit: async (e) => {
      e.preventDefault();
      const p = await savePhrase({ text: addIn.value });
      addIn.value = "";
      if (p) enrichPhrase(p.id);
    },
  }, addIn, h("button", { class: "btn" }, "Add"));
  $("tools").replaceChildren(kindSeg, ...langChips, h("span", { class: "spacer" }),
    forReviewWords().length ? h("button", { class: "btn primary", onclick: () => { state.rtab = "words"; go("review"); } }, `Quiz ${forReviewWords().length} words`) : null,
    add);

  const list = base.filter((p) => state.lang === "All" || p.lang === state.lang).sort((a, b) => b.created - a.created);
  if (!list.length) {
    return emptyEl(all.length ? "Nothing here" : "No words yet",
      "Select a word on any page, then right-click › “Save to Phrasebook”, or press Alt+Shift+W.");
  }
  // the 10 newest words saved this week get highlighted
  const fresh = new Set(list.filter((p) => p.created >= weekStart()).slice(0, 10).map((p) => p.id));
  return h("div", {}, byWeek(list, (p) => (p.kind === "quote" ? quoteCard(p) : wordCard(p, fresh.has(p.id)))));
}

function forReviewWords() {
  return quizQueue(data.phrases);
}
