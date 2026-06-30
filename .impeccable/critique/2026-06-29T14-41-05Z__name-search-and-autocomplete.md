---
target: name search and autocomplete
total_score: 27
p0_count: 0
p1_count: 3
p2_count: 2
timestamp: 2026-06-29T14-41-05Z
slug: name-search-and-autocomplete
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Autocomplete skeleton ✓; silent fetch-error on name tab (no UI feedback) |
| 2 | Match System / Real World | 3 | Good labels; autocomplete metadata (série, wilaya, year) shown without labels |
| 3 | User Control and Freedom | 2 | No clear/reset on either input; name tab offers no exit if no suggestions appear |
| 4 | Consistency and Standards | 3 | Consistent input heights; interaction model differs between tabs (submit vs. select-only) |
| 5 | Error Prevention | 3 | Digit-only validation, 2-char minimum, year select — solid; no maxLength on exam input |
| 6 | Recognition Rather Than Recall | 3 | Autocomplete covers name; unlabeled metadata forces recall ("MPC", "Nouakchott") |
| 7 | Flexibility and Efficiency | 2 | Keyboard nav in dropdown ✓; no recent searches, no tab keyboard switch, no clear affordance |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and focused; minor redundancy in two pre-input help texts on exam tab |
| 9 | Error Recovery | 3 | Field errors inline with role=alert ✓; network failure on autocomplete shows nothing |
| 10 | Help and Documentation | 2 | "Trouvable sur votre convocation" is the only contextual help; zero guidance in name tab |
| **Total** | | **27/40** | **Acceptable — significant improvements needed** |

---

## Anti-Patterns Verdict

**LLM assessment**: Not AI-generated. The component code is disciplined and intentional — no eyebrow kickers, no gradient text, no identical card grids, no glassmorphism. The tab system is clean, the input heights are consistent, and the ARIA implementation on the combobox is genuinely excellent. The product register aesthetic (restrained, tool-first) is correctly applied: this doesn't try to be beautiful, it tries to be fast and trustworthy. The design is defensible, not reflexive.

**Deterministic scan**: Clean — `detect.mjs` returned zero findings across all three target files. No slop patterns detected.

**Browser visualization**: Skipped — dev server not running and no browser automation in this session.

---

## Overall Impression

The search surfaces are technically solid and accessible. The ARIA combobox implementation is among the best in any submitted critique — it will work correctly with VoiceOver and NVDA. The visual consistency between tabs (identical input heights, shared token vocabulary) is good. The biggest weakness is the interaction model: the name tab has no "what if nothing appears?" path, the autocomplete metadata is cryptic for a non-technical audience, and the page's h1 gives zero orientation to screen reader users. The gap between the two tabs' interaction models will confuse first-time users who expect both tabs to have a Search button.

---

## What's Working

**1. ARIA combobox implementation is production-quality.** `role="combobox"`, `aria-expanded`, `aria-haspopup`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`, a polite live region for result announcements, and correct keyboard navigation (↑↓ Arrow, Enter, Escape). This is not boilerplate — it was built thoughtfully.

**2. Skeleton loading state on the autocomplete.** Three skeleton rows with varied widths (72%, 56%, 64%) and a secondary skeleton line per row accurately simulate the real list shape. Users see the right structure before content loads. This is the correct pattern for this interaction.

**3. Error handling is layered correctly.** Field validation errors use `role="alert"` (interrupting). Search outcome (not found) uses `role="status"` (polite). The abort controller on both tabs prevents race conditions and stale results. The cancel affordance during exam search is genuinely useful during slow connections.

---

## Priority Issues

### [P1] Autocomplete metadata is cryptic for the target audience
**What**: Each suggestion shows `birthPlace · serie · latestYear` — e.g., "Kiffa · MPC · 2024" — with no labels.
**Why it matters**: Netija's primary users are parents and grandparents who may have never seen abbreviations like "MPC" (série de Mathématiques, Physique, Chimie). The metadata is meant to help distinguish between multiple people with the same name — but without labels, it achieves the opposite for non-technical users. "Kiffa · MPC · 2024" reads as three unrelated data points.
**Fix**: Add micro-labels to the metadata span. Instead of a joined string: render small labeled chips — `Wilaya: Kiffa`, `Série: MPC`, `Année: 2024` — or at minimum use the full série name from a lookup, not the abbreviation. The current `text-xs text-muted-foreground` single line has space for 2-3 small labeled spans.
**Suggested command**: `$impeccable clarify NameAutocomplete — improve autocomplete result metadata labels for non-technical users`

---

### [P1] Name tab has no action path when autocomplete produces nothing
**What**: If a user types a name and no suggestions appear (misspelling, obscure name, or API hiccup), there is no submit button, no "press Enter to search" affordance, and no explanation of what to do. The Enter key only selects an active suggestion — if none is active, nothing happens.
**Why it matters**: Non-technical users (Netija's core audience) do not innately understand that this is a select-from-list interaction. They will type a name, see "Aucun résultat", and not know whether to try again, spell it differently, or switch tabs. There is zero guidance at this dead end.
**Fix**: When `status === 'done'` and `suggestions.length === 0`, the empty state should include a suggestion: "Essayez un prénom différent, ou cherchez par numéro d'examen." Add a button or link that switches to the exam tab. This turns the dead end into a routing moment.
**Suggested command**: `$impeccable harden NameAutocomplete — add meaningful empty state with guidance and tab-switch prompt`

---

### [P1] H1 provides no task-based orientation
**What**: The h1 is "Netija" — the brand name only. The subtitle "Résultats du Baccalauréat mauritanien" carries all orientation but is in `text-muted-foreground`.
**Why it matters**: Screen reader users navigate by heading. Landing on "Netija" as the page's only h1 tells them the brand, not the task. A user navigating without vision will not know whether this is the home page, the results page, or a login screen until they explore further. The brand name as h1 is also SEO-suboptimal.
**Fix**: Either invert the heading/subtitle relationship (make the task description the h1, use a smaller logotype above it), or make the subtitle visually and semantically equal to the h1 — e.g., visually present brand name + subtitle as a combined hero block where the subtitle has heading weight even if it's a `<p>`. At minimum, add a `title` attribute or ensure the `<head>` has a meaningful `<title>` tag.
**Suggested command**: `$impeccable clarify page.tsx — improve h1 orientation for screen reader users and SEO`

---

### [P2] Label redundancy on the name tab
**What**: The tab trigger reads "Recherche par nom". When selected, the `NameAutocomplete` renders a `<Label>` that also reads "Recherche par nom" immediately below the tab bar. The label is therefore visible twice at the same time: once as the active tab indicator, once as the field label.
**Why it matters**: Redundant labels create visual noise and waste vertical space — especially on mobile where every pixel above the keyboard matters. The duplication signals the label exists because a pattern requires it, not because it adds information.
**Fix**: Either remove the `<Label>` inside `NameAutocomplete` (the tab label is sufficient context) and add `aria-label` directly to the input, or rename the label to something more instructive like "Nom du candidat" that adds information the tab heading doesn't provide.
**Suggested command**: `$impeccable distill NameAutocomplete — remove label redundancy, improve input labeling`

---

### [P2] Network failure on autocomplete is silent
**What**: When `fetchSuggestions` catches a non-abort error, it silently sets `suggestions = []` and returns without setting any error message or user-visible feedback. The user sees "Aucun résultat" — identical to a genuine no-match — and has no idea a network failure occurred.
**Why it matters**: On slow connections (3G Mauritanian mobile networks), fetch failures are not rare. A user seeing "Aucun résultat" after a network hiccup will conclude their name isn't in the database and give up — rather than retrying.
**Fix**: Distinguish between a network error and a genuine no-results state. Add an `'error'` branch to the current `status` state machine and render a different message: "Impossible de se connecter. Vérifiez votre connexion et réessayez." — matching the exam tab's `errorNetwork` string.
**Suggested command**: `$impeccable harden NameAutocomplete — handle fetch error state distinctly from no-results`

---

## Persona Red Flags

**Jordan (Confused First-Timer)** — primary Netija user archetype:
- Types "Mouhamed Ould" in the name search, gets 3 suggestions, sees "Mouhamed Ould Ba · Nouakchott · LV · 2023". Does not know what "LV" means (Lettres et Valeurs islamiques). Cannot distinguish between three suggestions confidently. Might select the wrong person.
- Types a misspelled name, sees "Aucun résultat", and doesn't know whether to try again or switch to exam tab. No guidance. Will likely abandon and call a family member instead.
- On the exam tab: reads "Trouvable sur votre convocation" but doesn't know what a "convocation" looks like in digital form. The example "Ex: 04938" helps, but its placement above the input is non-standard and might be missed.

**Casey (Distracted Mobile User)** — one-handed, on a slow Mauritanian 3G connection:
- Opens the name tab, starts typing. Autocomplete dropdown appears, overlapping the content below — and potentially partially behind the soft keyboard. The `max-h-56` (224px) limit helps, but on small screens (iPhone SE: 375px viewport) with a keyboard open (~280px tall), there may be as little as 95px of visible page above the keyboard. The dropdown opens downward toward the keyboard.
- Typed "Fatim" and wants to clear and start over. No clear button — must tap the input and backspace 5 times or triple-tap to select all. A ×-clear button at `right-3` inside the input would save 5 taps.
- Network is slow. Typed 3 chars, debounce fires (300ms), fetch takes 4 seconds. During those 4 seconds, the skeleton shows — but the user may have already typed more chars. No indication that the skeleton is stale and a new fetch is in flight.

**Fatouma (Mauritanian parent, Arabic-speaking, project-specific)**:
- RTL layout with an Arabic name. The metadata line in the suggestion — `birthPlace · serie · latestYear` — will render as a bidi-mixed string. "Nouakchott · MPC · 2024" inside an RTL context would appear visually reversed. The dots used as separators (` · `) in LTR become visually confusing in RTL without explicit `dir="ltr"` on the metadata span.
- The hardcoded `lang === 'ar' ? 'مثال: 04938' : 'Ex: 04938'` bypasses the i18n system — if translations need updating (e.g., for another locale or wording change), this will be missed.

---

## Minor Observations

- The `TabsTrigger` applies `className="rounded-none px-4 py-2.5 data-active:text-primary after:bg-primary"`. The `after:` pseudo-element indicator is fine but the `data-active` attribute name suggests a custom variant — worth verifying this attribute is actually emitted by the Tabs component at runtime, or the active state styling may not apply.
- The `SelectContent alignItemWithTrigger={false}` prop on the year select is unusual. The default shadcn behavior aligns the popover with the selected item. Disabling this may cause the dropdown to appear at an unexpected position relative to the trigger on some browsers.
- `Loader2 className="animate-spin size-4"` inside the button: the spinner and "Annuler" text share the button. When a user clicks the button expecting to confirm "Rechercher" but it's already loading, they might click Cancel unintentionally. The state-change from Submit→Cancel without an animation or transition is abrupt.
- Both inputs use `autoComplete="off"` — correct for exam numbers; debatable for the name search. Browser autofill of a previously searched name would actually be useful for returning users.
- No `maxLength` on the exam number input. A student pasting a paragraph of text would produce an API request with a very long string. Limit to 10–12 chars.

---

## Questions to Consider

- "The name tab is a select-from-dropdown interaction — but what percentage of users actually know their exact name spelling? A free-text search with a separate results page might serve the audience better than a forced autocomplete selection."
- "Two search tabs is the right call for the MVP. But should the default tab be 'exam' or 'name'? Exam is faster (one number, one result) but name is more forgiving of imprecision — which error does the audience make more often?"
- "The autocomplete metadata shows série abbreviations that would require a lookup to understand. Is the goal to disambiguate (show enough info to distinguish two Fatim Bah results) or to provide context (show their history)? If disambiguation, show only birthPlace + year; leave série for the results page."
