// Weekly review: Pages (one at a time — keep / discard / next week / pin) and
// Words (this week's 10 words — show meaning, then Got it / Again).

let reviewPath = null;
let reviewKeys = null; // key -> action for the sub-view on screen
const quiz = { reveal: false, got: 0, again: 0 };

function viewReview() {
  const pages = forReview(data.items).sort((a, b) => a.created - b.created);
  const words = quizQueue(data.phrases);
  if (state.rtab === "pages" && !pages.length && words.length) state.rtab = "words";
  setHead("Weekly review", `${pages.length} page${pages.length === 1 ? "" : "s"} · ${words.length} word${words.length === 1 ? "" : "s"}`);
  $("tools").replaceChildren();
  const tabs = h("div", { class: "review-tabs" }, h("div", { class: "seg" },
    [["pages", `Pages ${pages.length}`], ["words", `Words ${words.length}`]].map(([v, l]) =>
      h("button", { class: state.rtab === v ? "on" : null, onclick: () => { state.rtab = v; render(); } }, l))));
  return h("div", {}, statsEl(), tabs, state.rtab === "words" ? reviewWords(words) : reviewPages(pages, words.length));
}

// What you read and saved this week and this month.
function statsEl() {
  const s = readingStats(data.items);
  const part = (label, read, minutes, saved) => h("div", { class: "stat" },
    h("span", { class: "muted small" }, label),
    h("b", {}, `${read} read`),
    minutes ? h("span", { class: "small" }, `≈ ${fmtMinutes(minutes)}`) : null,
    h("span", { class: "muted small" }, `${saved} saved`));
  return h("div", { class: "stats" },
    part("This week", s.weekRead, s.weekMinutes, s.weekSaved),
    part("This month", s.monthRead, s.monthMinutes, s.monthSaved),
    h("div", { class: "stat" }, h("span", { class: "muted small" }, "Still unread"), h("b", {}, String(s.unread)),
      s.unreadMinutes ? h("span", { class: "small" }, `≈ ${fmtMinutes(s.unreadMinutes)}`) : null,
      h("button", { class: "link small", onclick: () => go("queue") }, "Reading queue →")));
}

function reviewPages(queue, wordsLeft) {
  if (!queue.length) {
    const later = data.items.filter((x) => x.stage === "inbox").length;
    return h("div", {},
      emptyEl("Pages done", later
        ? `${later} page${later > 1 ? "s" : ""} pushed to next week. Next review: Friday 16:00.`
        : "Your Inbox is empty. Next review: Friday 16:00."),
      wordsLeft ? h("div", { style: "text-align:center" }, h("button", { class: "btn primary", onclick: () => { state.rtab = "words"; render(); } }, `Now ${wordsLeft} words →`)) : null);
  }
  const it = queue[0];
  const pinned = data.pins.some((p) => p.url === it.url);
  reviewPath = h("input", {
    class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path),
    placeholder: "Collection, e.g. AI › Agents",
    onkeydown: async (e) => { if (e.key === "Enter") { await act("keep"); reload(); } },
  });
  const act = async (what) => {
    const path = reviewPath.value || UNSORTED;
    if (what === "keep") await withUndo(`Kept in ${pathLabel(cleanPath(path))}`, ["items", "collections"], () => keepItem(it.id, path));
    else if (what === "discard") await withUndo(`Discarded “${it.title}”`, ["items"], () => deleteItem(it.id));
    else if (what === "later") await withUndo("Pushed to next week", ["items"], () => laterItem(it.id));
    else if (what === "pin") await (pinned ? unpinSite(it.url) : pinSite(it));
  };
  reviewKeys = { ArrowRight: () => act("keep"), ArrowLeft: () => act("discard"), ArrowDown: () => act("later"), p: () => act("pin"), P: () => act("pin") };
  return h("div", { class: "review" },
    h("div", { class: "count" }, `1 of ${queue.length} · saved ${stamp(it.created)}${isOld(it) ? " · old" : ""}`),
    h("div", { class: `rcard t-${it.type}` },
      h("div", { class: "head" },
        h("img", { src: faviconFor(it.url, 64), alt: "" }),
        h("div", {},
          h("h3", {}, it.title),
          h("div", { class: "meta" }, hostOf(it.url), "·", h("span", { class: "type" }, h("i", { class: "dot", style: "background:var(--type)" }), it.type)))),
      h("span", { class: "why" }, it.why || "No AI note yet."),
      h("div", { class: "meta" },
        h("a", { class: "link", href: it.url, target: "_blank" }, "Open page ↗"),
        it.progress ? `· ${it.progress.done}/${it.progress.total} units` : null,
        it.remindAt ? `· reminder ${shortWhen(it.remindAt)}` : null),
      h("div", { class: "file" }, h("span", { class: "small muted" }, "Keep in"), reviewPath),
      h("div", { class: "decide" },
        h("button", { class: "btn discard", onclick: () => act("discard") }, "Discard", h("kbd", {}, "←")),
        h("button", { class: "btn", onclick: () => act("later") }, "Next week", h("kbd", {}, "↓")),
        h("button", { class: "btn", onclick: () => act("pin") }, pinned ? "Unpin" : "Pin", h("kbd", {}, "P")),
        h("button", { class: "btn primary", onclick: () => act("keep") }, "Keep", h("kbd", {}, "→ / Enter")))));
}

function reviewWords(queue) {
  if (!queue.length) {
    const done = quiz.got + quiz.again;
    return emptyEl("Words done", done
      ? `${quiz.got} known, ${quiz.again} to see again next week.`
      : "No new words this week. Save some with right-click › “Save to Phrasebook” or Alt+Shift+W.");
  }
  const p = queue[0];
  const answer = async (known) => {
    quiz.reveal = false;
    known ? quiz.got++ : quiz.again++;
    await updatePhrase(p.id, { again: !known, quizzedAt: Date.now(), known: (p.known || 0) + (known ? 1 : 0) });
  };
  const show = () => { quiz.reveal = true; render(); };
  reviewKeys = quiz.reveal
    ? { ArrowRight: () => answer(true), ArrowLeft: () => answer(false) }
    : { " ": show, Enter: show, ArrowRight: show };

  return h("div", { class: "review quiz" },
    h("div", { class: "count" }, `1 of ${queue.length}${p.again ? " · from last time" : ""} · saved ${stamp(p.created)}`),
    h("div", { class: "rcard" },
      h("div", { class: "meta" }, h("span", { class: "lang" }, p.lang.toUpperCase()), langName(p.lang), p.ai?.pos ? `· ${p.ai.pos}` : null),
      h("div", { class: "word" }, p.text),
      quiz.reveal
        ? h("div", { class: "reveal" },
            p.ai?.definition ? h("div", { class: "ph-def" }, h("span", { class: "ai-tag" }, "AI"), p.ai.definition) : null,
            p.translation ? h("div", { class: "ph-tr" }, "→ ", p.translation) : null,
            p.note ? h("div", { class: "ph-note" }, p.note) : null,
            p.sentence ? sentenceEl(p) : null,
            h("div", { class: "ph-foot" }, sourceEl(p), h("span", { class: "spacer" }),
              dictLinks(p.text, p.lang).map(([n, u]) => h("a", { class: "dict", href: u, target: "_blank" }, n))),
            h("div", { class: "decide", style: "grid-template-columns:1fr 1fr" },
              h("button", { class: "btn discard", onclick: () => answer(false) }, "Again", h("kbd", {}, "←")),
              h("button", { class: "btn primary", onclick: () => answer(true) }, "Got it", h("kbd", {}, "→"))))
        : h("div", { class: "decide", style: "grid-template-columns:1fr" },
            h("button", { class: "btn primary", onclick: show }, "Show meaning", h("kbd", {}, "Space")))));
}

document.addEventListener("keydown", (e) => {
  if (state.view !== "review" || !reviewKeys) return;
  if (e.target.matches("input, select, textarea")) return;
  const fn = reviewKeys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});
