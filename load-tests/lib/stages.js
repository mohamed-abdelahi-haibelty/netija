// Turns a ramping-vus `stages` array into a lookup from "elapsed test time"
// to "which stage are we in right now", so stress.js/spike.js can tag every
// request with e.g. `stage: 'vu_500'` and get a *separate* p95/error-rate
// per stage in k6's own end-of-test summary — directly answering "at which
// stage did it degrade, and by how much" without any custom report code.
//
// Approximation, not a hard guarantee: each VU computes its own TEST_START
// the moment k6 initializes it. As long as the scenario uses
// `preAllocatedVUs` set to the stage's peak target (both stress.js and
// spike.js do), k6 initializes every VU up front before the ramp begins, so
// this lands within about a second of the real stage boundaries — plenty
// precise for a 90s+ hold per stage.

const TEST_START = Date.now();

function durationToMs(d) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(d).trim());
  if (!m) throw new Error(`lib/stages.js: unrecognized duration "${d}"`);
  const value = parseFloat(m[1]);
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2]];
  return value * mult;
}

function buildTimeline(stages) {
  let cursor = 0;
  return stages.map((s) => {
    const ms = durationToMs(s.duration);
    const entry = { name: s.name, startMs: cursor, endMs: cursor + ms };
    cursor += ms;
    return entry;
  });
}

// Returns a zero-arg function that reports the current stage's `name`
// based on wall-clock time elapsed since this module was loaded.
export function makeStageResolver(stages) {
  const timeline = buildTimeline(stages);
  return function currentStageName() {
    const elapsed = Date.now() - TEST_START;
    for (const s of timeline) {
      if (elapsed >= s.startMs && elapsed < s.endMs) return s.name;
    }
    return timeline[timeline.length - 1].name;
  };
}
