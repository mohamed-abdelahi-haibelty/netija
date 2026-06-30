---
target: web/app/[lang]/page.tsx (home page)
total_score: 29
p0_count: 0
p1_count: 2
p2_count: 2
p3_count: 1
timestamp: 2026-06-29T10-48-48Z
slug: web-app-lang-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Button shows loading state, inline errors appear, but no cancel option during pending requests |
| 2 | Match System / Real World | 4 | Domain-appropriate labels, natural form flow in both languages |
| 3 | User Control and Freedom | 2 | No cancel/escape during search. User must wait for request to complete or fail. |
| 4 | Consistency and Standards | 4 | Uses standard form patterns, Base UI primitives, consistent design tokens |
| 5 | Error Prevention | 3 | Client-side validation (empty, digits-only). No confirmation needed for search. |
| 6 | Recognition Rather Than Recall | 4 | All labels visible, year dropdown avoids recall, placeholder text guides input |
| 7 | Flexibility and Efficiency of Use | 1 | No keyboard shortcuts, no batch search, no autocomplete, no cancel |
| 8 | Aesthetic and Minimalist Design | 4 | Perfect restraint. Single focus, centered form, nothing unnecessary. |
| 9 | Error Recovery | 3 | Clear inline errors. "Not found" message lacks next-step guidance. |
| 10 | Help and Documentation | 1 | No contextual help, no tooltips, no guidance for first-timers on where to find exam number |
| **Total** | | **29/40** | **Good** — foundations are solid, 3 areas need attention |

### Cognitive Load

All 8 checklist items pass. The page has unambiguously low cognitive load: single focus, two fields, one button. Excellent.

---

## Anti-Patterns Verdict

**This does not look AI-generated.** The page is minimal, purposeful, and avoids every absolute ban in the Impeccable skill: no gradient text, no glassmorphism, no side-stripe borders, no card grids, no numbered section markers, no tiny uppercase eyebrows, no excessive border-radius, no hand-drawn illustrations, no stripe backgrounds. The design disappears into the task — which is the highest compliment for product UI.

**Deterministic scan**: CLI detector found zero issues across all scanned files (page.tsx, layout.tsx, SearchTabs.tsx). Clean.

**Register fit**: Strong alignment with the Product register. One-family typography (Thmanyah for Arabic, Geist for French), fixed rem scale (no `clamp()`), restrained color use, motion that conveys state not decoration. The page ships with no decorative motion at all on the search form — correct for a task-focused tool.

---

## What's Working

1. **Exceptional focus discipline.** The home page does exactly one thing (search by exam number) and eliminates everything else. No hero section, no feature cards, no testimonials, no stats — just the search form. This is the right call for an anxious user who wants their result NOW. The `min-h-[calc(100vh-57px)]` fills the viewport, centering the form vertically, which feels intentional and confident.

2. **Strong accessibility baseline.** `aria-invalid`, `aria-describedby`, `role="alert"` on errors, `inputMode="numeric"` for mobile keyboards, proper `<label>` associations, `h-12` generous touch targets (44pt+), `text-base` to prevent iOS zoom. The bilingual direction handling (`dir="rtl"` / `dir="ltr"`) works at the `<html>` level and flows through to all components. This was clearly built with real users in mind.

3. **Clean server/client split.** Page.tsx is thin (server-rendered, fetches years in parallel with translations). SearchTabs is the only client boundary. Minimal client-side JS, no waterfall. The `revalidate: 3600` cache on years is sensible. This performs well out of the gate.

---

## Priority Issues

### [P1] No cancel/escape during pending search

**What**: When the search request is in-flight, the submit button changes to "Searching..." and is disabled. There is no cancel mechanism. On a slow connection, a user who mistypes their exam number must wait for the request to finish (or fail) before retrying.

**Why it matters**: Mauritanian users on publication day will hammer the form. A slow API under load + no cancel = trapped user. This is a control-and-freedom violation (Heuristic 3, score 2) and a real pain point for the Alex persona.

**Fix**: 
- Use `AbortController` to cancel the in-flight fetch
- Replace the button text with "Searching... · Cancel" or show a cancel link below the button when `loading` is true
- Reset state on cancel

**Suggested command**: `$impeccable harden @web/components/SearchTabs.tsx`

### [P1] Name search tab is a dead end

**What**: The "name" tab renders a disabled input with placeholder text and a "coming soon" message. The `TabsTrigger` for the name tab is clickable (it switches the tab), but the content within is non-functional. A user who clicks it sees a dead end.

**Why it matters**: The Jordan persona clicks this tab and finds nothing to do. No guidance on when to come back, no alternative suggestion. The tab should either be removed entirely or visually demoted to signal unavailability at the trigger level.

**Fix options**:
- **Best**: Remove the name tab entirely until it's implemented. The product ships with one search mode — own it.
- **Fallback**: Add a small "Prochainement" badge to the trigger text, and keep the tab content minimal with an explicit message: "Cette fonctionnalité sera disponible en 2025" (concrete, not vague).

**Suggested command**: `$impeccable clarify @web/components/SearchTabs.tsx`

### [P2] "Not found" recovery lacks next steps

**What**: When `STUDENT_NOT_FOUND` is returned, the message is "Aucun résultat pour ce numéro en 2024" — it states the failure but gives no hint about what to try next. The `role="status"` is present (good), but the user is left in a dead end.

**Why it matters**: The Riley persona (deliberate stress tester) will try this path. A first-timer (Jordan) who mistyped their number has no suggestion to check the year or re-enter. This is a recovery gap (Heuristic 9, score 3).

**Fix**: Append a helpful suggestion: "Vérifiez le numéro ou essayez une autre année" / "تحقق من الرقم أو جرب سنة أخرى".

**Suggested command**: `$impeccable clarify @web/components/SearchTabs.tsx`

### [P2] No contextual help for first-time users

**What**: A user who has never taken the Bac (a family member, a grandparent) may not know what their "exam number" is or where to find it. There is no tooltip, hint text, or help icon near the exam number field.

**Why it matters**: The Jordan persona (non-technical first-timer) will hesitate at this field. The product principle says "effortless" — but this assumes the user already has their number ready and knows what it is.

**Fix**: Add subtle helper text below the label: "Trouvable sur votre convocation" / "موجود في استدعائك" — or a small tooltip icon next to the label.

**Suggested command**: `$impeccable clarify @web/components/SearchTabs.tsx`

### [P3] Subtle heading weight could be stronger

**What**: The h1 is `text-2xl font-bold` (1.5rem / 24px). For a full-viewport-centered hero layout, this feels modest. The subtitle at `text-sm` creates a compressed vertical rhythm.

**Why it matters**: The page is clean, but the title could carry more presence. The brand personality says "Calm · Beautiful · Effortless" — the heading should feel beautiful, not just correct.

**Fix**: Bump the h1 to `text-3xl` (1.875rem) or `text-4xl` (2.25rem). The design system scale supports this. Keep the subtitle at `text-sm` or bump to `text-base` for better balance. Add more vertical space between title block and search form (`gap-4` instead of `gap-2`).

**Suggested command**: `$impeccable typeset @web/app/[lang]/page.tsx`

---

## Persona Red Flags

### Jordan (Confused First-Timer)

- **"Numéro d'examen" / "رقم الامتحان"**: No hint explaining what this is or where to find it. A grandparent searching for their grandchild's result won't know.
- **Name search tab**: Looks available in the tab bar but leads to a dead end. Confusing.
- **"Not found" message**: Tells the user "no result" but offers zero guidance on what to do. Jordan abandons at this point.

### Alex (Impatient Power User)

- **No keyboard shortcuts**: Must click the search button (or press Enter — at least that works). No `/` to focus search, no `Esc` to cancel.
- **No cancel on pending request**: On publication day with a loaded server, Alex will wait, get frustrated, refresh the page, and start over.
- **Single-item-at-a-time**: No batch search, no way to search multiple numbers quickly. Alex would paste a list of numbers and expect results.

### Casey (Distracted Mobile User)

- **Thumb zone**: The form fields and submit button are well within the thumb zone (bottom half of viewport). Good.
- **Touch targets**: 44px+ (h-12). Excellent.
- **State preservation**: If Casey switches apps mid-search, the form state is lost (React state, not URL-persisted). On return, the form is blank. Minor risk.

---

## Minor Observations

- The `gap-8` on the outer container and `gap-2` on the heading block create a good vertical rhythm, but the overall spacing between heading and search could be pushed further.
- The tabs use `variant="line"` which is correct for this context, but the active underline color override (`after:bg-primary`) would be more consistent if inherited from the base component. No visual bug, just a note.
- The `revalidate: 3600` on years is sensible, but there's no fallback UI if both the API is down AND cache is empty — the form renders with no year options and a "No years published" message. Consider showing a retry button.
- The Arabic translations are well-formed with proper Arabic punctuation (ellipsis character "…"). The `{{year}}` interpolation placeholder is correctly positioned in both languages.

---

## Questions to Consider

- **What if the name search tab were removed entirely?** The product currently ships with one search mode. Does a disabled placeholder tab help or hurt the perception of completeness?
- **What would a confident heading look like?** The current `text-2xl` is technically correct but emotionally modest. The brand says "beautiful" — could the title carry more weight without breaking focus?
- **What about a subtle empty state on first arrival?** Not "show something" — but what if the focused input had a brief, warm placeholder that made the moment feel less like a database query and more like a welcome?
