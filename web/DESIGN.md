---
version: 2.0
name: Netija Design System
description: Netija's visual language — a flat, Notion-calm document system. One warm paper canvas everywhere (no cards, no shadows, no pills), near-black type with a confident display heading, hairline structure, small tinted tags for status, and exactly one solid black action per page.

colors:
  primary: "#000000"
  primary-active: "#1a1a1a"
  secondary: "#8fad88"
  secondary-active: "#6e9471"
  accent: "#ffa07a"
  accent-active: "#e8855e"
  on-primary: "#ffffff"
  canvas: "#f8f6f4"
  surface: "#f8f6f4"
  ink: "#211f1d"
  ink-muted: "#615d59"
  hairline: "#e7e5e3"
  muted: "#eeecea"

  # Decision status
  status-pass-bg: "#e6f4e8"
  status-pass-fg: "#1e5e2a"
  status-fail-bg: "#fdf0e8"
  status-fail-fg: "#9a4200"
  status-pending-bg: "#fdf6e3"
  status-pending-fg: "#7a5f1a"
  status-neutral-bg: "#f4f4f4"
  status-neutral-fg: "#555555"

typography:
  heading-page:
    fontFamily: Thmanyah Serif Display (AR) / Geist Sans (FR)
    fontSize: clamp(30px, 7vw, 40px)
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  number-display:
    fontFamily: Thmanyah Sans / Geist Sans, tabular-nums
    fontSize: clamp(30px, 7vw, 38px)
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  body-md:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  tag:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
  button-cta:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
  button-quiet:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  mono-data:
    fontFamily: Geist Mono
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5

rounded:
  xs: 4px
  md: 6px
  lg: 8px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 28px
  xxl: 32px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    border: none
    padding: 16px
  document-column:
    maxWidth: 560px
    padding: "9vh 24px 80px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-cta}"
    rounded: "{rounded.md}"
    height: 48px
  button-quiet:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    typography: "{typography.button-quiet}"
    border: "1px {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 6px 14px
  tab-switcher-item:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    height: 36px
    activeBackgroundColor: "{colors.muted}"
    activeTextColor: "{colors.ink}"
  text-input:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    border: "1px {colors.hairline}"
    rounded: "{rounded.md}"
    height: 48px
  tag:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: 1px 8px
  tag-status-pass:
    backgroundColor: "{colors.status-pass-bg}"
    textColor: "{colors.status-pass-fg}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: 1px 8px
  tag-status-fail:
    backgroundColor: "{colors.status-fail-bg}"
    textColor: "{colors.status-fail-fg}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: 1px 8px
  tag-status-pending:
    backgroundColor: "{colors.status-pending-bg}"
    textColor: "{colors.status-pending-fg}"
    typography: "{typography.tag}"
    rounded: "{rounded.xs}"
    padding: 1px 8px
  property-row:
    labelColor: "{colors.ink-muted}"
    labelTypography: "{typography.label}"
    labelWidth: 144-176px
    valueTypography: "{typography.body-sm}"
    minHeight: 32px
  floating-menu:
    backgroundColor: "{colors.canvas}"
    border: "1px {colors.hairline}"
    rounded: "{rounded.md}"
    shadow: "shadow-md (floating menus only)"
---

## Overview

Netija looks like a well-kept document, not an app. Every page — search, result, admin — sits on one warm paper canvas (`{colors.canvas}`, `--background: oklch(0.975 0.003 80)`). There are **no cards**: nothing is lifted onto a white surface, nothing casts a shadow at rest. Structure comes from typography, whitespace, hairline rules, and small muted tags — the Notion vocabulary. Type is Thmanyah (Arabic) and Geist (French) in near-black ink; numbers (exam numbers, years, moyennes) are set in Geist Mono with tabular figures.

The result page is the showpiece and defines the pattern every public page follows: a narrow 560px column with generous top whitespace (~9vh), a confident display heading, flat label/value property rows, one hairline `hr`, one big number, and a row of quiet bordered actions. The decision is a small tinted select tag inline in its row — never a hero banner.

Color says very little on purpose. The only solid fill on a public page is the single black CTA. Status tags carry the emotional palette (celebratory green for Admis, warm calm amber for Ajourné/Sessionnaire). Sage green (`{colors.secondary}`) survives as the admin sidebar's active indicator and in charts; salmon (`{colors.accent}`) is reserved for charts and possible future decorative moments — neither appears as structure on public pages.

**Key characteristics:**

- One flat warm canvas — `--card` and `--popover` equal `--background`; figure/ground never comes from a white fill
- No shadows at rest; `shadow-md` only on floating menus (autocomplete dropdown, selects)
- Nothing pill-shaped: buttons and inputs round at `{rounded.md}` (6px), tags at `{rounded.xs}` (4px)
- Display heading `clamp(30px, 7vw, 40px)` weight 700, tracking −0.01em
- Property rows: muted 14px label (~160px column) + 15px value; mono for all numeric data
- Status is a small tinted tag with text, never color alone, never a hero
- Exactly one solid black action per page (`{colors.primary}`); everything else is quiet

## CSS Variables

Tokens live in `web/app/globals.css`. Light mode:

```css
:root {
  --background:       oklch(0.975 0.003 80); /* warm paper — the one canvas */
  --card:             oklch(0.975 0.003 80); /* same — flat system */
  --popover:          oklch(0.975 0.003 80);
  --foreground:       oklch(0.13 0.004 80);  /* warm near-black ink */
  --muted:            oklch(0.94 0.002 80);  /* tag / hover / active-tab fill */
  --muted-foreground: oklch(0.44 0.008 80);  /* labels, quiet text — ≥4.5:1 */
  --primary:          oklch(0 0 0);          /* the single black action */
  --secondary:        oklch(0.70 0.07 148);  /* sage — admin sidebar, charts */
  --accent:           oklch(0.76 0.13 48);   /* salmon — charts, reserve */
  --border:           oklch(0.91 0.002 80);  /* hairline */
  --ring:             oklch(0 0 0);
  --radius: 0.5rem;                          /* rounded-md ≈ 6px, rounded-lg 8px */
}
```

Dark mode mirrors the same flatness (`--card`/`--popover` = `--background: oklch(0.10 0.002 0)`); borders become white at 10% alpha.

Decision status tokens (light):

```css
--status-pass-bg:    oklch(0.94 0.07 148);  --status-pass-fg:    oklch(0.30 0.12 148);
--status-fail-bg:    oklch(0.94 0.06 55);   --status-fail-fg:    oklch(0.42 0.15 48);
--status-pending-bg: oklch(0.95 0.05 78);   --status-pending-fg: oklch(0.40 0.10 70);
--status-neutral-bg: oklch(0.93 0.002 0);   --status-neutral-fg: oklch(0.42 0.003 0);
```

## Typography

### Font families

| Context                    | Family                 | Variable                        |
| -------------------------- | ---------------------- | ------------------------------- |
| Arabic — display headings  | Thmanyah Serif Display | `--font-thmanyah-serif-display` |
| Arabic — UI / body         | Thmanyah Sans          | `--font-thmanyah-sans`          |
| French — all               | Geist Sans             | `--font-geist-sans`             |
| Numeric data               | Geist Mono             | `--font-geist-mono`             |

One font per script. The display serif appears only in the page heading (the student's name); labels, tags, buttons, and data never use it. Every number — exam number, year, série, moyenne — is mono with `tabular-nums`.

### Scale

| Token                        | Size                  | Weight | Use                                    |
| ---------------------------- | --------------------- | ------ | -------------------------------------- |
| `{typography.heading-page}`  | clamp(30px,7vw,40px)  | 700    | Page h1 (student name, home title)     |
| `{typography.number-display}`| clamp(30px,7vw,38px)  | 700    | The moyenne (`17.94 / 20`)             |
| `{typography.body-md}`       | 16px                  | 400    | Body copy, input text, CTA label       |
| `{typography.body-sm}`       | 15px                  | 400    | Property values, list rows             |
| `{typography.label}`         | 14px                  | 400    | Property/form labels (`ink-muted`)     |
| `{typography.tag}`           | 14px                  | 500    | Tags and decision tags                 |
| `{typography.button-quiet}`  | 13px                  | 400    | Quiet bordered actions                 |

Voice is tight and quiet-confident: one heavy heading against a calm 400 body. Negative tracking stays gentle (−0.01em heading, −0.02em big number). The moyenne is always rendered `dir="ltr"` and zero-padded to two decimals (`08.40`), with the "/ 20" at half size in `ink-muted`.

## Layout

- **Document column**: public pages use `max-w-140` (560px), centered, `px-6`, `pt-[9vh] pb-20`. Start-aligned content — never centered text blocks.
- **Property rows**: label column ~144–176px (`w-36 sm:w-44`), muted 14px; value 15px; min-height 32px; subtle full-row `hover:bg-muted/50`.
- **Section breaks**: a single hairline `<hr>` (`border-border`), `my-6`.
- **Admin**: `max-w-5xl`, compact density, same flat control vocabulary as public pages.
- Base spacing unit 4px; touch targets ≥44px on mobile (inputs and CTA are `h-12`).

## Elevation & Depth

There is none at rest. The page is the surface. Two sanctioned exceptions:

| Context                       | Treatment                                        |
| ----------------------------- | ------------------------------------------------ |
| Static structure              | Hairline `{colors.hairline}` borders only        |
| Floating menus (autocomplete dropdown, select popover) | `1px` hairline + `shadow-md`, `{rounded.md}` |

## Components

### Navigation

**`nav-bar`** — borderless top bar: brand wordmark (14px semibold) start, language toggle end, `h-(--nav-height)`. No border-bottom, no background change on scroll.

### Result page (the showpiece)

Flat Notion-style document, top to bottom:

1. **Name** — `{typography.heading-page}` in the display font of the rendered name's script. One name only: the current language's, falling back to the other; `lang`/`dir`/font follow the fallback.
2. **Property rows** — exam number (mono), year (mono), série (`tag`), decision (`tag-status-*`). The decision tag is small and inline — the moyenne is the visual hero, not the decision.
3. **Hairline `hr`.**
4. **Moyenne** — muted 14px label, then `{typography.number-display}` `XX.XX / 20`.
5. **Quiet actions** — `button-quiet` copy-link (swaps to "copied ✓" for 1.5s) and new-search.

### Tags

- **`tag`** — `{colors.muted}` fill, ink text, `{rounded.xs}`, padding `1px 8px`. Used for série and any enum value.
- **`tag-status-*`** — same shape, tinted with the status tokens. Always carries its text label; color never means anything alone.

### Buttons

- **`button-primary`** — solid black, white text, `{rounded.md}`, `h-12`, full-width in the search form. The only solid fill on a public page. Pressed: `{colors.primary-active}`.
- **`button-quiet`** — transparent, 1px hairline, `{rounded.md}`, 13px `ink-muted`; hover fills `{colors.muted}` and darkens to ink.

### Search (home page)

- **Tab switcher** — quiet text buttons (`tab-switcher-item`), not underline tabs: inactive is muted text on nothing; active gets a `{colors.muted}` rounded-md chip. No border under the row.
- **`text-input`** — transparent on the canvas, 1px hairline, `{rounded.md}`, `h-12`, 16px text; exam number input is mono. Labels above fields: 14px, normal weight, `ink-muted`. Focus: black ring.
- **Autocomplete menu** — `floating-menu`; rows are `px-4 py-3` with no dividers, separated by `hover:bg-muted/60` / active `bg-muted`; match highlight is bold ink (no color); loading shows skeleton rows; empty and error states are quiet centered text with an underlined ink action.

### Admin

Same flat system as the public pages, not a separate functional skin: one canvas, no cards, hairline structure only, `{rounded.md}` buttons (never pills), `{rounded.xs}` tags. Denser and no display fonts or brand moments — the product register's allowance, not a different design language. Tables and property lists sit directly on the canvas (a `border-b` under the header row and `divide-y` between rows, never a `bg-card` + `border` + `shadow` box). Empty states are quiet centered text with an underlined ink action, matching the public autocomplete's empty/error pattern — never a dashed "card". Sidebar active indicator uses `{colors.secondary}` (sage); the sidebar's own background is a legitimately distinct second neutral layer (`--sidebar`, slightly cooler than the canvas), which is the one place a second surface tone is allowed. The login form is a hairline-bordered `rounded-lg` block — no shadow.

## Motion

| Duration | Value | Use                         |
| -------- | ----- | --------------------------- |
| Short    | 150ms | State toggles, hover, focus |
| Medium   | 250ms | Panel reveals, menu open    |
| Long     | 350ms | Page-level transitions      |

- Reveals: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint). Exits: `cubic-bezier(0.4, 0, 1, 1)`.
- No orchestrated page-load sequences; pages load into a finished state.

### Admis celebration

Small and tasteful — the flat system celebrates quietly:

1. **Decision tag entrance** — `.netija-tag-spring`: scale 0.85→1 + fade, 400ms, gentle spring `cubic-bezier(0.34, 1.56, 0.64, 1)`.
2. **Moyenne count-up** — 0 to value over 600ms, two decimals.

Ajourné / Sessionnaire get `.netija-tag-fade` (200ms opacity) and a static moyenne. **Never festive about a fail.** `prefers-reduced-motion` collapses the spring to the fade and skips the count-up.

## Do's and Don'ts

### Do

- Keep every surface on the one warm canvas — light and dark. If something needs separation, use a hairline or whitespace, not a fill.
- Reserve solid black for the single primary action, focus ring, and active signals.
- Set all numeric data in Geist Mono with `tabular-nums`; zero-pad the moyenne to two decimals.
- Use `{rounded.md}` for buttons and inputs, `{rounded.xs}` for tags. Full-pill radii are banned everywhere.
- Pair every status tag with its text label; localize decisions.
- Keep labels muted 14px and values 15px in property rows; keep the label column fixed so rows scan as a table.

### Don't

- Don't add cards, panels, or white fills — no `bg-card` distinct from the page, ever.
- Don't use `box-shadow` at rest; only floating menus may cast one.
- Don't make the decision a hero banner or giant colored text — it is a small tag; the moyenne is the big moment.
- Don't animate Ajourné or Sessionnaire beyond a fade.
- Don't use underline/line tabs — tab switchers are quiet muted-chip buttons.
- Don't color text for emphasis in lists or matches — use weight (bold ink).
- Don't put display serif in labels, buttons, tags, or data.
- Don't introduce a second structural color on public pages; sage and salmon live in admin chrome and charts only.
- Never log or send student names, exam numbers, or NNI to any analytics or error service.
