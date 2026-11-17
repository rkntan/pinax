// Unit tests for the pure logic in core.js. Run: node --test tests/
// core.js is a plain browser script, so it is loaded into a VM context; only functions that
// don't touch chrome.* are tested here.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8"), ctx);
const core = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });

const DAY = 864e5;
// results built inside the VM have its own Array/Object prototypes; compare as plain JSON
const plain = (x) => JSON.parse(JSON.stringify(x));

test("cleanPath tidies user input into a 1-3 level path", () => {
  assert.equal(core.cleanPath(" ai › agents / papers / extra "), "ai/agents/papers");
  assert.equal(core.cleanPath("AI > Vision"), "AI/Vision");
  assert.equal(core.cleanPath(""), "Unsorted");
  assert.equal(core.cleanPath(" / / "), "Unsorted");
  assert.equal(core.pathLabel("AI/Agents"), "AI › Agents");
  assert.equal(core.pathLabel(""), "Unsorted");
});

test("inPath matches a branch and its children, not look-alike names", () => {
  assert.equal(core.inPath("AI", "AI"), true);
  assert.equal(core.inPath("AI/Agents", "AI"), true);
  assert.equal(core.inPath("AIX", "AI"), false);
  assert.equal(core.inPath("", "AI"), false);
});

test("withPath adds every parent and keeps the list sorted and unique", () => {
  assert.deepEqual(plain(core.withPath(["PCB"], "AI/Agents/Papers")), ["AI", "AI/Agents", "AI/Agents/Papers", "PCB"]);
  assert.deepEqual(plain(core.withPath(["AI"], "AI")), ["AI"]);
  assert.deepEqual(plain(core.withPath(["AI"], "")), ["AI"]);
});

test("renamePaths moves a branch with its pages and can merge branches", () => {
  const cols = ["AI", "AI/Agents", "AI/Agents/Papers", "ML"];
  const items = [{ id: 1, path: "AI/Agents/Papers" }, { id: 2, path: "ML" }, { id: 3, path: "AI" }];
  const r = plain(core.renamePaths(cols, items, "AI/Agents", "ML/Agents"));
  assert.deepEqual(r.collections, ["AI", "ML", "ML/Agents", "ML/Agents/Papers"]);
  assert.deepEqual(r.items.map((i) => i.path), ["ML/Agents/Papers", "ML", "AI"]);
  // merge: rename onto an existing branch
  const m = plain(core.renamePaths(["A", "B"], [{ path: "A" }], "A", "B"));
  assert.deepEqual(m.collections, ["B"]);
  assert.equal(m.items[0].path, "B");
  // inputs untouched
  assert.equal(items[0].path, "AI/Agents/Papers");
});

test("deletePaths removes a branch and moves its pages up one level", () => {
  const r = plain(core.deletePaths(["AI", "AI/Agents", "AI/Agents/Papers"], [{ path: "AI/Agents/Papers" }, { path: "AI" }], "AI/Agents"));
  assert.deepEqual(r.collections, ["AI"]);
  assert.deepEqual(r.items.map((i) => i.path), ["AI", "AI"]);
  const top = plain(core.deletePaths(["AI"], [{ path: "AI" }], "AI"));
  assert.deepEqual(top.items.map((i) => i.path), ["Unsorted"]);
});

test("reminder presets land on the expected times", () => {
  const tue2100 = new Date(2026, 10, 3, 21, 0);
  const at = (k) => new Date(core.presetTime(k, tue2100).when);
  assert.equal(at("tonight").getDate(), 4); // 20:00 already passed -> tomorrow
  assert.equal(at("tonight").getHours(), 20);
  assert.equal(at("tomorrow").getHours(), 9);
  assert.equal(at("saturday").getDay(), 6);
  assert.equal(at("saturday").getHours(), 10);
  assert.equal(at("week").getDate(), 10);
  assert.equal(core.presetTime("weekly", tue2100).repeat, "weekly");
  assert.equal(core.presetTime("", tue2100), null);
});

test("weekly review is the next Friday 16:00", () => {
  const next = (d) => new Date(core.nextReviewTime(d));
  assert.equal(next(new Date(2026, 10, 3, 10)).getDate(), 6);   // Tue -> Fri 6th
  assert.equal(next(new Date(2026, 10, 6, 15)).getDate(), 6);   // Fri before 16:00 -> same day
  assert.equal(next(new Date(2026, 10, 6, 16, 30)).getDate(), 13); // Fri after -> next week
  assert.equal(next(new Date(2026, 10, 3, 10)).getHours(), 16);
});

test("due, old and review filters", () => {
  const now = Date.now();
  assert.equal(core.isDue({ read: false, remindAt: now - 1 }, now), true);
  assert.equal(core.isDue({ read: true, remindAt: now - 1 }, now), false);
  assert.ok(!core.isDue({ read: false, remindAt: null }, now));
  assert.equal(core.isOld({ stage: "inbox", created: now - 15 * DAY }, now), true);
  assert.equal(core.isOld({ stage: "kept", created: now - 15 * DAY }, now), false);
  const list = [{ stage: "inbox" }, { stage: "inbox", reviewAfter: now + DAY }, { stage: "kept" }];
  assert.equal(core.forReview(list, now).length, 1);
});

test("guessType recognises common sites", () => {
  assert.equal(core.guessType("https://huggingface.co/learn/agents-course/en/unit0/introduction", "Welcome"), "Course");
  assert.equal(core.guessType("https://www.youtube.com/watch?v=x", "x"), "Video");
  assert.equal(core.guessType("https://arxiv.org/abs/1706.03762", "Attention"), "Paper");
  assert.equal(core.guessType("https://github.com/a/b", "b"), "Tool");
  assert.equal(core.guessType("https://example.com/", "Home"), "Other");
});

test("migrateData: v1 -> v3", () => {
  const v1 = {
    items: [{ id: "a", url: "u", topic: "ai agents" }],
    library: [
      { id: "s1", name: "3 Nov · x", saved: 1, tabs: [] },
      { id: "t1", name: "old", saved: 2, tidied: true, tabs: [{ url: "x" }] },
    ],
  };
  const out = plain(core.migrateData(v1, 1000));
  assert.equal(out.schema, 8);
  assert.equal(out.items[0].read, false);
  assert.equal(out.items[0].stage, "inbox");
  assert.equal(out.items[0].path, "ai agents");
  assert.equal("topic" in out.items[0], false);
  assert.deepEqual(out.collections, ["ai agents"]);
  assert.equal("history" in out, false, "history is dropped at v8");
  assert.deepEqual(out.projects, []);
  assert.equal("library" in out, false);
  assert.equal(v1.items[0].topic, "ai agents", "input must not change");
});

test("migrateData: v2 workspaces become projects; sessions and archive are dropped", () => {
  const v2 = {
    schema: 2,
    items: [{ id: "a", stage: "kept", path: "AI" }],
    collections: ["AI"],
    library: [
      { id: "w", kind: "workspace", name: "PCB clock", saved: 10, updated: 20, tabs: [{ url: "a" }] },
      { id: "s", kind: "auto", name: "closed", saved: 30, tabs: [{ url: "b" }] },
      { id: "t", kind: "tidied", name: "idle", saved: 40, tabs: [{ url: "c" }] },
    ],
  };
  const out = plain(core.migrateData(v2));
  assert.deepEqual(out.projects, [{ id: "w", name: "PCB clock", created: 10, updated: 20, tabs: [{ url: "a" }] }]);
  assert.equal("history" in out, false);
  assert.equal(out.items[0].path, "AI");
});

test("migrateData: a v3 history is migrated without error and dropped", () => {
  const v3 = { schema: 3, history: [{ id: "t", kind: "tidied", saved: 5, tabs: [] }, { id: "a", kind: "auto", saved: 6, tabs: [] }] };
  const out = plain(core.migrateData(v3, 777));
  assert.equal(out.schema, 8);
  assert.equal("history" in out, false);
});

test("migrateData: a schema-7 object with history becomes schema 8 without it, other data intact", () => {
  const v7 = {
    schema: 7,
    items: [{ id: "a", url: "https://a.test/", read: false }],
    projects: [{ id: "w", name: "W", tabs: [] }],
    history: [{ id: "h", kind: "auto", saved: 1, tabs: [{ url: "https://h.test/" }] }],
  };
  const out = plain(core.migrateData(v7));
  assert.equal(out.schema, 8);
  assert.equal("history" in out, false);
  assert.deepEqual(out.items, v7.items);
  assert.deepEqual(out.projects, v7.projects);
  assert.equal(v7.history.length, 1, "input must not change");
});

test("migrateData: v4 -> v5 turns status into read", () => {
  const v4 = { schema: 4, items: [{ id: "a", status: "done" }, { id: "b", status: "doing" }, { id: "c", status: "todo", readAt: 5 }] };
  const out = plain(core.migrateData(v4, 999));
  assert.deepEqual(out.items.map((i) => [i.read, i.readAt, "status" in i]), [[true, 999, false], [false, null, false], [false, null, false]]);
});

test("migrateData is safe to run twice and leaves current data alone", () => {
  const v2 = { schema: 2, library: [{ id: "w", kind: "workspace", name: "W", saved: 1, tabs: [] }] };
  const once = plain(core.migrateData(v2));
  const twice = plain(core.migrateData(once));
  assert.deepEqual(twice, once);
  // a half-finished run (projects already there, library still present) does not duplicate
  const half = plain(core.migrateData({ ...v2, projects: once.projects }));
  assert.equal(half.projects.length, 1);
});

test("phraseKind: 1 word, up to 5 words, longer is a quote", () => {
  assert.equal(core.phraseKind("serendipity"), "word");
  assert.equal(core.phraseKind("  take it with a grain "), "phrase");
  assert.equal(core.phraseKind("one two three four five six"), "quote");
});

test("guessLang: Polish letters, page language, English default", () => {
  assert.equal(core.guessLang("Dzień dobry, jak się masz"), "pl");
  assert.equal(core.guessLang("hello", "de-DE"), "de");
  assert.equal(core.guessLang("hello", ""), "en");
  assert.equal(core.guessLang("hello", "x-klingon"), "en");
  assert.equal(core.langName("pl"), "Polish");
});

test("dictLinks per language", () => {
  const en = plain(core.dictLinks("Grain of salt", "en"));
  assert.deepEqual(en.map((l) => l[0]), ["Cambridge", "Collins", "Google"]);
  assert.equal(en[0][1], "https://dictionary.cambridge.org/dictionary/english/grain-of-salt");
  const pl = plain(core.dictLinks("się", "pl"));
  assert.equal(pl[0][1], "https://sjp.pwn.pl/szukaj/si%C4%99.html");
  assert.equal(plain(core.dictLinks("Haus", "de"))[0][0], "Wiktionary");
});

test("highlightParts finds the word case-insensitively", () => {
  assert.deepEqual(plain(core.highlightParts("Take it with a Grain of salt.", "grain")), ["Take it with a ", "Grain", " of salt."]);
  assert.deepEqual(plain(core.highlightParts("no match here", "zzz")), ["no match here", "", ""]);
});

test("weekStart is Monday 00:00", () => {
  const d = new Date(core.weekStart(new Date(2026, 10, 8, 15).getTime())); // Sunday 8 Nov
  assert.equal(d.getDay(), 1);
  assert.equal(d.getDate(), 2);
  assert.equal(d.getHours(), 0);
  assert.equal(new Date(core.weekStart(new Date(2026, 10, 2, 0, 5).getTime())).getDate(), 2); // Monday itself
});

test("phraseList: by language (biggest first), filters, sorts; quotes never listed", () => {
  const w = (id, lang, extra = {}) => ({ id, text: id, kind: "word", lang, created: Number(id.length), ...extra });
  const list = [w("b", "it", { created: 1, tags: ["food"] }), w("a", "it", { created: 2, fav: true, seen: 3 }), w("c", "en", { created: 9 }),
    { id: "q", text: "q", kind: "quote", lang: "en", created: 1 }, w("d", "it", { created: 3 })];
  const ids = (o) => plain(core.phraseList(list, o).list).map((p) => p.id);
  assert.deepEqual(ids({}), ["d", "a", "b", "c"]);
  assert.deepEqual(ids({ sort: "az" }), ["a", "b", "d", "c"]);
  assert.deepEqual(ids({ sort: "seen" }), ["a", "d", "b", "c"]);
  assert.deepEqual(ids({ lang: "en" }), ["c"]);
  assert.deepEqual(ids({ tag: "food" }), ["b"]);
  assert.deepEqual(ids({ favOnly: true }), ["a"]);
  assert.deepEqual(plain(core.phraseList(list, { lang: "en" }).counts), { it: 3, en: 1 });
});

test("parseTags: lowercase, no #, no repeats, at most 8", () => {
  assert.deepEqual(plain(core.parseTags("Work, #Travel  work,")), ["work", "travel"]);
  assert.equal(core.parseTags("a b c d e f g h i j").length, 8);
});
