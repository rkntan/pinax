// Side panel: notes for the page in the current tab — highlights, your notes, export.
// Follows the active tab. Uses core.js.

const $ = (id) => document.getElementById(id);
const msg = (t) => ($("msg").textContent = t);

let tab = null;      // the tab the panel is showing
let note = null;     // its notes record (or null)
let color = "yellow";
let editing = null;  // highlight id whose comment is being edited
let saveTimer = null;
let penTab = null;   // tab where the highlighter pen is on (re-read from the page, see syncPen)
let myWin = null;    // the window this panel belongs to

const isWeb = (t) => t && /^https?:/.test(t.url || "");

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
}

// Pages where Chrome never lets extensions in.
function blocked(t) {
  return !isWeb(t) || /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(t.url);
}

async function currentTab() {
  const [t] = await chrome.tabs.query({ active: true, windowId: myWin });
  return t;
}

async function load() {
  tab = await currentTab();
  note = isWeb(tab) ? await noteFor(tab.url) : null;
  render();
  syncPen();
}

// The page knows whether its pen is on; the panel asks instead of guessing.
async function syncPen() {
  const t = tab;
  if (blocked(t)) return;
  const on = await inPage(t, penIsOn, [], false).catch(() => false);
  if (on && penTab !== t.id) penTab = t.id;
  else if (!on && penTab === t.id) penTab = null;
  else return;
  render();
}

// Site access: a click in the side panel doesn't give the extension the page, so ask Chrome.
// Must be the FIRST thing a click handler does (no await before it). No prompt if already allowed.
function askSite(t) {
  return chrome.permissions.request({ origins: [new URL(t.url).origin + "/*"] });
}

function why(e) {
  console.error(e);
  const m = String(e?.message || e);
  if (/gesture/i.test(m)) return "Chrome needs a direct click to allow this site: click again.";
  if (/cannot be scripted|chrome:\/\/|Cannot access/i.test(m)) return "Chrome doesn't allow extensions on this page.";
  return m;
}

async function where() {
  if (!isWeb(tab)) return "";
  const [items, projects] = await Promise.all([getItems(), getProjects()]);
  const it = items.find((x) => pageKey(x.url) === pageKey(tab.url));
  const src = sourceForUrl(projects, tab.url);
  return [
    hostOf(tab.url),
    it ? (it.stage === "kept" ? `in ${pathLabel(it.path)}` : "in Inbox") + (it.read ? " · read" : "") : null,
    src ? `source in ${src.project.name}` : null,
  ].filter(Boolean).join(" · ");
}

function render() {
  const web = isWeb(tab);
  $("title").textContent = web ? tab.title : "Open a web page to take notes";
  $("fav").src = web ? tab.favIconUrl || faviconFor(tab.url) : "icons/icon32.png";
  where().then((w) => ($("where").textContent = w));
  document.querySelectorAll(".bar, .colors, section").forEach((s) => s.classList.toggle("off", !web));

  $("colors").replaceChildren(...Object.entries(HL_COLORS).map(([name, hex]) =>
    el("button", {
      class: name === color ? "on" : null, title: name, style: `background:${hex}`,
      onclick: () => { color = name; if (penTab === tab?.id) inPage(tab, startPen, [color, hex], false).catch((e) => msg(why(e))); render(); },
    })));
  $("pen-btn").classList.toggle("on", !!tab && penTab === tab.id);
  $("pen-btn").disabled = blocked(tab);
  $("show-btn").disabled = blocked(tab);
  if (blocked(tab) && isWeb(tab)) msg("Chrome doesn't let extensions highlight on this page.");

  const hls = note?.highlights || [];
  $("hl-count").textContent = hls.length ? String(hls.length) : "";
  $("hl-list").replaceChildren(...(hls.length ? hls.map(hlEl) : [el("p", { class: "empty" },
    "Press “Highlighter”, then select text on the page: it is highlighted at once. Click a highlight on the page to recolour, comment or delete it.")]));

  renderSummary();

  // don't overwrite what you are typing
  if (document.activeElement !== $("text")) $("text").value = note?.text || "";
  $("export").disabled = !note;
}

// Tiny Markdown: "- " / "* " lines become a list, the rest paragraphs; **bold** kept.
function mdEl(text) {
  const box = el("div", { class: "sum" });
  let ul = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const node = el(bullet ? "li" : "p");
    (bullet ? bullet[1] : line).split(/\*\*(.+?)\*\*/g).forEach((part, i) => node.append(i % 2 ? el("b", {}, part) : part));
    if (bullet) { if (!ul) box.append((ul = el("ul"))); ul.append(node); }
    else { ul = null; box.append(node); }
  }
  return box;
}

function renderSummary() {
  const s = note?.summary;
  $("sum-hl").disabled = !(note?.highlights.length || note?.text.trim());
  $("sum-meta").textContent = s ? `${s.source === "page" ? "of the page" : "from your highlights"} · ${stamp(s.at)}` : "";
  $("sum-box").replaceChildren(...(s ? [mdEl(s.text), el("div", { class: "sum-tools" },
    el("button", {
      onclick: async () => {
        const text = ($("text").value.trim() ? $("text").value.trim() + "\n\n" : "") + `${s.source === "page" ? "Summary" : "Key ideas"} (AI):\n${s.text}`;
        $("text").value = text;
        await setNoteText(tab, text);
        msg("Added to your notes");
      },
    }, "Add to my notes"),
    el("button", { onclick: () => navigator.clipboard.writeText(s.text).then(() => msg("Copied")) }, "Copy"),
    el("button", { onclick: () => editNote(tab, (x) => delete x.summary) }, "Remove"))] : []));
}

async function summarise(source) {
  if (!isWeb(tab)) return;
  const btn = source === "page" ? $("sum-page") : $("sum-hl");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "✦ Thinking…";
  try {
    let text = "";
    if (source === "page") text = await inPage(tab, readPageText);
    await summariseNote(tab, source, text, (m) => msg(m));
    msg("");
  } catch (e) {
    msg(e.message || "The local AI couldn't summarise this.");
  } finally {
    btn.textContent = label;
    btn.disabled = false;
    renderSummary();
  }
}

$("sum-hl").onclick = () => summarise("highlights");
$("sum-page").onclick = () => summarise("page");

function hlEl(hl) {
  const hex = HL_COLORS[hl.color] || HL_COLORS.yellow;
  const comment = editing === hl.id
    ? el("textarea", {
        rows: 2,
        placeholder: "Your comment…",
        onblur: async (e) => { editing = null; await updateHighlight(tab.url, hl.id, { comment: e.target.value.trim() }); },
        onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.blur(); } },
      })
    : hl.comment ? el("div", { class: "hl-comment", title: "Edit", onclick: () => { editing = hl.id; render(); } }, hl.comment) : null;
  if (comment?.tagName === "TEXTAREA") setTimeout(() => { comment.value = hl.comment || ""; comment.focus(); });
  return el("div", { class: "hl", style: `--c:${hex}` },
    el("div", { class: "hl-text", title: "Show it on the page", onclick: () => showOnPage(hl.id, askSite(tab)) }, hl.text),
    comment,
    el("div", { class: "hl-tools" },
      Object.entries(HL_COLORS).map(([name, c]) => el("span", { class: "dot", title: name, style: `background:${c}`, onclick: () => updateHighlight(tab.url, hl.id, { color: name }) })),
      el("span", { class: "spacer" }),
      new Date(hl.created).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hl.comment ? null : el("button", { onclick: () => { editing = hl.id; render(); } }, "+ comment"),
      el("button", { title: "Copy", onclick: () => navigator.clipboard.writeText(`"${hl.text}" — ${note.title} (${note.url})`).then(() => msg("Copied")) }, "copy"),
      el("button", { title: "Delete", onclick: async () => { await deleteHighlight(tab.url, hl.id); showOnPage(null, false); } }, "delete")));
}

// access: the promise from askSite(), started in the click (null = don't ask, just try quietly)
async function showOnPage(scrollTo = null, access = null) {
  const t = tab;
  if (blocked(t)) return;
  try {
    if (access && !(await access)) return msg("Site access not allowed, so highlights can't be shown here.");
    const n = await noteFor(t.url);
    const found = await remark(t, scrollTo, false);
    const total = n?.highlights.length || 0;
    if (access) msg(total ? `${found} of ${total} highlight${total > 1 ? "s" : ""} found on the page` : "No highlights yet");
  } catch (e) {
    if (access) msg(why(e));
  }
}

// Highlighter pen: on = every selection in the page becomes a highlight.
$("pen-btn").onclick = () => {
  const t = tab;
  if (blocked(t)) return;
  const access = askSite(t); // first, while Chrome still counts this as your click
  (async () => {
    try {
      if (!(await access)) return msg("Site access not allowed, so the pen can't work on this site.");
      if (await inPage(t, penIsOn, [], false)) {
        await inPage(t, stopPen, [], false);
      } else {
        await remark(t, null, false); // shows existing highlights and their tools
        await inPage(t, startPen, [color, HL_COLORS[color]], false);
      }
      penTab = (await inPage(t, penIsOn, [], false)) ? t.id : null; // what the page says
      msg(penTab ? "Select text on the page to highlight it · Esc or the badge stops" : "Highlighter off");
    } catch (e) {
      penTab = null;
      msg(why(e));
    } finally {
      render();
    }
  })();
};

// Esc in the panel also stops the pen (after clicking here, the page no longer gets Esc)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && penTab && penTab === tab?.id && !e.target.matches("textarea, input")) {
    inPage(tab, stopPen, [], false).catch(() => {}).finally(() => { penTab = null; render(); });
  }
});

// the pen was turned off on the page (Esc or its badge), or the page navigated
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m?.type === "pen-off" && sender.tab?.id === penTab) { penTab = null; render(); }
});

$("show-btn").onclick = () => { if (!blocked(tab)) showOnPage(null, askSite(tab)); };

$("text").oninput = () => {
  clearTimeout(saveTimer);
  $("saved").textContent = "…";
  const page = tab;
  const value = $("text").value;
  saveTimer = setTimeout(async () => {
    await setNoteText(page, value);
    $("saved").textContent = "saved";
  }, 400);
};

$("save-inbox").onclick = async () => {
  if (!isWeb(tab)) return;
  const it = await saveForLater(tab);
  addStats(it.id, tab);
  msg("Saved to Inbox");
  render();
};

$("export").onclick = async () => {
  const n = await noteFor(tab.url);
  if (!n) return;
  const md = noteMarkdown(n, "#");
  navigator.clipboard.writeText(md).catch(() => {});
  const a = el("a", { href: URL.createObjectURL(new Blob([md], { type: "text/markdown" })), download: `${n.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.md` });
  a.click();
  URL.revokeObjectURL(a.href);
  msg("Exported and copied");
};

$("library").onclick = () => openLibraryTab("#notes");

$("auto").onchange = async (e) => {
  if (e.target.checked) {
    // ask Chrome for access to all sites, only now and only if you want this
    const ok = await chrome.permissions.request({ origins: ["<all_urls>"] });
    e.target.checked = ok;
    if (!ok) return msg("Not allowed: highlights still show when you press “Show on page”.");
  }
  await chrome.storage.local.set({ autoHighlights: e.target.checked });
  msg(e.target.checked ? "Highlights will show on pages you annotated" : "Highlights show only when you press “Show on page”");
};

// follow the active tab and live changes
// follow the active tab of this panel's own window only
chrome.tabs.onActivated.addListener((info) => { if (info.windowId === myWin) load(); });
chrome.tabs.onUpdated.addListener((id, change, t) => {
  if (t.windowId !== myWin) return;
  if (id === penTab && change.status === "loading") penTab = null; // a new page starts without the pen
  if (id === tab?.id && (change.status === "complete" || change.title)) load(); // load re-reads the pen
});
chrome.storage.onChanged.addListener(async (c) => {
  if (c.notes && isWeb(tab)) { note = await noteFor(tab.url); render(); }
});

(async function init() {
  myWin = (await chrome.windows.getCurrent()).id;
  const { autoHighlights = false } = await chrome.storage.local.get("autoHighlights");
  $("auto").checked = autoHighlights;
  await load();
})();
