// Page rows (compact list / cards), filters, and the Inbox and All pages views.

function remindSelect(it) {
  return h("select", {
    class: it.remindAt ? "remind-on" : null,
    onchange: (e) => setReminder(it.id, e.target.value === "keep" ? "" : e.target.value),
  },
    it.remindAt ? h("option", { value: "keep", selected: true }, `Remind ${shortWhen(it.remindAt)}${it.repeat === "weekly" ? " · weekly" : ""}`) : null,
    REMIND_PRESETS.map(([v, label]) => h("option", { value: v }, it.remindAt && !v ? "Clear reminder" : label)));
}

function progressEl(it) {
  if (it.progress) {
    const { done, total } = it.progress;
    const step = (d) => {
      const n = Math.max(0, Math.min(total, done + d));
      updateItem(it.id, { progress: { done: n, total }, ...(n >= total ? { read: true, readAt: Date.now() } : {}) });
    };
    return h("span", { class: "progress" },
      h("button", { class: "icon-btn", title: "Back one unit", onclick: () => step(-1) }, "−"),
      h("span", { class: "bar-mini" }, h("i", { style: `width:${(done / total) * 100}%` })),
      `${done}/${total}`,
      h("button", { class: "icon-btn", title: "Finished one unit", onclick: () => step(1) }, "+"));
  }
  if (it.type !== "Course") return null;
  return h("button", {
    class: "link",
    onclick: () => {
      const n = parseInt(prompt("How many units / lessons does this course have?", "5"), 10);
      if (n > 0) updateItem(it.id, { progress: { done: 0, total: n } });
    },
  }, "Track units");
}

// Quotes you saved from this page (Phrasebook).
function quotesFor(url) {
  return data.phrases.filter((q) => q.kind === "quote" && q.url === url);
}

function detailEl(it) {
  const pathIn = h("input", { class: "input", list: "paths", value: it.path === UNSORTED ? "" : pathLabel(it.path), placeholder: "Collection, e.g. AI › Agents" });
  const tagsIn = h("input", {
    class: "input", value: (it.tags || []).join(", "), placeholder: "tags, comma separated",
    onchange: (e) => updateItem(it.id, { tags: mergeTags([], e.target.value.split(",")) }),
  });
  return h("div", { class: "detail" },
    it.why ? h("p", { class: "why-full" }, it.why) : null,
    quotesFor(it.url).length
      ? h("div", { class: "quotes" }, quotesFor(it.url).map((q) => h("blockquote", { title: stamp(q.created) }, q.text)))
      : null,
    h("label", { class: "check", title: "Pages are marked read after 2 minutes of viewing" }, "Read",
      h("input", { type: "checkbox", checked: !!it.read, onchange: (e) => updateItem(it.id, { read: e.target.checked, readAt: e.target.checked ? Date.now() : null }) })),
    h("label", {}, "Type",
      h("select", { onchange: (e) => updateItem(it.id, { type: e.target.value }) },
        TYPES.map((t) => h("option", { value: t, selected: it.type === t }, t)))),
    remindSelect(it),
    progressEl(it),
    h("label", {}, it.stage === "inbox" ? "Keep in" : "Move to", pathIn,
      h("button", { class: "qbtn keep", onclick: () => keepItem(it.id, pathIn.value) }, it.stage === "inbox" ? "Keep" : "Move")),
    h("label", {}, "Tags", tagsIn),
    h("span", { style: "flex:1" }),
    it.stage === "kept" ? h("button", { class: "link", onclick: () => updateItem(it.id, { stage: "inbox" }) }, "Back to Inbox") : null,
    h("button", { class: "link", onclick: () => withUndo(`Removed “${it.title}”`, ["items"], () => deleteItem(it.id)) }, "Remove"));
}

function rowEl(it, pinned) {
  const open = state.open === it.id;
  const inbox = it.stage === "inbox";
  const suggested = inbox && it.path !== UNSORTED;
  const row = h("div", {
    class: `row t-${it.type}${open ? " open" : ""}${it.read ? " read" : " unread"}`,
    draggable: "true",
    ondragstart: (e) => { e.dataTransfer.setData("text/item", it.id); e.currentTarget.classList.add("dragging"); },
    ondragend: (e) => e.currentTarget.classList.remove("dragging"),
  },
    h("div", {
      class: "row-main",
      onclick: (e) => { if (e.target.closest("a, button, select, input")) return; state.open = open ? null : it.id; render(); },
    },
      h("img", { class: "fav", src: it.favIconUrl || faviconFor(it.url, 16), alt: "" }),
      h("div", { class: "line" },
        h("a", { class: "title", href: it.url, target: "_blank", title: it.url }, it.title),
        h("span", { class: "why" }, it.why || hostOf(it.url))),
      h("div", { class: "right" },
        isOld(it) ? h("span", { class: "chip", title: "In the Inbox for more than 2 weeks" }, "old") : null,
        isDue(it) ? h("span", { class: "chip lime" }, "due") : null,
        it.remindAt && !isDue(it) ? h("span", { class: "small remind-on", title: "Reminder" }, shortWhen(it.remindAt)) : null,
        it.progress ? h("span", { class: "small muted" }, `${it.progress.done}/${it.progress.total}`) : null,
        state.view !== "col" || inbox
          ? h("button", {
              class: `chip path-chip${inbox ? " suggest" : ""}`,
              title: inbox ? "AI suggestion" : "Open collection",
              onclick: () => (inbox ? (state.open = it.id, render()) : go("col", it.path)),
            }, pathLabel(it.path))
          : null,
        h("span", { class: "type" }, h("i", { class: "dot", style: "background:var(--type)" }), it.type),
        suggested ? h("button", { class: "qbtn keep", title: `Keep in ${pathLabel(it.path)}`, onclick: () => keepItem(it.id, it.path) }, "Keep") : null,
        h("button", {
          class: `star${pinned ? " on" : ""}`,
          title: pinned ? "Unpin" : "Pin to dock",
          onclick: () => (pinned ? withUndo("Unpinned", ["pins"], () => unpinSite(it.url)) : pinSite(it)),
        }, pinned ? "★" : "☆"))),
    open ? detailEl(it) : null);
  return row;
}

function listEl(items) {
  const pinned = new Set(data.pins.map((p) => p.url));
  return h("div", { class: `list ${prefs.get("density", "rows")}` }, items.map((it) => rowEl(it, pinned.has(it.url))));
}

function typeChips(base) {
  const counts = {};
  base.forEach((it) => (counts[it.type] = (counts[it.type] || 0) + 1));
  return ["All", ...TYPES].filter((t) => t === "All" || counts[t]).map((t) =>
    h("button", { class: `chip t-${t}${state.type === t ? " on" : ""}`, onclick: () => { state.type = t; render(); } },
      t !== "All" ? h("i", { class: "dot", style: "background:var(--type)" }) : null,
      `${t === "All" ? "All" : PLURAL[t]} ${t === "All" ? base.length : counts[t]}`));
}

function statusSeg() {
  return h("div", { class: "seg" }, [["all", "All"], ["unread", "Unread"], ["read", "Read"]].map(([v, l]) =>
    h("button", { class: state.status === v ? "on" : null, onclick: () => { state.status = v; render(); } }, l)));
}

const byStatus = (it) => state.status === "all" || (state.status === "read" ? !!it.read : !it.read);
const byType = (it) => state.type === "All" || it.type === state.type;

function emptyEl(title, text) {
  return h("div", { class: "empty" }, h("h3", {}, title), h("p", {}, text));
}

function viewInbox() {
  const base = data.items.filter((it) => it.stage === "inbox" && matches(it));
  const list = base.filter(byType);
  const waiting = forReview(data.items).length;
  setHead("Inbox", `${base.length} waiting · AI suggests a collection, you decide`);
  $("tools").replaceChildren(...typeChips(base), h("span", { class: "spacer" }),
    waiting ? h("button", { class: "btn primary", onclick: () => go("review") }, `Review ${waiting} now`) : null);
  return list.length ? listEl(list)
    : emptyEl("Inbox is clear", "Save pages from the popup, right-click → “Save link for later”, or press Alt+Shift+S.");
}

function viewAll() {
  const base = data.items.filter((it) => matches(it) && byStatus(it));
  setHead("All pages", `${data.items.length} saved`);
  $("tools").replaceChildren(...typeChips(base), h("span", { class: "spacer" }), statusSeg());
  const due = base.filter((it) => isDue(it));
  const rest = base.filter(byType);
  return h("div", {},
    due.length ? [h("h3", { class: "section-title" }, h("span", { class: "chip lime" }, "Due now"), String(due.length)), listEl(due), h("br")] : null,
    rest.length ? listEl(rest) : emptyEl("Nothing here", "Try another filter or search."));
}
