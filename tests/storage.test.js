// Storage size and backup tests: no stored favicon URLs, schema 7, trail cap, backup merge.
// Run: node --test "tests/*.test.js"

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// a tiny in-memory chrome.storage.local (get with key / list / defaults object, set, remove)
function fakeStore(init = {}) {
  const data = structuredClone(init);
  const pick = (keys) => {
    if (keys == null) return structuredClone(data);
    if (typeof keys === "string") keys = [keys];
    if (Array.isArray(keys)) return structuredClone(Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])));
    return structuredClone(Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in data ? data[k] : d])));
  };
  return {
    data,
    get: async (k) => pick(k),
    set: async (o) => { Object.assign(data, structuredClone(o)); },
    remove: async (k) => { [].concat(k).forEach((x) => delete data[x]); },
  };
}

function load(store = fakeStore()) {
  const chrome = { storage: { local: store }, tabGroups: { query: async () => [{ id: 1, title: "G", color: "blue" }] } };
  const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, chrome });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8"), ctx);
  return new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
}

const core = load();
const plain = (x) => JSON.parse(JSON.stringify(x));
const FAV = "data:image/png;base64,AAAA";

const v6 = () => ({
  schema: 6,
  items: [{ id: "a", url: "https://a.test/", title: "A", favIconUrl: FAV, read: false }],
  pins: [{ id: "p", url: "https://p.test/", title: "P", favIconUrl: FAV }],
  history: [{ id: "h", kind: "auto", saved: 1, tabs: [{ url: "https://h.test/", title: "H", favIconUrl: FAV, group: "", color: "" }] }],
  projects: [{
    id: "w", name: "W", tabs: [{ url: "https://t.test/", favIconUrl: FAV }],
    sources: [{ id: "s", url: "https://s.test/", title: "S", favIconUrl: FAV, status: "unread" }],
  }],
  notes: { "https://n.test/": { url: "https://n.test/", title: "N", favIconUrl: FAV, highlights: [], text: "x" } },
  backupV2: { items: [] },
});

test("schema is 7", () => {
  assert.equal(core.SCHEMA, 7);
});

test("migrateData v6 -> v7 strips stored favicon URLs everywhere and drops backupV2", () => {
  const input = v6();
  const out = plain(core.migrateData(input));
  assert.equal(out.schema, 7);
  assert.equal(JSON.stringify(out).includes("favIconUrl"), false);
  assert.equal("backupV2" in out, false);
  // everything else stays
  assert.deepEqual(out.items[0], { id: "a", url: "https://a.test/", title: "A", read: false });
  assert.deepEqual(out.history[0].tabs[0], { url: "https://h.test/", title: "H", group: "", color: "" });
  assert.equal(out.projects[0].sources[0].status, "unread");
  assert.equal(out.notes["https://n.test/"].text, "x");
  assert.equal(input.items[0].favIconUrl, FAV, "input must not change");
  assert.deepEqual(plain(core.migrateData(out)), out, "running again changes nothing");
});

test("migrate() upgrades storage and removes the old backupV2 key (and never writes a new one)", async () => {
  const store = fakeStore(v6());
  await load(store).migrate();
  assert.equal(store.data.schema, 7);
  assert.equal("backupV2" in store.data, false);
  assert.equal(JSON.stringify(store.data).includes("favIconUrl"), false);
  const old = fakeStore({ schema: 2, items: [{ id: "a", stage: "inbox", path: "Unsorted", tags: [] }] });
  await load(old).migrate();
  assert.equal("backupV2" in old.data, false);
});

test("new saves store no favicon URL (items, snapshots, sources, working tabs, notes)", async () => {
  const store = fakeStore({ schema: 7, projects: [{ id: "w", name: "W", tabs: [], sources: [] }] });
  const c = load(store);
  const tab = { id: 9, url: "https://a.test/", title: "A", favIconUrl: FAV, groupId: 1 };
  await c.saveForLater(tab, "", { sort: false });
  const snap = await c.snapshotTabs([tab]);
  assert.deepEqual(plain(snap), [{ url: "https://a.test/", title: "A", group: "G", color: "blue" }]);
  const r = c.withSource({ sources: [] }, tab);
  assert.equal("favIconUrl" in r.source, false);
  assert.equal(c.parkedSources({ sources: [] }, [tab]).sources.some((s) => "favIconUrl" in s), false);
  await c.toggleWorkingTab("w", { ...r.source, favIconUrl: FAV });
  await c.editNote(tab, (n) => (n.text = "hi"));
  assert.equal(JSON.stringify(store.data).includes("favIconUrl"), false);
});

test("trail stops adding pages by itself at TRAIL_MAX_SOURCES; known pages still match", () => {
  assert.equal(core.TRAIL_MAX_SOURCES, 300);
  const full = { sources: Array.from({ length: 300 }, (_, i) => ({ id: "s" + i, url: "https://x.test/" + i })) };
  assert.equal(core.trailMayAdd(full, "https://new.test/"), false);
  assert.equal(core.trailMayAdd(full, "https://x.test/7"), true, "an existing source is not a new add");
  assert.equal(core.trailMayAdd({ sources: full.sources.slice(1) }, "https://new.test/"), true);
  assert.equal(core.trailMayAdd({}, "https://new.test/"), true);
  // manual adds (withSource / addSource) have no cap
  assert.equal(core.withSource(full, { url: "https://new.test/" }).added, true);
});

test("mergeBackup refuses a file from a newer schema, before anything is merged", () => {
  const cur = { items: [{ id: "mine" }] };
  assert.throws(() => core.mergeBackup(cur, { app: "tab-organiser", schema: core.SCHEMA + 1, items: [{ id: "x" }] }), /newer/);
  assert.throws(() => core.mergeBackup(cur, { app: "other", items: [] }), /not a Tab Organiser backup/);
  assert.deepEqual(cur, { items: [{ id: "mine" }] });
});

test("mergeBackup imports an old version 4 file through migrateData, without duplicates", () => {
  const cur = { items: [{ id: "a", url: "https://a.test/", title: "mine" }], pins: [], projects: [], history: [], phrases: [], notes: {}, collections: ["AI"] };
  const file = {
    app: "tab-organiser", version: 4, schema: 4, exported: 1,
    items: [{ id: "a", url: "https://a.test/", title: "theirs" }, { id: "b", url: "https://b.test/", status: "done", path: "ML", favIconUrl: FAV }],
    collections: ["ML"],
    pins: [{ id: "p", url: "https://p.test/", favIconUrl: FAV }],
  };
  const next = plain(core.mergeBackup(cur, file, 50));
  assert.deepEqual(next.items.map((i) => [i.id, i.title]), [["a", "mine"], ["b", undefined]]);
  assert.equal(next.items[1].read, true, "v4 -> v5 step ran");
  assert.equal(JSON.stringify(next).includes("favIconUrl"), false, "v6 -> v7 step ran");
  assert.deepEqual(next.collections, ["AI", "ML"]);
  assert.equal(next.pins.length, 1);
});

test("mergeBackup restores settings when the file has them, and only known settings", () => {
  const file = { app: "tab-organiser", schema: 7, settings: { autoTidy: true, tidyDays: 7, resurface: false, dockHidden: ["https://x.test"], evil: 1 } };
  const next = plain(core.mergeBackup({}, file));
  assert.equal(next.autoTidy, true);
  assert.equal(next.tidyDays, 7);
  assert.equal(next.resurface, false);
  assert.deepEqual(next.dockHidden, ["https://x.test"]);
  assert.equal("evil" in next, false);
  assert.equal("autoSession" in plain(core.mergeBackup({}, { app: "tab-organiser", schema: 7 })), false, "no settings in file: none touched");
  for (const k of ["resurface", "autoSession", "autoTidy", "tidyDays", "dockHidden", "dockY"]) assert.ok(core.SETTINGS_KEYS.includes(k), k);
});
