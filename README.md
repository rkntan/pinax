# Tab Organiser (local AI)

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

## Projects, sessions, mind map
- **Sessions** are temporary (30 days): "Save window" in the popup, or made automatically when you
  close a window with 2+ tabs (switch off in Library › Sessions). **Make project** keeps one forever.
- **Projects** (formerly Workspaces): named tab sets in the sidebar and the popup; one click opens them all in a new
  window with their groups. Update from the current window, add/remove single tabs, drag a page
  row onto a project to add it.
- **Mind map**: left-to-right tree, Library › collections › sub-collections › pages. Click a branch
  to open it, double-click to open its list; dotted lines join pages that share a tag.

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

## Sessions and Archive
- **Save window** stores every tab with its groups as "3 Nov 14:20 · <AI name>" (Library -> Sessions).
- **Tidy** closes tabs idle for N days (pinned, active, audio and non-web tabs are skipped) and
  stores them first in Library -> **Archive**, grouped by day: restore all, restore one, or move
  one to Later. "Tidy automatically" checks hourly.

## Backup
Library footer -> **Export backup** / **Import backup** (JSON, merges without duplicates).
All data stays in `chrome.storage.local` on this machine.

Fonts: Inter and Space Grotesk (SIL Open Font License), bundled in `fonts/`.

## Development
- Plain JavaScript, no build step. Library page scripts: `core.js`, `tidy.js`, `ui.js`, `views/*.js`, `library.js`.
- Data lives in `chrome.storage.local` (schema 3: `items`, `collections`, `pins`, `projects`, `history`, `phrases`).
  Upgrades run in `migrate()`; the previous data is kept once in `backupV2`.
- Tests (pure logic in `core.js`): `node --test "tests/*.test.js"`
