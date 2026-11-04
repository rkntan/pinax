// Unit tests for reading length, the reading queue and reading stats.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8"), ctx);
const core = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
const plain = (x) => JSON.parse(JSON.stringify(x));
const DAY = 864e5;

test("minutesFor: words at 230/min, short pages don't count, videos by length", () => {
  assert.equal(core.minutesFor({ words: 2300 }), 10);
  assert.equal(core.minutesFor({ words: 160 }), 1);
  assert.equal(core.minutesFor({ words: 100 }), null);
  assert.equal(core.minutesFor({ video: 754 }), 13);
  assert.equal(core.minutesFor(null), null);
});

test("fmtMinutes and lengthLabel", () => {
  assert.equal(core.fmtMinutes(48), "48 min");
  assert.equal(core.fmtMinutes(60), "1 h");
  assert.equal(core.fmtMinutes(190), "3 h 10 min");
  assert.equal(core.lengthLabel({ minutes: 8 }), "8 min");
  assert.equal(core.lengthLabel({ minutes: 12, video: true }), "12 min video");
  assert.equal(core.lengthLabel({}), "");
});

test("readingQueue: unread, shortest first, unknown last, budget, no courses, videos optional", () => {
  const items = [
    { id: "long", minutes: 25, type: "Article", created: 1 },
    { id: "short", minutes: 4, type: "Paper", created: 2 },
    { id: "unknown", type: "Article", created: 3 },
    { id: "read", minutes: 2, type: "Article", read: true, created: 4 },
    { id: "course", minutes: 3, type: "Course", created: 5 },
    { id: "video", minutes: 10, type: "Video", video: true, created: 6 },
  ];
  assert.deepEqual(plain(core.readingQueue(items)).map((x) => x.id), ["short", "long", "unknown"]);
  assert.deepEqual(plain(core.readingQueue(items, { budget: 15 })).map((x) => x.id), ["short"]);
  assert.deepEqual(plain(core.readingQueue(items, { videos: true })).map((x) => x.id), ["short", "video", "long", "unknown"]);
});

test("readingStats counts this week (from Monday) and this month", () => {
  const now = new Date(2026, 10, 4, 12).getTime(); // Wed 4 Nov
  const items = [
    { read: true, readAt: now - DAY, minutes: 10, created: now - 2 * DAY },     // this week
    { read: true, readAt: now - 3 * DAY, minutes: 5, created: now - 20 * DAY }, // Sun 1 Nov: month, not week
    { read: true, readAt: now - 10 * DAY, minutes: 7, created: now - 30 * DAY },// October
    { read: false, minutes: 20, created: now },
    { read: false, created: now - 2 * DAY },
  ];
  assert.deepEqual(plain(core.readingStats(items, now)), {
    weekRead: 1, weekMinutes: 10, weekSaved: 3,
    monthRead: 2, monthMinutes: 15, monthSaved: 3,
    unread: 2, unreadMinutes: 20,
  });
});

test("resumePct: only for started, unfinished, recent, unread pages", () => {
  const now = Date.now();
  assert.equal(core.resumePct({ pos: { pct: 63.6, at: now } }, now), 64);
  assert.equal(core.resumePct({ pos: { pct: 3, at: now } }, now), null);
  assert.equal(core.resumePct({ pos: { pct: 97, at: now } }, now), null);
  assert.equal(core.resumePct({ pos: { pct: 50, at: now - 40 * DAY } }, now), null);
  assert.equal(core.resumePct({ read: true, pos: { pct: 50, at: now } }, now), null);
  assert.equal(core.resumePct({}, now), null);
});

test("dockConfig: shows for saved pages, pages with notes or just used; respects hidden sites", () => {
  const base = { origin: "https://a.test", hiddenSites: [] };
  assert.equal(core.dockConfig(base).show, false);
  assert.equal(core.dockConfig({ ...base, used: true }).show, true);
  assert.equal(core.dockConfig({ ...base, note: { highlights: [{}], text: "" } }).show, true);
  assert.equal(core.dockConfig({ ...base, note: { highlights: [], text: "  " } }).show, false);
  const item = { pos: { pct: 40, at: Date.now() } };
  const c = plain(core.dockConfig({ ...base, item }));
  assert.equal(c.show, true);
  assert.equal(c.track, true);
  assert.equal(c.resume, 40);
  assert.equal(core.dockConfig({ ...base, used: true, hiddenSites: ["https://a.test"] }).show, false);
  assert.equal(core.dockConfig({ ...base, y: 200 }).y, 85);
});
