// CLOUDFLARE COMPARISON — a lighter, through-Cloudflare run of the same
// realistic journey, so you can compare against a bypass run (load.js) and
// see how much the edge actually absorbs.
//
// Deliberately different from the other three scripts in two ways:
//
// 1. No `hosts` override — real DNS, real Cloudflare proxy in front. This
//    is the one script that does NOT need TARGET_HOST/the Cloudflare
//    bypass at all.
// 2. No synthetic per-visitor CF-Connecting-IP/X-Forwarded-For (see
//    lib/journey.js `spoofClientIp: false`) — Cloudflare sets
//    CF-Connecting-IP itself from the real TCP connection, which is this
//    one laptop's one real IP for the whole run. That means every VU here
//    shares ONE 60-req/min rate-limit bucket on dynamic endpoints
//    (api.netija.com/api/search/*, /api/results/*) — not a bug, just an
//    inherent limit of testing from a single machine with no second
//    server (see README.md "Cloudflare comparison scenario"). This script
//    stays deliberately light (a handful of VUs) because of that — it is
//    NOT a throughput test. Its real purpose is reading the
//    `Cf-Cache-Status` response header on the home page to see what
//    fraction of requests Cloudflare's edge cache serves without ever
//    reaching the origin.
//
// Run:
//   k6 run load-tests/cf-compare.js

import { summaryTrendStats } from './lib/config.js';
import { runJourney } from './lib/journey.js';
import { Rate, Counter } from 'k6/metrics';

const cfCacheHitRate = new Rate('cf_cache_hit_rate');
const cfCacheStatusSeen = new Counter('cf_cache_status_seen');

const VUS = Number(__ENV.CF_COMPARE_VUS || 15);

export const options = {
  summaryTrendStats,
  scenarios: {
    cf_compare: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: VUS, duration: '30s' },
        { target: VUS, duration: '3m' },
        { target: 0, duration: '20s' },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Informational only — see the file comment above for why this
    // script doesn't assert throughput/latency pass/fail bars.
    cf_cache_hit_rate: ['rate>=0'],
  },
};

export default function () {
  const { homeRes } = runJourney({ spoofClientIp: false });
  const cacheStatus = homeRes.headers['Cf-Cache-Status'];
  if (cacheStatus) {
    cfCacheStatusSeen.add(1);
    cfCacheHitRate.add(cacheStatus === 'HIT');
  }
}
