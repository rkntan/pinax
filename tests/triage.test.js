// Unit tests for Inbox triage: URL normalising and bundles.

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

test("normalizeUrl treats the same page written differently as one", () => {
  const a = core.normalizeUrl("http://www.Example.com/a/?utm_source=x&b=2&a=1#top");
  assert.equal(a, "https://example.com/a?a=1&b=2");
  assert.equal(core.normalizeUrl("https://example.com/a?b=2&a=1&fbclid=zz"), a);
  assert.equal(core.normalizeUrl("https://example.com/path/"), "https://example.com/path");
  assert.equal(core.normalizeUrl("https://example.com/"), "https://example.com/");
  assert.notEqual(core.normalizeUrl("https://example.com/a?id=1"), core.normalizeUrl("https://example.com/a?id=2"));
});

test("inboxBundles: duplicates, groups by suggestion, old, unsorted", () => {
  const now = Date.now();
  const I = (id, url, extra = {}) => ({ id, url, stage: "inbox", path: "Unsorted", created: now - DAY, read: false, ...extra });
  const items = [
    { id: "kept", url: "https://arxiv.org/abs/1", stage: "kept", path: "AI", created: now - 10 * DAY },
    I("dup-of-kept", "https://www.arxiv.org/abs/1?utm_source=x", { path: "AI/Agents" }),
    I("a1", "https://a.test/1", { path: "AI/Agents" }),
    I("a2", "https://a.test/2", { path: "AI/Agents" }),
    I("a3", "https://a.test/3", { path: "AI/Agents" }),
    I("v1", "https://v.test/1", { path: "Video" }),
    I("v2", "https://v.test/2", { path: "Video" }),
    I("single", "https://s.test/1", { path: "PCB" }),
    I("old", "https://o.test/1", { created: now - 20 * DAY }),
    I("old-read", "https://o.test/2", { created: now - 20 * DAY, read: true }),
    I("first", "https://d.test/x"),
    I("second", "https://d.test/x/", { created: now }),
  ];
  const b = plain(core.inboxBundles(items, now));
  assert.deepEqual(b.duplicates.map((x) => x.id).sort(), ["dup-of-kept", "second"]);
  assert.deepEqual(b.byPath.map((g) => [g.path, g.items.length]), [["AI/Agents", 3], ["Video", 2]]); // singles left out
  assert.deepEqual(b.old.map((x) => x.id), ["old"]);
  assert.deepEqual(b.unsorted.map((x) => x.id).sort(), ["first", "old", "old-read"]);
});
