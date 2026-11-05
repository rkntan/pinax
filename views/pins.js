// Pins dock: favourite sites on the left rail; drag to reorder.

let tip;
function showTip(el, text) {
  hideTip();
  const r = el.getBoundingClientRect();
  tip = h("div", { class: "pin-tip", style: `left:${r.right + 10}px;top:${r.top + 9}px` }, text);
  document.body.append(tip);
}
function hideTip() { tip?.remove(); tip = null; }

function renderPins() {
  hideTip();
  const box = $("pins");
  box.replaceChildren();
  let dragId = null;
  for (const p of data.pins) {
    const el = h("div", {
      class: "pin",
      draggable: "true",
      onclick: () => chrome.tabs.create({ url: p.url }),
      onmouseenter: (e) => showTip(e.currentTarget, `${p.title} · ${hostOf(p.url)}`),
      onmouseleave: hideTip,
      ondragstart: () => { dragId = p.id; hideTip(); },
      ondragover: (e) => { if (!dragId) return; e.preventDefault(); e.currentTarget.classList.add("drag-over"); },
      ondragleave: (e) => e.currentTarget.classList.remove("drag-over"),
      ondrop: async (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("drag-over");
        const all = await getPins();
        const pins = all.filter((x) => x.id !== dragId);
        const moved = all.find((x) => x.id === dragId);
        if (!moved || dragId === p.id) return; // dropped on itself: nothing moves
        pins.splice(pins.findIndex((x) => x.id === p.id), 0, moved);
        await setPins(pins);
      },
    },
      h("img", { src: faviconFor(p.url, 32), alt: "" }),
      h("button", { class: "x", title: "Unpin", onclick: (e) => { e.stopPropagation(); hideTip(); withUndo(`Unpinned ${hostOf(p.url)}`, ["pins"], () => unpinSite(p.url)); } }, "×"));
    box.append(el);
  }
}

$("pin-add").onclick = async () => {
  const url = prompt("Pin a site (paste its address):", "https://");
  if (!url || !/^https?:\/\/.+/.test(url)) return;
  await pinSite({ url, title: hostOf(url) });
};
