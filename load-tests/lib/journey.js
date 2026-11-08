// The shared, realistic user journey used by every scenario script
// (load.js, stress.js, spike.js, cf-compare.js). One call to runJourney()
// is one simulated visitor: it loads the home page, then — weighted per
// lib/weights.js#JOURNEY_WEIGHTS — either stops there, searches by exam
// number, or types a name into autocomplete, in both cases following
// through to the result page via the slug the search itself returned
// (never a hardcoded/guessed slug).

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { WEB_ORIGIN, API_ORIGIN } from './config.js';
import { randomLocale, randomExamType, randomExamYear, randomExamNo, randomTypedQuery, weightedPick } from './data.js';
import {
  JOURNEY_WEIGHTS,
  MIN_KEYSTROKES,
  MAX_KEYSTROKES,
  NAME_FOLLOWTHROUGH_ATTEMPT_RATE,
  EXAM_FOLLOWTHROUGH_ATTEMPT_RATE,
} from './weights.js';

// Per-endpoint-category latency, so a stage/period that degrades shows
// *which* endpoint got slow, not just an aggregate number.
export const homeDuration = new Trend('journey_home_duration', true);
export const examSearchDuration = new Trend('journey_exam_search_duration', true);
export const nameSearchDuration = new Trend('journey_name_search_duration', true);
export const resultPageDuration = new Trend('journey_result_page_duration', true);

// The real failure signal: 5xx or a network-level error (status 0).
export const serverErrors = new Rate('journey_server_errors');
// 429s are tracked separately — expected/healthy behavior under a real
// flood, not a "the server broke" signal by themselves. A high rate here
// despite per-visitor IP spoofing (see randomFakeIp below) is itself a
// finding worth reporting, just a different one than a 5xx spike.
export const rateLimited = new Rate('journey_rate_limited');
export const examFound = new Rate('journey_exam_found');
export const nameFoundAny = new Rate('journey_name_found_any');

// A fresh synthetic "client IP" per iteration (i.e. per simulated visitor),
// not per VU. See README.md "Cloudflare bypass" for why this exists at
// all: the API's rate limiter (api/src/lib/rateLimit.ts) keys off
// CF-Connecting-IP, which only exists because Cloudflare injects it — bypass
// Cloudflare with no replacement and every request in the whole test shares
// one bucket (60 req/min, total, across all VUs) within a few seconds. This
// header is exactly what a real flood of thousands of distinct student
// devices would produce; without it we'd be measuring the rate limiter, not
// the origin's real capacity. 10.0.0.0/8 is used purely as a distinct-looking
// stand-in range, not a claim about real client IPs.
function randomFakeIp() {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  return `10.${octet()}.${octet()}.${octet()}`;
}

function baseHeaders(locale, spoofClientIp, sessionIp) {
  const headers = { 'Accept-Language': locale };
  if (spoofClientIp) {
    headers['CF-Connecting-IP'] = sessionIp;
    headers['X-Forwarded-For'] = sessionIp;
  }
  return headers;
}

// `tags` is threaded into every metric .add() call, not just the HTTP
// request itself — that's what makes per-stage breakdowns (stress.js,
// spike.js tag with e.g. `{ stage: 'vu_500' }`) actually show up as
// separate rows in k6's end-of-test summary via a tag-filtered threshold
// like `journey_server_errors{stage:vu_500}`. A metric .add() call with no
// tags is invisible to that filter even if the HTTP request itself was
// tagged.
function recordOutcome(res, tags) {
  serverErrors.add(res.status === 0 || res.status >= 500, tags);
  rateLimited.add(res.status === 429, tags);
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseJsonSafe(res, tags) {
  try {
    return JSON.parse(res.body);
  } catch (e) {
    // A 200 with an unparseable body is a real backend defect, not a
    // network hiccup — count it as a server error even though the HTTP
    // status itself looked fine.
    serverErrors.add(true, tags);
    return null;
  }
}

export function homePage(locale, headers, tagExtra = {}) {
  const res = http.get(`${WEB_ORIGIN}/${locale}`, {
    headers,
    tags: Object.assign({ name: 'home' }, tagExtra),
  });
  homeDuration.add(res.timings.duration, tagExtra);
  recordOutcome(res, tagExtra);
  check(res, { 'home: 200 or 429': (r) => r.status === 200 || r.status === 429 });
  return res;
}

export function examNumberSearch(examType, headers, tagExtra = {}) {
  const no = randomExamNo();
  const year = randomExamYear();
  const res = http.get(
    `${API_ORIGIN}/api/search/exam?no=${no}&year=${String(year)}&type=${examType}`,
    { headers, tags: Object.assign({ name: 'exam_search' }, tagExtra) },
  );
  examSearchDuration.add(res.timings.duration, tagExtra);
  recordOutcome(res, tagExtra);
  check(res, { 'exam search: 200, 404, or 429': (r) => [200, 404, 429].includes(r.status) });

  const found = res.status === 200;
  examFound.add(found, tagExtra);
  let slug = null;
  if (found) {
    const body = parseJsonSafe(res, tagExtra);
    slug = body?.data?.slug ?? null;
  }
  return { res, slug };
}

export function nameAutocomplete(examType, locale, headers, tagExtra = {}) {
  const keystrokes =
    MIN_KEYSTROKES + Math.floor(Math.random() * (MAX_KEYSTROKES - MIN_KEYSTROKES + 1));
  let lastSuggestions = [];

  for (let i = 0; i < keystrokes; i++) {
    const q = randomTypedQuery(locale);
    const res = http.get(
      `${API_ORIGIN}/api/search/name?q=${encodeURIComponent(q)}&type=${examType}`,
      { headers, tags: Object.assign({ name: 'name_search' }, tagExtra) },
    );
    nameSearchDuration.add(res.timings.duration, tagExtra);
    recordOutcome(res, tagExtra);
    check(res, { 'name search: 200 or 429': (r) => r.status === 200 || r.status === 429 });

    if (res.status === 200) {
      const body = parseJsonSafe(res, tagExtra);
      lastSuggestions = body?.data?.suggestions ?? [];
    }
    // Mirrors the app's own ~300ms autocomplete debounce (see the code
    // comment in api/src/lib/rateLimit.ts) between simulated keystrokes.
    sleep(0.15 + Math.random() * 0.15);
  }

  nameFoundAny.add(lastSuggestions.length > 0, tagExtra);
  return { slug: lastSuggestions.length > 0 ? pickOne(lastSuggestions).slug : null };
}

export function resultPage(locale, slug, headers, tagExtra = {}) {
  const res = http.get(`${WEB_ORIGIN}/${locale}/results/${encodeURIComponent(slug)}`, {
    headers,
    tags: Object.assign({ name: 'result_page' }, tagExtra),
  });
  resultPageDuration.add(res.timings.duration, tagExtra);
  recordOutcome(res, tagExtra);
  check(res, { 'result page: 200 or 429': (r) => r.status === 200 || r.status === 429 });
  return res;
}

// Runs one full simulated visit. `spoofClientIp` should stay true for the
// Cloudflare-bypass scenarios (load/stress/spike) and false for the
// through-Cloudflare comparison (cf-compare.js), where Cloudflare itself
// overwrites CF-Connecting-IP anyway. `tagExtra` lets a caller attach
// extra k6 tags (e.g. `{ stage: 'vu_500' }`) so stress/spike can break
// metrics down by test stage.
export function runJourney({ spoofClientIp = true, tagExtra = {} } = {}) {
  const locale = randomLocale();
  const examType = randomExamType();
  const sessionIp = randomFakeIp();
  const headers = baseHeaders(locale, spoofClientIp, sessionIp);

  // Returned so callers that need to inspect the raw response (e.g.
  // cf-compare.js reading the `Cf-Cache-Status` header) don't have to issue
  // a second, redundant home-page request just to get one.
  const homeRes = homePage(locale, headers, tagExtra);

  const action = weightedPick(JOURNEY_WEIGHTS);
  if (action === 'homeOnly') return { homeRes };

  if (action === 'examNumberSearch') {
    const { slug } = examNumberSearch(examType, headers, tagExtra);
    if (slug && Math.random() < EXAM_FOLLOWTHROUGH_ATTEMPT_RATE) {
      resultPage(locale, slug, headers, tagExtra);
    }
    return { homeRes };
  }

  // nameSearch
  const { slug } = nameAutocomplete(examType, locale, headers, tagExtra);
  if (slug && Math.random() < NAME_FOLLOWTHROUGH_ATTEMPT_RATE) {
    resultPage(locale, slug, headers, tagExtra);
  }
  return { homeRes };
}
