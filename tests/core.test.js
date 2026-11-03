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
  assert.equal(core.isDue({ status: "todo", remindAt: now - 1 }, now), true);
  assert.equal(core.isDue({ status: "done", remindAt: now - 1 }, now), false);
  assert.ok(!core.isDue({ status: "todo", remindAt: null }, now));
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

test("temporary sessions expire after 30 days, tidied ones stay", () => {
  const now = Date.now();
  assert.equal(core.expiresInDays({ saved: now }, now), 30);
  assert.equal(core.expiresInDays({ saved: now - 31 * DAY }, now), 0);
  const list = [
    { kind: "saved", saved: now - 31 * DAY },
    { kind: "auto", saved: now - DAY },
    { kind: "tidied", saved: now - 300 * DAY },
  ];
  assert.deepEqual(plain(core.freshHistory(list, now)).map((s) => s.kind), ["auto", "tidied"]);
});

test("migrateData: v1 -> v3", () => {
  const v1 = {
    items: [{ id: "a", url: "u", topic: "ai agents" }],
    library: [
      { id: "s1", name: "3 Nov · x", saved: 1, tabs: [] },
      { id: "t1", name: "old", saved: 2, tidied: true, tabs: [{ url: "x" }] },
    ],
  };
  const out = plain(core.migrateData(v1));
  assert.equal(out.schema, 3);
  assert.equal(out.items[0].stage, "inbox");
  assert.equal(out.items[0].path, "ai agents");
  assert.equal("topic" in out.items[0], false);
  assert.deepEqual(out.collections, ["ai agents"]);
  assert.deepEqual(out.history.map((s) => s.kind), ["saved", "tidied"]);
  assert.deepEqual(out.projects, []);
  assert.equal("library" in out, false);
  assert.equal(v1.items[0].topic, "ai agents", "input must not change");
});

test("migrateData: v2 workspaces become projects, sessions and archive become history", () => {
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
  assert.deepEqual(out.history.map((s) => [s.id, s.kind]), [["s", "auto"], ["t", "tidied"]]);
  assert.equal(out.items[0].path, "AI");
});

test("migrateData is safe to run twice and leaves v3 data alone", () => {
  const v2 = { schema: 2, library: [{ id: "w", kind: "workspace", name: "W", saved: 1, tabs: [] }] };
  const once = plain(core.migrateData(v2));
  const twice = plain(core.migrateData(once));
  assert.deepEqual(twice, once);
  // a half-finished run (projects already there, library still present) does not duplicate
  const half = plain(core.migrateData({ ...v2, projects: once.projects }));
  assert.equal(half.projects.length, 1);
});
