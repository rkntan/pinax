// Tests for the fixed subject taxonomy and the two-step classifier. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(extra = {}) {
  const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, ...extra });
  for (const f of ["taxonomy.js", "core.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  return { ctx, get: (name) => vm.runInContext(name, ctx) };
}
const { get } = load();
const plain = (x) => JSON.parse(JSON.stringify(x));

test("taxonomy is well formed: unique ids and labels, two levels, no path separators", () => {
  const tax = plain(get("TAXONOMY"));
  const ids = new Set(), labels = new Set();
  for (const s of tax) {
    assert.ok(!ids.has(s.id), `duplicate subject id ${s.id}`);
    ids.add(s.id);
    for (const x of [s, ...s.children]) {
      assert.ok(!/[\/›>]/.test(x.label), `separator in label "${x.label}"`);
      assert.ok(x.label.length <= 40, `label too long: ${x.label}`);
    }
    for (const c of s.children) assert.equal(c.children, undefined); // two levels only
    assert.ok(s.children.length <= 10, `${s.id} has too many children for a small model`);
    const kids = new Set(s.children.map((c) => c.id));
    assert.equal(kids.size, s.children.length, `duplicate child id in ${s.id}`);
    [s.label, ...s.children.map((c) => `${s.label}/${c.label}`)].forEach((p) => {
      assert.ok(!labels.has(p), `duplicate path ${p}`);
      labels.add(p);
    });
  }
  assert.ok(ids.has("other"));
  assert.ok(tax.length <= 16, "keep the first step short");
});

test("taxonomyPath builds standard paths and rejects anything else", () => {
  assert.equal(get("taxonomyPath")("electronics", "pcb"), "Electronics & Hardware/PCB & Circuit Design");
  assert.equal(get("taxonomyPath")("electronics", "general"), "Electronics & Hardware");
  assert.equal(get("taxonomyPath")("electronics", "nope"), "Electronics & Hardware");
  assert.equal(get("taxonomyPath")("other", "pcb"), "");
  assert.equal(get("taxonomyPath")("made-up", "pcb"), "");
  assert.equal(get("isStandardPath")("Computing & Software/Programming"), true);
  assert.equal(get("isStandardPath")("AI/Agents"), false);
});

test("the first-step schema only allows subject ids; the second step only that subject's children", () => {
  const a = plain(get("subjectPrompt")({ title: "T", url: "https://x.com/a", excerpt: "about boards" }));
  assert.deepEqual(a.schema.properties.subject.enum, plain(get("SUBJECT_IDS")));
  assert.match(a.prompt, /Page text: about boards/);
  assert.match(a.prompt, /electronics: Electronics & Hardware/);
  const b = plain(get("detailPrompt")("electronics", ["pcb-clock"]));
  assert.deepEqual(b.schema.properties.sub.enum, ["embedded", "pcb", "components", "iot", "robotics", "computers", "general"]);
  assert.ok(b.schema.required.includes("sub"));
  assert.match(b.prompt, /pcb-clock/);
  const o = plain(get("detailPrompt")("other"));
  assert.equal(o.schema.properties.sub, undefined);
});

test("pageContext trims long page text", () => {
  const c = get("pageContext")({ title: "T", url: "https://www.site.org/p", excerpt: "x ".repeat(2000) });
  assert.ok(c.length < 1100);
  assert.match(c, /Site: site.org/);
});

test("aiClassify files a page in two steps and falls back to unsorted for 'other'", async () => {
  const answers = [];
  const make = (replies) => ({
    LanguageModel: {
      create: async () => ({
        prompt: async (p, o) => { answers.push(o.responseConstraint); return JSON.stringify(replies.shift()); },
        clone: async function () { return this; },
        destroy() {},
      }),
    },
  });
  const t1 = load(make([{ subject: "electronics" }, { sub: "pcb", type: "Article", why: "KiCad routing", units: 0, tags: ["kicad"] }]));
  const r = plain(await t1.get("aiClassify")({ title: "Routing", url: "https://x.com" }));
  assert.equal(r.path, "Electronics & Hardware/PCB & Circuit Design");
  assert.equal(r.type, "Article");
  assert.equal(answers.length, 2);

  const t2 = load(make([{ subject: "other" }, { type: "Other", why: "?", units: 0, tags: [] }]));
  assert.equal(plain(await t2.get("aiClassify")({ title: "?", url: "https://x.com" })).path, "");

  const t3 = load(make([{ subject: "electronics" }, { sub: "general", type: "Docs", why: "x", units: 0, tags: [] }]));
  assert.equal(plain(await t3.get("aiClassify")({ title: "?", url: "https://x.com" })).path, "Electronics & Hardware");
});

test("legacyToStandard maps everyday names onto the standard list", () => {
  const f = get("legacyToStandard");
  assert.equal(f("AI/Agents"), "Computing & Software/AI & Machine Learning");
  assert.equal(f("AI"), "Computing & Software/AI & Machine Learning");
  assert.equal(f("Electronics/PCB"), "Electronics & Hardware/PCB & Circuit Design");
  assert.equal(f("Electronics"), "Electronics & Hardware");
  assert.equal(f("Learning/Languages"), "Learning & Languages/Languages");
  assert.equal(f("AI/Agents/Papers"), "Computing & Software/AI & Machine Learning");
  assert.equal(f("Computing & Software/Programming"), "Computing & Software/Programming");
  assert.equal(f("My secret stuff"), null);
  assert.equal(f("Unsorted"), null);
  assert.equal(f(""), null);
});

test("alignPlan / applyAlign move pages, keep custom collections, and are idempotent", () => {
  const items = [
    { id: "1", stage: "kept", path: "AI/Agents" },
    { id: "2", stage: "inbox", path: "Electronics/PCB" },
    { id: "3", stage: "kept", path: "PCB Clock" },
    { id: "4", stage: "kept", path: "Unsorted" },
  ];
  const cols = ["AI", "AI/Agents", "Electronics", "Electronics/PCB", "PCB Clock"];
  const plan = plain(get("alignPlan")(items, cols));
  assert.equal(plan["AI/Agents"], "Computing & Software/AI & Machine Learning");
  assert.equal(plan["PCB Clock"], undefined);
  const r = plain(get("applyAlign")(items, cols, plan));
  assert.equal(r.items[0].path, "Computing & Software/AI & Machine Learning");
  assert.equal(r.items[2].path, "PCB Clock");
  assert.ok(r.collections.includes("PCB Clock"));
  assert.ok(r.collections.includes("Computing & Software"));
  assert.ok(!r.collections.includes("AI/Agents"));
  // second run changes nothing
  assert.deepEqual(plain(get("alignPlan")(r.items, r.collections)), {});
});
