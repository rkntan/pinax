# features

Chrome extension: organise tabs with Chrome's built-in Gemini Nano (no API key, runs on your laptop), save pages to your Inbox with reminders, and never lose closed tabs.

## Words we use
| Term | Meaning |
|---|---|
| **Inbox** | unsorted pages; **Save** always means "save to the Inbox" |
| **Collection** | a filed place (`AI › Agents`); the verb is **Keep** ("Keep in…", "Kept in X") |
| **Project** | research or work with **sources** (the pages you collected for it) and working tabs |
| **Pins** | pinned sites in the Library |
| **Dock** | the small toolbar on the page edge |
| **Notes** | a page's highlights, your own text and its summary; also the side panel |
| **Comment** | text attached to a highlight, a project source or a Phrasebook word |
| **AI reason** | the AI's one-line "why" for a saved page |
| **Summary** | the AI summary of a page or of your highlights, in Notes |
| **Phrasebook** | the words and phrases you add from pages |
| **History** | temporary tab sets: closed windows, snapshots, tidied tabs (30 days) |
| **Delete** / **Remove** | Delete destroys data; Remove takes something out of a container (a source from a project, a tag) |
| **Reminder** / **Daily nudge** | the bell on one page / one kept page resurfaced once a day (time set in Settings, default 10:00) |

## Install / update
1. `chrome://extensions` -> **Developer mode** on -> **Load unpacked** -> this folder.
   After changing files, click the reload arrow on the extension card.
2. Pin it from the puzzle-piece menu.

## Settings (v1.18)
The gear at the bottom of the left rail opens one page for everything you can set: daily nudge on/off and its time,
remember closed windows, tidy idle tabs, the weekly update check, exports and import, the list of standard subjects (with your page counts), local AI status, version.
Every "Keep in" box also suggests the standard subjects as you type, so you can file into one before it exists in your sidebar (collections are created when the first page is kept there).

## Update check (v1.15; on by default since v1.17)
- Settings › Updates › **Check for updates weekly** (untick to turn it off). A green dot on the gear means a newer release exists. Pinax asks GitHub once a week for the
  latest release number and shows "Pinax x.y is available" with a link. Nothing else is sent; no downloads or installs.
- To update: download the new `pinax-extension.zip`, unzip over the old folder, press reload on the extension card.

## Enable the AI (one time)
- Chrome 138+, desktop, ~22 GB free disk.
- Click **Organise tabs** once; Chrome downloads the model. Status: `chrome://on-device-internals`.
- If unavailable, enable `chrome://flags/#prompt-api-for-gemini-nano` and
  `chrome://flags/#optimization-guide-on-device-model`, restart Chrome.
- Without the model everything still works; sorting uses simple rules instead.

## Inbox, weekly review, collections, pins (v2a)
- Every save lands in the **Inbox** with an AI-suggested collection (dashed chip). One click **Keep** keeps it there.
- **Weekly review** (Friday 16:00 notification, or Library › Weekly review): one page at a time,
  → Keep (edit the collection first if you like), ← Delete, ↓ Next week, P Pin.
- **Collections** are a tree (`AI › Agents › Papers`): sidebar, drag rows onto a branch to keep them there,
  rename/merge/delete branches, tags per page for cross-topic research sets.
- **Standard subjects (v1.13)**: the AI only files into a fixed list of 14 subjects with 5-8 sub-subjects each
  (`taxonomy.js`, e.g. *Electronics & Hardware › PCB & Circuit Design*), so collections are the same for everyone and
  never drift into near-duplicates. It picks in two small steps (subject, then sub-subject) from the page's title, site and
  its own description/text. If nothing fits clearly the page stays Unsorted in the Inbox for you. Your own collections
  still work: you can keep pages anywhere, the AI just never invents new ones. Old free-form collections show
  **Align N with standard…** at the bottom of the sidebar tree (preview, then Undo).
- **It learns how you file (v1.14)**: every time you file a Inbox page somewhere other than the AI's guess, your last 30
  filings (title, site, standard subject) are kept, and the 8 most recent become examples in the next prompt. Only standard
  subjects count, so the AI never drifts off the list. A page that fits nothing shows up to two "Maybe …" chips (the
  likeliest subjects); one click files it there.
- **Accuracy check**: Settings › Local AI › *Accuracy check* scores the local AI on 60 labelled sample pages (right
  subject %, right sub-subject %, unclear pages left alone) and lists the misses. Tick "use my saved filings" to see how much your habits help.
- **Pins**: favourite sites as icons on the left of the Library and in the popup; drag to
  reorder; pin via the star (Pin to Library), the popup, or right-click › "Pin this site to Library".
- Rows / Cards toggle for a compact or visual list.

## Projects: sources
- **Working on** (popup › ⋯ › Track for a project, per window): every page you open in that window joins the project's
  sources, under the page it was opened from (search result pages are skipped).
- **Park this window** (popup › ⋯): all tabs become the project's sources, keeping who-opened-whom;
  optionally closes them and opens the project in the Library.
- Project view: the sources as an indented tree, statuses ✓ Useful / Later (also to Inbox) /
  ✕ Not needed (offers to prune the pages opened from it), comments, ▣ working tabs, progress bar.
- **Reading mode**: "Read next" in the Library, then in the popup: mark the page and the same
  tab moves on to the next unread source.
- **Finish**: keep useful sources in collections, handle what is left, export Markdown
  (title, link, comment, highlights). Finished projects are read-only and can be reopened.

## Projects, History, mind map
- **History** keeps closed windows, snapshots and tidied tabs for 30 days. **Make project**
  keeps an entry forever.
- **Projects** (formerly Workspaces): named tab sets in the sidebar and the popup; one click opens them all in a new
  window with their groups. Update from the current window, add/remove single tabs, drag a page
  row onto a project to add it.
- **Mind map**: left-to-right tree, Library › collections › sub-collections › pages. Click a branch
  to open it, double-click to open its list; dotted lines join pages that share a tag.

## Inbox triage
- Bundles: pages with the same AI suggestion ("→ AI › Agents · 4 [Keep all]"), duplicates
  (same page written differently), old & never read, no suggestion yet ("Sort with AI").
- Tick rows (or X) to select many: Keep here, Keep suggested, → Project, Read / Unread, Delete.
- Keys: J/K move · X select · E keep · # delete · O open · M read/unread · * all · Esc clear.
- Every bulk action can be undone (Undo button or Ctrl+Z).

## Reading
- Saved pages get a length when saved from an open tab: "8 min" (230 words/min) or "12 min video".
  Pages saved without access are measured next time they load on a site you allowed.
- Library › **Reading queue**: unread pages shortest first, "I have 5 / 15 / 30 min / 1 hour",
  videos optional, courses left out; "Up next" opens the shortest.
- The weekly review shows what you read and saved this week and this month.

## Notes (highlights + your notes)
- **Selection bubble**: select text on a site you allowed (or after clicking the icon on a page):
  4 colours with roles (Key point, Idea, Question, Check), Comment, Word, Copy. Roles show and
  filter in the panel and in Library › Notes. Keys while the bubble shows: **H** Key point,
  **C** comment, **W** word, **Esc** close.
- **Dock** (right edge, on saved / annotated pages or after you used the icon): highlighter,
  note card (same notes as the panel), show/hide highlights, open Notes, ⋯ hide on this site.
  Draggable. **Continue reading**: saved pages remember how far you read ("Continue at 64%").
- **Highlighter pen**: Notes → Highlighter; while it's on, every text you select on the page
  is highlighted at once (Esc stops). Click a highlight on the page for a bar: colour, comment,
  copy, delete. The eye icon shows your highlights again. The popup header has a Notes button.
- Select text → right-click **Highlight**, or the **✎ Notes** button in the popup
  (opens Notes in Chrome's side panel next to the page). Pick a colour, add comments, write your own
  notes (saved as you type). Long selections added with Alt+Shift+W become highlights too.
- **Show on page** marks your highlights in the text again (found by the passage and the words
  around it). Chrome asks once per site; "Work on every site" asks for all sites, only if
  you switch it on.
- Library › **Notes** lists every annotated page; page details show their highlights; Ctrl+K
  and search look inside highlights and notes. Export one page or all as Markdown.
- **AI summaries** (Chrome's built-in Summarizer, or Gemini Nano if that's missing): "Key ideas
  from my highlights" (bullets from your highlights, comments and notes) or "Summarise the page".
  Kept with the page, shown in Notes, searchable, included in exports; "Add to my notes" copies it.
- Mind map: ✎ marks pages with notes; annotated pages you never saved sit in a "Notes" branch.
- Pages are marked **read** after 2 minutes of real viewing (bold = unread, like mail).

## Phrasebook
- Select a word, phrase or sentence on any page -> right-click **Add "…" to Phrasebook**, or **Alt+Shift+W**.
- Stored with the sentence it appeared in, the page, the date and the language (Chrome's offline
  language detector; Polish letters / page language as fallback). The page is read only at that moment.
- Up to 5 words = word/phrase; longer becomes a highlight in that page's Notes.
- Local AI adds a short definition + example (labelled AI); non-English words get an offline
  translation; dictionary links: Cambridge, Collins, Google (EN), PWN, Wiktionary (PL).
- Library › Phrasebook groups by week; the 10 newest words this week are highlighted.
- Weekly review › **Words**: show the word, reveal the meaning, Got it (→) / Again (←).

## Save to Inbox
- Popup **Save to Inbox** (optional reminder via the bell; ▾ keeps it in a collection or adds it to a project),
  right-click a page or link -> **Save page / link to Inbox**, or **Alt+Shift+S**.
- The AI picks a type (Course, Video, Tool, Article, Docs, Other), a topic and a one-line AI reason.
  Courses can track units (2/5).
- Reminders: tonight, tomorrow, Saturday, in a week, or every week. Chrome notification with
  **Open** / **Snooze 1 day**; the icon badge counts what is due.
- **Daily nudge**: once a day one forgotten kept page comes back ("From your collections"). Switch it off or pick the time in Settings (gear, bottom of the left rail).
- **Library page** (popup -> Library ↗): filters, search, due strip, **Mind map** by topic.

## History (30 days)
- One timeline, grouped by day: **closed windows** (2+ tabs, switch off in Settings: "Remember closed windows"),
  **snapshots** ("Snapshot window" in the popup, named "3 Nov 14:20 · <AI name>") and **tidied** tabs.
- **Tidy** (settings in Settings) closes tabs idle for N days; pinned, active, audio and non-web
  tabs are skipped. "Automatically" checks hourly.
- Per entry: Restore all, Make project, Rename, Delete. Per tab: Restore, → Inbox, → Project,
  → Collection, Pin, × Delete. A tab moved somewhere leaves History.
- Everything expires after 30 days. Tidied tabs from before v0.9 got 30 days from the upgrade.

## Shortcuts and quick search
| Keys | Does |
|---|---|
| Alt+Shift+S | save this page to the Inbox |
| Alt+Shift+W | add the selected word / phrase to the Phrasebook (a longer passage becomes a highlight) |
| Alt+Shift+O | organise this window's tabs into groups |
| Alt+Shift+L | open the Library |
| Ctrl+K (Library) | jump to any page, collection, project, source, word or view |
| Ctrl+Z (Library) | undo the last delete / prune (also the Undo button, 8 s) |
| H / C / W (page, text selected) | highlight as Key point / highlight with a comment / add the word |

Change the keys at `chrome://extensions/shortcuts`. When the AI sorts a page it also suggests
up to 2 tags, so related pages in different collections get linked in the mind map.

## Backup
Settings › Your pages › **Backup** / **Import backup** (JSON `pinax-backup-<date>.json`, merges without duplicates;
older `tab-organiser-backup-*.json` files still import).
All data stays in `chrome.storage.local` on this machine.

## Take your pages with you (v1.16)
You never depend on Pinax: Settings › Your pages also has **Export bookmarks** and **Export CSV**.
- **Bookmarks**: `pinax-bookmarks-<date>.html`, the standard bookmarks file. Import it in Chrome, Edge, Firefox or Safari
  (Bookmark manager › Import). Collections become nested folders; the Inbox, Pins and each project's useful sources get
  their own folders; tags and reasons are kept where the browser supports them.
- **CSV**: `pinax-pages-<date>.csv`, one row per saved page (title, url, collection, status, type, tags, note, read, saved)
  for a spreadsheet. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so a spreadsheet never runs them.
- **Backup** stays the full copy (JSON) for restoring into Pinax.

Fonts: Inter and Space Grotesk (SIL Open Font License), bundled in `fonts/`.

## Development
- Plain JavaScript, no build step. Library page scripts: `core.js`, `tidy.js`, `ui.js`, `views/*.js`, `library.js`.
- Data lives in `chrome.storage.local` (schema 7: `items`, `collections`, `pins`, `projects`, `history`, `phrases`, `notes`).
  Upgrades run in `migrate()` (export a backup first to keep a copy). Favicons are not stored; they are shown with `faviconFor(url)`.
  Internal names (`ws`, `trail`, `why`, history kind `"saved"`, backup marker `app: "tab-organiser"`) predate the
  wording above and stay as they are.
- Tests (pure logic in `core.js`): `node --test "tests/*.test.js"`
