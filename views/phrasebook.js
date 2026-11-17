// Phrasebook: words and phrases added from pages, one section per language
// (passages are highlights in Notes). Each card: meaning (English), example in the word's
// own language, grammar, tags, pronunciation. Everything on a card can be edited.

const COMMON_LANGS = ["en", "it", "pl", "tr", "de", "fr", "es", "pt", "nl", "ru", "ar", "zh", "ja"];

// Reads the word aloud in its language (the browser's own voices; nothing is sent anywhere).
function speak(text, lang) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    speechSynthesis.speak(u);
  } catch { showToast("This browser has no voice for reading aloud"); }
}

const speakBtn = (text, lang, title = "Listen") =>
  h("button", { class: "link small", title, "aria-label": title, onclick: () => speak(text, lang) }, "🔊");

function sentenceEl(p) {
  const [a, b, c] = highlightParts(p.sentence, p.text);
  return h("blockquote", { class: "ph-ctx" }, a, b ? h("mark", {}, b) : null, c);
}

function noteEl(p) {
  const edit = () => {
    const n = prompt("Your comment:", p.note || "");
    if (n !== null) updatePhrase(p.id, { note: n.trim() });
  };
  return p.note
    ? h("div", { class: "ph-note", title: "Edit comment", onclick: edit }, p.note)
    : h("button", { class: "link small", onclick: edit }, "+ Comment");
}

function sourceEl(p) {
  if (!p.url) return h("span", { class: "muted small" }, stamp(p.created));
  return h("span", { class: "ph-src" },
    h("img", { src: faviconFor(p.url, 16), loading: "lazy", alt: "" }),
    h("a", { href: p.url, target: "_blank", title: p.url }, p.title || hostOf(p.url)),
    h("span", { class: "muted" }, ` · ${stamp(p.created)}`));
}

function wordCard(p, fresh) {
  if (state.editing === p.id) return editCard(p);
  const ai = p.ai || {};
  const def = ai.definition
    ? h("div", { class: "ph-def" }, h("span", { class: "ai-tag", title: "Written by the local AI; check a dictionary if unsure" }, "AI"), ai.definition)
    : h("div", { class: "ph-def muted" }, p.needsAi ? "Looking up with local AI when it's ready…" : "No definition yet: edit the card or use a dictionary below.");
  return h("article", { class: `phrase${fresh ? " fresh" : ""}` },
    h("div", { class: "ph-head" },
      h("button", { class: `star${p.fav ? " on" : ""}`, title: p.fav ? "Remove from favourites" : "Favourite", "aria-pressed": String(!!p.fav), onclick: () => updatePhrase(p.id, { fav: !p.fav }) }, p.fav ? "★" : "☆"),
      h("span", { class: "ph-text" }, p.text),
      speakBtn(p.text, p.lang),
      ai.pos ? h("span", { class: "muted small" }, ai.pos) : null,
      ai.gender ? h("span", { class: "chip", title: "Grammatical gender" }, ai.gender) : null,
      p.seen > 1 ? h("span", { class: "chip", title: "Times you added it" }, `${p.seen}×`) : null),
    def,
    ai.forms ? h("div", { class: "ph-forms small muted" }, ai.forms) : null,
    p.translation ? h("div", { class: "ph-tr" }, "→ ", p.translation) : null,
    p.sentence ? sentenceEl(p) : null,
    ai.example ? h("div", { class: "ph-ex" }, h("span", { class: "muted" }, "e.g. "), ai.example, " ", speakBtn(ai.example, p.lang, "Listen to the example")) : null,
    (p.tags || []).length ? h("div", { class: "ph-tags" }, p.tags.map((t) => h("button", { class: "chip", onclick: () => { state.tag = t; render(); } }, `#${t}`))) : null,
    noteEl(p),
    h("div", { class: "ph-foot" },
      sourceEl(p),
      h("span", { class: "spacer" }),
      dictLinks(p.text, p.lang).map(([name, url]) => h("a", { class: "dict", href: url, target: "_blank" }, name)),
      h("button", { class: "link small", title: "Edit this card", onclick: () => { state.editing = p.id; render(); } }, "Edit"),
      h("button", { class: "link small", title: "Delete", onclick: () => withUndo(`Deleted “${p.text}”`, ["phrases"], () => deletePhrase(p.id)) }, "×")));
}

// The card as a form: fix the language, rewrite the meaning, add tags.
function editCard(p) {
  const ai = p.ai || {};
  const field = (label, el) => h("label", { class: "ph-field" }, h("span", { class: "muted small" }, label), el);
  const text = h("input", { class: "input", value: p.text });
  const lang = h("select", { class: "input" },
    [...new Set([p.lang, ...COMMON_LANGS])].map((l) => h("option", { value: l, selected: l === p.lang }, `${langName(l)} (${l})`)));
  const meaning = h("textarea", { class: "input", rows: 2 }, ai.definition || "");
  const example = h("textarea", { class: "input", rows: 2 }, ai.example || "");
  const gender = h("input", { class: "input", value: ai.gender || "", placeholder: "e.g. il, masculine" });
  const forms = h("input", { class: "input", value: ai.forms || "", placeholder: "e.g. plural: libri" });
  const tr = h("input", { class: "input", value: p.translation || "" });
  const tags = h("input", { class: "input", value: (p.tags || []).join(", "), placeholder: "work, travel" });
  const save = async () => {
    const word = text.value.replace(/\s+/g, " ").trim();
    if (!word) return showToast("The word can't be empty");
    const patch = { text: word, translation: tr.value.trim(), tags: parseTags(tags.value) };
    const changedLang = lang.value !== p.lang;
    const untouched = meaning.value.trim() === (ai.definition || "") && example.value.trim() === (ai.example || "");
    if (changedLang) Object.assign(patch, { lang: lang.value, langLocked: true });
    if (changedLang && untouched) {
      await updatePhrase(p.id, { ...patch, detected: false, translation: "", ai: null, needsAi: true });
      state.editing = null;
      reload();
      return enrichPhrase(p.id); // the meaning and example again, in the right language
    }
    patch.ai = { ...ai, definition: meaning.value.trim(), example: example.value.trim(), gender: gender.value.trim(), forms: forms.value.trim() };
    if (patch.ai.definition) patch.needsAi = false;
    await updatePhrase(p.id, patch);
    state.editing = null;
    reload();
  };
  return h("article", { class: "phrase editing", onkeydown: (e) => { if (e.key === "Escape") { state.editing = null; render(); } } },
    field("Word or phrase", text),
    field("Language (changing it writes the meaning again)", lang),
    field("Meaning (English)", meaning),
    field(`Example (${langName(p.lang)})`, example),
    h("div", { class: "ph-two" }, field("Gender", gender), field("Forms", forms)),
    p.lang !== "en" ? field("English translation", tr) : null,
    field("Tags (comma separated)", tags),
    h("div", { class: "ph-foot" },
      h("button", { class: "btn primary", onclick: save }, "Save"),
      h("button", { class: "btn", onclick: () => { state.editing = null; render(); } }, "Cancel"),
      h("span", { class: "spacer" }),
      h("button", { class: "link small", title: "Ask the local AI again", onclick: async () => {
        await updatePhrase(p.id, { ai: null, needsAi: true });
        state.editing = null;
        reload();
        enrichPhrase(p.id);
      } }, "Rewrite with AI")));
}

// One heading per language (click to fold it away), then that language's cards.
function langSections(order, counts, shown, card) {
  const folded = new Set(prefs.get("phFolded", []));
  const by = new Map();
  shown.forEach((p) => by.set(p.lang, [...(by.get(p.lang) || []), p]));
  return order.flatMap((l) => {
    const off = folded.has(l);
    const toggle = () => { off ? folded.delete(l) : folded.add(l); prefs.set("phFolded", [...folded]); renderPhrasebook(); };
    return [
      h("h3", { class: "section-title ph-lang", role: "button", tabindex: 0, "aria-expanded": String(!off), title: off ? "Show" : "Fold away", onclick: toggle, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } } },
        off ? "▸ " : "▾ ", langName(l), " ", h("span", { class: "muted small" }, `· ${counts[l]}`)),
      off ? null : h("div", { class: "ph-grid" }, (by.get(l) || []).map(card)),
    ];
  });
}
const renderPhrasebook = () => render();

function viewPhrasebook() {
  const all = data.phrases;
  const vocab = all.filter((p) => p.kind !== "quote");
  const thisWeek = vocab.filter((p) => p.created >= weekStart()).length;
  setHead("Phrasebook", `${vocab.length} words · ${thisWeek} this week`);

  const tagCount = {};
  vocab.forEach((p) => (p.tags || []).forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  if (state.tag && !tagCount[state.tag]) state.tag = "";
  const favs = vocab.filter((p) => p.fav).length;
  if (state.favOnly && !favs) state.favOnly = false;

  const { list, counts } = phraseList(all, { lang: "All", tag: state.tag, favOnly: state.favOnly, sort: state.psort, q: state.q });
  if (state.lang !== "All" && !counts[state.lang]) state.lang = "All";
  const shownList = list.filter((p) => state.lang === "All" || p.lang === state.lang);
  const langKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const langChips = langKeys.length > 1
    ? ["All", ...langKeys].map((l) =>
        h("button", { class: `chip${state.lang === l ? " on" : ""}`, title: l === "All" ? "" : langName(l), onclick: () => { state.lang = l; render(); } },
          l === "All" ? `All ${list.length}` : `${l.toUpperCase()} ${counts[l]}`))
    : [];

  const addIn = h("input", { class: "input", placeholder: "Add a word…" });
  const add = h("form", {
    class: "add",
    onsubmit: async (e) => {
      e.preventDefault();
      if (phraseKind(addIn.value) === "quote") return showToast("Too long: highlight it on the page instead");
      const p = await savePhrase({ text: addIn.value });
      addIn.value = "";
      reload(); // the field keeps focus, so the storage-change redraw would wait
      if (p) enrichPhrase(p.id);
    },
  }, addIn, h("button", { class: "btn" }, "Add"));
  // one compact row: language, favourites, top tags, sort, add
  const sort = h("select", { class: "input", title: "Sort words", "aria-label": "Sort words", onchange: (e) => { state.psort = e.target.value; render(); } },
    [["new", "Newest"], ["az", "A–Z"], ["seen", "Most seen"]].map(([v, l]) => h("option", { value: v, selected: v === state.psort }, l)));
  setTools(
    ...langChips,
    favs ? h("button", { class: `chip${state.favOnly ? " on" : ""}`, title: "Favourites only", onclick: () => { state.favOnly = !state.favOnly; render(); } }, `★ ${favs}`) : null,
    Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a] || a.localeCompare(b)).slice(0, 6).map((t) =>
      h("button", { class: `chip${state.tag === t ? " on" : ""}`, onclick: () => { state.tag = state.tag === t ? "" : t; render(); } }, `#${t} ${tagCount[t]}`)),
    h("span", { class: "spacer" }),
    vocab.length ? sort : null,
    add);
  const bar = null;

  if (!shownList.length) {
    return h("div", {}, bar, emptyEl(all.length ? "Nothing here" : "No words yet",
      "Select a word on any page and press Alt+Shift+W."));
  }
  // the 10 newest words saved this week get highlighted
  const fresh = new Set(shownList.filter((p) => p.created >= weekStart()).sort((a, b) => b.created - a.created).slice(0, 10).map((p) => p.id));
  const folded = new Set(prefs.get("phFolded", []));
  const { shown, more } = pageOf("words", shownList.filter((p) => !folded.has(p.lang)));
  const order = [...new Set(shownList.map((p) => p.lang))];
  return h("div", {}, bar, langSections(order, counts, shown, (p) => wordCard(p, fresh.has(p.id))), more);
}

function exportWords() {
  const day = new Date().toISOString().slice(0, 10);
  saveFile(`pinax-phrasebook-${day}.csv`, phrasesCsv(data.phrases), "text/csv;charset=utf-8");
  showToast("Phrasebook exported: open it in a spreadsheet or import it into Anki");
}
