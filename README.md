# Tab Organiser

Chrome extension: organise tabs with Chrome's built-in Gemini Nano (no API key, runs on your laptop), save pages for later with reminders, and never lose closed tabs.

## Install / update
1. `chrome://extensions` -> **Developer mode** on -> **Load unpacked** -> this folder.
   After changing files, click the reload arrow on the extension card.
2. Pin it from the puzzle-piece menu.

## Enable the AI (one time)
- Chrome 138+, desktop, ~22 GB free disk.
- Click **Organise tabs** once; Chrome downloads the model. Status: `chrome://on-device-internals`.
- If unavailable, enable `chrome://flags/#prompt-api-for-gemini-nano` and
  `chrome://flags/#optimization-guide-on-device-model`, restart Chrome.
- Without the model everything still works; sorting uses simple rules instead.

## Inbox, weekly review, collections, pins (v2a)
- Every save lands in the **Inbox** with an AI-suggested collection (dashed chip). One click **Keep** files it there.
- **Weekly review** (Friday 16:00 notification, or Library › Weekly review): one page at a time,
  → Keep (edit the collection first if you like), ← Discard, ↓ Next week, P Pin.
- **Collections** are a tree (`AI › Agents › Papers`): sidebar, drag rows onto a branch to file them,
  rename/merge/delete branches, tags per page for cross-topic research sets.
- **Pins dock**: favourite sites as icons on the left of the Library and in the popup; drag to
  reorder; pin via the star, the popup, or right-click › "Pin this site to Library".
- Rows / Cards toggle for a compact or visual list.

## Projects: research trails
- **Working on** (popup, per window): every page you open in that window joins the project's
  trail, under the page it was opened from (search result pages are skipped).
- **Park this window** (popup): all tabs become the project's sources, keeping who-opened-whom;
  optionally closes them and opens the project in the Library.
- Project view: the trail as an indented tree, statuses ✓ Useful / Later (also to Inbox) /
  ✕ Not needed (offers to prune the pages opened from it), notes, ▣ working tabs, progress bar.
- **Reading mode**: "Read next" in the Library, then in the popup: mark the page and the same
  tab moves on to the next unread source.
- **Finish**: file useful sources into collections, handle what is left, export Markdown
  (title, link, note, saved quotes). Finished projects are read-only and can be reopened.

## Projects, sessions, mind map
- **History** keeps closed windows, saved sessions and tidied tabs for 30 days. **Make project**
  keeps an entry forever.
- **Projects** (formerly Workspaces): named tab sets in the sidebar and the popup; one click opens them all in a new
  window with their groups. Update from the current window, add/remove single tabs, drag a page
  row onto a project to add it.
- **Mind map**: left-to-right tree, Library › collections › sub-collections › pages. Click a branch
  to open it, double-click to open its list; dotted lines join pages that share a tag.

## Inbox triage
- Bundles: pages with the same AI suggestion ("→ AI › Agents · 4 [Keep all]"), duplicates
  (same page written differently), old & never read, no suggestion yet ("Sort with AI").
- Tick rows (or X) to select many: Keep here, Keep suggested, → Project, Read / Unread, Discard.
- Keys: J/K move · X select · E keep · # discard · O open · M read/unread · * all · Esc clear.
- Every bulk action can be undone (Undo button or Ctrl+Z).

## Reading
- Saved pages get a length when saved from an open tab: "8 min" (230 words/min) or "12 min video".
  Pages saved without access are measured next time they load on a site you allowed.
- Library › **Reading queue**: unread pages shortest first, "I have 5 / 15 / 30 min / 1 hour",
  videos optional, courses left out; "Up next" opens the shortest.
- The weekly review shows what you read and saved this week and this month.

## Page notes (highlights + your notes)
- **Highlighter pen**: side panel → Highlighter; while it's on, every text you select on the page
  is highlighted at once (Esc stops). Click a highlight on the page for a bar: colour, comment,
  copy, delete. The eye icon shows your highlights again. The popup header has a side-panel button.
- Select text → right-click **Highlight (page notes)**, or the **✎ Notes** button in the popup
  (opens Chrome's side panel next to the page). Pick a colour, add comments, write your own
  notes (saved as you type). Long selections saved with Alt+Shift+W become highlights too.
- **Show on page** marks your highlights in the text again (found by the passage and the words
  around it). Chrome asks once per site; "Always show highlights" asks for all sites, only if
  you switch it on.
- Library › **Notes** lists every annotated page; page details show their highlights; Ctrl+K
  and search look inside highlights and notes. Export one page or all as Markdown.
- **AI summaries** (Chrome's built-in Summarizer, or Gemini Nano if that's missing): "Key ideas
  from my highlights" (bullets from your highlights, comments and notes) or "Summarise the page".
  Kept with the page, shown in Notes, searchable, included in exports; "Add to my notes" copies it.
- Mind map: ✎ marks pages with notes; annotated pages you never saved sit in a "Notes" branch.
- Pages are marked **read** after 2 minutes of real viewing (bold = unread, like mail).

## Phrasebook
- Select a word, phrase or sentence on any page -> right-click **Save "…" to Phrasebook**, or **Alt+Shift+W**.
- Stored with the sentence it appeared in, the page, the date and the language (Chrome's offline
  language detector; Polish letters / page language as fallback). The page is read only at that moment.
- Up to 5 words = word/phrase; longer = quote (also shown on that page's details in the Library).
- Local AI adds a short definition + example (labelled AI); non-English words get an offline
  translation; dictionary links: Cambridge, Collins, Google (EN), PWN, Wiktionary (PL).
- Library › Phrasebook groups by week; the 10 newest words this week are highlighted.
- Weekly review › **Words**: show the word, reveal the meaning, Got it (→) / Again (←).

## Save for later
- Popup **Save for later** (optional reminder, optional close tab), right-click a page or link ->
  **Save page / link for later**, or **Alt+Shift+S**.
- The AI picks a type (Course, Video, Tool, Article, Docs, Other), a topic and a one-line "why".
  Courses can track units (2/5).
- Reminders: tonight, tomorrow, Saturday, in a week, or every week. Chrome notification with
  **Open** / **Snooze 1 day**; the icon badge counts what is due.
- Daily at 10:00 one forgotten page comes back (switch off in the Library footer).
- **Library page** (popup -> Open Later library): filters, search, due strip, **Mind map** by topic.

## History (30 days)
- One timeline, grouped by day: **closed windows** (2+ tabs, switch off in History), **saved
  sessions** ("Save session" in the popup, named "3 Nov 14:20 · <AI name>") and **tidied** tabs.
- **Tidy** (settings in History) closes tabs idle for N days; pinned, active, audio and non-web
  tabs are skipped. "Automatically" checks hourly.
- Per entry: Restore all, Make project, Rename, Delete. Per tab: Restore, → Inbox, → Project,
  → Collection, Pin. A tab moved somewhere leaves History.
- Everything expires after 30 days. Tidied tabs from before v0.9 got 30 days from the upgrade.

## Shortcuts and quick search
| Keys | Does |
|---|---|
| Alt+Shift+S | save this page to the Inbox |
| Alt+Shift+W | save the selected word / phrase / quote to the Phrasebook |
| Alt+Shift+O | organise this window's tabs into groups |
| Alt+Shift+L | open the Library |
| Ctrl+K (Library) | jump to any page, collection, project, source, word or view |
| Ctrl+Z (Library) | undo the last delete / discard / prune (also the Undo button, 8 s) |

Change the keys at `chrome://extensions/shortcuts`. When the AI sorts a page it also suggests
up to 2 tags, so related pages in different collections get linked in the mind map.

## Backup
Library footer -> **Export backup** / **Import backup** (JSON, merges without duplicates).
All data stays in `chrome.storage.local` on this machine.

Fonts: Inter and Space Grotesk (SIL Open Font License), bundled in `fonts/`.

## Development
- Plain JavaScript, no build step. Library page scripts: `core.js`, `tidy.js`, `ui.js`, `views/*.js`, `library.js`.
- Data lives in `chrome.storage.local` (schema 6: `items`, `collections`, `pins`, `projects`, `history`, `phrases`, `notes`).
  Upgrades run in `migrate()`; the previous data is kept once in `backupV2`.
- Tests (pure logic in `core.js`): `node --test "tests/*.test.js"`
