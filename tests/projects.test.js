// Unit tests for project sources (the research trail) in core.js. Run: node --test "tests/*.test.js"

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8"), ctx);
const core = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
const plain = (x) => JSON.parse(JSON.stringify(x));

// survey -> paper -> repo, survey -> blog; hn (root)
const S = (id, parent, added, status = "unread", url = "https://x.test/" + id) => ({ id, parent, added, status, url, title: id, note: "" });
const trail = () => [S("survey", null, 1), S("paper", "survey", 2), S("hn", null, 3), S("repo", "paper", 4), S("blog", "survey", 5)];

test("isSearchPage spots search result pages only", () => {
  assert.equal(core.isSearchPage("https://www.google.com/search?q=agents"), true);
  assert.equal(core.isSearchPage("https://www.google.pl/search?q=agents"), true);
  assert.equal(core.isSearchPage("https://duckduckgo.com/?q=agents"), true);
  assert.equal(core.isSearchPage("https://www.google.com/maps"), false);
  assert.equal(core.isSearchPage("https://arxiv.org/abs/1"), false);
  assert.equal(core.isSearchPage("not a url"), false);
});

test("sourceTree is depth-first in opening order, with depth", () => {
  const t = plain(core.sourceTree(trail()));
  assert.deepEqual(t.map((n) => `${n.s.id}:${n.depth}`), ["survey:0", "paper:1", "repo:2", "blog:1", "hn:0"]);
  assert.equal(t[0].children, 2);
  // a missing parent becomes a root; a loop doesn't hang
  const odd = [S("a", "gone", 1), S("b", "c", 2), S("c", "b", 3)];
  assert.deepEqual(plain(core.sourceTree(odd)).map((n) => n.s.id), ["a"]);
});

test("descendants and nextUnread", () => {
  const src = trail();
  assert.deepEqual(plain(core.descendants(src, "survey")).sort(), ["blog", "paper", "repo"]);
  assert.deepEqual(plain(core.descendants(src, "hn")), []);
  src.find((s) => s.id === "survey").status = "useful";
  assert.equal(core.nextUnread(src).id, "paper");
  assert.equal(core.nextUnread(src, "repo").id, "blog");
  assert.equal(core.nextUnread(src, "hn").id, "paper"); // wraps around
  src.forEach((s) => (s.status = "skip"));
  assert.equal(core.nextUnread(src), null);
});

test("projectProgress counts statuses", () => {
  const src = trail();
  src[0].status = "useful"; src[1].status = "skip"; src[2].status = "later";
  assert.deepEqual(plain(core.projectProgress({ sources: src })), { total: 5, unread: 2, useful: 1, later: 1, skip: 1, sorted: 3 });
  assert.equal(core.projectProgress({}).total, 0);
});

test("withSource adds once per URL and ignores unknown parents", () => {
  const p = { sources: [] };
  const a = core.withSource(p, { url: "https://a.test", title: "A" });
  assert.equal(a.added, true);
  const again = core.withSource(a.project, { url: "https://a.test", title: "A2" });
  assert.equal(again.added, false);
  assert.equal(again.source.id, a.source.id);
  const b = core.withSource(a.project, { url: "https://b.test" }, a.source.id);
  assert.equal(b.source.parent, a.source.id);
  const c = core.withSource(b.project, { url: "https://c.test" }, "nope");
  assert.equal(c.source.parent, null);
  assert.equal(p.sources.length, 0, "input must not change");
});

test("parkedSources keeps who opened whom and skips search pages", () => {
  const tabs = [
    { id: 3, url: "https://repo.test", title: "repo", openerTabId: 2 },
    { id: 1, url: "https://survey.test", title: "survey" },
    { id: 2, url: "https://paper.test", title: "paper", openerTabId: 1 },
    { id: 4, url: "https://www.google.com/search?q=x", title: "search", openerTabId: 1 },
    { id: 5, url: "chrome://settings", title: "settings" },
    { id: 6, url: "https://loop.test", openerTabId: 7 },
    { id: 7, url: "https://loop2.test", openerTabId: 6 },
  ];
  const r = plain(core.parkedSources({ sources: [] }, tabs));
  assert.equal(r.count, 5);
  const by = Object.fromEntries(r.sources.map((s) => [s.title, s]));
  assert.equal(by.survey.parent, null);
  assert.equal(by.paper.parent, by.survey.id);
  assert.equal(by.repo.parent, by.paper.id);
  assert.equal(r.sources.some((s) => s.url.includes("google")), false);
  // parking the same window again adds nothing
  assert.equal(core.parkedSources({ sources: r.sources }, tabs).count, 0);
});

test("projectMarkdown lists useful sources with notes and quotes", () => {
  const src = trail();
  src[0].status = "useful"; src[0].note = "best overview";
  src[3].status = "useful";
  const md = core.projectMarkdown({ name: "Agent memory", sources: src }, [{ url: src[0].url, text: "Memory is key." }]);
  assert.match(md, /^# Agent memory\n/);
  assert.match(md, /2 useful of 5 pages/);
  assert.match(md, /- \[survey\]\(https:\/\/x\.test\/survey\) — best overview\n  > Memory is key\.\n/);
  assert.match(md, /- \[repo\]\(https:\/\/x\.test\/repo\)\n/);
  assert.doesNotMatch(md, /hn/);
});

test("sourceForUrl ignores finished projects", () => {
  const projects = [
    { id: "f", status: "finished", sources: [S("x", null, 1)] },
    { id: "a", sources: [S("x", null, 1)] },
  ];
  assert.equal(core.sourceForUrl(projects, "https://x.test/x").project.id, "a");
  assert.equal(core.sourceForUrl(projects, "https://x.test/none"), null);
});
