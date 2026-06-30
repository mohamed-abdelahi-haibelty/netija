---
target: student page
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-06-29T15-17-16Z
slug: web-app-lang-students
---
### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Count-up and badge animation signal state well; no skeleton on page load |
| 2 | Match System / Real World | 3 | Labels are clear; "Sessionnaire" is domain-correct but opaque to edge cases |
| 3 | User Control and Freedom | 3 | Back link present; no share/copy affordance for the primary share-this-result action |
| 4 | Consistency and Standards | 2 | Decision badge rendered identically in weight to "school" and "wilaya" rows — hierarchy collapsed |
| 5 | Error Prevention | 3 | Server-side notFound() guard; no user input on this surface |
| 6 | Recognition Rather Than Recall | 3 | Property rows labeled; icons on badges; history table columned |
| 7 | Flexibility and Efficiency | 2 | No share button, no print layout, no keyboard shortcuts; single rigid path |
| 8 | Aesthetic and Minimalist Design | 2 | Page is clean but emotionally flat for its stated purpose; two eyebrow section headers violate absolute bans |
| 9 | Error Recovery | 3 | 404 handled; API errors throw to error.tsx; no user-side errors on this surface |
| 10 | Help and Documentation | 2 | No tooltip for "Sessionnaire"; no grading scale context; no share guidance |
| **Total** | | **26/40** | **Acceptable — significant improvement needed** |

### Anti-Patterns Verdict

**LLM assessment:** The page doesn't read as "AI made this" from a slop-patterns perspective — no gradient text, no glassmorphism, no ghost-card border+shadow double-use, no hero-metric template, no sketch illustrations. The code is clean. But it fails a different test: it reads as "developer made this." The design spec says this surface is the showpiece. A developer made a property list. Both can be correct; this one is not the spec.

Two eyebrow-pattern violations: `text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider` on both "HISTORY" and "SEE ALSO" section headers.

**Deterministic scan:** 1 finding — `bounce-easing` in `StudentResultCard.tsx:94` (`netija-badge-spring` uses cubic-bezier(0.34, 1.56, 0.64, 1)). This is intentional per DESIGN.md for the Admis badge entrance; candidate for `ignore.md`.

### Overall Impression

The code is correct. The design is not. The PRODUCT.md says "the student results page is the most beautiful surface in the system — screenshot-worthy." What's built is a well-structured property list followed by a data table. It's appropriate for an admin panel; it is not what a student screenshots after passing the Baccalauréat.

The single biggest opportunity: **the decision is visually buried.** At `text-xs` inside a PropertyRow identical in visual weight to "Lycée" and "Wilaya," the result looks like a data field. It should look like a verdict.

### What's Working

**1. Bilingual name hierarchy.** Primary name at h1 scale with alternate-language subtitle. RTL/LTR handled correctly per-element with explicit `lang` and `dir`. Rare and correct.

**2. PropertyRow hover UX.** The `-mx-3 px-3` pull-to-edge hover with `hover:bg-muted/40` is clean. The grid layout `grid-cols-[7rem_1fr]` gives consistent left-align without table rigidity.

**3. Count-up hook.** `useCountUp` with `prefers-reduced-motion` check and RAF-based frame-by-frame is production-quality. The reduced-motion path snaps instantly — exactly right.

### Priority Issues

**[P0] The decision is not the visual centerpiece**
- **What:** Decision badge at `text-xs` inside a PropertyRow, same visual weight as school and wilaya rows.
- **Why it matters:** This is what the user came for. DESIGN.md specifies: "Decision badge: large and prominent, below the name. Centered. Not inline."
- **Fix:** Pull badge out of PropertyRow. Place it standalone between `<header>` and properties — large pill, centered, `text-base` or larger inside the badge. Hierarchy becomes: Name → Decision → Details.
- **Suggested command:** `$impeccable layout student page`

**[P1] Result-card spec not implemented**
- **What:** DESIGN.md specifies a white card on warm canvas with Level-1 shadow and `rounded.xl`. Current implementation is a plain `<div className="flex flex-col">` — no card, no shadow, no border-radius.
- **Why it matters:** Without the card/canvas contrast, the page has no figure/ground separation. It looks like a form, not a document worth framing.
- **Fix:** Wrap content below breadcrumb in `<div className="bg-card rounded-xl p-8 shadow-level-1">`. The `shadow-level-1` utility is already in globals.css.
- **Suggested command:** `$impeccable polish student page`

**[P1] Confetti burst absent — Admis celebration is half-built**
- **What:** `@keyframes netija-confetti` defined in globals.css with `prefers-reduced-motion` suppression in place. No confetti particles rendered in `StudentResultCard.tsx`.
- **Why it matters:** The particle burst is the brand's one celebratory moment. Without it, "Admis" differs from "Ajourné" only in color and count-up — accessibility violation plus emotional flatness.
- **Fix:** Render 12–16 confetti `<div className="netija-confetti">` elements when `isPass && !prefersReducedMotion`, with random `--confetti-dx` / `--confetti-dy` inline styles, absolutely positioned relative to the badge.
- **Suggested command:** `$impeccable animate student page`

**[P2] Two eyebrow section headers — absolute-ban pattern**
- **What:** Both "HISTORY" and "SEE ALSO" use `text-sm font-semibold text-muted-foreground uppercase tracking-wider`. Applied twice on one page.
- **Fix:** Remove `uppercase` and `tracking-wider`. Use `text-sm font-medium text-muted-foreground` for "History." For "See Also," use the body copy sentence as the label.
- **Suggested command:** `$impeccable typeset student page`

**[P2] Hover direction on see-also links is inverted**
- **What:** `text-foreground hover:text-muted-foreground` — hover makes links dimmer.
- **Fix:** Swap to `text-muted-foreground hover:text-foreground`.
- **Suggested command:** `$impeccable polish student page`

### Persona Red Flags

**Jordan (First-Timer):** Decision badge at text-xs looks like a tag, not a verdict. "Sessionnaire" unexplained. History table column count requires confident table-reading.

**Casey (Distracted Mobile User):** Horizontal-scroll table is two-handed with no scroll affordance (no fade hint). No share button — the primary mobile use case (send to family WhatsApp) requires manual URL copy.

**Riley (Deliberate Stress Tester):** Zero-attempts edge case: page renders just a name with no empty-state message. 20+ seeAlso entries render uninterrupted. Long Arabic names (4–5 words, full diacritics) at 2.25rem on 320px viewport not verified.

### Minor Observations

1. Table header uses `text-xs font-medium` (no uppercase) while section header above uses uppercase — inconsistent boundary.
2. `examNo` is in the table but not surfaced in properties — first-timers may not know to look there.
3. Back link `mb-10` wastes mobile viewport. `mb-6` would tighten it.
4. `--ease-spring` flagged by detector — intentional per DESIGN.md. Candidate for `ignore.md`.
5. Ajourné moyenne rendered as a static PropertyRow value — still correct emotionally, but visually indistinguishable from the school name row.

### Questions to Consider

- "What does 'screenshot-worthy' look like when the decision badge is the size of a postage stamp instead of a small chip in a list?"
- "The confetti keyframe exists but fires nothing. Was this intentionally deferred, or missed?"
- "Would a collapsed history view (latest only, expand to see more) serve mobile users better than horizontal table scroll?"
