// Tests for collection ordering and moves. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(extra = {}) {
  const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, ...extra });
  for (const f of ["taxonomy.js", "core.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  return (name) => vm.runInContext(name, ctx);
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const get = load();

function env(stored = {}) {
  const store = plain(stored);
  const calls = { set: 0 };
  const chrome = { storage: { local: {
    get: async (k) => {
      const keys = Array.isArray(k) ? k : [k];
      return Object.fromEntries(keys.filter((x) => x in store).map((x) => [x, plain(store[x])]));
    },
    set: async (o) => { calls.set++; Object.assign(store, plain(o)); },
  } } };
  return { g: load({ chrome }), store, calls };
}

test("collectionDepth and isLockedName", () => {
  assert.equal(get("collectionDepth")("A"), 1);
  assert.equal(get("collectionDepth")("A/B"), 2);
  const std = get("taxonomyPaths")()[0];
  assert.equal(get("isLockedName")(std), true);
  assert.equal(get("isLockedName")("My own/thing"), false);
});

test("orderedChildren: listed first, unknown ignored, rest alphabetical", () => {
  const f = get("orderedChildren");
  const names = ["b", "a", "d", "c"];
  assert.deepEqual(plain(f("", names, { "": ["c", "zzz", "b"] })), ["c", "b", "a", "d"]);
  assert.deepEqual(plain(f("", names, {})), ["a", "b", "c", "d"]);
  assert.deepEqual(names, ["b", "a", "d", "c"]);
});

test("reorderChild: before, to end, unknown before-name, no mutation", () => {
  const f = get("reorderChild");
  const order = { X: ["q"] };
  const sib = ["a", "b", "c"];
  assert.deepEqual(plain(f(order, "", sib, "c", "a")), { X: ["q"], "": ["c", "a", "b"] });
  assert.deepEqual(plain(f(order, "", sib, "a", null))[""], ["b", "c", "a"]);
  assert.deepEqual(plain(f(order, "", sib, "a", "nope"))[""], ["b", "c", "a"]);
  assert.deepEqual(order, { X: ["q"] });
  assert.deepEqual(sib, ["a", "b", "c"]);
});

const cols = ["A", "A/B", "A/B/C", "D", "E"];
const items = [{ id: 1, path: "A/B" }, { id: 2, path: "A/B/C" }, { id: 3, path: "D" }];

test("moveCollection nests and un-nests", () => {
  const f = get("moveCollection");
  const r = plain(f(cols, items, {}, "D", "E"));
  assert.equal(r.to, "E/D");
  assert.deepEqual(r.collections, ["A", "A/B", "A/B/C", "E", "E/D"]);
  assert.equal(r.items[2].path, "E/D");
  const u = plain(f(cols, items, {}, "A/B", ""));
  assert.equal(u.to, "B");
  assert.deepEqual(u.collections, ["A", "B", "B/C", "D", "E"]);
  assert.equal(u.items[1].path, "B/C");
});

test("moveCollection merges into an existing collection", () => {
  const f = get("moveCollection");
  const c = ["A", "A/X", "A/X/P", "B", "B/X", "B/X/Q"];
  const it = [{ id: 1, path: "A/X/P" }, { id: 2, path: "B/X" }];
  const r = plain(f(c, it, {}, "A/X", "B"));
  assert.equal(r.to, "B/X");
  assert.deepEqual(r.collections, ["A", "B", "B/X", "B/X/P", "B/X/Q"]);
  assert.equal(r.items[0].path, "B/X/P");
});

test("moveCollection errors and noop", () => {
  const f = get("moveCollection");
  assert.equal(f(cols, items, {}, "A", "A").error, "Can't move a collection into itself");
  assert.equal(f(cols, items, {}, "A", "A/B").error, "Can't move a collection into itself");
  assert.equal(f(cols, items, {}, "A", "D/E/F").error, "Collections can only go 3 levels deep");
  assert.equal(f(cols, items, {}, "A", "E").error, "Collections can only go 3 levels deep");
  assert.equal(f(cols, items, {}, "A/B", "E").error, undefined);
  assert.equal(f(cols, items, {}, "A", "D").error, "Collections can only go 3 levels deep");
  assert.equal(f(cols, items, {}, "A/B", "A").noop, true);
  assert.equal(f(cols, items, {}, "D", "").noop, true);
});

test("moveCollection re-keys order and does not mutate", () => {
  const f = get("moveCollection");
  const order = { "": ["E", "A", "D"], A: ["B"], "A/B": ["C"] };
  const snap = plain({ cols, items, order });
  const r = plain(f(cols, items, { ...order, E: ["q"] }, "A/B", "E"));
  assert.deepEqual(r.order, { "": ["E", "A", "D"], E: ["q", "B"], "E/B": ["C"] });
  assert.deepEqual(plain({ cols, items, order }), snap);
  const withList = plain(f(cols, items, { E: ["x"] }, "D", "E"));
  assert.deepEqual(withList.order.E, ["x", "D"]);
});

test("renameOrder keeps position", () => {
  const f = get("renameOrder");
  const r = plain(f({ "": ["a", "b", "c"], b: ["k"] }, "b", "z"));
  assert.deepEqual(r, { "": ["a", "z", "c"], z: ["k"] });
});

test("moveCollectionTo writes once and returns errors", async () => {
  const e = env({ collections: cols, items, collectionOrder: {} });
  const r = await e.g("moveCollectionTo")("D", "E");
  assert.equal(r.to, "E/D");
  assert.equal(e.calls.set, 1);
  assert.deepEqual(e.store.collections, ["A", "A/B", "A/B/C", "E", "E/D"]);
  assert.ok(e.store.collectionOrder);
  const bad = await e.g("moveCollectionTo")("A", "A/B");
  assert.ok(bad.error);
  assert.equal(e.calls.set, 1);
});

test("reorderCollection stores order", async () => {
  const e = env({});
  await e.g("reorderCollection")("", ["a", "b"], "b", "a");
  assert.deepEqual(e.store.collectionOrder, { "": ["b", "a"] });
});

test("renameCollection refuses standard subjects, renames others with order", async () => {
  const std = get("taxonomyPaths")()[0];
  const e = env({ collections: [std, "My"], items: [], collectionOrder: { "": ["My"] } });
  await assert.rejects(() => e.g("renameCollection")(std, "Other"), /keep their names/);
  await e.g("renameCollection")("My", "Mine");
  assert.deepEqual(e.store.collections.includes("Mine"), true);
  assert.deepEqual(e.store.collectionOrder[""], ["Mine"]);
});

test("deleteCollection cleans the order", async () => {
  const e = env({ collections: ["A", "A/B", "C"], items: [], collectionOrder: { "": ["A", "C"], A: ["B"], "A/B": ["x"] } });
  await e.g("deleteCollection")("A");
  assert.deepEqual(e.store.collectionOrder, { "": ["C"] });
  assert.deepEqual(e.store.collections, ["C"]);
});

test("mergeBackup carries collectionOrder, current wins per parent", () => {
  const m = get("mergeBackup");
  const r = plain(m({ collectionOrder: { "": ["a"] } }, { app: "tab-organiser", schema: 8, collectionOrder: { "": ["z"], Q: ["y"] } }));
  assert.deepEqual(r.collectionOrder, { "": ["a"], Q: ["y"] });
});
