// Unit tests for page notes in core.js (the page-marking code needs a real page; see TESTING.md).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "core.js"), "utf8"), ctx);
const core = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
const plain = (x) => JSON.parse(JSON.stringify(x));

test("pageKey drops the #fragment only", () => {
  assert.equal(core.pageKey("https://a.test/post?id=1#section-3"), "https://a.test/post?id=1");
  assert.equal(core.pageKey("https://a.test/post"), "https://a.test/post");
  assert.equal(core.pageKey("not a url"), "not a url");
});

test("noteMarkdown: title link, highlights as quotes with comments, then notes", () => {
  const n = {
    title: "Memory [draft]", url: "https://a.test/m",
    highlights: [{ text: "Agents forget.", comment: "key point" }, { text: "Line one\nline two", comment: "" }],
    text: "My summary.\n",
  };
  assert.equal(core.noteMarkdown(n),
    "## [Memory draft](https://a.test/m)\n\n> Agents forget.\n>\n> — key point\n\n> Line one\n> line two\n\nMy summary.\n");
  assert.match(core.noteMarkdown({ ...n, text: "" }, "#"), /^# \[Memory draft\]/);
});

test("noteHit searches title, url, notes, highlights and comments", () => {
  const n = { title: "T", url: "https://a.test", text: "about memory", highlights: [{ text: "Vector stores", comment: "compare with graphs" }] };
  assert.equal(core.noteHit(n, ""), true);
  assert.equal(core.noteHit(n, "vector"), true);
  assert.equal(core.noteHit(n, "graphs"), true);
  assert.equal(core.noteHit(n, "memory"), true);
  assert.equal(core.noteHit(n, "zebra"), false);
});

test("markList gives each highlight its colour", () => {
  const list = plain(core.markList({ highlights: [{ id: "a", text: "x", color: "green" }, { id: "b", text: "y", color: "nope" }] }));
  assert.deepEqual(list.map((x) => x.color), ["#b2f2bb", "#ffe066"]);
  assert.deepEqual(plain(core.markList(null)), []);
});

test("migrateData v5 -> v6 moves Phrasebook quotes into page notes", () => {
  const v5 = {
    schema: 5,
    phrases: [
      { id: "w", kind: "word", text: "serendipity", url: "https://a.test/x" },
      { id: "q1", kind: "quote", text: "A long quote here.", url: "https://a.test/x#p2", title: "X", note: "nice", created: 5 },
      { id: "q2", kind: "quote", text: "Another one.", url: "https://a.test/x", title: "X", created: 6 },
    ],
  };
  const out = plain(core.migrateData(v5));
  assert.equal(out.schema, 6);
  assert.deepEqual(out.phrases.map((p) => p.id), ["w"]);
  const n = out.notes["https://a.test/x"];
  assert.deepEqual(n.highlights.map((h) => [h.id, h.comment]), [["q1", "nice"], ["q2", ""]]);
  // running again changes nothing
  assert.deepEqual(plain(core.migrateData(out)), out);
});

test("highlightsText joins highlights, comments and notes for the summariser", () => {
  const n = { highlights: [{ text: "A", comment: "" }, { text: "B", comment: "why" }], text: " mine \n" };
  assert.equal(core.highlightsText(n), "- A\n- B (my comment: why)\n\nMy notes:\nmine");
  assert.equal(core.highlightsText(null), "");
});

test("noteMarkdown ends with the AI key ideas; search finds summary text", () => {
  const n = { title: "T", url: "https://a.test", highlights: [], text: "", summary: { text: "- idea one", source: "highlights" } };
  assert.match(core.noteMarkdown(n), /\*\*Key ideas \(AI\)\*\*\n\n- idea one\n$/);
  assert.match(core.noteMarkdown({ ...n, summary: { text: "Short.", source: "page" } }), /\*\*Summary \(AI\)\*\*/);
  assert.equal(core.noteHit(n, "idea one"), true);
});

test("aiSummary says so when no local AI exists", async () => {
  await assert.rejects(() => core.aiSummary("some text"), /No local AI/);
});
