// Labelled sample pages for the accuracy check (eval.html). Fictional but realistic pages:
// title, url, a short "page text", and the standard subject/sub-subject a person would file it under.
// expect: "subject/sub" ids from taxonomy.js; "other" means: nothing fits, leave it in the Inbox.

const EVAL_SAMPLES = [
  // computing
  { title: "Understanding Python decorators", url: "https://realpython.com/primer-on-python-decorators/", text: "Decorators wrap a function to extend its behaviour. This tutorial shows closures, functools.wraps and real examples.", expect: "computing/programming" },
  { title: "A complete guide to CSS Grid", url: "https://css-tricks.com/snippets/css/complete-guide-grid/", text: "CSS Grid is a two-dimensional layout system for the web. Learn grid-template-columns, areas and responsive patterns.", expect: "computing/web" },
  { title: "Building LLM agents with tool use", url: "https://example.com/blog/llm-agents-tool-use", text: "How large language models call tools, plan multi-step tasks and recover from errors. We compare agent frameworks.", expect: "computing/ai-ml" },
  { title: "PostgreSQL index types explained", url: "https://www.postgresql.org/docs/current/indexes-types.html", text: "B-tree, hash, GiST, SP-GiST, GIN and BRIN indexes: when to use each, with query planner examples.", expect: "computing/data" },
  { title: "OWASP Top 10 web application risks", url: "https://owasp.org/www-project-top-ten/", text: "The most critical security risks to web applications: broken access control, injection, cryptographic failures.", expect: "computing/security" },
  { title: "Deploying containers to Kubernetes", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/deploy-app/", text: "Create a deployment, expose a service and scale pods on a cluster using kubectl.", expect: "computing/devops-cloud" },
  { title: "Git rebase vs merge", url: "https://www.atlassian.com/git/tutorials/merging-vs-rebasing", text: "When to rebase a branch and when to merge it. Interactive rebase, conflicts and keeping history clean.", expect: "computing/os-tools" },
  { title: "Obsidian: a second brain in markdown files", url: "https://obsidian.md/", text: "A private and flexible note-taking app that works on local markdown files with plugins and links.", expect: "computing/apps" },
  // electronics
  { title: "ESP32-C6 deep sleep and wake-up sources", url: "https://docs.espressif.com/projects/esp-idf/en/latest/esp32c6/api-reference/system/sleep_modes.html", text: "Configure light sleep, deep sleep and wake-up from GPIO or timer on the ESP32-C6 firmware.", expect: "electronics/embedded" },
  { title: "KiCad: routing differential pairs", url: "https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html", text: "Interactive router, length tuning and differential pair rules when laying out a PCB in KiCad.", expect: "electronics/pcb" },
  { title: "LM358 dual operational amplifier datasheet", url: "https://www.ti.com/lit/ds/symlink/lm358.pdf", text: "Pin configuration, absolute maximum ratings and electrical characteristics of the LM358 op-amp.", expect: "electronics/components" },
  { title: "Zigbee vs Thread vs Matter for smart sensors", url: "https://example.com/iot/zigbee-thread-matter", text: "Comparing low-power wireless protocols for battery sensors in a smart home network.", expect: "electronics/iot" },
  { title: "ROS 2 navigation stack for mobile robots", url: "https://docs.nav2.org/", text: "Autonomous navigation, SLAM and path planning for wheeled robots using ROS 2.", expect: "electronics/robotics" },
  { title: "Raspberry Pi 5 review: faster, hotter, pricier", url: "https://example.com/reviews/raspberry-pi-5", text: "Benchmarks of the Raspberry Pi 5 single-board computer against the Pi 4 and mini PCs.", expect: "electronics/computers" },
  // engineering
  { title: "Designing snap-fit joints in Fusion 360", url: "https://example.com/cad/snap-fit-fusion", text: "Parametric CAD tutorial for cantilever snap fits, tolerances and strength calculations.", expect: "engineering/mechanical" },
  { title: "Best PETG settings for Bambu printers", url: "https://example.com/3d-printing/petg-settings", text: "Nozzle temperature, retraction and cooling for reliable PETG prints, with calibration models.", expect: "engineering/3d-printing" },
  { title: "How CNC machining tolerances work", url: "https://example.com/manufacturing/cnc-tolerances", text: "Standard machining tolerances, surface finish and cost drivers for production parts.", expect: "engineering/manufacturing" },
  { title: "Home battery storage: sizing a system", url: "https://example.com/energy/home-battery-sizing", text: "How many kWh of battery you need with rooftop solar, inverter choices and payback time.", expect: "engineering/energy" },
  { title: "Build a wooden standing desk in a weekend", url: "https://example.com/diy/standing-desk", text: "Step-by-step maker project with cut list, joinery and finishing for a DIY desk.", expect: "engineering/diy" },
  // science
  { title: "A visual introduction to eigenvectors", url: "https://example.com/math/eigenvectors", text: "Linear algebra intuition: what eigenvalues and eigenvectors mean geometrically, with animations.", expect: "science/math" },
  { title: "What the James Webb telescope saw in its first year", url: "https://example.com/astronomy/jwst-first-year", text: "Galaxies, exoplanet atmospheres and star formation images from the infrared space observatory.", expect: "science/physics" },
  { title: "How lithium-ion cathode materials work", url: "https://example.com/chemistry/cathode-materials", text: "Chemistry of NMC and LFP cathodes, ion intercalation and degradation mechanisms.", expect: "science/chemistry" },
  { title: "CRISPR gene editing: a review of clinical trials", url: "https://example.com/biology/crispr-trials", text: "Overview of recent clinical research on CRISPR therapies for sickle cell disease.", expect: "science/life-sciences" },
  { title: "Arctic sea ice minimum reaches new low", url: "https://example.com/earth/arctic-sea-ice", text: "Satellite data show reduced ice extent; climate scientists explain feedback loops.", expect: "science/earth" },
  // business
  { title: "OKRs: how to set objectives that work", url: "https://example.com/management/okrs", text: "Goal setting for teams, key results, quarterly planning and common management mistakes.", expect: "business/management" },
  { title: "Content marketing funnel: from blog to buyer", url: "https://example.com/marketing/content-funnel", text: "SEO, email nurture and conversion tactics for B2B marketing and sales teams.", expect: "business/marketing" },
  { title: "Getting Things Done: a weekly review checklist", url: "https://example.com/productivity/weekly-review", text: "A simple workflow for inbox zero, task lists and planning your week.", expect: "business/productivity" },
  { title: "How to prepare for a system design interview", url: "https://example.com/careers/system-design-interview", text: "Hiring process tips, salary negotiation and what interviewers look for in senior candidates.", expect: "business/careers" },
  { title: "GDPR checklist for small companies", url: "https://example.com/legal/gdpr-checklist", text: "Compliance requirements, data processing agreements and privacy notices for businesses.", expect: "business/legal" },
  { title: "Finding product-market fit before you scale", url: "https://example.com/startups/product-market-fit", text: "Founders and early-stage startups: interviews, MVPs and validating a product idea.", expect: "business/startups" },
  // money
  { title: "How to build a monthly budget that sticks", url: "https://example.com/money/budget", text: "Track income and expenses, set savings goals and pay down debt with the 50/30/20 rule.", expect: "money/personal-finance" },
  { title: "Index funds vs ETFs for long-term investors", url: "https://example.com/investing/index-funds-etfs", text: "Fees, diversification and stock market returns for passive investing.", expect: "money/investing" },
  { title: "Why inflation is falling but prices are not", url: "https://example.com/economics/inflation-prices", text: "Central bank policy, interest rates and what economists say about the price level.", expect: "money/economics" },
  { title: "Best noise-cancelling headphones under 200 euro", url: "https://example.com/shopping/headphones", text: "Deals and buying guide comparing five pairs, with price history.", expect: "money/shopping" },
  // health
  { title: "Beginner 5k running plan", url: "https://example.com/fitness/5k-plan", text: "An eight-week training plan with interval runs, rest days and injury prevention.", expect: "health/fitness" },
  { title: "High-protein vegetarian meal prep", url: "https://example.com/nutrition/protein-meal-prep", text: "Nutrition guide: protein sources, macros and weekly meal prep for vegetarians.", expect: "health/nutrition" },
  { title: "Back pain: when to see a doctor", url: "https://example.com/health/back-pain", text: "Symptoms, causes and treatments of lower back pain; red flags that need medical care.", expect: "health/medical" },
  { title: "Mindfulness for anxiety: what the research says", url: "https://example.com/health/mindfulness-anxiety", text: "Evidence for meditation and cognitive therapy in managing stress and anxiety.", expect: "health/mind" },
  // learning
  { title: "Polish verb aspects made simple", url: "https://example.com/languages/polish-aspects", text: "Perfective and imperfective verbs in Polish grammar with exercises and vocabulary.", expect: "learning/languages" },
  { title: "How to study effectively: spaced repetition", url: "https://example.com/study/spaced-repetition", text: "Study skills for students: active recall, flashcards and exam preparation.", expect: "learning/study" },
  { title: "Hugging Face LLM course, unit 1", url: "https://huggingface.co/learn/llm-course/chapter1/1", text: "Free course with units and quizzes teaching transformers; lesson 1 introduces the pipeline.", expect: "learning/courses" },
  // creative
  { title: "Typography rules every UI designer should know", url: "https://example.com/design/typography-ui", text: "Type scale, line height, contrast and hierarchy in user interface and graphic design.", expect: "creative/design" },
  { title: "Street photography: shooting in low light", url: "https://example.com/photo/street-low-light", text: "Camera settings, ISO and composition tips for photographers shooting after dark.", expect: "creative/photo-video" },
  { title: "Mixing vocals: a producer guide", url: "https://example.com/music/mixing-vocals", text: "Compression, EQ and reverb for music producers in the studio.", expect: "creative/music-audio" },
  { title: "On writing short stories", url: "https://example.com/writing/short-stories", text: "Fiction craft: structure, voice and revising a literary short story.", expect: "creative/writing" },
  { title: "Brutalist architecture in Eastern Europe", url: "https://example.com/art/brutalism", text: "A photo essay on concrete buildings, art and architectural history.", expect: "creative/art" },
  // society
  { title: "EU agrees new rules on AI systems", url: "https://example.com/news/eu-ai-rules", text: "Brussels reached a deal today; ministers react. Breaking news and analysis.", expect: "society/news" },
  { title: "How parliamentary elections work in Poland", url: "https://example.com/politics/polish-elections", text: "Electoral system, parties and the role of the constitutional court.", expect: "society/politics" },
  { title: "The fall of the Roman Republic", url: "https://example.com/history/roman-republic", text: "History of the late republic, the Gracchi, Caesar and the end of senatorial rule.", expect: "society/history" },
  // life
  { title: "A week in Lisbon: itinerary and food tips", url: "https://example.com/travel/lisbon-week", text: "Where to stay, which neighbourhoods to walk and day trips from Lisbon.", expect: "life/travel" },
  { title: "How to fix a leaking tap", url: "https://example.com/home/fix-leaking-tap", text: "Home repair guide: tools, replacing the cartridge and when to call a plumber.", expect: "life/home" },
  { title: "Easy weeknight chicken curry", url: "https://example.com/recipes/chicken-curry", text: "Recipe with ingredients, 30 minutes cooking time and serving suggestions.", expect: "life/food" },
  { title: "Electric car winter range: real-world tests", url: "https://example.com/vehicles/ev-winter-range", text: "How cold weather affects EV battery range, charging speed and heat pumps.", expect: "life/vehicles" },
  // entertainment
  { title: "Hades II early access review", url: "https://example.com/games/hades-2-review", text: "Roguelike action game review: combat, story and replayability on PC.", expect: "entertainment/games" },
  { title: "The best sci-fi series of the decade", url: "https://example.com/tv/best-scifi-series", text: "Ranking television series and films with trailers, casts and where to stream.", expect: "entertainment/film-tv" },
  // reference
  { title: "Transformer (deep learning architecture) - Wikipedia", url: "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)", text: "From Wikipedia, the free encyclopedia. A transformer is a deep learning architecture based on attention.", expect: "reference/encyclopedia" },
  { title: "IEEE 802.11 wireless LAN standard summary", url: "https://example.com/standards/ieee-80211", text: "Specification overview of the 802.11 standard revisions, amendments and channel definitions.", expect: "reference/standards" },
  // other (nothing fits clearly)
  { title: "Untitled", url: "https://example.com/", text: "", expect: "other" },
  { title: "Page not found", url: "https://example.com/404", text: "The page you requested could not be found.", expect: "other" },
  { title: "Sign in to continue", url: "https://accounts.example.com/login", text: "Email Password Remember me Forgot your password?", expect: "other" },
];
