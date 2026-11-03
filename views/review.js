// Weekly review: one page at a time — keep / discard / next week / pin.

let reviewPath = null;
function viewReview() {
  const queue = forReview(data.items).sort((a, b) => a.created - b.created);
  setHead("Weekly review", queue.length ? `${queue.length} to decide` : "");
  $("tools").replaceChildren();
  if (!queue.length) {
    const later = data.items.filter((x) => x.stage === "inbox").length;
    return emptyEl("All reviewed", later
      ? `${later} page${later > 1 ? "s" : ""} pushed to next week. Next review: Friday 16:00.`
      : "Your Inbox is empty. Next review: Friday 16:00.");
  }
  const it = queue[0];
  const pinned = data.pins.some((p) => p.url === it.url);
  reviewPath = h("input", {
    class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path),
    placeholder: "Collection, e.g. AI › Agents",
    onkeydown: (e) => { if (e.key === "Enter") act("keep"); },
  });
  const act = async (what) => {
    if (what === "keep") await keepItem(it.id, reviewPath.value || UNSORTED);
    else if (what === "discard") await deleteItem(it.id);
    else if (what === "later") await laterItem(it.id);
    else if (what === "pin") await (pinned ? unpinSite(it.url) : pinSite(it));
  };
  reviewAct = act;
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
let reviewAct = null;

document.addEventListener("keydown", (e) => {
  if (state.view !== "review" || !reviewAct) return;
  if (e.target.matches("input, select, textarea")) return;
  const k = { ArrowRight: "keep", ArrowLeft: "discard", ArrowDown: "later", p: "pin", P: "pin" }[e.key];
  if (k) { e.preventDefault(); reviewAct(k); }
});
