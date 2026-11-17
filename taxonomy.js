// The fixed subject taxonomy (plain script, loaded before core.js). Two levels only.
// Ids are stable; labels are what the user sees and what collection paths are made of
// ("Electronics & Hardware/PCB & Circuit Design"). The AI can only pick from this list, so
// collections stay the same for everyone. "other" means: leave it in the Inbox for manual filing.

const TAXONOMY = [
  { id: "computing", label: "Computing & Software", children: [
      { id: "programming", label: "Programming" },
      { id: "web", label: "Web Development" },
      { id: "ai-ml", label: "AI & Machine Learning" },
      { id: "data", label: "Data & Databases" },
      { id: "security", label: "Security & Privacy" },
      { id: "devops-cloud", label: "DevOps & Cloud" },
      { id: "os-tools", label: "Operating Systems & Dev Tools" },
      { id: "apps", label: "Apps & Software Tools" },
    ] },
  { id: "electronics", label: "Electronics & Hardware", children: [
      { id: "embedded", label: "Embedded & Firmware" },
      { id: "pcb", label: "PCB & Circuit Design" },
      { id: "components", label: "Components & Datasheets" },
      { id: "iot", label: "IoT, Sensors & Wireless" },
      { id: "robotics", label: "Robotics & Automation" },
      { id: "computers", label: "Computers & Devices" },
    ] },
  { id: "engineering", label: "Engineering & Making", children: [
      { id: "mechanical", label: "Mechanical & CAD" },
      { id: "3d-printing", label: "3D Printing & Fabrication" },
      { id: "manufacturing", label: "Manufacturing & Industry" },
      { id: "energy", label: "Energy & Power" },
      { id: "diy", label: "DIY & Maker Projects" },
    ] },
  { id: "science", label: "Science & Math", children: [
      { id: "math", label: "Mathematics & Statistics" },
      { id: "physics", label: "Physics & Astronomy" },
      { id: "chemistry", label: "Chemistry & Materials" },
      { id: "life-sciences", label: "Biology & Medicine Research" },
      { id: "earth", label: "Earth & Environment" },
    ] },
  { id: "business", label: "Business & Work", children: [
      { id: "management", label: "Management & Strategy" },
      { id: "marketing", label: "Marketing & Sales" },
      { id: "productivity", label: "Productivity & Workflows" },
      { id: "careers", label: "Careers & Hiring" },
      { id: "legal", label: "Legal & Compliance" },
      { id: "startups", label: "Startups & Product" },
    ] },
  { id: "money", label: "Money & Economy", children: [
      { id: "personal-finance", label: "Personal Finance" },
      { id: "investing", label: "Investing & Markets" },
      { id: "economics", label: "Economics" },
      { id: "shopping", label: "Shopping & Deals" },
    ] },
  { id: "health", label: "Health & Fitness", children: [
      { id: "fitness", label: "Fitness & Sport" },
      { id: "nutrition", label: "Food & Nutrition" },
      { id: "medical", label: "Medical & Wellbeing" },
      { id: "mind", label: "Mind & Mental Health" },
    ] },
  { id: "learning", label: "Learning & Languages", children: [
      { id: "languages", label: "Languages" },
      { id: "study", label: "Study Skills & Education" },
      { id: "courses", label: "Courses & Tutorials" },
    ] },
  { id: "creative", label: "Design, Arts & Media", children: [
      { id: "design", label: "Graphic & UX Design" },
      { id: "photo-video", label: "Photography & Video" },
      { id: "music-audio", label: "Music & Audio" },
      { id: "writing", label: "Writing & Literature" },
      { id: "art", label: "Art & Architecture" },
    ] },
  { id: "society", label: "News & Society", children: [
      { id: "news", label: "News & Current Events" },
      { id: "politics", label: "Politics & Law" },
      { id: "history", label: "History & Culture" },
      { id: "opinion", label: "Opinion & Essays" },
    ] },
  { id: "life", label: "Home, Life & Travel", children: [
      { id: "travel", label: "Travel & Places" },
      { id: "home", label: "Home & Garden" },
      { id: "food", label: "Recipes & Cooking" },
      { id: "vehicles", label: "Vehicles & Transport" },
      { id: "family", label: "Family & Relationships" },
    ] },
  { id: "entertainment", label: "Entertainment & Games", children: [
      { id: "games", label: "Games" },
      { id: "film-tv", label: "Film & TV" },
      { id: "social", label: "Social & Community" },
      { id: "humor", label: "Humor & Fun" },
    ] },
  { id: "reference", label: "Reference", children: [
      { id: "encyclopedia", label: "Encyclopedias & Wikis" },
      { id: "dictionaries", label: "Dictionaries & Glossaries" },
      { id: "standards", label: "Standards & Specifications" },
    ] },
  { id: "other", label: "Other (unsorted)", children: [] },
];

// ---------- pure helpers ----------

const SUBJECT_IDS = TAXONOMY.map((s) => s.id);
const subjectOf = (id) => TAXONOMY.find((s) => s.id === id) || null;
const kidsOf = (id) => subjectOf(id)?.children || [];

// Path for a subject (and optional sub-subject): "Label" or "Label/Label". "" for other/invalid.
function taxonomyPath(subjectId, subId) {
  const s = subjectOf(subjectId);
  if (!s || s.id === "other") return "";
  const c = s.children.find((x) => x.id === subId);
  return c ? `${s.label}/${c.label}` : s.label;
}

// Every standard path (subjects and sub-subjects), for pickers and checks.
function taxonomyPaths() {
  return TAXONOMY.filter((s) => s.id !== "other").flatMap((s) => [s.label, ...s.children.map((c) => `${s.label}/${c.label}`)]);
}

function isStandardPath(path) {
  return taxonomyPaths().includes(path);
}

// One line per subject for the AI prompt: id, label and what belongs in it.
function subjectMenu() {
  return TAXONOMY.map((s) => `${s.id}: ${s.label}${s.children.length ? ` (${s.children.map((c) => c.label).join("; ")})` : " (nothing fits clearly)"}`).join("\n");
}

// Old free-form collection names -> standard path. Matched on the last level first, then the
// first, by name or by these everyday words. Unknown names stay as the user's own collections.
const LEGACY_WORDS = {
  "computing/ai-ml": ["ai", "artificial intelligence", "machine learning", "ml", "llm", "llms", "agents", "ai agents", "deep learning", "nlp", "gemini", "claude"],
  "computing/programming": ["code", "coding", "dev", "development", "software", "python", "javascript", "rust", "c++", "algorithms"],
  "computing/web": ["web", "frontend", "front end", "css", "html", "react", "browser"],
  "computing/data": ["data", "database", "databases", "sql", "analytics"],
  "computing/security": ["security", "privacy", "infosec", "cybersecurity"],
  "computing/devops-cloud": ["devops", "cloud", "docker", "aws", "azure", "kubernetes", "hosting"],
  "computing/os-tools": ["linux", "windows", "git", "github", "terminal", "cli", "dev tools", "devtools", "tools dev"],
  "computing/apps": ["tools", "apps", "software tools", "utilities", "productivity tools"],
  "electronics/embedded": ["embedded", "firmware", "esp32", "stm32", "arduino", "microcontroller", "microcontrollers", "mcu"],
  "electronics/pcb": ["pcb", "kicad", "circuits", "circuit design", "schematic"],
  "electronics/components": ["components", "datasheets", "parts"],
  "electronics/iot": ["iot", "sensors", "wireless", "bluetooth", "wifi", "zigbee", "matter"],
  "electronics/robotics": ["robotics", "robots", "automation"],
  "electronics": ["electronics", "hardware"],
  "engineering/3d-printing": ["3d printing", "3d print", "fabrication"],
  "engineering/mechanical": ["cad", "mechanical", "mechanics"],
  "engineering/diy": ["diy", "maker", "makers"],
  "engineering/energy": ["energy", "power", "solar", "battery", "batteries"],
  "engineering": ["engineering", "making"],
  "science/math": ["math", "maths", "mathematics", "statistics"],
  "science/physics": ["physics", "astronomy", "space"],
  "science": ["science"],
  "business/management": ["management", "strategy", "leadership"],
  "business/marketing": ["marketing", "sales", "seo"],
  "business/productivity": ["productivity", "workflow", "workflows"],
  "business/careers": ["career", "careers", "jobs", "hiring"],
  "business/startups": ["startup", "startups"],
  "business": ["business"],
  "money/investing": ["investing", "stocks", "crypto", "markets"],
  "money/personal-finance": ["finance", "personal finance", "budget", "tax", "taxes"],
  "money/shopping": ["shopping", "deals", "buy"],
  "health/fitness": ["fitness", "sport", "sports", "running", "gym"],
  "health": ["health", "wellbeing"],
  "learning/languages": ["language", "languages", "english", "polish", "german", "turkish", "vocabulary"],
  "learning/courses": ["course", "courses", "tutorial", "tutorials"],
  "learning": ["learning", "education", "study"],
  "creative/design": ["design", "ux", "ui", "graphic design"],
  "creative/music-audio": ["music", "audio"],
  "creative/photo-video": ["photography", "photo", "video editing"],
  "creative/writing": ["writing", "books", "literature"],
  "creative": ["art", "arts", "creative", "media"],
  "society/news": ["news", "current events"],
  "society/history": ["history", "culture"],
  "life/travel": ["travel", "trips", "places"],
  "life/food": ["recipes", "cooking", "food"],
  "life/home": ["home", "garden"],
  "entertainment/games": ["games", "gaming"],
  "entertainment/film-tv": ["film", "movies", "tv", "series"],
  "entertainment": ["entertainment", "fun"],
  "reference": ["reference", "wiki", "docs", "documentation", "standards"],
};

function legacyIndex() {
  const idx = new Map();
  const put = (word, key) => { const w = word.toLowerCase().trim(); if (!idx.has(w)) idx.set(w, key); };
  for (const s of TAXONOMY) {
    if (s.id === "other") continue;
    put(s.label, s.id);
    for (const c of s.children) put(c.label, `${s.id}/${c.id}`);
  }
  // the everyday words only fill gaps: an exact label always wins
  for (const [key, words] of Object.entries(LEGACY_WORDS)) words.forEach((w) => put(w, key));
  return idx;
}

// Pure: standard path for an old collection path, or null if it is the user's own naming.
// Already-standard paths map to themselves. "AI/Agents" -> "Computing & Software/AI & Machine Learning".
function legacyToStandard(path) {
  if (!path || path === "Unsorted") return null;
  if (isStandardPath(path)) return path;
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const idx = legacyIndex();
  for (const part of [parts[parts.length - 1], parts[0]]) {
    const key = idx.get(part.toLowerCase());
    if (key) { const [sid, cid] = key.split("/"); return taxonomyPath(sid, cid); }
  }
  return null;
}

// ---------- learning from your filing ----------

// Pure: { subject, sub } ids for a standard path, or null.
function idsOfPath(path) {
  for (const s of TAXONOMY) {
    if (s.id === "other") continue;
    if (path === s.label) return { subject: s.id, sub: "general" };
    const c = s.children.find((x) => `${s.label}/${x.label}` === path);
    if (c) return { subject: s.id, sub: c.id };
  }
  return null;
}

// Pure: your latest filings as few-shot lines for the prompt. list = [{ t: title, h: site, p: path }],
// newest first. Only standard paths count, so examples never pull the AI outside the list.
// With subjectId: examples inside that subject, labelled by sub-subject; without: labelled by subject.
function correctionExamples(list = [], subjectId = null, max = 8) {
  const out = [];
  for (const c of list) {
    const ids = idsOfPath(c.p);
    if (!ids || (subjectId && ids.subject !== subjectId)) continue;
    out.push(`- "${String(c.t).slice(0, 70)}" (${c.h}) -> ${subjectId ? ids.sub : ids.subject}`);
    if (out.length >= max) break;
  }
  return out;
}
