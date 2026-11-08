// STRESS TEST — find the breaking point.
//
// Question this answers: what's my ceiling, and what breaks first? Ramps
// VUs progressively past the expected results-day target — 50, 100, 250,
// 500, 1000, 2000 — holding at each level, running the full realistic user
// journey (lib/journey.js) throughout.
//
// Read the results by comparing the per-stage rows k6 prints at the end:
// `journey_server_errors{stage:vu_250}`, `journey_server_errors{stage:vu_500}`,
// etc. (a Rate — the share of requests that got a 5xx/network error) and
// `http_req_duration{stage:vu_250}` (a Trend — its p95 in particular). The
// stage where journey_server_errors first climbs off ~0, or p95 first
// crosses a few seconds, is your ceiling — read the console output
// top-to-bottom, stage by stage, and note where the numbers turn.
//
// Run (see README.md for full instructions):
//   k6 run load-tests/stress.js
//
// There's no fixed pass/fail threshold here by design — the point is to
// find where it breaks, not to assert it doesn't. The one safety threshold
// below aborts early if things are already catastrophically broken, so we
// don't spend 10+ more minutes hammering a downed server for no reason.

import { bypassHosts, summaryTrendStats } from './lib/config.js';
import { runJourney } from './lib/journey.js';
import { makeStageResolver } from './lib/stages.js';

const RAMP_DURATION = '20s';
const HOLD_DURATION = '100s'; // 20s + 100s = 2m per level, matching the resolver's STAGE_DURATION below
const STAGE_DURATION = '2m';

const LEVELS = [50, 100, 250, 500, 1000, 2000];

const currentStageName = makeStageResolver(
  LEVELS.map((target) => ({ name: `vu_${String(target)}`, duration: STAGE_DURATION })),
);

const executorStages = LEVELS.flatMap((target) => [
  { target, duration: RAMP_DURATION },
  { target, duration: HOLD_DURATION },
]);
// Settle back to 0 so the very end of the run doesn't get folded into the
// vu_2000 stage's numbers.
executorStages.push({ target: 0, duration: '20s' });

// Tag-filtered thresholds with a trivially-true bound (`>=0`) — these don't
// pass/fail anything, they exist purely to make k6 compute and print a
// separate row per stage in the end-of-test summary. This is what actually
// produces the "which stage degraded" breakdown; without a threshold
// referencing `{stage:vu_X}`, k6 only prints the all-stages-combined total.
const stageThresholds = {};
for (const target of LEVELS) {
  const tag = `vu_${String(target)}`;
  stageThresholds[`journey_server_errors{stage:${tag}}`] = ['rate>=0'];
  stageThresholds[`journey_rate_limited{stage:${tag}}`] = ['rate>=0'];
  stageThresholds[`http_req_duration{stage:${tag}}`] = ['p(95)>=0'];
}

export const options = {
  hosts: bypassHosts(),
  summaryTrendStats,
  scenarios: {
    breakpoint: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: executorStages,
      gracefulRampDown: '10s',
    },
  },
  thresholds: Object.assign(
    {
      // Safety net, not a real pass/fail bar: if more than 80% of requests
      // are hard-failing, the server is already down — stop early rather
      // than burn the remaining stages for no new information.
      journey_server_errors: [{ threshold: 'rate<0.8', abortOnFail: true }],
    },
    stageThresholds,
  ),
};

export default function () {
  const stage = currentStageName();
  runJourney({ spoofClientIp: true, tagExtra: { stage } });
}
