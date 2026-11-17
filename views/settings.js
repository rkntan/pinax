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

function viewSettings() {
  setHead("Settings", "everything stays on this computer");
  setTools();
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
    settingsSection("Reminders", "",
      toggleRow("Daily nudge", resurface, (on) => { time.disabled = !on; chrome.storage.local.set({ resurface: on }); }),
      h("label", { class: "row-inline" }, "at ", time)),

    settingsSection("Updates", "Once a week Pinax asks GitHub for the latest release number. Nothing else is sent, and nothing is installed for you.",
      toggleRow("Check for updates weekly", s.updateCheck?.on !== false, async (on) => {
        const { updateCheck = {} } = await chrome.storage.local.get("updateCheck");
        await chrome.storage.local.set({ updateCheck: { ...updateCheck, on } });
        if (!on) { updateFound = null; $("settings-btn").classList.remove("has-update"); showFound(); }
      }),
      checkNow, updateLine),

    settingsSection("Export & backup", `${(bytes / 1048576).toFixed(1)} MB on this computer`,
      h("div", { class: "set-grid" },
        h("button", { class: "btn", title: "A bookmarks file Chrome, Edge, Firefox and Safari can import", onclick: () => exportPages("bookmarks") }, "Pages (bookmarks)"),
        h("button", { class: "btn", onclick: () => exportPages("csv") }, "Pages (CSV)"),
        h("button", { class: "btn", title: "One row per word: opens in a spreadsheet, or import it into Anki", onclick: exportWords }, "Phrasebook (CSV)"),
        h("button", { class: "btn", title: "Every page's highlights, as one Markdown file", onclick: exportAllNotes }, "Notes (.md)"),
        h("button", { class: "btn", title: "All projects, as one Markdown file", onclick: exportAllProjects }, "Projects (.md)")),
      h("div", { class: "set-grid" },
        h("button", { class: "btn primary", title: "Everything, to restore into Pinax later", onclick: exportBackup }, "Back up everything"),
        h("label", { class: "btn", title: "Restore a Pinax backup (merges, no duplicates)" }, "Restore backup…", importInput))),

    settingsSection("Local AI", "",
      aiLine,
      h("a", { class: "small", href: "eval.html", target: "_blank" }, "Accuracy check")),

    settingsSection("About", "",
      h("span", { class: "small" }, `Pinax ${chrome.runtime.getManifest().version} · MIT licence · `,
        h("a", { href: "https://github.com/rkntan/pinax", target: "_blank" }, "github.com/rkntan/pinax"))));
}
