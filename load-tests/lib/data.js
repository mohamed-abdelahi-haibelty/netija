// Randomized input data for the load tests, so every request does real
// work against Postgres/Meilisearch/Redis instead of hammering one cached
// response. Every name below is FABRICATED — combinatorially generated from
// common Mauritanian naming patterns (given names + the "Ould"/"Mint"
// lineage particles meaning "son of"/"daughter of", used exactly like
// "bin"/"binti"), never real people. Nothing here is copied from seed data,
// fixtures, or production.

import { MIN_EXAM_YEAR, MAX_EXAM_YEAR, EXAM_TYPE_WEIGHTS, LOCALE_WEIGHTS } from './weights.js';

// --- Locale -----------------------------------------------------------
// Arabic is the project's default locale (architecture.md, project-overview
// .md) and is assumed to carry the bulk of results-day traffic — weighted
// 70/30 ar:fr here. Adjust LOCALE_WEIGHTS in weights.js if real PostHog
// numbers say otherwise once the site has traffic.
export function randomLocale() {
  return weightedPick(LOCALE_WEIGHTS);
}

// --- Exam type ----------------------------------------------------------
// Bac is assumed to be the higher-volume exam (more candidates, longer
// history of public awareness) — weighted 70/30 bac:brevet. This is an
// assumption, not a measured split; see README.md "Weighting assumptions".
export function randomExamType() {
  return weightedPick(EXAM_TYPE_WEIGHTS);
}

// --- Exam year / number ---------------------------------------------------
export function randomExamYear() {
  return MIN_EXAM_YEAR + Math.floor(Math.random() * (MAX_EXAM_YEAR - MIN_EXAM_YEAR + 1));
}

// Real exam numbers are digit strings with leading zeros preserved
// (architecture.md). We don't know the real per-year candidate count, so we
// spread across a plausible 4-6 digit range rather than guessing an exact
// width — this deliberately produces a healthy mix of hits and realistic
// STUDENT_NOT_FOUND misses, both real load.
export function randomExamNo() {
  const width = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6 digits
  const max = 10 ** width;
  const n = Math.floor(Math.random() * max);
  return String(n).padStart(width, '0');
}

// --- Fabricated Mauritanian names ----------------------------------------

const GIVEN_FR = [
  'Mohamed', 'Sidi', 'Sidi Mohamed', 'Mohamed Vall', 'Mohamed Abdellahi',
  'Ahmed', 'Ahmed Salem', 'El Hacen', 'Cheikh', 'Baba', 'Yahya', 'Brahim',
  'Moulaye', 'Abdellahi', 'Mohamed Lemine', 'Housseinou', 'Amadou', 'Samba',
  'Aliou', 'Demba', 'Bocar', 'Mamadou',
];

const GIVEN_FR_F = [
  'Fatimetou', 'Khadijetou', 'Aichetou', 'Mariem', 'Zeinabou', 'Selma',
  'Vatma', 'Aminetou', 'Mahjouba', 'Salka', 'Coumba', 'Aissata', 'Oumou',
  'Rabab', 'Dahba',
];

const FAMILY_FR = [
  'Ahmed Salem', 'Cheikh', 'Mohamed', 'Sidi Ahmed', 'Taleb', 'El Moctar',
  'Boubacar', 'Diallo', 'Sy', 'Ba', 'Kane', 'Fall', 'Jiddou', 'Vall',
  'Ould Cheikh', 'Ahmedou',
];

const GIVEN_AR = [
  'محمد', 'سيدي محمد', 'أحمد سالم', 'الحسن', 'الشيخ', 'بابا', 'يحيى',
  'إبراهيم', 'مولاي', 'عبد الله', 'محمد الأمين',
];

const GIVEN_AR_F = [
  'فاطمتو', 'خديجتو', 'عائشتو', 'مريم', 'زينبو', 'سلمى', 'فاطمة', 'أمينتو',
];

const FAMILY_AR = [
  'أحمد سالم', 'الشيخ', 'محمد', 'سيدي أحمد', 'الطالب', 'المختار', 'ولد الشيخ',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Builds one fabricated full name, French/Latin script, "<given> Ould/Mint
// <family>" — mirrors the real Mauritanian lineage-particle pattern.
function fabricatedNameFr() {
  const female = Math.random() < 0.5;
  const given = pick(female ? GIVEN_FR_F : GIVEN_FR);
  const particle = female ? 'Mint' : 'Ould';
  return `${given} ${particle} ${pick(FAMILY_FR)}`;
}

function fabricatedNameAr() {
  const female = Math.random() < 0.5;
  const given = pick(female ? GIVEN_AR_F : GIVEN_AR);
  const particle = female ? 'بنت' : 'ولد';
  return `${given} ${particle} ${pick(FAMILY_AR)}`;
}

// Returns a fabricated full name in the given script ('ar' | 'fr').
export function randomFullName(script) {
  return script === 'ar' ? fabricatedNameAr() : fabricatedNameFr();
}

// Simulates a user typing: a random prefix of a random fabricated name,
// length 2..full — matches the autocomplete's 2-character minimum
// (api/src/schemas/nameSearch.ts) and the "partial queries as if typing"
// requirement.
export function randomTypedQuery(script) {
  const full = randomFullName(script);
  const minLen = 2;
  const len = minLen + Math.floor(Math.random() * Math.max(1, full.length - minLen));
  return full.slice(0, len);
}

function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

export { weightedPick };
