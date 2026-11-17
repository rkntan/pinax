// Accuracy check: runs aiClassify over EVAL_SAMPLES and shows how often it files like a person would.
const $ = (id) => document.getElementById(id);

// Pure: compares a result to the expected "subject/sub" (sub optional for "other").
function scoreSample(expect, got) {
  const [subject, sub] = expect.split("/");
  const subjectOk = got.subject === subject;
  return { subjectOk, subOk: subjectOk && (!sub || got.sub === sub) };
}

async function run() {
  $("run").disabled = true;
  $("out").replaceChildren();
  const avail = await aiAvailability();
  if (avail !== "available") {
    $("status").textContent = avail === "unsupported" ? "No local AI in this browser." : `Local AI is "${avail}": open the popup and click Organise once to download it.`;
    $("run").disabled = false;
    return;
  }
  const corrections = $("corr").checked ? await getCorrections() : [];
  const rows = [];
  for (const [i, s] of EVAL_SAMPLES.entries()) {
    $("status").textContent = `Classifying ${i + 1} / ${EVAL_SAMPLES.length}…`;
    let got;
    try { got = await aiClassify({ title: s.title, url: s.url, excerpt: s.text }, [], corrections); }
    catch (e) { got = { subject: "error", sub: "", path: String(e.message || e) }; }
    rows.push({ s, got, r: scoreSample(s.expect, got) });
  }
  const real = rows.filter((x) => x.s.expect !== "other");
  const unclear = rows.filter((x) => x.s.expect === "other");
  const subjectHits = real.filter((x) => x.r.subjectOk).length;
  const exactHits = real.filter((x) => x.r.subOk).length;
  const otherHits = unclear.filter((x) => x.r.subjectOk).length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  $("score").innerHTML =
    `<div class="big">${pct(subjectHits, real.length)}% subject · ${pct(exactHits, real.length)}% exact</div>` +
    `<div class="muted">${subjectHits}/${real.length} right subject, ${exactHits}/${real.length} right sub-subject; ` +
    `${otherHits}/${unclear.length} unclear pages correctly left unsorted</div>`;
  const table = document.createElement("table");
  table.innerHTML = "<tr><th></th><th>Page</th><th>Expected</th><th>Got</th></tr>";
  const good = (x) => (x.s.expect === "other" ? x.r.subjectOk : x.r.subOk);
  [...rows.filter((x) => !good(x)), ...rows.filter(good)].forEach((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="${good(x) ? "ok" : "no"}">${good(x) ? "✓" : "✗"}</td><td></td><td></td><td></td>`;
    tr.children[1].textContent = x.s.title;
    tr.children[2].textContent = x.s.expect;
    tr.children[3].textContent = x.got.subject === "error" ? `error: ${x.got.path}` : `${x.got.subject}${x.got.sub ? "/" + x.got.sub : ""}`;
    table.append(tr);
  });
  $("out").append(table);
  $("status").textContent = "Done.";
  $("run").disabled = false;
}

$("run").onclick = run;
