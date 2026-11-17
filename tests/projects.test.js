// Unit tests for project sources (the research trail) in core.js. Run: node --test "tests/*.test.js"

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, TextEncoder, atob, Uint8Array, DataView, ArrayBuffer });
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

test("zipStore writes a valid store-only zip (crc and directory)", () => {
  const zip = core.zipStore([{ name: "a/b.txt", data: Uint8Array.from(Buffer.from("hello")) }], new Date(2026, 0, 2, 3, 4, 6));
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(14, true), 0x3610a686, "crc32 of hello");
  assert.equal(v.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(zip.length - 12, true), 1);
});

test("projectsZip puts images in a folder and links them from note.md", () => {
  const p = { name: "Agents / memory", sources: [], clips: [
    { id: "1", kind: "text", text: "Memory is key.", url: "https://x.test/a", title: "A", caption: "" },
    { id: "2", kind: "image", imgId: "2", url: "https://x.test/b", title: "B", caption: "diagram" },
    { id: "3", kind: "image", src: "https://x.test/c.png", url: "https://x.test/c", title: "C", caption: "" },
  ] };
  const md = core.projectMarkdown(p, [], 0, { 2: "images/01.jpg" });
  assert.match(md, /## Notes\n\n> Memory is key\.\n\nSource: \[A\]\(https:\/\/x\.test\/a\)/);
  assert.match(md, /!\[diagram\]\(images\/01\.jpg\)/);
  assert.match(md, /!\[\]\(https:\/\/x\.test\/c\.png\)/);
  const zip = Buffer.from(core.projectsZip([p], [], { 2: "data:image/jpeg;base64,AAEC" }));
  assert.ok(zip.includes("Agents - memory/images/01.jpg") && zip.includes("Agents - memory/note.md"));
});

test("pickNoteProject prefers the tracked project, else the latest active one", () => {
  const ps = [{ id: "a", updated: 1 }, { id: "b", updated: 5 }, { id: "c", updated: 9, status: "finished" }];
  assert.equal(core.pickNoteProject(ps, "a").id, "a");
  assert.equal(core.pickNoteProject(ps, "c").id, "b");
  assert.equal(core.pickNoteProject([], null), null);
});

test("clockLabel, timeUrl and citeApa", () => {
  assert.equal(core.clockLabel(754), "12:34");
  assert.equal(core.clockLabel(3723), "1:02:03");
  assert.equal(core.timeUrl("https://www.youtube.com/watch?v=abc", 754.9), "https://www.youtube.com/watch?v=abc&t=754s");
  const c = { title: "Agents", author: "Ada Lovelace", site: "Example", date: "2024-03-05", url: "https://x.test/a" };
  assert.equal(core.citeApa(c, new Date(2026, 10, 17)), "Ada Lovelace. (2024, March 5). Agents. Example. Retrieved November 17, 2026, from https://x.test/a");
  assert.match(core.citeApa({ title: "T", url: "https://x.test/a" }), /^x\.test\. \(n\.d\.\)\. T\./);
});

test("noteObsidian writes properties and role callouts; notesZip makes one file per page", () => {
  const n = { url: "https://x.test/a", title: "A: page", text: "mine", highlights: [{ text: "line1\nline2", color: "green", comment: "why" }] };
  const md = core.noteObsidian(n, "AI › Agents", new Date(2026, 10, 17));
  assert.match(md, /^---\nsource: "https:\/\/x\.test\/a"\ntitle: "A: page"\nsaved: 2026-11-17\ncollection: "AI › Agents"\ntags: \[pinax\]\n---\n/);
  assert.match(md, /> \[!quote\] Idea\n> line1\n> line2\n>\n> why\n/);
  const zip = Buffer.from(core.notesZip([n, { ...n }]));
  assert.ok(zip.includes("Notes/A- page.md") && zip.includes("Notes/A- page 2.md"));
});

test("pickNoteProject: a chosen target beats the tracked project", () => {
  const ps = [{ id: "a", updated: 1 }, { id: "b", updated: 5 }, { id: "c", updated: 9, status: "finished" }];
  assert.equal(core.pickNoteProject(ps, "a", "b").id, "b");
  assert.equal(core.pickNoteProject(ps, "a", "c").id, "a", "a finished target is ignored");
});

test("boardColumns: Unsorted first, themes after, a deleted theme falls back", () => {
  const p = { themes: [{ id: "t1", name: "Basics" }], clips: [{ id: "a", theme: "t1" }, { id: "b" }, { id: "c", theme: "gone" }] };
  const cols = plain(core.boardColumns(p));
  assert.deepEqual(cols.map((c) => `${c.name}:${c.clips.map((x) => x.id)}`), ["Unsorted:b,c", "Basics:a"]);
});

test("mergeClipsInto joins text, keeps both sources, refuses images", () => {
  const p = { clips: [
    { id: "a", kind: "text", text: "One", caption: "", url: "https://a.test/1", title: "A" },
    { id: "b", kind: "text", text: "Two", caption: "why", url: "https://b.test/2", title: "B" },
    { id: "i", kind: "image", text: "", url: "https://c.test/3" },
  ] };
  assert.equal(core.mergeClipsInto(p, "b", "a"), true);
  assert.equal(p.clips.length, 2);
  assert.equal(p.clips[0].text, "One\n\nTwo");
  assert.equal(p.clips[0].caption, "why");
  assert.deepEqual(plain(p.clips[0].also), [{ url: "https://b.test/2", title: "B" }]);
  assert.equal(core.mergeClipsInto(p, "i", "a"), false);
});

test("projectMarkdown groups notes under their theme and lists merged sources", () => {
  const p = { name: "Z", sources: [], themes: [{ id: "t", name: "Basics" }], clips: [
    { id: "a", kind: "text", text: "Loose", url: "" },
    { id: "b", kind: "text", text: "Core", theme: "t", url: "https://a.test/1", title: "A", also: [{ url: "https://b.test/2", title: "B" }] },
  ] };
  const md = core.projectMarkdown(p);
  assert.ok(md.indexOf("> Loose") < md.indexOf("### Basics"));
  assert.ok(md.includes("Source: [A](https://a.test/1), [B](https://b.test/2)"));
});
