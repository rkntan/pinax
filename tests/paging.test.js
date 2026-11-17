// Library speed + privacy: long lists draw 100 rows then "Show N more"; icons never load a remote favicon URL.
// Run: node --test "tests/*.test.js"
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

// Just enough DOM for ui.js's h() builder.
function fakeEl(tag) {
  return {
    tag, attrs: {}, on: {}, kids: [], style: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { this.on[t] = f; },
    append(...k) { this.kids.push(...k); },
    get textContent() { return this.kids.map((k) => (typeof k === "string" ? k : k.textContent)).join(""); },
  };
}
let renders = 0;
const ctx = vm.createContext({
  console,
  document: { createElement: fakeEl, addEventListener() {}, getElementById: () => null },
  history: { replaceState() {} },
  render: () => { renders++; return Promise.resolve(); },
});
vm.runInContext(fs.readFileSync(path.join(root, "ui.js"), "utf8"), ctx);
const ui = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
const range = (n) => Array.from({ length: n }, (_, i) => i);
const button = (more) => more.kids.find((k) => k.tag === "button");

test("a short list is drawn whole, without a Show more button", () => {
  ui.state.limit = {};
  const { shown, more } = ui.pageOf("a", range(100));
  assert.equal(shown.length, 100);
  assert.equal(more, null);
});

test("a long list draws 100 rows, Show more adds 100 and keeps the count in state", () => {
  ui.state.limit = {};
  const list = range(250);
  let { shown, more } = ui.pageOf("a", list);
  assert.equal(shown.length, 100);
  assert.equal(button(more).textContent, "Show 100 more");
  const before = renders;
  button(more).on.click();
  assert.equal(renders, before + 1);
  assert.equal(ui.state.limit.a, 200);
  // a storage-triggered redraw keeps the count (pageOf reads state, nothing resets it)
  ({ shown, more } = ui.pageOf("a", list));
  assert.equal(shown.length, 200);
  assert.equal(button(more).textContent, "Show 50 more");
  button(more).on.click();
  ({ shown, more } = ui.pageOf("a", list));
  assert.equal(shown.length, 250);
  assert.equal(more, null);
  // other lists in the same view keep their own count
  assert.equal(ui.pageOf("b", list).shown.length, 100);
});

test("a row that must be shown (J/K focus past the end) grows the list to include it", () => {
  ui.state.limit = {};
  const { shown } = ui.pageOf("a", range(500), 150);
  assert.equal(shown.length, 200);
  assert.equal(ui.state.limit.a, 200);
  assert.equal(ui.pageOf("a", range(500), -1).shown.length, 200, "no focus: keeps the grown count");
});

test("go() to another view or collection resets the shown counts", () => {
  ui.state.limit = { a: 300 };
  ui.go("all");
  assert.deepEqual({ ...ui.state.limit }, {});
});

test("h() flattens nested child arrays (section + list pairs)", () => {
  const el = ui.h("div", {}, [[ui.h("h3"), [ui.h("div"), null]]], "x");
  assert.deepEqual(el.kids.map((k) => (typeof k === "string" ? k : k.tag)), ["h3", "div", "x"]);
});

test("UI shows page icons only through faviconFor (no stored or live favIconUrl)", () => {
  const files = ["popup.js", "panel.js", "library.js", "ui.js", ...fs.readdirSync(path.join(root, "views")).map((f) => path.join("views", f))];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    assert.ok(!src.includes("favIconUrl"), `${f} still uses favIconUrl`);
  }
});

test("row images load lazily", () => {
  for (const f of ["items.js", "notes.js", "phrasebook.js", "projects.js"]) {
    const src = fs.readFileSync(path.join(root, "views", f), "utf8");
    for (const m of src.matchAll(/h\("img", \{[^}]*\}/g)) assert.match(m[0], /loading: "lazy"/, `${f}: ${m[0]}`);
  }
});
