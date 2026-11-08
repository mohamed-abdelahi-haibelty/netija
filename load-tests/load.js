// LOAD TEST — sustained expected results-day traffic.
//
// Question this answers: does normal results-day traffic hold steady?
// Ramps to the target request rate and holds it for several minutes,
// running the full realistic user journey (lib/journey.js) so every
// request does real work against Postgres/Meilisearch/Redis.
//
// Run (see README.md for full instructions and the Cloudflare-bypass setup
// this depends on):
//   k6 run load-tests/load.js
//
// Tune the target with TARGET_RPS (default 330, i.e. ~20,000 req/min) and
// AVG_REQUESTS_PER_ITERATION (default 3.3 — recalibrate after a short dry
// run, see README.md "Weighting assumptions").

import { bypassHosts, TARGET_RPS, AVG_REQUESTS_PER_ITERATION, summaryTrendStats } from './lib/config.js';
import { runJourney } from './lib/journey.js';

const iterationRate = Math.max(1, Math.round(TARGET_RPS / AVG_REQUESTS_PER_ITERATION));

export const options = {
  hosts: bypassHosts(),
  summaryTrendStats,
  scenarios: {
    sustained_load: {
      executor: 'ramping-arrival-rate',
      startRate: Math.max(1, Math.round(iterationRate * 0.1)),
      timeUnit: '1s',
      preAllocatedVUs: Math.max(50, iterationRate * 3),
      maxVUs: Math.max(100, iterationRate * 6),
      stages: [
        { target: iterationRate, duration: '2m' }, // ramp up to target
        { target: iterationRate, duration: '6m' }, // hold — the actual "does it stay steady" window
        { target: 0, duration: '1m' }, // ramp down
      ],
    },
  },
  thresholds: {
    // Pass/fail criteria from README.md: p95 < 1s at target throughput,
    // effectively zero 5xx. 429s are deliberately NOT part of this
    // threshold — see journey.js's `rateLimited` metric comment.
    http_req_duration: ['p(95)<1000'],
    journey_server_errors: ['rate<0.001'],
  },
};

export default function () {
  runJourney({ spoofClientIp: true });
}
