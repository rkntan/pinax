# Tab Organiser: to-do after v1.0

Goal: make the core loop excellent before adding more:
**save without thinking → decide fast → read and take notes → find it again.**
(PLAN.md phases 1-5 are done; this list replaces it.)

## Now

1. [ ] **Run TESTING.md in Chrome** and fix what breaks (Erkan tests, Claude fixes).
2. [x] **Read / Unread instead of Status.** Bold until read; auto-read after ~2 min of real
   viewing; manual toggle. To do / In progress / Done go away (existing "done" = read).
3. [x] **All tabs → Inbox** in the popup: saves every tab of the window and closes them.
4. [x] **Page notes (v1)**: see the design below. Highlights, notes and quotes on any page,
   in a side panel next to the page; one page record joins link + highlights + notes.
5. [x] **Inbox triage with AI bundles**: "7 pages → AI › Agents [Keep all]", "duplicates /
   old [Discard all]", select many.
6. [x] **Gmail-style keys** in the Inbox: J/K move, E keep, # discard, X select.

## Next (reading)

7. [x] Reading time ("8 min") from the page text at save time.
8. [x] Reading queue: unread articles, shortest first.
9. [x] "Read this week / month" in the review.
10. [x] Page notes v2: AI summary of your highlights (Chrome's built-in Summarizer),
    "key ideas", notes in Ctrl+K and the mind map.

## Planned: on-page note-taking (see NOTES-PLAN.md)

14. [x] A v1.7: selection bubble + highlight roles
15. [x] B v1.8: page dock, note card, continue reading
16. [x] C v1.9: page shortcuts (Obsidian export dropped)
17. [x] Popup redesign (one big Save with ▾, quiet tools row, ⋯ More) v1.10

Design rule for everything: minimalist (see NOTES-PLAN.md, "Design rule").

## Audit 2026-11-09 (end-to-end: journey, naming, colour, speed, storage, a11y)

18. [x] v1.11: storage (unlimitedStorage, no stored favicons, schema 7, trail cap), Library paging +
    debounced search, worker without the 1-min alarm, Chrome favicons only, WCAG AA colours, backup fixes.
19. [ ] Naming: one word per concept (Inbox, Collection + Keep, Project + sources, Pins, Dock, Notes,
    comment, Highlight, Delete; "Save" only for the Inbox).
20. [ ] Keyboard: real buttons for tree / pins / map / rows, focus kept after redraw, Import as a button, narrow nav.
21. [ ] Screen-reader basics: lang, titles, aria-labels, aria-pressed/expanded, live status.
22. [ ] First run + dead ends: Inbox empty state with "Download AI model", undo "hide dock", weekly review on/off.
23. [ ] Memory: destroy aiBase on pagehide, Summarizer in try/finally, prune snapTimers.
24. [ ] Cut list (Erkan decides): Mind map, Pins row, daily nudge, Rows/Cards + stats; merge Park/Save session/All tabs.
25. [ ] Per-record storage keys (schema 8) so one change doesn't rewrite all items.
26. [ ] Split core.js: injected page code into its own files (popup JS < 60 KB).

## Later (only if the above feels good in daily use)

11. [ ] Offline page text + "Ask your library".
12. [ ] Sync through a Chrome bookmarks folder.
13. [ ] Product session (jobs, story map, ICE); office market round if releasing.

## Not doing

- No accounts, no cloud server, no paid AI APIs, no mobile app.
- No new "places" beyond: Pins, Inbox, Projects, Collections, Notes inside pages, Phrasebook, History.

---

## Design: page notes (item 4)

**One page = one record.** Its link, status (Inbox / collection / project source), read state,
highlights, quotes and your notes live together. Saving the same page twice adds to the same
record.

**While reading (side panel next to the page)**
- Select text → right-click **Highlight** (or a shortcut); optional colour and a comment.
- The side panel (Chrome's built-in side panel) shows this page's highlights in order, a free
  notes box (Markdown) and buttons: Save to Inbox / collection / project.
- Notes are saved as you type, linked to the page.

**Coming back**
- The Library page row and its details show highlights + notes; a **Notes** view lists every
  annotated page; Ctrl+K and search find text inside highlights and notes.
- On the website, highlights can be shown again (marked in the text), anchored by the quote
  and the words around it, so they survive small page changes.

**Export**
- One page, a collection or a project → Markdown (title, link, highlights as quotes, notes):
  Obsidian-ready.

**Phrasebook** keeps words and phrases; long selections (quotes) move into page notes.

**Decisions for Erkan** (defaults in bold, see chat)
1. Where to write notes: **side panel** / only in the Library / in the popup.
2. Show highlights again on websites: **on click (no extra permission), with an optional
   "always" switch that asks Chrome for site access** / always (asks for access to all sites
   at install) / never.
3. Move Phrasebook quotes into page notes: **yes** / keep both.
4. Order: **2 + 3 first (small), then 4**, then 5-6.
