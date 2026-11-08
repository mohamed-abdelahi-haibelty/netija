// SPIKE TEST — the results-day scenario. A teacher posts the link and
// thousands of students arrive within the same minute: near-zero traffic,
// then an almost-instant jump to full load, held briefly, then a sudden
// drop back to near-zero.
//
// Questions this answers: does a sudden flood kill us, and do we recover?
// Specifically watch for: a cold-cache stampede (everyone hitting
// previously-unrequested exam numbers/names at once — lib/journey.js
// randomizes every request's data, so this is real, not a single cached
// response), connection-pool exhaustion, and — critically — whether
// `baseline_after` looks like `baseline_before` once the spike passes, or
// stays broken.
//
// Read the results the same way as stress.js: compare the per-phase rows
// k6 prints at the end — `journey_server_errors{phase:baseline_before}`
// vs. `{phase:baseline_after}` is the recovery check; a `baseline_after`
// that's still elevated after the spike has passed means the system did
// NOT recover cleanly (e.g. exhausted connection pool never released,
// Postgres/Redis connections pinned, a container that OOM'd and is still
// restarting).
//
// Run (see README.md for full instructions):
//   k6 run load-tests/spike.js
//
// Tune the peak with SPIKE_PEAK_VUS (default 1500, i.e. "1000+" per the
// brief) and the baseline with SPIKE_BASELINE_VUS (default 10).

import { bypassHosts, summaryTrendStats } from './lib/config.js';
import { runJourney } from './lib/journey.js';
import { makeStageResolver } from './lib/stages.js';

const BASELINE_VUS = Number(__ENV.SPIKE_BASELINE_VUS || 10);
const PEAK_VUS = Number(__ENV.SPIKE_PEAK_VUS || 1500);

const PHASES = [
  { name: 'baseline_before', target: BASELINE_VUS, duration: '20s' },
  { name: 'spike_ramp', target: PEAK_VUS, duration: '8s' }, // near-zero -> full load in under 10s, per the brief
  { name: 'spike_hold', target: PEAK_VUS, duration: '1m' },
  { name: 'drop', target: BASELINE_VUS, duration: '10s' }, // sudden drop
  { name: 'baseline_after', target: BASELINE_VUS, duration: '3m' }, // recovery window — compare against baseline_before
  { name: 'cooldown', target: 0, duration: '10s' },
];

const currentPhaseName = makeStageResolver(
  PHASES.map((p) => ({ name: p.name, duration: p.duration })),
);

const executorStages = PHASES.map((p) => ({ target: p.target, duration: p.duration }));

// Same "trivially-true threshold, purely to force a per-phase summary row"
// trick as stress.js — see that file's comment for why.
const phaseThresholds = {};
for (const p of PHASES) {
  phaseThresholds[`journey_server_errors{phase:${p.name}}`] = ['rate>=0'];
  phaseThresholds[`journey_rate_limited{phase:${p.name}}`] = ['rate>=0'];
  phaseThresholds[`http_req_duration{phase:${p.name}}`] = ['p(95)>=0'];
}

export const options = {
  hosts: bypassHosts(),
  summaryTrendStats,
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      // Note: `ramping-vus` (unlike the arrival-rate executors) has no
      // preAllocatedVUs/maxVUs — it spins VUs up/down to match each
      // stage's `target` directly, which is exactly what "jump from 10 to
      // 1500 VUs in 8s" needs.
      stages: executorStages,
      gracefulRampDown: '10s',
    },
  },
  thresholds: phaseThresholds,
};

export default function () {
  const phase = currentPhaseName();
  runJourney({ spoofClientIp: true, tagExtra: { phase } });
}
