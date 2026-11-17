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

test("the accuracy-check samples are valid, cover every subject and include unclear pages", () => {
  const t = load();
  const vmx = (n) => plain(t.get(n));
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "eval-samples.js"), "utf8"), t.ctx);
  const samples = vmx("EVAL_SAMPLES");
  assert.ok(samples.length >= 50);
  const tax = vmx("TAXONOMY");
  const seen = new Set();
  for (const s of samples) {
    const [sub, child] = s.expect.split("/");
    const subj = tax.find((x) => x.id === sub);
    assert.ok(subj, `unknown subject in "${s.title}"`);
    if (child) assert.ok(subj.children.some((c) => c.id === child), `unknown sub in "${s.title}"`);
    seen.add(sub);
  }
  for (const s of tax) assert.ok(seen.has(s.id), `no sample for ${s.id}`);
});

test("idsOfPath and correctionExamples turn your filings into prompt examples", () => {
  const ids = (p) => plain(get("idsOfPath")(p));
  assert.deepEqual(ids("Electronics & Hardware/PCB & Circuit Design"), { subject: "electronics", sub: "pcb" });
  assert.deepEqual(ids("Electronics & Hardware"), { subject: "electronics", sub: "general" });
  assert.equal(ids("AI/Agents"), null);
  const list = [
    { t: "KiCad routing", h: "kicad.org", p: "Electronics & Hardware/PCB & Circuit Design" },
    { t: "My own thing", h: "x.com", p: "PCB Clock" }, // not standard: ignored
    { t: "Pandas guide", h: "pandas.pydata.org", p: "Computing & Software/Data & Databases" },
  ];
  const all = plain(get("correctionExamples")(list));
  assert.equal(all.length, 2);
  assert.match(all[0], /KiCad routing.*-> electronics/);
  const inSubject = plain(get("correctionExamples")(list, "electronics"));
  assert.equal(inSubject.length, 1);
  assert.match(inSubject[0], /-> pcb/);
  assert.match(get("subjectPrompt")({ title: "T", url: "https://x.com" }, list).prompt, /filed similar pages before/);
  assert.doesNotMatch(get("subjectPrompt")({ title: "T", url: "https://x.com" }, []).prompt, /filed similar pages before/);
});

test("withCorrections records only inbox pages filed somewhere new, standard paths only, newest first, capped", () => {
  const f = get("withCorrections");
  const std = "Computing & Software/Programming";
  const items = [
    { id: "1", stage: "inbox", path: "Unsorted", title: "A", url: "https://a.com/x" },
    { id: "2", stage: "inbox", path: std, title: "B", url: "https://b.com/x" }, // AI was right: nothing to learn
    { id: "3", stage: "kept", path: "Other", title: "C", url: "https://c.com/x" },
  ];
  const r = plain(f([{ t: "old", h: "o.com", p: std }], items, ["1", "2", "3"], std));
  assert.deepEqual(r.map((x) => x.t), ["A", "old"]);
  assert.equal(r[0].h, "a.com");
  assert.deepEqual(plain(f([], items, ["1"], "My own collection")), []); // custom paths are not examples
  const many = plain(f(Array.from({ length: 30 }, (_, i) => ({ t: "o" + i, h: "o.com", p: std })), items, ["1"], std));
  assert.equal(many.length, 30);
  assert.equal(many[0].t, "A");
});

test("an unclear page gets up to two suggested subjects as alts", async () => {
  const mk = (replies) => ({ LanguageModel: { create: async () => ({ prompt: async () => JSON.stringify(replies.shift()), clone: async function () { return this; }, destroy() {} }) } });
  const t = load(mk([{ subject: "other", top: ["electronics", "computing", "money"] }, { type: "Other", why: "?", units: 0, tags: [] }]));
  const r = plain(await t.get("aiClassify")({ title: "?", url: "https://x.com" }));
  assert.equal(r.path, "");
  assert.deepEqual(r.alts, ["Electronics & Hardware", "Computing & Software"]);
  const t2 = load(mk([{ subject: "computing", top: ["computing", "data"] }, { sub: "programming", type: "Article", why: "x", units: 0, tags: [] }]));
  const r2 = plain(await t2.get("aiClassify")({ title: "?", url: "https://x.com" }));
  assert.equal(r2.path, "Computing & Software/Programming");
  assert.deepEqual(r2.alts, []);
  assert.equal(r2.subject, "computing");
  assert.equal(r2.sub, "programming");
});
