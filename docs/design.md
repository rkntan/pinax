# Pinax design system

Single source of truth for look and feel. All tokens live in `theme.css` (`:root`, with a dark override in `@media (prefers-color-scheme: dark)`). Popup, side panel and Library share it. Change a value there, never copy it into a page stylesheet.

## Rules

1. **No hard-coded colours in `popup.css`, `panel.css`, `library.css`.** Use a token. If none fits, add one to `theme.css` with both a light and a dark value.
2. **Every colour is checked in light and dark.** Text on any surface must stay readable (aim for WCAG AA, 4.5:1).
3. **Flat and simple.** No gradients. Shadows only on floating layers (menu, toast, quick search, drawer).
4. **The UI does not narrate itself.** Helper text only when it prevents a mistake or explains a consequence.
5. **Works at any window size.** Fluid widths, `min-width: 0` in flex children, long text ellipsised, no fixed widths over about 220px without a `max-width: 100%`. See "Responsive".

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#e8e8e2` | `#0e0a1c` | Page background |
| `--surface` | `#ffffff` | `#18122c` | Cards, inputs, lists, menus |
| `--ink` | `#130537` | `#f1eefc` | Body text, dark buttons, pin rail |
| `--muted` | ink 58% | ink 58% | Secondary text, captions |
| `--line` | ink 12% | ink 12% | Dividers, card borders |
| `--line-strong` | ink 46% | ink 40% | Input and button borders |
| `--violet` | `#6c38ff` | `#9d78ff` | Brand accent: links, focus, hover borders, drop markers |
| `--violet-btn` / `--violet-ink` | `#6c38ff` / `#fff` | same | Primary button fill and its text |
| `--lav` | `#ece9ff` | `#241b45` | Chips, selected segment, progress tracks |
| `--lime` / `--lime-ink` | `#c7ff01` / `#130537` | same | Highlight chip, "due" and update markers |
| `--lime-on-ink` | `#c7ff01` | `#4d6600` | Lime used on dark ink |
| `--ok` / `--ok-btn` | `#0d8561` | `#12b886` | Success, healthy status |
| `--warn` | `#b04409` | `#e8590c` | Warning status |
| `--danger` | `#e0262c` | `#ff5a5f` | Destructive actions, errors |
| `--muted-btn` | ink 58% | `#6b6780` | Disabled-looking / quiet buttons |

### Type colours (`.t-<Type>` sets `--type`)

Course `#8959ff` · Video `#ff5a5f` · Tool `--ok` · Article `#ca8300` · Docs `#228be6` · Paper `#e64980` · Other `#868e96`. Used for dots, mind-map leaves and type labels. New types need a colour here.

### Meaning of colour

- Violet = interactive or selected. Lime = needs attention (due, update). Green = ok. Orange = warn. Red = danger only.
- Never use red or green as the only signal; pair with text or an icon.

## Typography

- Headings (`h1`–`h3`, titles): **Space Grotesk** 700, `letter-spacing: -0.01em` (`--head`).
- Everything else: **Inter** 400–700 (`--body`), 13px / 1.45 base.
- Sizes in use: 10–11px labels, 11.5px `.small`, 12px controls and metadata, 13px body, 14–15px section and popup titles, 17–20px page heading, 18px stat numbers. Do not add new sizes without a reason.
- Weights: 400 body, 500 buttons and links, 600 row titles and primary buttons, 700 headings.
- `.muted` for secondary text. Do not set grey text colours by hand.

## Shape and spacing

- Radius: `--radius` (10px) for cards and lists; 8px inputs and buttons; 6px small buttons; 999px chips; 14px dialogs (quick search, finish card); 3–5px favicons.
- Edges: 16px in the popup, 14px in the side panel, 22px in the Library main area (16px on narrow windows, 12px on phones-size windows).
- Gaps: 4, 6, 8, 10, 14 px. Keep to this scale.
- Icons and favicons: 16px in rows, 22px in the popup header, 24px in the pin rail, 40px for pins.

## Components

- `.btn` (outline), `.btn.primary` (violet), `.btn.dark` (ink), `.link` (text button). One primary button per area.
- `.input` / `select`: 1px `--line-strong` border, violet on focus. Focus ring is always `:focus-visible` 2px violet.
- `.chip` (lavender), `.chip.lime` (highlight). Long chip text does not wrap.
- Lists sit on `--surface` with a `--line` border, rows divided by `--line`.
- Floating layers (menu, toast, quick search): `--surface` (toast uses `--ink`), border `--line`, shadow, `z-index` 20–30.

## Responsive

- Library: grid `60px | 232px | 1fr`. At 860px or less the sidebar becomes a drawer behind the menu button and the rail is 52px. At 560px or less inputs go full width and padding shrinks. At 500px height or less the top bar stops being sticky.
- Popup: 360px wide, max 600px tall, scrolls. Centred when opened as a tab.
- Side panel: fluid, minimum 240px.
- Use `dvh` for full-height layouts, not `vh`.
- Test at: 320, 480, 860, 1280 px wide and 400, 700 px tall, in light and dark.

## Checklist before merging UI changes

- [ ] No raw colours added outside `theme.css` (grep for `#` and `rgb` in the page CSS).
- [ ] Looks right in light and dark.
- [ ] No horizontal scroll at 320px.
- [ ] No new helper text that only restates the label.
- [ ] New type or status has a colour defined here.
