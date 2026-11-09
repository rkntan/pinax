// The background worker against a fake chrome: no periodic wake-ups while idle, auto-read
// after 2 minutes still works, and focus changes / page loads don't re-read the items.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const URL_A = "https://ex.com/a";
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const plain = (x) => JSON.parse(JSON.stringify(x));

function boot({ items = [], session = {}, alarms = [] } = {}) {
  const L = {}; // listeners by API path, e.g. "tabs.onActivated"
  const st = { now: 1_700_000_000_000, idle: "active", win: { id: 1, focused: true }, tab: { id: 7, windowId: 1, url: URL_A, active: true } };
  const store = { local: { items: plain(items) }, session: plain(session) };
  const al = new Map(alarms.map((a) => [a.name, a]));
  const log = { itemReads: 0, badge: [], scripts: [] };
  const fire = (p, ...a) => Promise.all((L[p] || []).map((f) => f(...a)));

  function node(p, over = {}) {
    return new Proxy(() => Promise.resolve(undefined), {
      get(_, k) {
        if (typeof k === "symbol" || k === "then") return undefined;
        if (k in over) return over[k];
        if (k === "addListener") return (f) => (L[p] ||= []).push(f);
        if (k === "removeListener" || k === "hasListener") return () => false;
        return (over[k] = node(p ? `${p}.${k}` : k));
      },
    });
  }
  const area = (name) => node(`storage.${name}`, {
    async get(k) {
      const keys = k == null ? Object.keys(store[name]) : typeof k === "string" ? [k] : Array.isArray(k) ? k : Object.keys(k);
      if (name === "local" && keys.includes("items")) log.itemReads++;
      const out = k && typeof k === "object" && !Array.isArray(k) ? plain(k) : {};
      for (const x of keys) if (x in store[name]) out[x] = plain(store[name][x]);
      return out;
    },
    async set(o) {
      const ch = {};
      for (const [k, v] of Object.entries(o)) { ch[k] = { oldValue: store[name][k], newValue: plain(v) }; store[name][k] = plain(v); }
      queueMicrotask(() => { fire("storage.onChanged", ch, name); fire(`storage.${name}.onChanged`, ch); });
    },
    async remove(k) { for (const x of [].concat(k)) delete store[name][x]; },
  });
  const chrome = node("", {
    storage: node("storage", { local: area("local"), session: area("session") }),
    alarms: node("alarms", {
      async create(name, info) { al.set(name, { name, ...info, scheduledTime: info.when ?? st.now + (info.delayInMinutes || info.periodInMinutes) * 60000 }); },
      async clear(name) { return al.delete(name); },
      async get(name) { return al.get(name); },
      async getAll() { return [...al.values()]; },
    }),
    idle: node("idle", { async queryState() { return st.idle; }, setDetectionInterval() {} }),
    windows: node("windows", { async getLastFocused() { return st.win; }, async getAll() { return []; } }),
    tabs: node("tabs", { async query() { return [st.tab]; } }),
    action: node("action", { async setBadgeText(o) { log.badge.push(o.text); }, async setBadgeBackgroundColor() {} }),
    permissions: node("permissions", { async contains() { return true; } }),
    scripting: node("scripting", { async executeScript(o) { log.scripts.push(o.func.name); return [{ result: null }]; } }),
  });
  const ctx = vm.createContext({
    structuredClone, console, crypto: globalThis.crypto, URL, chrome,
    setTimeout: () => 0, clearTimeout() {}, __now: () => st.now,
    importScripts: (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f })),
  });
  vm.runInContext("Date.now = () => __now();", ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  return { st, store, al, log, fire, L };
}

const savedA = { id: "a", url: URL_A, title: "A", stage: "inbox", minutes: 5, created: 1 };
const periodic = (al) => [...al.values()].filter((a) => a.periodInMinutes && a.periodInMinutes < 60);

test("loading the worker and startup create no periodic alarm; startup clears the old read-tick", async () => {
  const w = boot({ alarms: [{ name: "read-tick", periodInMinutes: 1 }] });
  await settle();
  await w.fire("runtime.onStartup");
  await settle();
  assert.equal(w.al.has("read-tick"), false);
  assert.deepEqual(periodic(w.al), []);
});

test("viewing a page that isn't saved schedules nothing", async () => {
  const w = boot({ items: [] });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  assert.equal(w.al.size, 0);
});

test("a saved unread page in view gets a one-shot check at its 2-minute mark, then is marked read", async () => {
  const w = boot({ items: [savedA] });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  const a = w.al.get("read-check");
  assert.ok(a, "read-check scheduled");
  assert.equal(a.when, w.st.now + 120_000);
  assert.equal(a.periodInMinutes, undefined);
  w.st.now += 120_000;
  await w.fire("alarms.onAlarm", { name: "read-check" });
  await settle();
  assert.equal(w.store.local.items[0].read, true);
  assert.equal(w.al.has("read-check"), false, "nothing left to check once read");
});

test("time already viewed counts: the check is scheduled for what's left", async () => {
  const k = "https://ex.com/a";
  const w = boot({ items: [savedA], session: { viewTime: { [k]: 30_000 } } });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  assert.equal(w.al.get("read-check").when, w.st.now + 90_000);
});

test("idle or focus lost clears the check; nothing is marked read early", async () => {
  const w = boot({ items: [savedA] });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  w.st.now += 60_000;
  w.st.idle = "idle";
  await w.fire("idle.onStateChanged", "idle");
  await settle();
  assert.equal(w.al.has("read-check"), false);
  w.st.idle = "active";
  w.st.now += 10 * 60_000; // away for 10 minutes: not counted
  await w.fire("idle.onStateChanged", "active");
  await settle();
  assert.equal(w.al.get("read-check").when, w.st.now + 60_000, "the remaining minute");
  w.st.win = { id: 1, focused: false };
  await w.fire("windows.onFocusChanged", -1);
  await settle();
  assert.equal(w.al.has("read-check"), false);
  assert.ok(!w.store.local.items[0].read);
});

test("saving the page you are viewing starts the check (cache follows storage changes)", async () => {
  const w = boot({ items: [] });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  w.store.local.items = [savedA]; // the popup saved it; the worker hears it from onChanged
  await w.fire("storage.onChanged", { items: { oldValue: [], newValue: [savedA] } }, "local");
  await settle();
  assert.ok(w.al.get("read-check"));
});

// Viewing a page for `ms` before saving it, then the popup saves it.
async function viewThenSave(ms) {
  const w = boot({ items: [] });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  w.st.now += ms;
  w.store.local.items = [savedA];
  await w.fire("storage.onChanged", { items: { oldValue: [], newValue: [savedA] } }, "local");
  await settle();
  return w;
}

test("viewed 3 min, then saved: time is credited but it is never auto-marked read", async () => {
  const w = await viewThenSave(180_000);
  assert.ok(!w.store.local.items[0].read, "not marked on save");
  assert.equal(w.store.session.viewTime["https://ex.com/a"], 180_000);
  assert.equal(w.al.has("read-check"), false);
  w.st.now += 5 * 60_000;
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 });
  await settle();
  assert.ok(!w.store.local.items[0].read, "not marked later either");
});

test("viewed 90 s, then saved: checked 30 s later and marked read", async () => {
  const w = await viewThenSave(90_000);
  assert.ok(!w.store.local.items[0].read);
  assert.equal(w.al.get("read-check").when, w.st.now + 30_000);
  w.st.now += 30_000;
  await w.fire("alarms.onAlarm", { name: "read-check" });
  await settle();
  assert.equal(w.store.local.items[0].read, true);
});

test("focus changes and the badge don't re-read items; badge shows due count or the dot", async () => {
  const due = { ...savedA, id: "d", url: "https://ex.com/d", remindAt: 1 };
  const w = boot({ items: [savedA, due], session: { workingOn: {} } });
  await w.fire("tabs.onActivated", { tabId: 7, windowId: 1 }); // warms the cache
  await settle();
  const reads = w.log.itemReads;
  for (let i = 0; i < 5; i++) await w.fire("windows.onFocusChanged", 1);
  await settle();
  assert.equal(w.log.itemReads, reads, "no items reads on focus change");
  assert.equal(w.log.badge.at(-1), "1");
  await w.fire("storage.onChanged", { items: { oldValue: [savedA, due], newValue: [savedA] } }, "local");
  w.store.session.workingOn = { 1: "p1" };
  await w.fire("storage.session.onChanged", { workingOn: { newValue: { 1: "p1" } } });
  await settle();
  assert.equal(w.log.badge.at(-1), "●");
  assert.equal(w.log.itemReads, reads);
});

test("page load on an allowed site: at most one items read, none when the cache is warm", async () => {
  const w = boot({ items: [savedA] });
  await w.fire("tabs.onUpdated", 7, { status: "complete" }, w.st.tab);
  await settle();
  assert.ok(w.log.itemReads <= 1, `cold: ${w.log.itemReads} reads`);
  assert.ok(w.log.scripts.includes("installDock"), "page tools still installed");
  const reads = w.log.itemReads;
  await w.fire("tabs.onUpdated", 7, { status: "complete" }, w.st.tab);
  await settle();
  assert.equal(w.log.itemReads, reads, "warm: no items read");
});
