// Reading queue: unread pages, shortest first, filtered by the time you have.

const BUDGETS = [[null, "Any length"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"]];

function viewQueue() {
  const all = readingQueue(data.items, { videos: state.videos }).filter(matches);
  const list = state.budget ? all.filter((it) => it.minutes && it.minutes <= state.budget) : all;
  const known = all.filter((it) => it.minutes);
  const total = known.reduce((a, it) => a + it.minutes, 0);
  setHead("Reading queue", `${all.length} unread${total ? ` · ≈ ${fmtMinutes(total)} of known length` : ""}`);
  $("tools").replaceChildren(
    h("span", { class: "small muted" }, "I have"),
    ...BUDGETS.map(([m, label]) => h("button", { class: `chip${state.budget === m ? " on" : ""}`, onclick: () => { state.budget = m; render(); } }, label)),
    h("span", { class: "spacer" }),
    h("label", { class: "small check" },
      h("input", { type: "checkbox", checked: state.videos, onchange: (e) => { state.videos = e.target.checked; render(); } }),
      "include videos"));

  if (!all.length) return emptyEl("Nothing unread", "Everything you saved is read. Pages count as read after 2 minutes of viewing.");
  if (!list.length) return emptyEl(`Nothing fits in ${fmtMinutes(state.budget)}`, "Try a longer slot. Pages get their length when you save them from an open tab.");

  const started = list.filter((it) => resumePct(it)).sort((a, b) => b.pos.at - a.pos.at);
  const first = started[0] || list[0];
  const withLen = list.filter((it) => it.minutes);
  const unknown = list.filter((it) => !it.minutes);
  return h("div", {},
    h("div", { class: "queue-next" },
      h("img", { src: faviconFor(first.url, 32), alt: "" }),
      h("div", { class: "t" },
        h("span", { class: "muted small" }, resumePct(first)
          ? `Continue · you read ${resumePct(first)}% · ${lengthLabel(first) || ""}`
          : `Up next · ${lengthLabel(first) || "length unknown"} · ${first.stage === "kept" ? pathLabel(first.path) : "Inbox"}`),
        h("b", {}, first.title)),
      h("button", { class: "btn primary", onclick: () => window.open(first.url, "_blank") }, resumePct(first) ? "▶ Continue" : "▶ Read now")),
    started.length > 1 ? [sectionEl("Continue reading", started.length), listEl(started, "started")] : null,
    selBar(),
    withLen.length ? listEl(withLen, "len") : null,
    unknown.length ? [sectionEl("Length unknown", unknown.length), listEl(unknown, "unknown")] : null,
    h("p", { class: "keys-hint small muted" }, `${KEYS_HINT} · a page leaves the queue once read (2 min of viewing, or M)`));
}
