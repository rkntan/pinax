// Settings page (gear at the bottom of the left rail): reminders, tabs, updates, your data, AI.

$("settings-btn").onclick = () => go("settings");

let updateFound = null; // { version, url } when GitHub has a newer release than this one

// Weekly update check (on unless switched off): marks the gear when a newer release exists.
async function checkUpdateQuietly({ force = false } = {}) {
  try { updateFound = await checkForUpdate({ force }); } catch (e) { if (force) throw e; }
  $("settings-btn").classList.toggle("has-update", !!updateFound);
  $("settings-btn").title = updateFound ? `Settings · Pinax ${updateFound.version} is available` : "Settings";
}

const AI_STATUS = {
  available: "Ready. Sorting and summaries run on this computer.",
  downloadable: "Not downloaded yet. Click Organise in the popup once.",
  downloading: "The model is downloading.",
  unavailable: "Not available here. Simple rules sort your saves.",
  unsupported: "Not available in this browser. Simple rules sort your saves.",
};

function settingsSection(title, hint, ...rows) {
  return h("section", { class: "set-sec" },
    h("h3", {}, title),
    hint ? h("p", { class: "muted small" }, hint) : null,
    h("div", { class: "set-rows" }, ...rows));
}

function toggleRow(label, checked, onchange, title = "") {
  return h("label", { class: "check", title }, h("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target.checked) }), label);
}

// The standard subjects, read-only, with how many of your kept pages sit in each (click to open).
function subjectsList() {
  const row = (label, path, extra = "") => {
    const n = countIn(path);
    return h("div", { class: "subj-row" },
      n ? h("a", { href: "#", onclick: (e) => { e.preventDefault(); go("col", path); } }, label) : h("span", {}, label),
      h("span", { class: "n" }, n ? String(n) : ""), extra);
  };
  return h("div", { class: "subjects" }, TAXONOMY.filter((s) => s.id !== "other").map((s) =>
    h("details", {},
      h("summary", {}, row(s.label, s.label)),
      h("div", { class: "subj-kids" }, s.children.map((c) => row(c.label, `${s.label}/${c.label}`))))));
}

function viewSettings() {
  setHead("Settings", "everything stays on this computer");
  $("tools").replaceChildren();
  const root = h("div", { class: "settings" });
  fillSettings(root);
  return root;
}

async function fillSettings(root) {
  const s = await chrome.storage.local.get(["resurface", "nudgeTime", "updateCheck"]);
  const resurface = s.resurface !== false;
  const nudgeTime = /^\d\d:\d\d$/.test(s.nudgeTime) ? s.nudgeTime : DEFAULT_NUDGE;

  const time = h("input", {
    type: "time", class: "input", value: nudgeTime, disabled: !resurface,
    onchange: (e) => e.target.value && chrome.storage.local.set({ nudgeTime: e.target.value }),
  });
  const updateLine = h("span", { class: "small" });
  const showFound = () => {
    updateLine.replaceChildren(updateFound ? h("a", { href: updateFound.url, target: "_blank" }, `Pinax ${updateFound.version} is available`) : "");
  };
  showFound();
  const checkNow = h("button", {
    class: "btn",
    onclick: async () => {
      checkNow.disabled = true;
      try {
        await checkUpdateQuietly({ force: true });
        updateLine.textContent = updateFound ? "" : `Pinax ${chrome.runtime.getManifest().version} is the latest.`;
        showFound();
      } catch { updateLine.textContent = "Couldn't reach GitHub."; }
      checkNow.disabled = false;
    },
  }, "Check now");

  const bytes = await chrome.storage.local.getBytesInUse(null);
  const aiLine = h("span", { class: "small muted" }, "Checking…");
  aiAvailability().then((a) => (aiLine.textContent = AI_STATUS[a] || AI_STATUS.unsupported));
  const importInput = h("input", { type: "file", accept: "application/json", hidden: true, onchange: async (e) => { await importBackup(e.target.files[0]); e.target.value = ""; } });

  root.replaceChildren(
    settingsSection("Reminders", "One kept page comes back each day; the weekly review is Friday 16:00.",
      toggleRow("Daily nudge", resurface, (on) => { time.disabled = !on; chrome.storage.local.set({ resurface: on }); }),
      h("label", { class: "row-inline" }, "at ", time)),

    settingsSection("Tabs and history", "Idle tabs are closed into History, where you can restore them for 30 days.",
      toggleRow("Remember closed windows", autoSessionOn, (on) => { autoSessionOn = on; chrome.storage.local.set({ autoSession: on }); }),
      ...tidyTools()),

    settingsSection("Updates", "Once a week Pinax asks GitHub for the latest release number. Nothing else is sent, and nothing is installed for you.",
      toggleRow("Check for updates weekly", s.updateCheck?.on !== false, async (on) => {
        const { updateCheck = {} } = await chrome.storage.local.get("updateCheck");
        await chrome.storage.local.set({ updateCheck: { ...updateCheck, on } });
        if (!on) { updateFound = null; $("settings-btn").classList.remove("has-update"); showFound(); }
      }),
      checkNow, updateLine),

    settingsSection("Your pages", `You are never tied to Pinax. Saved on this computer: ${(bytes / 1048576).toFixed(1)} MB.`,
      h("button", { class: "btn", title: "A bookmarks file Chrome, Edge, Firefox and Safari can import", onclick: () => exportPages("bookmarks") }, "Export bookmarks"),
      h("button", { class: "btn", title: "One row per saved page, for a spreadsheet", onclick: () => exportPages("csv") }, "Export CSV"),
      h("button", { class: "btn", title: "Everything, to restore into Pinax later", onclick: exportBackup }, "Backup"),
      h("label", { class: "btn", title: "Restore a Pinax backup (merges, no duplicates)" }, "Import backup", importInput)),

    settingsSection("Subjects", "The standard list the AI files into, the same for everyone. It never invents new ones; you can still make your own collections. Open one to see its sub-subjects.",
      subjectsList()),

    settingsSection("Local AI", "",
      aiLine,
      h("a", { class: "small", href: "eval.html", target: "_blank", title: "Score the local AI on sample pages" }, "Accuracy check")),

    settingsSection("About", "",
      h("span", { class: "small" }, `Pinax ${chrome.runtime.getManifest().version} · MIT licence · `,
        h("a", { href: "https://github.com/rkntan/pinax", target: "_blank" }, "github.com/rkntan/pinax"))));
}
