// Tests for the plain-file exports (bookmarks HTML, CSV). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL });
for (const f of ["taxonomy.js", "core.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
const get = (n) => vm.runInContext(n, ctx);

const items = [
  { title: 'Rust <ownership> & "borrowing"', url: "https://example.org/a?x=1&y=2", stage: "kept", path: "Computing & Software/Programming", type: "Docs", tags: ["rust", "learn"], why: "clear intro", read: true, created: 1700000000000 },
  { title: "Sourdough basics", url: "https://example.com/bread", stage: "kept", path: "Life/Food", type: "Article", tags: [], why: "", read: false, created: 1700000100000 },
  { title: "Weekend trip ideas", url: "https://example.net/trip", stage: "inbox", path: "Unsorted", type: "Article", tags: [], why: "", read: false, created: 1700000200000 },
  { title: "Loose page", url: "https://example.net/loose", stage: "kept", path: "Unsorted", type: "Other", tags: [], why: "", read: false, created: 1700000300000 },
];
const pins = [{ id: "p", url: "https://news.example.com", title: "News" }];
const projects = [{ name: "PCB clock", sources: [{ url: "https://kicad.org", title: "KiCad", status: "useful" }, { url: "https://skip.example", title: "Skipped", status: "skip" }] }];

test("bookmarksHtml makes a Netscape bookmarks file with nested folders and escaped text", () => {
  const html = get("bookmarksHtml")(items, pins, projects);
  assert.match(html, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
  assert.match(html, /<DT><H3>Computing &amp; Software<\/H3>/);
  assert.match(html, /<DT><H3>Programming<\/H3>/);
  assert.match(html, /<A HREF="https:\/\/example\.org\/a\?x=1&amp;y=2" ADD_DATE="1700000000" TAGS="rust,learn">Rust &lt;ownership&gt; &amp; &quot;borrowing&quot;<\/A>/);
  assert.match(html, /<DD>clear intro/);
  assert.match(html, /<DT><H3>Inbox<\/H3>/);
  assert.match(html, /<DT><H3>Pins<\/H3>/);
  assert.match(html, /<DT><H3>PCB clock<\/H3>/);
  assert.match(html, /KiCad/);
  assert.doesNotMatch(html, /Skipped/);
  assert.match(html, /<DT><H3>Unsorted<\/H3>/);
  // every folder that opens also closes
  assert.equal((html.match(/<DL><p>/g) || []).length, (html.match(/<\/DL><p>/g) || []).length);
});

test("bookmarksHtml of nothing is still a valid empty file", () => {
  const html = get("bookmarksHtml")([], [], []);
  assert.match(html, /<DL><p>\n<\/DL><p>/);
});

test("itemsCsv has a header, quotes awkward cells and blocks spreadsheet formulas", () => {
  const rows = get("itemsCsv")([...items, { title: "=HYPERLINK(\"http://evil\")", url: "https://e.com", stage: "inbox", type: "Other", created: 0 }]).replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(rows[0], "title,url,collection,status,type,tags,note,read,saved");
  assert.match(rows[1], /^"Rust <ownership> & ""borrowing""",https:\/\/example\.org\/a\?x=1&y=2,Computing & Software > Programming,kept,Docs,rust learn,clear intro,yes,2023-11-14$/);
  assert.match(rows[3], /^Weekend trip ideas,https:\/\/example\.net\/trip,,inbox,/);
  assert.match(rows[4], /^Loose page,.*,,kept,/);
  assert.match(rows[5], /^"'=HYPERLINK/);
});
