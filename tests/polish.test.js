// Unit tests for Phase 5 helpers: site grouping fallback, tags, quick-search scoring.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
// quick.js registers a key handler at load; give it a do-nothing document
const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(root, "core.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "views", "quick.js"), "utf8"), ctx);
const core = new Proxy({}, { get: (_, name) => vm.runInContext(name, ctx) });
const plain = (x) => JSON.parse(JSON.stringify(x));

test("domainGroups groups 2+ tabs per site", () => {
  const tabs = ["https://github.com/a", "https://kicad.org", "https://www.github.com/b", "https://x.test"].map((url) => ({ url }));
  const g = plain(core.domainGroups(tabs));
  assert.equal(g.length, 1);
  assert.equal(g[0].name, "github.com");
  assert.deepEqual(g[0].tabs, [0, 2]);
});

test("mergeTags tidies, dedupes and caps at 5", () => {
  assert.deepEqual(plain(core.mergeTags(["ai"], ["#Deep Research", "AI", "łódź!", ""])), ["ai", "deep-research", "łódź"]);
  assert.equal(core.mergeTags([], ["a", "b", "c", "d", "e", "f"]).length, 5);
});

test("allTags orders by how often they are used", () => {
  const items = [{ tags: ["x", "y"] }, { tags: ["y"] }, {}];
  assert.deepEqual(plain(core.allTags(items)), ["y", "x"]);
});

test("quickScore: every word must match, word starts rank higher", () => {
  assert.equal(core.quickScore("Hugging Face Agents Course", ["xyz"]), -1);
  assert.equal(core.quickScore("Hugging Face Agents Course", ["agents", "zzz"]), -1);
  const start = core.quickScore("Agents course", ["agents"]);
  const word = core.quickScore("Hugging Face Agents", ["agents"]);
  const inside = core.quickScore("Multiagents", ["agents"]);
  assert.ok(start > word && word > inside, `${start} > ${word} > ${inside}`);
});
