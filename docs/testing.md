# Pinax v1.8: Chrome test checklist

Tick each box as you go. If something fails, note the step number and what you saw; for errors,
open `chrome://extensions` → Pinax → **Errors**, or right-click the popup / Library →
**Inspect** → Console. About 30-40 minutes for everything; sections can be done separately.

## 0. Before you start

- [ ] 0.1 Export a backup: Library → gear (bottom of the left rail) → **Your pages → Backup** (keep the `.json` file).
- [ ] 0.2 `chrome://extensions` → Pinax → **⟳ reload**. Version shows **1.0.0**, no red **Errors** button.
- [ ] 0.3 `chrome://extensions/shortcuts`: Alt+Shift+S, Alt+Shift+W, Alt+Shift+O, Alt+Shift+L are all set (if one is empty, Chrome found a clash: set it by hand).
- [ ] 0.4 Have a test window with ~10 tabs: 2 from the same site, a YouTube video, a GitHub repo, an arXiv paper, a page in Polish, and one duplicate tab.

## 1. Upgrade (your old data survives)

- [ ] 1.1 Open the Library (Alt+Shift+L). Your old pages are in Inbox / collections, pins are on the left rail.
- [ ] 1.2 Old workspaces appear under **Projects** with their working tabs; **Open** opens them in a new window.
- [ ] 1.3 There is no History entry in the Library (removed in v1.20); `chrome.storage.local.get("history")` returns `{}` after the upgrade.
- [ ] 1.4 Inspect the Library → Console: `chrome.storage.local.get("schema").then(console.log)` prints `{schema: 8}`.

## 2. Popup basics

- [ ] 2.1 Popup opens fast; the dot next to the title is green (local AI) or orange (hover tells why).
- [ ] 2.2 The popup has no pins row and no footer counts (those live in the Library); ☆ still pins the current page.
- [ ] 2.3 "This window" shows the tab and group counts and "✕ 1 duplicate"; clicking it closes the duplicate and the button disappears (no duplicates = no button).
- [ ] 2.4 **✦ Organise with AI**: tabs are grouped with names and colours; message says "N groups by AI" (or "by site").
- [ ] 2.5 **⋯ → Ungroup tabs** removes the groups. The ⋯ menu also has All tabs → Inbox, Park this window…, Track for a project…; a click outside or Esc closes it.
- [ ] 2.7 Popup looks: one white surface, thin lines between header / page / window, left and right edges line up; no empty space at the bottom when there is no message.
- [ ] 2.6 Press **Alt+Shift+O** on a normal page: tabs get grouped, a "Tabs organised" notification appears.

## 3. Saving pages (Inbox, collection, project)

- [ ] 3.1 On the arXiv tab: popup → bell icon → "Tomorrow 09:00" (bell turns violet) → **Save to Inbox**. (The ▾ next to Save picks Inbox / Collection… / Project… under "Where to"; the choice is remembered.) Message "Saved to Inbox", then (a moment later, AI on) "AI suggests …".
- [ ] 3.2 Re-open the popup on that tab: it says "in Inbox", the button says "Saved in Inbox ✓"; the bell changes the reminder straight away.
- [ ] 3.3 On the GitHub tab: **Collection** → type `Tools › Dev` → **Keep in Tools › Dev**. In the Library it is under Collections › Tools › Dev (not in the Inbox).
- [ ] 3.4 Right-click any link → **Save link to Inbox** → notification "Saved to Inbox"; it appears in the Inbox.
- [ ] 3.5 **Alt+Shift+S** on another page → notification; it appears in the Inbox.
- [ ] 3.6 Popup **☆** pins the current page; it appears in the pins row and on the Library rail.

## 4. Library: Inbox, review, collections

- [ ] 4.1 Inbox rows show title, AI reason, dashed suggested collection, type; **Keep** keeps it in the suggestion.
- [ ] 4.2 Click a row: details open (status, type, reminder, Keep in, tags; a kept page also says "Keep in", not "Move to"). The AI-sorted page shows up to 2 tags.
- [ ] 4.3 Drag an Inbox row onto a collection in the sidebar: it moves there.
- [ ] 4.4 Collection view: **+ Sub**, **Rename** (e.g. `Tools › Dev` → `Tools › Code`), pages follow the rename.
- [ ] 4.5 **Rows / Cards** toggle changes the layout and is remembered after reload.
- [ ] 4.6 **Weekly review** → Pages tab: → keeps (in the typed collection), ← deletes, ↓ pushes to next week, P pins.
- [ ] 4.7 After each review action an **Undo** message appears; **Undo** (or Ctrl+Z) brings the page back.
- [ ] 4.8 Course page (e.g. the Hugging Face course): details → **Track units** → 5 → **+** moves the bar.
- [ ] 4.9 **Mind map**: click a top branch to open it, double-click to open its list; pages show site icons; pages sharing a tag have a dotted line.

## 5. Phrasebook

- [ ] 5.1 On an English article, select one word → right-click **Add "…" to Phrasebook** → notification "Added to Phrasebook" with the sentence.
- [ ] 5.2 Select a 2-4 word phrase → **Alt+Shift+W** → added as a phrase.
- [ ] 5.3 Select a whole sentence (6+ words) → it becomes a **highlight** ("Highlighted"); in the Library that page's details show it.
- [ ] 5.4 On the Polish page, add a word: language badge says **PL**; translation "→ …" appears (may need Chrome's one-time translator download).
- [ ] 5.5 Library → **Phrasebook**: one section per language (e.g. English, Italian) with a count, lime edge on the newest, sentence with the word in bold, AI definition marked "AI", dictionary links open the right word (Cambridge / Collins / PWN).
- [ ] 5.6 Add the same word again: it shows "2×" instead of a second card.
- [ ] 5.7 **+ Comment** adds your own comment; **×** deletes with Undo.
- [ ] 5.8 Add an Italian word: it appears under **Italian** with an English meaning and an Italian example; click the heading to fold it.
- [ ] 5.8a **☆** favourites a card; **★ n** in the filter bar shows only favourites. **🔊** reads the word aloud in its language.
- [ ] 5.8b **Edit**: change tags, meaning, example; Save. Change the language: the meaning is written again. Esc / Cancel leaves it unchanged.
- [ ] 5.8c Tags show as #chips; clicking one filters. Sort menu: Newest / A to Z / Most seen.
- [ ] 5.8d **Export CSV** downloads one row per word (word, meaning, language, example…); Anki's Import File reads it.
- [ ] 5.9 On a Chrome page (e.g. the Web Store) adding a word still works, just without a sentence.

## 5b. Notes and read / unread (v1.2)

- [ ] 5b.1 On a long article select a paragraph → right-click **Highlight**: the side panel opens, the passage is marked yellow on the page.
- [ ] 5b.2 Pick another colour in the panel, select more text → **Highlight selection** (Chrome may ask for access to this site once).
- [ ] 5b.3 Add a comment to a highlight; type notes in **My notes**; reload the page: everything is still in the panel.
- [ ] 5b.4 Reload the page → **Show on page**: highlights are marked again; clicking a highlight in the panel scrolls to it.
- [ ] 5b.5 Switch tabs: the panel follows the active tab.
- [ ] 5b.6 Library → **Notes**: the page with its highlights and notes; **Export** downloads a .md; Ctrl+K finds a word from a highlight.
- [ ] 5b.7 Popup on that page shows "N highlights + notes" and a **✎ Notes** button that opens Notes.
- [ ] 5b.8 Old Phrasebook quotes (if you had any) now appear as highlights in Notes.
- [ ] 5b.9 Save a page to the Inbox: its row is **bold** (unread). Read it for 2+ minutes in the front tab: the row turns normal (read). Tick/untick **Read** in its details.
- [ ] 5b.10 Popup **All tabs → Inbox**: every tab is saved, and the window shows the Inbox.

## 5a. Highlighter pen (v1.6)

- [ ] 5a.1 The extension is called **Pinax** (no "(local AI)") in chrome://extensions and the side panel menu.
- [ ] 5a.2 Popup header: the side-panel icon (next to Library) opens Notes.
- [ ] 5a.3 Panel → **Highlighter**: the first time on a site Chrome asks "allow on this site?" (say Allow); a dark "Highlighter on" badge appears top right on the page and the button turns dark.
- [ ] 5a.4 Select text with the mouse: it turns into a highlight at once (colour from the panel dots); change the colour dot while the pen is on and select again.
- [ ] 5a.5 Click a highlight on the page: a dark bar with 4 colours, Comment, Copy, Delete; each works and the panel list updates.
- [ ] 5a.6 Turn it off with the panel button, the badge, Esc on the page, or Esc in the panel: the badge goes and the button is light again.
- [ ] 5a.6b Close and reopen the side panel while the pen is on: the button still shows it as on, and one click turns it off.
- [ ] 5a.6c Reload the extension at chrome://extensions with a pen on: the old badge disappears at the next selection; turning the pen on again works.
- [ ] 5a.7 The eye icon in the panel shows the highlights again after a page reload.

## 5f. Selection bubble and roles (v1.7)

- [ ] 5f.1 On a site you allowed (or right after clicking the extension icon on a page): select text → a small dark bar appears above it.
- [ ] 5f.2 The 4 dots highlight as Key point (yellow) · Idea (green) · Question (blue) · Check (pink); the bar says "Highlighted" and closes.
- [ ] 5f.3 **Comment**: a text box appears in the bar; type, Enter → "Highlighted with comment".
- [ ] 5f.4 **Word**: added to the Phrasebook with its sentence ("Added to Phrasebook"). **Copy**: quote + title + link on the clipboard.
- [ ] 5f.5 Esc, a click elsewhere or scrolling closes the bar; it never appears when selecting inside a text box.
- [ ] 5f.6 Side panel: each highlight shows its role; role chips (All / Key point / …) filter the list. Library › Notes has the same chips.
- [ ] 5f.7 Panel switch "Work on every site": asks Chrome once; afterwards the bar works on any site. Switching it off goes back to sites you allowed.

## 5g. Page dock, note card, continue reading (v1.8)

- [ ] 5g.1 On a saved page or a page with notes (site allowed), a thin dark tab sits on the right edge; hover it: Highlighter · Notes · Show/hide · Open Notes · ⋯.
- [ ] 5g.2 Drag the small grip at its top up/down; reload: it stays where you put it.
- [ ] 5g.3 **Notes**: a card opens beside the dock with your notes for this page; type → "saved"; the side panel shows the same text.
- [ ] 5g.4 **Highlighter** in the dock turns the pen on/off (badge appears); the side panel button follows.
- [ ] 5g.5 **Show/hide** removes your highlights from the page and brings them back.
- [ ] 5g.6 **⋯ → Hide the dock on this site**: gone on that site (the bubble still works).
- [ ] 5g.7 Save a long article, scroll to the middle, close it, open it again: "You read N% of this · Continue" bottom right; Continue jumps there.
- [ ] 5g.8 Library › Reading queue: started pages show "N% read" and come first ("Continue").

## 5h. Page shortcuts (v1.9)

- [ ] 5h.1 Select text on an allowed page (the bubble shows), press **H**: "Highlighted", yellow Key point in the side panel.
- [ ] 5h.2 Select text, press **C**: the comment box opens; type (letters like h/c/w just type), Enter saves the highlight with the comment.
- [ ] 5h.3 Select a word, press **W**: "Added to Phrasebook".
- [ ] 5h.4 With nothing selected, or while typing in a search box on the page, H/C/W do nothing extra; Ctrl+C still copies while the bubble is open.
- [ ] 5h.5 **Esc** closes the bubble.

## 4b. Standard subjects (v1.13)

- [ ] 4b.1 Save an electronics page (e.g. a KiCad article) with its tab open: after a moment the Inbox suggests `Electronics & Hardware › PCB & Circuit Design`.
- [ ] 4b.2 Save a page that fits nothing (a blank or odd page): it stays Unsorted, no invented collection.
- [ ] 4b.3 Save 10 varied pages (news, recipe, video course, GitHub repo, paper): every suggestion is one of the standard subjects.
- [ ] 4b.4 If you have old collections like `AI › Agents`, the sidebar shows **Align N with standard…**; the preview lists each move; confirm; pages follow; **Undo** restores. Your own names (e.g. a project name) are left alone.
- [ ] 4b.5 (v1.14) Keep an Inbox page in a different standard subject than suggested; save a similar page: the suggestion follows your choice more often.
- [ ] 4b.6 (v1.14) A page that fits nothing shows up to two "Maybe …" chips; clicking one keeps it there.
- [ ] 4b.7 (v1.14) Settings › **Local AI › Accuracy check** › Run check: needs the local AI ready; shows % right subject / exact and the misses first. Note the numbers; re-run after changing prompts.

- [ ] 4b.8 (v1.15) Settings › Updates: **Check for updates weekly** is ticked on a fresh install. Press **Check now**: a line says "Pinax x.y is the latest." (or "is available" with a link). Untick it: the gear loses its green dot. With it unticked, DevTools › Network on the Library shows no request to api.github.com.

- [ ] 4b.9 (v1.16) Settings › **Export bookmarks** downloads a `.html` file: in `chrome://bookmarks` › ⋮ › Import bookmarks, it appears with your collections as folders, plus Inbox / Pins / Projects.
- [ ] 4b.10 (v1.16) Settings › **Export CSV** downloads a `.csv`: opens in a spreadsheet with a header row, accents readable, one row per page.

## 4c. Settings page (v1.18)

- [ ] 4c.1 The left rail has a gear at the bottom; clicking it opens **Settings** (gear highlighted). Sections: Reminders, Updates, Your pages, Subjects, Local AI, About. The sidebar footer only shows the AI status line.
- [ ] 4c.2 Reminders: untick **Daily nudge**: the time box greys out. Tick it, set a time two minutes ahead: a page notification arrives then (and daily after).
- [ ] 4c.4 Your pages: Export bookmarks, Export CSV, Backup, Import backup all work from here; the storage size is shown.
- [ ] 4c.5 About shows the installed version and the GitHub link.

- [ ] 4c.6 (v1.19) Settings › **Subjects** lists the 13 standard subjects (the 14th, Other, means "unsorted"); opening one shows its sub-subjects; subjects holding kept pages show a count and open that collection when clicked.
- [ ] 4c.7 (v1.19) In any "Keep in" box, typing a few letters (e.g. `Elec`) suggests standard paths such as `Electronics & Hardware › PCB & Circuit Design` before you have used them.

## 4d. Collections (v1.21)

- [ ] 4d.1 Drag one collection onto the middle of another: it nests (its pages come along); Undo moves it back.
- [ ] 4d.2 Drag a collection onto the top or bottom edge of a sibling: a thin line shows, it lands there and the order stays after reload.
- [ ] 4d.3 While dragging, "Drop here for top level" appears under the tree; dropping on it un-nests. Dropping a collection onto itself or its child is not allowed; going past 3 levels shows a message.
- [ ] 4d.4 Hover a row, click **⋯**: Rename edits in place (Enter saves, Esc cancels; greyed out for standard subjects), **Move to…** and **Merge into…** list valid places, **New sub-collection** adds under it, **Delete** asks and has Undo.
- [ ] 4d.5 **+** next to Collections: type a path or click a standard subject (e.g. Electronics & Hardware › PCB & Circuit Design): it is created and opens. "Other" is not offered.
- [ ] 4d.6 A page can still be dragged from a list onto any collection row.
- [ ] 4d.7 Backup then import: your manual order survives.
- [ ] 4d.8 A collection with no sub-collections shows no stray "null" text in the toolbar.

## 5c. Inbox triage (v1.3)

- [ ] 5c.1 With 5+ pages in the Inbox: bundle cards appear (e.g. "→ AI › Agents 4", "Duplicates", "Old & never read", "No suggestion yet").
- [ ] 5c.2 **Keep all** on a bundle keeps them; **Undo** brings them back. **Show** filters the list; the chip "… ×" clears it.
- [ ] 5c.3 Save the same page twice written differently (with `?utm_source=x` or `www.`): it shows under **Duplicates**.
- [ ] 5c.4 Tick 3 rows: the dark bar shows "3 selected"; Keep here / Keep suggested / → Project / Read / Unread / Delete work.
- [ ] 5c.5 Keys: J/K move the outline, X selects, E keeps (as suggested), # deletes, O opens, M toggles read, * selects all, Esc clears.
- [ ] 5c.6 **Keep all N as suggested** in the toolbar keeps every page in its AI suggestion.

## 5d. Reading (v1.4)

- [ ] 5d.1 Save a long article from the popup: its row shows "N min" (a YouTube video shows "N min video").
- [ ] 5d.2 Library → **Reading queue**: unread pages shortest first, "Up next" card with **▶ Read now**; unknown lengths at the bottom; no courses.
- [ ] 5d.3 Chips "5 min / 15 min / 30 min / 1 hour" show only pages that fit; "include videos" adds videos.
- [ ] 5d.4 Read a queued page for 2+ minutes: it leaves the queue (or press M on its row).
- [ ] 5d.5 Weekly review shows **This week / This month / Still unread** with counts and ≈ reading time.

## 5e. Notes v2: AI summaries (v1.5)

- [ ] 5e.1 On a page with 3+ highlights, side panel → **✦ Key ideas from my highlights**: bullet points appear under Summary (the first time Chrome may download its summariser).
- [ ] 5e.2 **✦ Summarise the page** gives a short summary of the whole article.
- [ ] 5e.3 **Add to my notes** copies it into My notes; **Copy** and **Delete** work.
- [ ] 5e.4 Library → Notes: the card shows the AI summary; **✦ Key ideas** / **Redo** works from there; **Export** includes it.
- [ ] 5e.5 Ctrl+K finds a word that only appears in a summary.
- [ ] 5e.6 Mind map: saved pages with notes show ✎ (hover shows the first highlight); annotated pages you never saved are in a **Notes** branch (double-click opens Notes).

## 6. Projects and sources

- [ ] 6.1 Popup → **⋯ → Track for a project…** → **Working on** → **+ New project…** → "Test research" + Enter. Icon shows **●** in this window.
- [ ] 6.2 Search Google, open 2 results in new tabs, click a link inside one of them.
- [ ] 6.3 Library → Projects → Test research: the sources show those pages indented under the page they came from; no Google result page in the list.
- [ ] 6.4 **Track this window** button in the project shows "● Tracking this window" for the window the Library is in only if that window is the tracked one.
- [ ] 6.5 In another window with 5+ tabs: popup → **⋯ → Park this window…** → existing project, **close the tabs** ticked → **Park**. The tabs close, the Library opens on the project, new sources are listed.
- [ ] 6.6 Source buttons: ✓ useful (green dot), Later (also appears in Inbox), ✕ not needed (struck through), ▣ adds to working tabs, ✎ comment, − Remove from project (Undo works).
- [ ] 6.7 ✕ on a page that has pages under it asks to mark them too; the branch is greyed; Undo restores it.
- [ ] 6.8 Filters (Unread / Useful / …) and the progress bar match what you marked.
- [ ] 6.9 **▶ Read next** opens the next unread page. Popup shows the green **Reading for Test research** card.
- [ ] 6.10 In that card press **✓ Useful** with "then open the next one here" ticked: the same tab moves to the next unread page.
- [ ] 6.11 Press **✕ Not needed** on a page with children: two inline buttons appear ("Only this" / "This + those").
- [ ] 6.12 **Export**: a `.md` file downloads with the useful sources, comments and any highlights; it is also on the clipboard.
- [ ] 6.13 **Finish…**: choose "send to Inbox" for unread, type a collection for all → **Finish**. Project shows "✓" in the sidebar, buttons are gone, useful pages are in that collection; **Reopen** brings it back.
- [ ] 6.14 Popup **Project** save option adds the current page to a project's sources.

## 7. History and Tidy removed (v1.20)

- [ ] 7.1 The Library sidebar has no History entry and Settings has no "Tabs and history" section; the popup ⋯ menu has no Snapshot window.
- [ ] 7.2 Close a window with 2+ tabs: nothing is recorded anywhere; Chrome's own Ctrl+Shift+T still reopens it.
- [ ] 7.3 After upgrading from 1.19: `chrome.storage.local.get(["history","autoTidy","tidyDays","autoSession"])` returns `{}`; the "auto-tidy" alarm is gone (`chrome.alarms.getAll()` in the service-worker console).
- [ ] 7.4 Importing a backup made before v1.20 works; its history is ignored.

## 8. Reminders and notifications

- [ ] 8.1 Inspect the Library → Console, run:
      `getItems().then(i => updateItem(i[0].id, { remindAt: Date.now() - 1000 }))`
      The item shows a lime **due** chip; the popup footer shows "1 due" and the icon badge "1".
- [ ] 8.2 Set a page's reminder to "Tonight 20:00" (or wait for 3.1's reminder): the notification has **Open** and **Snooze 1 day**; Open opens the page.
- [ ] 8.3 (Friday 16:00, or skip) the weekly review notification lists pages; **Review now** opens the review.

## 9. Search, shortcuts, undo, backup

- [ ] 9.1 Library **Ctrl+K**: typing finds pages, collections, projects, sources, words; ↑↓ + Enter opens; Esc closes.
- [ ] 9.2 **Alt+Shift+L** from any tab focuses the open Library (no second Library tab).
- [ ] 9.3 Undo message disappears after ~8 s; Ctrl+Z after that does nothing.
- [ ] 9.4 **Backup** again, then **Import backup** the file from 0.1 (both in Settings › Your pages): message says how many pages/projects/pins you have; nothing is duplicated.
- [ ] 9.5 Dark mode (Windows → Settings → Colours → Dark): popup and Library are readable.
- [ ] 9.6 The export file has `"schema": 8` and a `settings` block; importing it into a fresh profile brings back your settings (daily nudge and time, hidden docks) and reminders fire without restarting Chrome.
- [ ] 9.7 Colours (v1.11): violet buttons look slightly deeper; highlights on a dark website (e.g. GitHub dark) show dark, readable text; the collapsed page dock shows a thin edge on dark sites.

## 10. Speed

- [ ] 10.1 Popup opens in well under a second; saving returns at once (AI reason arrives later).
- [ ] 10.2 With 30+ pages and the AI sorting, the Library stays responsive (no freezing while sorting).
- [ ] 10.3 Long lists show 100 rows and a quiet **Show 100 more**; J/K past the last row shows more; `*` still selects every matching page.
- [ ] 10.4 Typing in the Library search waits a moment, then filters (no lag per key).
- [ ] 10.5 Leave a saved, unread article open for 2+ minutes: it turns read. Read an unsaved page 3 minutes, then save it: it stays unread.
- [ ] 10.6 Page icons in the Library come from Chrome (DevTools → Network on the Library: no requests to other sites).

## Found a problem?

Write the step number, what you expected, what happened, and the Console error (if any).
Your data is safe: the backup from 0.1 (the old `backupV2` copy inside the extension is removed in v1.11).
