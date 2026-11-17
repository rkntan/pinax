// Tests for the opt-in update check. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(extra = {}) {
  const ctx = vm.createContext({ structuredClone, console, crypto: globalThis.crypto, URL, ...extra });
  for (const f of ["taxonomy.js", "core.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  return (name) => vm.runInContext(name, ctx);
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test("isNewerVersion compares dotted versions numerically", () => {
  const get = load();
  const newer = get("isNewerVersion");
  assert.equal(newer("1.15.0", "1.14.0"), true);
  assert.equal(newer("v1.10.0", "1.9.9"), true);
  assert.equal(newer("1.14.0", "1.14.0"), false);
  assert.equal(newer("1.14", "1.14.0"), false);
  assert.equal(newer("1.13.9", "1.14.0"), false);
  assert.equal(newer("2.0.0", "1.99.99"), true);
});

test("parseRelease accepts only a clean tag and a link into this repo", () => {
  const parse = load()("parseRelease");
  const ok = { tag_name: "v1.15.0", html_url: "https://github.com/rkntan/pinax/releases/tag/v1.15.0" };
  assert.deepEqual(plain(parse(ok)), { version: "1.15.0", url: ok.html_url });
  assert.equal(parse({ ...ok, html_url: "https://evil.example/pinax" }), null);
  assert.equal(parse({ ...ok, tag_name: "latest" }), null);
  assert.equal(parse({}), null);
  assert.equal(parse(null), null);
});

function env({ stored = {}, release, version = "1.14.0" }) {
  const calls = { fetch: 0 };
  const store = { ...stored };
  const chrome = {
    runtime: { getManifest: () => ({ version }) },
    storage: { local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => Object.assign(store, plain(o)),
    } },
  };
  const fetch = async () => { calls.fetch++; return { ok: true, json: async () => release }; };
  return { get: load({ chrome, fetch }), calls, store };
}
const REL = { tag_name: "v1.15.0", html_url: "https://github.com/rkntan/pinax/releases/tag/v1.15.0" };

test("the update check is on by default, and does nothing (no request) once you switch it off", async () => {
  const on = env({ release: REL });
  assert.equal(plain(await on.get("checkForUpdate")()).version, "1.15.0");
  assert.equal(on.calls.fetch, 1);
  const off = env({ stored: { updateCheck: { on: false } }, release: REL });
  assert.equal(await off.get("checkForUpdate")(), null);
  assert.equal(off.calls.fetch, 0);
});

test("when on, it asks GitHub once a week and reports a newer release", async () => {
  const e = env({ stored: { updateCheck: { on: true } }, release: REL });
  const found = plain(await e.get("checkForUpdate")());
  assert.equal(found.version, "1.15.0");
  assert.equal(e.calls.fetch, 1);
  // checked again right away: answered from storage, no second request
  assert.equal(plain(await e.get("checkForUpdate")()).version, "1.15.0");
  assert.equal(e.calls.fetch, 1);
  // a week later it asks again
  e.store.updateCheck.lastCheck = Date.now() - 8 * 864e5;
  await e.get("checkForUpdate")();
  assert.equal(e.calls.fetch, 2);
});

test("no notice when you already have the latest version", async () => {
  const e = env({ stored: { updateCheck: { on: true } }, release: REL, version: "1.15.0" });
  assert.equal(await e.get("checkForUpdate")(), null);
});

test("nextDailyTime gives the next HH:MM after now, today or tomorrow, and falls back to 10:00", () => {
  const next = load()("nextDailyTime");
  const at = (iso) => new Date(iso);
  const hm = (ms) => { const d = new Date(ms); return [d.getDate(), d.getHours(), d.getMinutes()]; };
  assert.deepEqual(hm(next("08:30", at("2026-11-17T07:00:00"))), [17, 8, 30]);
  assert.deepEqual(hm(next("08:30", at("2026-11-17T09:00:00"))), [18, 8, 30]);
  assert.deepEqual(hm(next("08:30", at("2026-11-17T08:30:00"))), [18, 8, 30]); // strictly after now
  assert.deepEqual(hm(next("garbage", at("2026-11-17T07:00:00"))), [17, 10, 0]);
  assert.deepEqual(hm(next("25:99", at("2026-11-17T07:00:00"))), [17, 10, 0]);
});
