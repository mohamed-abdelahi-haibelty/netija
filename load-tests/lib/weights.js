// All traffic-shape assumptions live here, in one place, so they're easy to
// find, question, and retune. None of these are measured from real traffic
// (the site has no real users yet) — they're deliberate, documented
// assumptions. See README.md "Weighting assumptions" for the reasoning.

export const MIN_EXAM_YEAR = 2015;
export const MAX_EXAM_YEAR = 2025;

// Arabic is the project's default locale (project-overview.md: "the visitor
// first chooses which exam... Arabic is the default"). Weighted higher than
// French for both page-load locale and which name script gets searched.
export const LOCALE_WEIGHTS = { ar: 70, fr: 30 };

// Bac is assumed the higher-volume exam type. Brevet was added later
// (task 036) and, going by candidate-population size for a national Bac vs.
// a lower-secondary Brevet exam, is assumed to draw less search traffic.
export const EXAM_TYPE_WEIGHTS = { bac: 70, brevet: 30 };

// The core journey mix. One iteration picks exactly one of these actions
// (see lib/journey.js#runJourney). Name search is weighted heaviest per the
// task brief ("highest-volume endpoint") — it's also the only one with no
// required year/exam-number input, matching how a typical visitor who
// doesn't have their exam number handy behaves. Exam-number search is
// second: it's the "I know my number" path. A small slice of visits are
// home-page-only (bounced before searching, or just checking the site is
// up).
export const JOURNEY_WEIGHTS = {
  nameSearch: 60,
  examNumberSearch: 25,
  homeOnly: 15,
};

// Within a name-search visit, how many "keystrokes" (partial-query
// requests) fire before either picking a suggestion or giving up — mirrors
// typing a few characters, pausing on the debounce, typing more.
export const MIN_KEYSTROKES = 2;
export const MAX_KEYSTROKES = 4;

// Chance that a name-search visit, after typing, actually clicks a
// suggestion and follows through to the result page (vs. abandoning). Real
// production data may make plausible-but-fabricated names match sometimes
// (Meilisearch is typo-tolerant), but most fabricated queries won't hit a
// real record — this caps how often we *attempt* the follow-through; the
// journey only actually visits a result page if the search response really
// returned a slug.
export const NAME_FOLLOWTHROUGH_ATTEMPT_RATE = 0.5;

// Same idea for exam-number search: attempt the follow-through only if the
// number search actually resolved (200, not 404).
export const EXAM_FOLLOWTHROUGH_ATTEMPT_RATE = 0.9;
