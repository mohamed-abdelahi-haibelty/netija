---
version: 1.0
name: Netija Design System
description: Netija's visual language — a paper-calm document surface built on a warm off-white canvas, near-black type, and a single black primary action, punctuated by sage green structure and a warm salmon accent that carries all the personality while the chrome stays quiet.

colors:
  primary: "#000000"
  primary-active: "#1a1a1a"
  secondary: "#8fad88"
  secondary-active: "#6e9471"
  accent: "#ffa07a"
  accent-active: "#e8855e"
  on-primary: "#ffffff"
  on-secondary: "#ffffff"
  on-accent: "#ffffff"
  canvas: "#ffffff"
  canvas-soft: "#f6f5f4"
  surface: "#ffffff"
  ink: "#000000"
  ink-secondary: "#31302e"
  ink-muted: "#615d59"
  ink-faint: "#a39e98"
  hairline: "#e6e6e6"

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
  display-1:
    fontFamily: Thmanyah Serif Display / Geist Sans
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -2.125px
  display-2:
    fontFamily: Thmanyah Serif Display / Geist Sans
    fontSize: 54px
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: -1.875px
  heading-1:
    fontFamily: Thmanyah Serif Display / Geist Sans
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -1px
  heading-2:
    fontFamily: Thmanyah Serif Text / Geist Sans
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.23
    letterSpacing: -0.625px
  heading-3:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.27
    letterSpacing: -0.25px
  title:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.125px
  body-md:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: 0
  button:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: 0
  eyebrow:
    fontFamily: Thmanyah Sans / Geist Sans
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: 0.125px

rounded:
  xs: 4px
  sm: 5px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px

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
    padding: 16px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
  button-utility:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 4px 14px
  button-icon-circular:
    backgroundColor: "rgba(0, 0, 0, 0.05)"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
  badge-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: 4px 8px
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-elevated:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    padding: 6px
  result-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.display-1}"
    rounded: "{rounded.xl}"
    padding: 32px
  footer:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    padding: 32px
  status-badge-pass:
    backgroundColor: "{colors.status-pass-bg}"
    textColor: "{colors.status-pass-fg}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  status-badge-fail:
    backgroundColor: "{colors.status-fail-bg}"
    textColor: "{colors.status-fail-fg}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  status-badge-pending:
    backgroundColor: "{colors.status-pending-bg}"
    textColor: "{colors.status-pending-fg}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.full}"
    padding: 4px 12px
---

## Overview

Netija looks like a well-organized document in calm daylight. The dominant surface is not pure white but a warm, paper-soft off-white — `{colors.canvas-soft}` (#f6f5f4) — that takes the clinical edge off the screen and makes long pages feel like a record rather than an app. Type is set in Thmanyah (Arabic) and Geist (French) at near-black `{colors.ink}`, with heavy, tightly-tracked weights so headings read as confident statements. The system whispers in greys and blacks, then says exactly two things in color: a single, dependable black `{colors.primary}` for the primary call-to-action, and a sage green `{colors.secondary}` (#8fad88) and warm salmon `{colors.accent}` (#ffa07a) that add warmth and structure without ever competing with content.

The result page is the most beautiful surface in the product — it should feel like something worth framing. The decision badge earns the most emotional weight: Admis gets a warm celebratory entrance; Ajourné and Sessionnaire appear with quiet restraint. Everything else stays out of the way.

Surfaces are defined by hairlines and barely-there layered shadows rather than heavy elevation. Cards round at a friendly 12px (`{rounded.lg}`), CTAs are fully pill-shaped (`{rounded.full}`), and utility buttons round at a tighter 8px (`{rounded.md}`). Nothing is loud; the brand's character comes from restraint plus one well-placed moment of warmth.

**Key Characteristics:**

- Warm paper-soft canvas `{colors.canvas-soft}` over pure white — never clinical
- Near-black `{colors.ink}` type with tight negative tracking at display sizes (`{typography.display-1}`)
- Exactly one structural primary — black `{colors.primary}` — reserved for CTAs and focus signals
- Sage green `{colors.secondary}` (#8fad88) for structural accents, active states, and sidebar chrome
- Warm salmon `{colors.accent}` (#ffa07a) for decorative highlights, the Admis celebration moment, and brand warmth
- Pill-shaped marketing CTAs (`{rounded.full}`) contrasted with 8px utility buttons (`{rounded.md}`)
- Elevation by hairline + barely-there layered shadow, not heavy drop-shadows
- Decision status palette tuned for emotional honesty — Admis is celebratory, never alarming about a fail

---

## Colors

### Brand & Structural

- **Black** (`{colors.primary}` — #000000): the single structural action color. Primary CTA fill ("Rechercher"), focus ring, active-tab indicator, and inline links. This is the only color that ever paints a primary action.
- **Pressed Black** (`{colors.primary-active}` — #1a1a1a): the darker press state of the primary CTA.
- **Sage Green** (`{colors.secondary}` — #8fad88): structural accent for sidebar chrome, active nav items, secondary badges, and supporting UI structure. Calm and botanical — it adds warmth without competing with the primary.
- **Deep Sage** (`{colors.secondary-active}` — #6e9471): the pressed / active state of secondary elements.
- **Warm Salmon** (`{colors.accent}` — #ffa07a): the brand's single decorative and celebratory color. Used for the Admis badge entrance, highlight chips, and the confetti burst on the result page. Never used for structure or CTAs.
- **Deep Salmon** (`{colors.accent-active}` — #e8855e): pressed / darker state of accent elements.

### Surface

- **White** (`{colors.canvas}` / `{colors.surface}` — #ffffff): card and panel surfaces, nav bar, form fields.
- **Warm Paper** (`{colors.canvas-soft}` — #f6f5f4): the signature page canvas and the footer band — a warm off-white that gives every page its document-like calm.
- **Hairline** (`{colors.hairline}` — #e6e6e6): 1px card borders and dividers.

### Text

- **Ink** (`{colors.ink}` — #000000): primary headings and body text.
- **Warm Charcoal** (`{colors.ink-secondary}` — #31302e): secondary body copy and footer text.
- **Stone** (`{colors.ink-muted}` — #615d59): supporting / muted copy.
- **Ash** (`{colors.ink-faint}` — #a39e98): captions, metadata, placeholder text.

### Decision Status

Status badges must never rely on color alone — always pair with text. The palette is emotionally tuned: Admis is warmer and more vibrant; Ajourné and Sessionnaire are measured and never alarming.

- **Admis (Pass)** — `{colors.status-pass-bg}` / `{colors.status-pass-fg}`: warm celebratory green. The badge earns a spring-entrance animation.
- **Ajourné (Fail)** — `{colors.status-fail-bg}` / `{colors.status-fail-fg}`: warm amber-orange, never alarming. No animation.
- **Sessionnaire (Resit)** — `{colors.status-pending-bg}` / `{colors.status-pending-fg}`: measured warm amber. No animation.
- **Neutral / Unknown** — `{colors.status-neutral-bg}` / `{colors.status-neutral-fg}`: quiet grey fallback.

---

## CSS Variables

### Light Mode

```css
:root {
  /* Surface */
  --background: oklch(0.975 0.003 0); /* canvas-soft warm paper */
  --card: oklch(1 0 0); /* pure white */
  --popover: oklch(1 0 0);

  /* Type */
  --foreground: oklch(0 0 0); /* ink black */
  --card-foreground: oklch(0 0 0);
  --popover-foreground: oklch(0 0 0);
  --muted-foreground: oklch(0.44 0.008 60); /* stone — ≥4.5:1 on white */

  /* Brand */
  --primary: oklch(0 0 0); /* #000000 black */
  --primary-foreground: oklch(1 0 0); /* white */

  /* Secondary (sage green #8fad88) */
  --secondary: oklch(0.7 0.07 148);
  --secondary-foreground: oklch(1 0 0);

  /* Accent (salmon #ffa07a) */
  --accent: oklch(0.76 0.13 48);
  --accent-foreground: oklch(1 0 0);

  /* Muted (neutral surface) */
  --muted: oklch(0.94 0.003 0);
  --muted-foreground: oklch(0.44 0.008 60);

  /* Semantic */
  --destructive: oklch(0.57 0.22 28);

  /* Chrome */
  --border: oklch(0.9 0.002 0); /* hairline */
  --input: oklch(0.9 0.002 0);
  --ring: oklch(0 0 0); /* primary black focus ring */

  --radius: 0.5rem;
}
```

### Dark Mode

```css
.dark {
  --background: oklch(0.1 0.003 0);
  --card: oklch(0.15 0.003 0);
  --popover: oklch(0.15 0.003 0);
  --foreground: oklch(0.95 0.002 0);
  --card-foreground: oklch(0.95 0.002 0);
  --popover-foreground: oklch(0.95 0.002 0);
  --muted-foreground: oklch(0.63 0.006 60);

  --primary: oklch(0.95 0 0); /* near-white in dark mode */
  --primary-foreground: oklch(0.1 0 0);

  --secondary: oklch(0.55 0.07 148); /* darker sage */
  --secondary-foreground: oklch(0.95 0 0);

  --accent: oklch(0.68 0.13 48); /* darker salmon */
  --accent-foreground: oklch(0.1 0 0);

  --muted: oklch(0.2 0.003 0);
  --muted-foreground: oklch(0.63 0.006 60);

  --destructive: oklch(0.68 0.2 28);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.95 0 0);
}
```

### Decision Status Tokens

```css
:root {
  /* Admis (Pass) — warm celebratory green */
  --status-pass-bg: oklch(0.94 0.07 148);
  --status-pass-fg: oklch(0.3 0.12 148);

  /* Ajourné (Fail) — warm amber, never alarming */
  --status-fail-bg: oklch(0.94 0.06 55);
  --status-fail-fg: oklch(0.42 0.15 48);

  /* Sessionnaire (Resit) — measured amber */
  --status-pending-bg: oklch(0.95 0.05 78);
  --status-pending-fg: oklch(0.4 0.1 70);

  /* Neutral / unknown */
  --status-neutral-bg: oklch(0.93 0.002 0);
  --status-neutral-fg: oklch(0.42 0.003 0);
}
```

---

## Typography

### Font Families

| Context                   | Family                 | Variable                        |
| ------------------------- | ---------------------- | ------------------------------- |
| Arabic — display headings | Thmanyah Serif Display | `--font-thmanyah-serif-display` |
| Arabic — long-form text   | Thmanyah Serif Text    | `--font-thmanyah-serif-text`    |
| Arabic — UI / body        | Thmanyah Sans          | `--font-thmanyah-sans`          |
| French — all              | Geist Sans             | `--font-geist-sans`             |
| Code / data               | Geist Mono             | `--font-geist-mono`             |

One font per script. Geist carries all French UI and body. Thmanyah Serif Display is reserved for large headings on the Arabic result page — the student's name and decision. Never use display fonts in labels, buttons, or data cells.

### Scale

| Token                    | Size | Weight | Line Height | Letter Spacing | Use                         |
| ------------------------ | ---- | ------ | ----------- | -------------- | --------------------------- |
| `{typography.display-1}` | 64px | 700    | 1.0         | −2.125px       | Result page name headline   |
| `{typography.display-2}` | 54px | 700    | 1.04        | −1.875px       | Large section headlines     |
| `{typography.heading-1}` | 40px | 700    | 1.1         | −1px           | Section headlines           |
| `{typography.heading-2}` | 26px | 700    | 1.23        | −0.625px       | Sub-section headings        |
| `{typography.heading-3}` | 22px | 700    | 1.27        | −0.25px        | Card titles                 |
| `{typography.title}`     | 20px | 600    | 1.4         | −0.125px       | Feature titles, callouts    |
| `{typography.body-md}`   | 16px | 400    | 1.5         | 0              | Default body copy           |
| `{typography.body-sm}`   | 15px | 400    | 1.33        | 0              | Dense body, table rows, nav |
| `{typography.button}`    | 16px | 500    | 1.5         | 0              | Button labels               |
| `{typography.caption}`   | 14px | 400    | 1.43        | 0              | Captions, footnotes         |
| `{typography.eyebrow}`   | 12px | 600    | 1.33        | +0.125px       | Pill badges, small labels   |

### Principles

Type voice is **tight, heavy, and quiet-confident**. Headlines lean on weight 700 and aggressive negative tracking. Body copy stays at a comfortable 1.5 line-height for document readability. Numeric data (averages, exam numbers): `font-variant-numeric: tabular-nums`. The contrast between a heavy 700 headline and a calm 400 body is the primary expressive lever — no decorative typography, only a clear hierarchy.

---

## Spacing & Layout

### Spacing System

- **Base unit**: 4px. All spacing in multiples of 4.
- **Tokens**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 28px · `{spacing.xxl}` 32px.
- Card interior padding: `{spacing.lg}` (24px) minimum; result card uses `{spacing.xxl}` (32px) — it is a moment, not a data row.
- Utility buttons: tight `4px 14px`. Form fields: `6px`.

### Grid & Container

| Context          | Max Width           | Notes                                              |
| ---------------- | ------------------- | -------------------------------------------------- |
| Search & results | `max-w-2xl` (42rem) | Centered, generous outer gutters                   |
| Admin            | `max-w-5xl`         | Compact density, tables may go full viewport width |

No nested cards. The page is the canvas; cards are the documents on it.

### Responsive Strategy

| Name    | Width       | Key Changes                                          |
| ------- | ----------- | ---------------------------------------------------- |
| Wide    | 1440px+     | Full multi-column grids, widest container            |
| Desktop | 1080–1300px | Standard centred container                           |
| Tablet  | 768–840px   | Nav begins condensing                                |
| Mobile  | ≤600px      | Single-column stacks, hamburger nav, full-width CTAs |

Touch targets: maintain 44×44px minimum hit area on mobile.

---

## Elevation & Depth

| Level        | Treatment                                                                                                                        | Use                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0 — Flat     | Hairline border `{colors.hairline}`, no shadow                                                                                   | Default cards on the warm canvas  |
| 1 — Soft     | Layered micro-shadow: `rgba(0,0,0,0.01) 0 0.175px 1.041px`, `0.02 0 0.8px 2.925px`, `0.027 0 2.025px 7.847px`, `0.04 0 4px 18px` | Raised feature cards, result card |
| 2 — Elevated | Deeper 5-stop stack ending in `rgba(0,0,0,0.05) 0 23px 52px`                                                                     | Modals, popovers                  |

Elevation is **barely-there**: shadows are built from many near-transparent layers so surfaces feel gently lifted off the paper, never dramatically dropped. Most cards rely on a hairline alone.

---

## Shapes

### Border Radius Scale

| Token            | Value  | Use                                                  |
| ---------------- | ------ | ---------------------------------------------------- |
| `{rounded.xs}`   | 4px    | Form fields, small tags, inline chips                |
| `{rounded.sm}`   | 5px    | Menu items, list rows, status pills                  |
| `{rounded.md}`   | 8px    | Utility / nav buttons, smaller cards                 |
| `{rounded.lg}`   | 12px   | Feature cards, result card containers                |
| `{rounded.xl}`   | 16px   | Result card, large image wells                       |
| `{rounded.full}` | 9999px | Primary CTAs, decision badges, circular icon buttons |

---

## Components

> **No hover states documented.** Every spec below documents Default and Active/Pressed states only.

### Navigation

**`nav-bar`** — Top navigation

- White surface `{colors.canvas}`, `{colors.ink}` link text at `{typography.body-sm}`, padding `{spacing.md}`. Slim sticky bar; condenses to a hamburger below the tablet breakpoint.

### Buttons

**`button-primary`** — Primary CTA ("Rechercher")

- Background `{colors.primary}` (black), text `{colors.on-primary}`, type `{typography.button}`, fully pill-shaped `{rounded.full}`. The single black action on any page.
- Pressed state: `button-primary-pressed` (background `{colors.primary-active}` #1a1a1a).

**`button-secondary`** — Secondary CTA

- White surface `{colors.surface}`, text `{colors.ink}`, type `{typography.button}`, pill `{rounded.full}`, Level-1 shadow.

**`button-utility`** — Nav / utility button

- White surface, text `{colors.ink}`, tighter `{rounded.md}` (8px), padding `4px 14px`, 1px `{colors.hairline}` border.

### Cards & Containers

**`feature-card`** — Content card

- White surface `{colors.surface}`, `{colors.ink}` text, `{typography.body-md}`, rounded `{rounded.lg}` (12px), padding `{spacing.lg}` (24px). Flat elevation (hairline only).

**`feature-card-elevated`** — Raised card

- Same chrome as `feature-card` with Level-1 layered shadow.

### Inputs & Forms

**`text-input`** — Text / number field

- White surface `{colors.surface}`, `{colors.ink}` text, `{typography.body-sm}`, 1px `{colors.hairline}` border, rounded `{rounded.xs}` (4px), padding `6px`. Focus adds Level-1 shadow and `ring-2` in `{colors.primary}`.
- Height `h-12` for the search input — generous for Arabic IME and large fingers.

### Decision Badges

**`status-badge-pass`** — Admis

- `{colors.status-pass-bg}` fill, `{colors.status-pass-fg}` text, `{typography.eyebrow}`, `{rounded.full}`, padding `4px 12px`.
- Earns a spring entrance animation on first render. Pair with a checkmark icon. Never color alone.

**`status-badge-fail`** — Ajourné

- `{colors.status-fail-bg}` fill, `{colors.status-fail-fg}` text, `{rounded.full}`.
- No animation. Warm, calm, never alarming. Pair with a dash icon.

**`status-badge-pending`** — Sessionnaire

- `{colors.status-pending-bg}` fill, `{colors.status-pending-fg}` text, `{rounded.full}`.
- No animation. Measured. Pair with a clock icon.

### Result Card (the showpiece)

This is the most beautiful surface in the product. It must look exceptional — not just correct.

**`result-card`** — Decision surface

- Pure white card (`{colors.surface}`) on the warm paper canvas `{colors.canvas-soft}` — creates a clean lift.
- Level-1 soft shadow. Rounded `{rounded.xl}`. Padding `{spacing.xxl}` (32px) minimum.
- Student name: `{typography.display-1}` in display font (Arabic: Thmanyah Serif Display; French: Geist). `font-variant-numeric: tabular-nums` on all numeric data.
- Decision badge: large and prominent, below the name. Centered. Not inline.
- Admis state: badge springs in. Moyenne Générale counts up from 0 to value over 600ms. A brief `{colors.accent}` particle burst (12–18 CSS `border-radius: 50%` divs, no library).
- Ajourné / Sessionnaire: calm `opacity 0 → 1` appearance (150ms). No scale, no particles, no alarm.
- Attempt history table: borderless, `{typography.body-sm}`, alternating `rgba(var(--muted), 0.5)` rows.

**Never festive about a fail.** No animation, no motion, no color that reads as celebration on Ajourné or Sessionnaire.

### Footer

**`footer`** — Site footer

- Warm `{colors.canvas-soft}` band, `{colors.ink-secondary}` link text at `{typography.caption}`, padding `{spacing.xxl}`.

### Admin (stays plain)

Admin surfaces are functional, not beautiful. No brand moments, no display fonts. Compact density. Tables at full viewport width. Standard form controls. Sidebar uses `{colors.secondary}` (#8fad88) as the active nav indicator.

---

## Motion

| Duration | Value | Use                           |
| -------- | ----- | ----------------------------- |
| Short    | 150ms | State toggles, hover, focus   |
| Medium   | 250ms | Panel reveals, badge entrance |
| Long     | 350ms | Page-level transitions        |

- Easing in: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint) for reveals.
- Easing out: `cubic-bezier(0.4, 0, 1, 1)` (ease-in-quart) for exits.
- `prefers-reduced-motion`: crossfade (opacity 150ms) or instant. No layout motion.
- No orchestrated page-load sequences. The result page loads into a finished state.

### Admis Celebration

1. **Badge entrance**: scales from `scale(0.85)` to `scale(1)` with `opacity 0 → 1`, 400ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` (gentle spring).
2. **Confetti burst**: 12–18 small `{colors.accent}` (#ffa07a) and `{colors.secondary}` (#8fad88) particles scatter upward from the badge, fade out in 800ms. CSS only, no library.
3. **Grade reveal**: Moyenne Générale counts up from 0 to its value over 600ms, linear, displayed as a single decimal (e.g. 14.5).

`prefers-reduced-motion` override: all three reduce to a single `opacity 0 → 1` fade over 200ms.

---

## Do's and Don'ts

### Do

- Reserve `{colors.primary}` (black) for the primary action, focus ring, and active/focus signal — nothing decorative.
- Keep pages on the warm `{colors.canvas-soft}` canvas; use pure white `{colors.surface}` for cards to create gentle figure/ground.
- Use `{colors.secondary}` (#8fad88) for structural accents — sidebar active states, secondary badges, supporting chrome.
- Use `{colors.accent}` (#ffa07a) only for decorative warmth and the Admis celebration moment.
- Set headlines in heavy `{typography.display-1}` / `{typography.heading-1}` with their negative tracking applied explicitly.
- Use pill `{rounded.full}` for primary CTAs and decision badges; tighter `{rounded.md}` for nav/utility buttons.
- Define surfaces with `{colors.hairline}` and the barely-there Level-1 shadow rather than heavy drop-shadows.
- Pair every status badge with its text label — color never carries meaning alone.

### Don't

- Don't paint a CTA or structural fill in `{colors.accent}` — that is decoration and celebration only.
- **Don't** use tinted badges (`bg-primary/10 text-primary`). Use muted-text labels or bordered labels instead.
- **Don't** use same-hue background + text combinations on any badge or pill.
- Don't introduce a second structural primary alongside `{colors.primary}`.
- **Don't** use `box-shadow` anywhere.
- **Don't** use linear gradients on any surface.
- Don't put pill `{rounded.full}` radii on form fields — inputs stay tight at `{rounded.xs}` (4px).
- Don't drop heavy shadows; elevation is many near-transparent layers, never a hard cast.
- Don't set body copy in a heavy weight — keep 400 for readability; weight 700 belongs to headlines.
- Don't place type on pure clinical white for full pages; the warm `{colors.canvas-soft}` is the brand's calm.
- Don't animate Ajourné or Sessionnaire — never festive about a fail.
- Never log or send student names, exam numbers, or NNI to any analytics or error service.
