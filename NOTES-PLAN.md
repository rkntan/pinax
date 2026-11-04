# Plan: on-page note-taking (floating bar) — v1.7 to v1.9

Status: approved 2026-11-04 with the defaults. Phase A done (v1.7.0).

## Design rule (whole app): minimalist

- One job per surface. Show nothing until it's needed; hide it again when done.
- Fewest controls that do the job. If a control is used rarely, it goes one click deeper (⋯).
- One visual language: dark ink surfaces on the page, drawn icons (no emoji / text symbols),
  soft shadow, 10-12 px corners, 8 px spacing grid, one accent (violet), lime only for "due".
- No new places in the Library. Everything here lives in the existing **Notes** view.
- Every action undoable; no "are you sure?" for small things.

## What we build

### 1. Selection bubble (fast actions while reading)

Select text on a page → a small dark bubble appears just above the selection:

```
┌───────────────────────────────┐
│ ●  ●  ●  ●  │  Note  Word  ⧉  │
└───────────────────────────────┘
```

- 4 dots = highlight with a **role** (see 3). One click, bubble closes.
- **Note** = highlight + a one-line comment box right there (Enter saves).
- **Word** = save to the Phrasebook (same as Alt+Shift+W).
- **⧉** = copy with source (quote + title + link).
- Disappears on Esc, click elsewhere, or scroll away. Never shows inside inputs / editors.
- Replaces the need for the "Highlighter" pen in daily use (the pen stays in the panel for
  marking many passages in a row).

### 2. Page dock (page tools, always the same place)

A slim vertical dock on the right edge, collapsed to one small tab until hovered:

```
  ┃ ✎   highlighter on/off
  ┃ ▤   page note card (see 4)
  ┃ ◉   show / hide my highlights
  ┃ ✦   key ideas (AI)
  ┃ ⇲   open the full side panel
```

- Only on pages that have notes, or after you used the bubble / icon on that page.
- Draggable up/down; remembers its spot; "hide on this site" in its ⋯ menu.

### 3. Highlight roles (meaning, not just colour)

| Colour | Role | Use |
|---|---|---|
| yellow | Key point | the main things |
| green | Idea | something to use / try |
| blue | Question | to find out / ask |
| pink | Check | doubtful, verify later |

- Roles show as small labels in the panel and the Notes view; filter "all my Questions".
- Existing highlights keep their colour = role (no migration needed beyond the label).

### 4. Page note card (notes without leaving the page)

- Small floating card (dock ▤ or shortcut N): your notes for this page, Markdown, autosave.
- Same notes as the side panel (one record per page); the panel stays as the full notebook.
- Minimise to the dock; never covers the text you're reading (snaps to a side).

### 5. Continue reading

- Remembers how far you scrolled in a long article (≥ 3 min reading time).
- Dock / Reading queue: "Continue at 64%" jumps back.

### 6. Shortcuts (when the bubble or dock is active on a page)

- H highlight selection (Key point) · N note · W save word · Esc close.
- Chrome-wide shortcuts stay as they are (max 4).

### 7. Export for Obsidian

- Markdown with frontmatter (title, url, date, tags, collection/project), highlights grouped
  by role, comments under each, then your notes and the AI key ideas.
- Per page, per collection, per project; "Copy" or download.

### Later (not in this plan)

- Sticky notes pinned to a paragraph without a highlight.
- Images / area clips.

## Phases

| Phase | Version | Content | Done when |
|---|---|---|---|
| A ✓ | v1.7 | Selection bubble + roles (1, 3) | Select → bubble → highlight with role / note / word / copy works on 3 real sites; roles shown + filterable in panel and Notes |
| B | v1.8 | Page dock + note card + continue reading (2, 4, 5) | Dock appears only when it should; note card edits the same notes as the panel; continue jumps back |
| C | v1.9 | Shortcuts + Obsidian export (6, 7) | Keys work only while the page tools are active; export opens cleanly in Obsidian |

Each phase: unit tests for the pure parts, a live check on real pages (Wikipedia, a blog, a
docs site), TESTING.md steps, one commit.

## How it gets onto the page (permissions)

Chrome only lets the extension into a page after: a click on its icon, the right-click menu,
a keyboard shortcut, or a site you allowed (side panel → Allow). Options:

1. **Sites you allow (recommended).** The bubble/dock run on sites you've allowed once, and on
   any page right after you use the icon or a shortcut there. No new permission.
2. **Everywhere.** One "read and change all sites" permission; smoothest, but the scary prompt.
3. **Per page, by hand.** Only after you switch it on for that page. Most private, most clicks.

## Decisions for Erkan (defaults in bold)

1. Bubble + dock + side panel: **yes** / bubble only / dock only.
2. When it appears: **1. sites you allow** / 2. everywhere / 3. per page.
3. Role names and colours as in the table: **yes** / change them.
4. Keep the Highlighter pen in the panel: **yes** (for many passages in a row) / remove.
5. Order: **A → B → C**.
