---
target: @web/app/[lang]/page.tsx
total_score: 31
p0_count: 1
p1_count: 2
timestamp: 2026-06-29T14-23-36Z
slug: web-app-lang-page-tsx
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No loading spinner on CTA — text changes to "Cancel" but no visual activity on slow connections |
| 2 | Match System / Real World | 4 | Domain-appropriate terms; "رقم الامتحان" and convocation reference are natural |
| 3 | User Control and Freedom | 3 | Cancel during search works, but no clear-input button on exam number field |
| 4 | Consistency and Standards | 4 | Consistent shadcn/base-ui vocabulary across all form controls |
| 5 | Error Prevention | 3 | `inputMode=numeric` helps, but no maxlength or format constraint on exam number |
| 6 | Recognition Rather Than Recall | 3 | Name autocomplete aids recognition; exam tab relies entirely on recall |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, paste/scan cues, or "try another year" quick links |
| 8 | Aesthetic and Minimalist Design | 3 | Container `max-w-110` (440px) is disproportionately narrow vs DESIGN.md spec of 42rem |
| 9 | Error Recovery | 4 | Excellent error messages with suggested recovery for all failure modes |
| 10 | Help and Documentation | 2 | No contextual help, FAQ link, format examples, or support contact anywhere |
| **Total** | | **31/40** | **Good** |

---

#### Anti-Patterns Verdict

**Start here. Does this look AI-generated?**

**LLM assessment**: Clean pass. Every absolute ban from the Impeccable skill is respected — no side-stripe borders, gradient text, glassmorphism, hero-metric template, identical card grids, uppercase tracked eyebrows, numbered section markers, border+shadow pairs, over-rounded corners, hand-drawn SVGs, stripe backgrounds, or meta-criticism copy. The product-register slop test (would a Linear/Figma/Notion user trust this?) also passes: form controls are consistent shadcn/base-ui, motion is purposeful, display fonts are correctly reserved for the result page. No invented affordances. No gratuitous motion. The tool disappears into the task.

**Deterministic scan**: Clean on target files (`page.tsx`, `SearchTabs.tsx`, `NameAutocomplete.tsx`). Two `bounce-easing` findings on broader files (`globals.css:114`, `StudentResultCard.tsx:94`) are both false positives — the `--ease-spring` token and `netija-badge-spring` animation are intentional, scoped brand animations for the Admis celebration moment.

**Visual overlays**: Unavailable — `/detect.js` not served at the dev-server URL and no browser mutation tool was available for injection. No user-visible overlay was placed.

---

#### Overall Impression

The search page is a confident, well-constructed product surface. It respects its brand (calm, beautiful, effortless), follows its design system strictly, and handles edge cases comprehensively. Error states are production-grade. The name autocomplete is genuinely well-built with full ARIA. Color restraint is exactly right (only black + stone on search; salmon and sage reserved for the result page). The single biggest opportunity: widen the container to match the design spec and add a visible loading indicator.

---

#### What's Working

**1. Impeccable error experience.** Every failure mode has a clear, calm, actionable message — field validation, network failure, server error, and not-found with recovery suggestion (`errorRequired`, `errorDigitsOnly`, `errorNetwork`, `errorGeneric`, not-found). Errors auto-clear on input change. This is production-grade polish.

**2. Name autocomplete is a standout component.** Full ARIA combobox pattern (`aria-activedescendant`, `role="listbox"`, `aria-expanded`), debounced API calls (300ms), skeleton loading rows, keyboard navigation (arrows + enter + escape), pointer-down management to prevent focus loss on selection. Correctly handles RTL and bilingual display. Hard to distinguish from hand-crafted production code.

**3. Color strategy restraint.** The search page correctly uses only black (primary) and stone (muted) — no sage green, no salmon. This preserves those colors for the result page (the "showpiece") and keeps the search experience calm and undistracted. Exactly the right emotional and brand decision.

---

#### Priority Issues

##### [P0] Container width violates design spec and looks lost on desktop

**What**: `max-w-110` = 27.5rem = 440px. The DESIGN.md specifies `max-w-2xl` (42rem = 672px) for search pages. On a 1440px display, the form occupies ~30% of the viewport, leaving ~500px of empty canvas on each side. The French help text ("Trouvable sur votre convocation" at ~33 chars) wraps awkwardly.

**Why it matters**: Makes the page feel sparse rather than intentionally minimal. The design system deliberately chose 42rem for this surface; deviating undermines the "effortless" promise by making users search across a wide empty canvas. On desktop, the visual proportion fails.

**Fix**: Change `max-w-110` to `max-w-xl` (36rem / 576px) or `max-w-2xl` (42rem / 672px) in `page.tsx:34`.

**Suggested command**: `$impeccable layout @web/app/[lang]/page.tsx`

##### [P1] No loading spinner on CTA button

**What**: When searching, the button text changes from "بحث" → "إلغاء" but there's no visual activity indicator. On slow connections (common in Mauritania — mobile data), a static button with changed text provides no feedback that work is happening.

**Why it matters**: Violates Heuristic #1 (Visibility of System Status). Anxious users waiting for a high-stakes result need confirmation the system is working. Text-only state change is insufficient.

**Fix**: Add a `Loader2` icon with `animate-spin` inside the button when `loading` is true.

**Suggested command**: `$impeccable polish @web/components/SearchTabs.tsx`

##### [P1] Missing accessible label on tab group

**What**: Translation key `home.tabsLabel` ("طريقة البحث" / "Mode de recherche") exists but is never rendered. The `<TabsList>` has no `aria-label`, so screen readers announce tabs without context.

**Why it matters**: Screen reader users hear "رقم الامتحان" and "البحث بالاسم" as standalone tab names without understanding they're search method options. WCAG 4.1.2 violation.

**Fix**: Add `aria-label={t('home.tabsLabel')}` to `<TabsList>` in `SearchTabs.tsx`.

**Suggested command**: `$impeccable audit @web/components/SearchTabs.tsx`

##### [P2] No exam number format guidance for anxious users

**What**: The only help text is "موجود في استدعائك" (found on your convocation). No example format, digit count hint, or guidance on where to find the number.

**Why it matters**: Primary anxiety point. A user who doesn't have the convocation has no path forward except the name tab (which requires accurate spelling in a potentially unfamiliar search).

**Fix**: Add a lighter hint below the help text showing an example format or number of digits.

**Suggested command**: `$impeccable clarify @web/components/SearchTabs.tsx`

##### [P2] Inactive tab label contrast may fail WCAG AA

**What**: Inactive tabs use `text-foreground/60` (60% opacity of near-black). Effective contrast against `bg-background` (warm paper L=0.975) is approximately 4.2:1 — below the 4.5:1 threshold for 14px text.

**Why it matters**: WCAG AA failure. Users with low vision may struggle to read inactive tab labels. The active/inactive distinction is reinforced by the underline indicator, but text itself must meet contrast requirements.

**Fix**: Increase opacity to `text-foreground/75` or use a specific muted color with known contrast ≥4.5:1 in the tabs trigger class.

**Suggested command**: `$impeccable audit @web/components/ui/tabs.tsx`

##### [P3] Language switcher tap target too small for mobile

**What**: The LanguageSwitcher renders a `text-sm` (14px) link with no padding in the header. Hit area is well below the 44×44px minimum recommended touch target.

**Why it matters**: On mobile, users — especially non-technical users with larger fingers — may struggle to tap the language toggle accurately. This is a mobile-first accessibility concern.

**Fix**: Add explicit padding (`p-2` or `px-3 py-2`) to create a minimum 44×44px tap target.

**Suggested command**: `$impeccable adapt @web/components/LanguageSwitcher.tsx`

---

#### Persona Red Flags

**Salem (Anxious Parent, non-technical, Arabic, mobile)**:
- No exam number format example — if Salem doesn't have the convocation, they're stuck
- No support link, FAQ, or contact if search fails repeatedly
- Name search rescue path requires typing Arabic names with diacritics on mobile — error-prone

**Aisha (Repeat Visitor, checking results multiple times)**:
- No "search another" shortcut after seeing a result (result page issue, but affects flow)
- No way to cache/reuse the previous exam number for rapid re-checking
- No keyboard shortcut to jump to search and retry

**Jordan (Confused First-Timer)**:
- Would understand purpose from "نتيجة" heading and subtitle immediately — clear copy
- Might not know which tab to choose or what their exam number is
- No tutorial, walkthrough, or inline explanation on first visit

**Casey (Distracted Mobile User)**:
- Large tap targets (h-12 = 48px) are excellent
- Keyboard correctly shows numeric in Arabic — good
- If interrupted mid-search, React state preserves the form — good
- Language switcher tap target too small

---

#### Minor Observations

1. **`tabular-nums` missing on exam number input** — numeric data should use proportional-num/tabular-nums
2. **Year select `h-12!` uses `!important`** — overrides base shadcn sizing; fragile if base component changes
3. **`meta description` is static Arabic** — the layout serves Arabic `<meta>` for all locales, including `/fr`
4. **`<section>` inside `<main>` is semantically redundant** — harmless but unnecessary
5. **Language switcher touch target** — `text-sm` with no padding is below 44×44px minimum
6. **Active tab underline offset** — `after:bottom-[-5px]` floats below the container border; visible but slightly disconnected
7. **No `spellCheck={false}` on exam number input** — in French, spellcheck might underline digits

---

#### Questions to Consider

1. **Is the "نتيجة" heading doing enough work?** It's the brand name and page purpose. On the result page, the student's name replaces it. Should the home heading hint at action ("ابحث عن نتيجتك" / "Search your result") rather than just state the concept?

2. **Should the page remember the last-searched exam number in `sessionStorage`?** For repeat visitors checking results frequently, returning with the previous number pre-filled would save 2-3 seconds per check.

3. **Is the 48px gap between heading and form serving the page or isolating it?** On mobile, this pushes the form below the fold. Is the tradeoff worth it for "calm"?
