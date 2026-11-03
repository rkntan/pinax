# Tab Organiser: plan v0.6 to v1.0

Status: approved 2026-11-03. Phase 1 done (v0.6.0), Phase 2 done (v0.7.0), Phase 3 done (v0.8.0); next: Phase 4 (History).

## Where we are (v0.5.0, commit 259a5e1)

- Popup: save page to Inbox / collection / workspace, pins row, AI organise, sessions, workspaces.
- Library: pins dock, Inbox, weekly review, collections tree, mind map, sessions, archive (tidy).
- Data in `chrome.storage.local`: `items`, `collections`, `pins`, `library` (sessions, workspaces
  and archive mixed in one list), settings.
- Weak spots: `library.js` is one 900-line file; sessions/workspaces/archive share one list;
  no tests; no git until now.

## Target structure (6 places)

| Place | For | Lifetime |
|---|---|---|
| Pins | tools you use every day | forever |
| Inbox | quick saves, decided in the Friday review | 1-2 weeks |
| Projects | research / work: sources, trail tree, working tabs (replaces Workspaces) | until finished |
| Collections | long-term knowledge by topic | forever |
| Phrasebook | words, phrases, quotes with context; weekly 10 | forever |
| History | closed windows + tidied tabs (Sessions + Archive merged) | 30 days |

## Phase 1: Foundation (no new features, safer base) - DONE v0.6.0

1. Split `library.js` into small files: `ui.js` (DOM helpers), `views/inbox.js`, `review.js`,
   `collections.js`, `map.js`, `history.js`, `projects.js`, `phrasebook.js`. Same behaviour.
2. Storage schema v3 with migration: `library` -> `projects` (from workspaces) + `history`
   (sessions + archive). The old data is copied to `backupV2` first, so nothing can be lost.
3. Unit tests for `core.js` with Node's built-in test runner (`node --test`): dates, paths,
   collection rename/delete, expiry, migration. Pure logic only, no fake Chrome.
4. Sidebar order: Inbox · Review · Projects · Collections · Phrasebook · History · Mind map.
   (Phrasebook appears in Phase 2; History shows Sessions + Archive until Phase 4.)
5. Export/import includes the new keys.

Done when: tests pass, the extension looks and works as v0.5 after migration, commit.

## Phase 2: Phrasebook - DONE v0.7.0

1. Right-click selected text -> **Save to Phrasebook**, and shortcut **Alt+Shift+W**.
2. Stored: the text, the sentence around it, page title + link, date, language.
   - Sentence: read from the page only at the moment you save (Chrome `activeTab` + `scripting`,
     no access to all sites).
   - Language: Chrome's built-in Language Detector (offline); fallback: simple rules.
3. Up to ~5 words = word/phrase. Longer = **quote**, attached to that page (and its project).
4. Meaning:
   - AI note (Gemini Nano): short definition + one example, labelled "AI".
   - Dictionary links: Cambridge, Collins, Google (English); PWN + Wiktionary (Polish).
   - Translation with Chrome's built-in Translator (offline) when the word is not English.
5. Phrasebook view: **This week** (last 10 highlighted), older weeks below, filter by language,
   search, edit, delete. Quotes tab.
6. Friday review gets a step **This week's 10 words**: show word -> reveal meaning + sentence ->
   Got it / Again ("Again" words come back next week).
7. Popup footer: "Words this week: N".

Done when: save from a real page with context, language detected, review step works, commit.

## Phase 3: Projects (replaces Workspaces) - DONE v0.8.0

1. Background **trail tracking**: remembers which tab opened which (Chrome "opener"), per window,
   only on this laptop.
2. Popup: **Working on: [project]** per window. New tabs in that window join the project's trail.
   **Park this window** -> new or existing project, optionally close the tabs.
3. Project view:
   - Trail tree (left) and source list (right).
   - Source status: unread / useful / later / not needed; a one-line note per source.
   - "Not needed" on a branch offers to prune the pages opened from it.
   - **Open working tabs** (what Workspaces did), progress bar "18 of 30 sorted".
4. **Reading mode**: Read next -> mark Useful / Later (Inbox) / Not needed -> tab closes, next opens.
   Available in the Library and in the popup when the current tab is a project source.
5. **Finish project**: sort what is left, file useful sources into collections, export a
   Markdown list (title, link, note, quotes). Project becomes read-only.
6. Existing workspaces become projects automatically (all their tabs = working tabs).

Done when: park a 20+ tab window, triage it in reading mode, finish and export, commit.

## Phase 4: History (Sessions + Archive merged)

1. One timeline grouped by day: closed windows, saved sessions, tidied tabs.
2. Restore all / one tab, move a tab to Inbox, a project or a collection.
3. Everything expires after 30 days unless moved somewhere.
4. Tidy settings live here.

## Phase 5: Polish

1. Undo message after discard / delete / prune.
2. AI suggests 1-2 tags when sorting a page.
3. Ctrl+K quick search in the Library (pages, projects, collections, words).
4. Shortcuts: Alt+Shift+O organise window, Alt+Shift+L open Library.

## Decisions (defaults used unless you change them)

1. Six places as above, Workspaces become Projects: **yes**
2. Word meanings: **AI note + dictionary links + translation**
3. Explain / translate into: **English** (alternative: Turkish, or both)
4. Weekly words quiz in the Friday review: **yes**
5. Read the page only when you save a word (`activeTab`): **yes**
6. Order: **Phase 1 -> 2 (Phrasebook) -> 3 (Projects) -> 4 -> 5**
7. History expiry for tidied tabs: **30 days** (today the Archive keeps them forever)

## Working rules

- One commit per phase (plus small fixes), message says what changed.
- Each phase: syntax check + unit tests, then you test in Chrome before the next phase starts.
- Nothing leaves this laptop: no accounts, no servers, no API keys.
