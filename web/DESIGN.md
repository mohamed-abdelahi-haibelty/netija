# Design

## Theme

Netija is a modern independent product, not a government portal. The visual system is editorial and precise — built around a deep forest green that is calm enough for a fail and rich enough for a pass. Every surface is considered. The result page is the most beautiful thing on the site: it should feel like something worth framing.

Color strategy: **Restrained**. Pure white surface. One primary color (deep forest green) for primary actions, current state, and structural elements. A separate, emotionally-tuned semantic palette for decision moments — the Admis state earns a warmer, celebratory green; the Ajourné and Sessionnaire states stay measured and warm.

---

## Colors

### Light Mode

```css
:root {
  /* Surface */
  --background:          oklch(1 0 0);
  --card:                oklch(0.975 0.005 155);
  --popover:             oklch(0.975 0.005 155);

  /* Type */
  --foreground:          oklch(0.13 0.005 155);
  --card-foreground:     oklch(0.13 0.005 155);
  --popover-foreground:  oklch(0.13 0.005 155);
  --muted-foreground:    oklch(0.44 0.006 155);   /* ≥4.5:1 on white */

  /* Brand */
  --primary:             oklch(0.42 0.13 155);    /* deep forest green */
  --primary-foreground:  oklch(0.975 0 0);

  /* Neutrals */
  --secondary:           oklch(0.94 0.007 155);
  --secondary-foreground: oklch(0.13 0.005 155);
  --muted:               oklch(0.94 0.007 155);
  --accent:              oklch(0.94 0.007 155);
  --accent-foreground:   oklch(0.42 0.13 155);

  /* Semantic */
  --destructive:         oklch(0.57 0.22 28);

  /* Chrome */
  --border:              oklch(0.90 0.004 155);
  --input:               oklch(0.90 0.004 155);
  --ring:                oklch(0.42 0.13 155);

  --radius: 0.5rem;
}
```

### Dark Mode

```css
.dark {
  --background:          oklch(0.10 0.005 155);
  --card:                oklch(0.15 0.006 155);
  --popover:             oklch(0.15 0.006 155);
  --foreground:          oklch(0.95 0.003 155);
  --card-foreground:     oklch(0.95 0.003 155);
  --popover-foreground:  oklch(0.95 0.003 155);
  --muted-foreground:    oklch(0.63 0.006 155);

  --primary:             oklch(0.60 0.15 155);
  --primary-foreground:  oklch(0.10 0.005 155);

  --secondary:           oklch(0.20 0.007 155);
  --secondary-foreground: oklch(0.95 0.003 155);
  --muted:               oklch(0.20 0.007 155);
  --accent:              oklch(0.20 0.007 155);
  --accent-foreground:   oklch(0.95 0.003 155);

  --destructive:         oklch(0.68 0.20 28);
  --border:              oklch(1 0 0 / 10%);
  --input:               oklch(1 0 0 / 14%);
  --ring:                oklch(0.60 0.15 155);
}
```

### Decision Status Tokens

Status badges must never rely on color alone — always pair with text. The palette is emotionally tuned: Admis is warmer and more vibrant; Ajourné and Sessionnaire are measured and never alarming.

```css
:root {
  /* Admis (Pass) — warmer green, celebratory */
  --status-pass-bg:     oklch(0.91 0.09 150);
  --status-pass-fg:     oklch(0.28 0.12 150);

  /* Ajourné (Fail) — warm, never alarming */
  --status-fail-bg:     oklch(0.93 0.07 28);
  --status-fail-fg:     oklch(0.42 0.18 28);

  /* Sessionnaire (Resit) — amber, measured */
  --status-pending-bg:  oklch(0.93 0.07 78);
  --status-pending-fg:  oklch(0.38 0.10 65);

  /* Neutral / unknown */
  --status-neutral-bg:  oklch(0.92 0.004 155);
  --status-neutral-fg:  oklch(0.40 0.008 155);
}
```

---

## Typography

### Families

| Context | Family | Variable |
|---|---|---|
| Arabic — display headings | Thmanyah Serif Display | `--font-thmanyah-serif-display` |
| Arabic — long-form text | Thmanyah Serif Text | `--font-thmanyah-serif-text` |
| Arabic — UI / body | Thmanyah Sans | `--font-thmanyah-sans` |
| French — all | Geist Sans | `--font-geist-sans` |
| Code / data | Geist Mono | `--font-geist-mono` |

One font per script. Geist carries all French UI and body. Thmanyah Serif Display is reserved for large headings on the Arabic results page — the student's name and decision. Never use display fonts in labels, buttons, or data cells.

### Scale

Product UI: fixed rem, ratio 1.125. No `clamp()` on headings.

| Token | Size | Line height | Weight |
|---|---|---|---|
| `text-xs` | 0.75rem | 1rem | 400 |
| `text-sm` | 0.875rem | 1.25rem | 400 |
| `text-base` | 1rem | 1.5rem | 400 |
| `text-lg` | 1.125rem | 1.75rem | 400 |
| `text-xl` | 1.25rem | 1.75rem | 600 |
| `text-2xl` | 1.5rem | 2rem | 600 |
| `text-3xl` | 1.875rem | 2.25rem | 700 |
| `text-4xl` | 2.25rem | 2.5rem | 700 |

Display use (results page only): up to `text-4xl`. Restrict `text-balance` to `h1–h3`. Numeric data (averages, exam numbers): `font-variant-numeric: tabular-nums`.

---

## Spacing & Layout

- Base unit: 4px. Multiples of 4 for all spacing.
- Page max-width: `max-w-2xl` (42rem) for search and results pages; `max-w-5xl` for admin.
- Vertical rhythm on results page: generous — `gap-8` between sections, `py-12` on the page.
- Admin panels: compact. Tables may go full viewport width; use `px-4 sm:px-6` gutters.
- No nested cards.

---

## Motion

### General rules

- Duration short: 150ms (state toggles, hover, focus)
- Duration medium: 250ms (panel reveals, badge entrance)
- Duration long: 350ms (page-level transitions)
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint) for reveals; `cubic-bezier(0.4, 0, 1, 1)` (ease-in-quart) for exits
- `prefers-reduced-motion`: crossfade (opacity 150ms) or instant. No layout motion.
- No orchestrated page-load sequences. The results page loads into a finished state.

### Admis celebration

When the decision is Admis, a single tasteful moment of joy plays on first render:

1. **Badge entrance**: the decision badge scales from `scale(0.85)` to `scale(1)` with `opacity 0 → 1`, duration 400ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` (gentle spring — enough to feel alive, never bouncy).
2. **Confetti burst** (optional, implementation-permitting): 12–18 small particles in `--status-pass-bg` and `--primary` scatter upward from the badge center, fade out in 800ms. Particles are CSS `border-radius: 50%` divs, not canvas or library-heavy. Total page weight added: zero JS libraries.
3. **Grade reveal**: the Moyenne Générale counts up from 0 to its value over 600ms using a linear timer, displayed as a single decimal (e.g. 14.5). Stops exactly on the real value.

**`prefers-reduced-motion` override**: all three effects reduce to a single `opacity 0 → 1` fade over 200ms. No scale, no count-up, no particles.

**Fail / resit**: no entrance animation beyond a standard `opacity 0 → 1` fade (150ms). The badge appears — it does not announce itself.

**Never festive about a fail.** No animation, no motion, no color that reads as celebration on Ajourné or Sessionnaire.

---

## Component Vocabulary

### Buttons

- Primary: `bg-primary text-primary-foreground`, hover `brightness-[1.08]`
- Secondary: `bg-secondary text-secondary-foreground border border-border`
- Destructive: `bg-destructive text-white`
- Ghost: transparent bg, `text-foreground`, hover `bg-secondary`
- All: `rounded-md`, `h-10 px-4` default, `h-9 px-3` small. No wide letter-spacing on button labels.

### Decision Badge

- Shape: `rounded-full px-3 py-0.5 text-sm font-semibold`
- Color: from status tokens above (bg + fg pair)
- Must include the text label — color never carries meaning alone
- Icon: checkmark for Admis, clock for Sessionnaire, dash for Ajourné
- Admis badge gets the entrance animation from the Motion section; others do not

### Search Input

- Height: `h-12` — generous for Arabic IME input and large fingers
- Focus ring: `ring-2 ring-primary ring-offset-2`
- No decorative inner shadow
- Placeholder text: `text-muted-foreground`, verified ≥4.5:1 contrast

### Results Card (the showpiece)

This is the most beautiful surface in the product. It must look exceptional — not just correct.

- Pure white card (`bg-card`) on the slightly-tinted bg — creates a clean lift
- Student name: `text-3xl font-bold` in display font (Arabic: Thmanyah Serif Display; French: Geist)
- Decision badge: large and prominent, below the name. Not inline with it. Centered.
- Admis state: badge animates in. Grade counts up. A brief, tasteful particle burst.
- Ajourné / Sessionnaire: calm appearance. Warm, respectful. No animation, no alarm.
- Moyenne Générale: `font-variant-numeric: tabular-nums`, `text-2xl font-semibold`
- Attempt history table: borderless, `text-sm`, alternating `bg-secondary/50` rows
- Generous padding: `p-8` minimum on the card. This is not a data row — it is a moment.

### Loading / Empty States

- Content loading: skeleton shimmer — never a spinner in the middle of content
- No result found: a short, warm message in `text-muted-foreground`. No illustration. No alarm.
- Effortless means: a non-technical user understands what happened and what to try next

### Admin (stays plain)

- Admin surfaces are functional, not beautiful. No brand moments, no display fonts.
- Sidebar background: `--sidebar` = `oklch(0.94 0.007 155)` (secondary surface)
- Active nav item: `bg-primary text-primary-foreground`
- Compact density. Tables at full viewport width. Standard form controls.
