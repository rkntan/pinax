// Weekly review: saved pages one at a time — keep / delete / next week / pin.

let reviewPath = null;
let reviewKeys = null; // key -> action for the sub-view on screen

function viewReview() {
  const pages = forReview(data.items).sort((a, b) => a.created - b.created);
  setHead("Weekly review", `${pages.length} page${pages.length === 1 ? "" : "s"}`);
  setTools();
  return h("div", {}, statsEl(), reviewPages(pages));
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

function reviewPages(queue) {
  if (!queue.length) {
    const later = data.items.filter((x) => x.stage === "inbox").length;
    return emptyEl("Pages done", later
      ? `${later} page${later > 1 ? "s" : ""} pushed to next week. Next review: Friday 16:00.`
      : "Your Inbox is empty. Next review: Friday 16:00.");
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
    else if (what === "discard") await withUndo(`Deleted “${it.title}”`, ["items"], () => deleteItem(it.id));
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
      h("span", { class: "why" }, it.why || "No AI reason yet."),
      h("div", { class: "meta" },
        h("a", { class: "link", href: it.url, target: "_blank" }, "Open page ↗"),
        it.progress ? `· ${it.progress.done}/${it.progress.total} units` : null,
        it.remindAt ? `· reminder ${shortWhen(it.remindAt)}` : null),
      h("div", { class: "file" }, h("span", { class: "small muted" }, "Keep in"), reviewPath),
      h("div", { class: "decide" },
        h("button", { class: "btn discard", onclick: () => act("discard") }, "Delete", h("kbd", {}, "←")),
        h("button", { class: "btn", onclick: () => act("later") }, "Next week", h("kbd", {}, "↓")),
        h("button", { class: "btn", onclick: () => act("pin") }, pinned ? "Unpin" : "Pin", h("kbd", {}, "P")),
        h("button", { class: "btn primary", onclick: () => act("keep") }, "Keep", h("kbd", {}, "→ / Enter")))));
}

document.addEventListener("keydown", (e) => {
  if (state.view !== "review" || !reviewKeys) return;
  if (e.target.matches("input, select, textarea")) return;
  const fn = reviewKeys[e.key];
  if (fn) { e.preventDefault(); fn(); }
});
