# Tab Organiser v1.4: Chrome test checklist

Tick each box as you go. If something fails, note the step number and what you saw; for errors,
open `chrome://extensions` → Tab Organiser → **Errors**, or right-click the popup / Library →
**Inspect** → Console. About 30-40 minutes for everything; sections can be done separately.

## 0. Before you start

- [ ] 0.1 Export a backup: Library → sidebar footer → **Export** (keep the `.json` file).
- [ ] 0.2 `chrome://extensions` → Tab Organiser → **⟳ reload**. Version shows **1.0.0**, no red **Errors** button.
- [ ] 0.3 `chrome://extensions/shortcuts`: Alt+Shift+S, Alt+Shift+W, Alt+Shift+O, Alt+Shift+L are all set (if one is empty, Chrome found a clash: set it by hand).
- [ ] 0.4 Have a test window with ~10 tabs: 2 from the same site, a YouTube video, a GitHub repo, an arXiv paper, a page in Polish, and one duplicate tab.

## 1. Upgrade (your old data survives)

- [ ] 1.1 Open the Library (Alt+Shift+L). Your old pages are in Inbox / collections, pins are on the left rail.
- [ ] 1.2 Old workspaces appear under **Projects** with their working tabs; **Open** opens them in a new window.
- [ ] 1.3 **History** shows old sessions and tidied tabs; old tidied entries say about "expires in 30d".
- [ ] 1.4 Inspect the Library → Console: `chrome.storage.local.get("schema").then(console.log)` prints `{schema: 4}`.

## 2. Popup basics

- [ ] 2.1 Popup opens fast; the dot next to the title is green (local AI) or orange (hover tells why).
- [ ] 2.2 Pins row shows your pins; clicking one opens it.
- [ ] 2.3 "This window" shows the tab and group counts and "Close 1 duplicate"; clicking it closes the duplicate.
- [ ] 2.4 **✦ Organise with AI**: tabs are grouped with names and colours; message says "N groups by AI" (or "by site").
- [ ] 2.5 **Ungroup** removes the groups.
- [ ] 2.6 Press **Alt+Shift+O** on a normal page: tabs get grouped, a "Tabs organised" notification appears.

## 3. Saving pages (Inbox, collection, project)

- [ ] 3.1 On the arXiv tab: popup → **Inbox** → reminder "Tomorrow 09:00" → **Save to Inbox**. Message "Saved to Inbox", then (a moment later, AI on) "AI suggests …".
- [ ] 3.2 Re-open the popup on that tab: the line under the title says "in Inbox"; button says "Update reminder".
- [ ] 3.3 On the GitHub tab: **Collection** → type `Tools › Dev` → **Save to Tools › Dev**. In the Library it is under Collections › Tools › Dev (not in the Inbox).
- [ ] 3.4 Right-click any link → **Save link for later** → notification; it appears in the Inbox.
- [ ] 3.5 **Alt+Shift+S** on another page → notification; it appears in the Inbox.
- [ ] 3.6 Popup **☆** pins the current page; it appears in the pins row and on the Library rail.

## 4. Library: Inbox, review, collections

- [ ] 4.1 Inbox rows show title, AI note, dashed suggested collection, type; **Keep** files it into the suggestion.
- [ ] 4.2 Click a row: details open (status, type, reminder, collection, tags). The AI-sorted page shows up to 2 tags.
- [ ] 4.3 Drag an Inbox row onto a collection in the sidebar: it moves there.
- [ ] 4.4 Collection view: **+ Sub**, **Rename** (e.g. `Tools › Dev` → `Tools › Code`), pages follow the rename.
- [ ] 4.5 **Rows / Cards** toggle changes the layout and is remembered after reload.
- [ ] 4.6 **Weekly review** → Pages tab: → keeps (into the typed collection), ← discards, ↓ pushes to next week, P pins.
- [ ] 4.7 After each review action an **Undo** message appears; **Undo** (or Ctrl+Z) brings the page back.
- [ ] 4.8 Course page (e.g. the Hugging Face course): details → **Track units** → 5 → **+** moves the bar.
- [ ] 4.9 **Mind map**: click a top branch to open it, double-click to open its list; pages show site icons; pages sharing a tag have a dotted line.

## 5. Phrasebook

- [ ] 5.1 On an English article, select one word → right-click **Save "…" to Phrasebook** → notification with the sentence.
- [ ] 5.2 Select a 2-4 word phrase → **Alt+Shift+W** → saved as a phrase.
- [ ] 5.3 Select a whole sentence (6+ words) → saved as a **quote**; in the Library that page's details show the quote.
- [ ] 5.4 On the Polish page, save a word: language badge says **PL**; translation "→ …" appears (may need Chrome's one-time translator download).
- [ ] 5.5 Library → **Phrasebook**: "This week" group, lime edge on the newest, sentence with the word in bold, AI definition marked "AI", dictionary links open the right word (Cambridge / Collins / PWN).
- [ ] 5.6 Save the same word again: it shows "2×" instead of a second card.
- [ ] 5.7 **+ Note** adds your own note; **×** deletes with Undo.
- [ ] 5.8 Weekly review → **Words** tab: Space shows the meaning, → Got it, ← Again; done screen counts them.
- [ ] 5.9 On a Chrome page (e.g. the Web Store) saving a word still works, just without a sentence.

## 5b. Page notes and read / unread (v1.2)

- [ ] 5b.1 On a long article select a paragraph → right-click **Highlight (page notes)**: the side panel opens, the passage is marked yellow on the page.
- [ ] 5b.2 Pick another colour in the panel, select more text → **Highlight selection** (Chrome may ask for access to this site once).
- [ ] 5b.3 Add a comment to a highlight; type notes in **My notes**; reload the page: everything is still in the panel.
- [ ] 5b.4 Reload the page → **Show on page**: highlights are marked again; clicking a highlight in the panel scrolls to it.
- [ ] 5b.5 Switch tabs: the panel follows the active tab.
- [ ] 5b.6 Library → **Notes**: the page with its highlights and notes; **Export** downloads a .md; Ctrl+K finds a word from a highlight.
- [ ] 5b.7 Popup on that page shows "N highlights + notes" and a **✎ Notes** button that opens the panel.
- [ ] 5b.8 Old Phrasebook quotes (if you had any) now appear as highlights in Notes.
- [ ] 5b.9 Save a page to the Inbox: its row is **bold** (unread). Read it for 2+ minutes in the front tab: the row turns normal (read). Tick/untick **Read** in its details.
- [ ] 5b.10 Popup **All tabs → Inbox**: every tab is saved, the window shows the Inbox, and History has a "N tabs sent to Inbox" snapshot.

## 5c. Inbox triage (v1.3)

- [ ] 5c.1 With 5+ pages in the Inbox: bundle cards appear (e.g. "→ AI › Agents 4", "Duplicates", "Old & never read", "No suggestion yet").
- [ ] 5c.2 **Keep all** on a bundle files them; **Undo** brings them back. **Show** filters the list; the chip "… ×" clears it.
- [ ] 5c.3 Save the same page twice written differently (with `?utm_source=x` or `www.`): it shows under **Duplicates**.
- [ ] 5c.4 Tick 3 rows: the dark bar shows "3 selected"; Keep here / Keep suggested / → Project / Read / Unread / Discard work.
- [ ] 5c.5 Keys: J/K move the outline, X selects, E keeps (as suggested), # discards, O opens, M toggles read, * selects all, Esc clears.
- [ ] 5c.6 **Keep all N as suggested** in the toolbar files every page into its AI suggestion.

## 5d. Reading (v1.4)

- [ ] 5d.1 Save a long article from the popup: its row shows "N min" (a YouTube video shows "N min video").
- [ ] 5d.2 Library → **Reading queue**: unread pages shortest first, "Up next" card with **▶ Read now**; unknown lengths at the bottom; no courses.
- [ ] 5d.3 Chips "5 min / 15 min / 30 min / 1 hour" show only pages that fit; "include videos" adds videos.
- [ ] 5d.4 Read a queued page for 2+ minutes: it leaves the queue (or press M on its row).
- [ ] 5d.5 Weekly review shows **This week / This month / Still unread** with counts and ≈ reading time.

## 6. Projects and research trails

- [ ] 6.1 Popup → **Working on** → **+ New project…** → "Test research" + Enter. Icon shows **●** in this window.
- [ ] 6.2 Search Google, open 2 results in new tabs, click a link inside one of them.
- [ ] 6.3 Library → Projects → Test research: the trail shows those pages indented under the page they came from; no Google result page in the list.
- [ ] 6.4 **Track this window** button in the project shows "● Tracking this window" for the window the Library is in only if that window is the tracked one.
- [ ] 6.5 In another window with 5+ tabs: popup → **Park this window** → existing project, **close the tabs** ticked → **Park**. The tabs close, the Library opens on the project, new sources are listed.
- [ ] 6.6 Trail buttons: ✓ useful (green dot), Later (also appears in Inbox), ✕ not needed (struck through), ▣ adds to working tabs, ✎ note, − remove (Undo works).
- [ ] 6.7 ✕ on a page that has pages under it asks to mark them too; the branch is greyed; Undo restores it.
- [ ] 6.8 Filters (Unread / Useful / …) and the progress bar match what you marked.
- [ ] 6.9 **▶ Read next** opens the next unread page. Popup shows the green **Reading for Test research** card.
- [ ] 6.10 In that card press **✓ Useful** with "then open the next one here" ticked: the same tab moves to the next unread page.
- [ ] 6.11 Press **✕ Not needed** on a page with children: two inline buttons appear ("Only this" / "This + those").
- [ ] 6.12 **Export**: a `.md` file downloads with the useful sources, notes and any quotes; it is also on the clipboard.
- [ ] 6.13 **Finish…**: choose "send to Inbox" for unread, type a collection for all → **Finish**. Project shows "✓" in the sidebar, buttons are gone, useful pages are in that collection; **Reopen** brings it back.
- [ ] 6.14 Popup **Project** save option adds the current page to a project's trail.

## 7. History

- [ ] 7.1 Popup → **Save session**: History shows "Saved session" with the date + AI name.
- [ ] 7.2 Close a window with 2+ tabs: within a few seconds History shows "Closed window · N tabs".
- [ ] 7.3 Filter chips (Closed windows / Saved sessions / Tidied) filter the list.
- [ ] 7.4 Per tab: **Restore** opens it and removes it from the entry; **→ Inbox**, **→ Project**, **→ Collection** move it (it leaves the entry); **×** removes with Undo.
- [ ] 7.5 **Make project** turns an entry into a project and opens it.
- [ ] 7.6 Tidy: set "idle for 1 day" → **Tidy N idle tabs now** closes idle tabs (never pinned, active or audio tabs); they appear as "Tidied".
- [ ] 7.7 Untick "save closed windows", close a window: nothing new appears. Tick it again.

## 8. Reminders and notifications

- [ ] 8.1 Inspect the Library → Console, run:
      `getItems().then(i => updateItem(i[0].id, { remindAt: Date.now() - 1000 }))`
      The item shows a lime **due** chip; the popup footer shows "1 due" and the icon badge "1".
- [ ] 8.2 Set a page's reminder to "Tonight 20:00" (or wait for 3.1's reminder): the notification has **Open** and **Snooze 1 day**; Open opens the page.
- [ ] 8.3 (Friday 16:00, or skip) the weekly review notification lists pages and words; **Review now** opens the review.

## 9. Search, shortcuts, undo, backup

- [ ] 9.1 Library **Ctrl+K**: typing finds pages, collections, projects, sources, words; ↑↓ + Enter opens; Esc closes.
- [ ] 9.2 **Alt+Shift+L** from any tab focuses the open Library (no second Library tab).
- [ ] 9.3 Undo message disappears after ~8 s; Ctrl+Z after that does nothing.
- [ ] 9.4 **Export** again, then **Import** the file from 0.1: message says how many pages/projects/pins you have; nothing is duplicated.
- [ ] 9.5 Dark mode (Windows → Settings → Colours → Dark): popup and Library are readable.

## 10. Speed

- [ ] 10.1 Popup opens in well under a second; saving returns at once (AI note arrives later).
- [ ] 10.2 With 30+ pages and the AI sorting, the Library stays responsive (no freezing while sorting).

## Found a problem?

Write the step number, what you expected, what happened, and the Console error (if any).
Your data is safe: the backup from 0.1, plus `backupV2` inside the extension from the first upgrade.
