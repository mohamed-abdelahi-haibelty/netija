// Shared configuration for every load-test scenario. Import from here, never
// re-read __ENV directly in a scenario script, so all scripts agree on the
// same target/bypass behavior.

// TARGET_HOST is the Hetzner server's bare IP. Required, never hardcoded or
// defaulted — see ../.env.example and ../README.md ("Cloudflare bypass").
export const TARGET_HOST = __ENV.TARGET_HOST;

export const WEB_DOMAIN = __ENV.WEB_DOMAIN || 'netija.com';
export const API_DOMAIN = __ENV.API_DOMAIN || 'api.netija.com';

export const WEB_ORIGIN = `https://${WEB_DOMAIN}`;
export const API_ORIGIN = `https://${API_DOMAIN}`;

// k6's `hosts` option pins these hostnames to TARGET_HOST at the TCP-connect
// level while the request itself keeps using the real hostname for the Host
// header and the TLS SNI. That's what makes this a clean Cloudflare bypass
// rather than a spoofed request: Caddy on the origin sees exactly the same
// Host/SNI it would if DNS had resolved normally, so the real cert and the
// real Caddyfile routing apply — only the proxy hop through Cloudflare's
// edge is skipped. See README.md for the alternative (grey-cloud DNS-only
// subdomain) and why this is preferred.
export function bypassHosts() {
  if (!TARGET_HOST) {
    throw new Error(
      'TARGET_HOST env var is required (the Hetzner server IP). ' +
        'Copy load-tests/.env.example to load-tests/.env, fill it in, and ' +
        'run `set -a; source load-tests/.env; set +a` before `k6 run`. ' +
        'Never hardcode the IP in a script.',
    );
  }
  return {
    [WEB_DOMAIN]: TARGET_HOST,
    [API_DOMAIN]: TARGET_HOST,
  };
}

// Raw HTTP-request-per-second target for the load test (task/PRD language:
// "~330 req/s, i.e. 20,000 req/min"). This is a request rate, not an
// iteration rate — see AVG_REQUESTS_PER_ITERATION below and README.md's
// "Weighting assumptions" section for how the two are reconciled.
export const TARGET_RPS = Number(__ENV.TARGET_RPS || 330);

// Estimated average number of real HTTP requests one simulated visitor
// journey fires (home page + however many search/typing/result-page calls
// the weighted journey in lib/journey.js happens to make). This is a
// deliberate approximation, not a measured constant — recalibrate it after
// a short dry run by comparing the k6 summary's `http_reqs` rate to its
// `iterations` rate, then adjust TARGET_RPS or this value so the *raw
// request* throughput actually lands near your target. See README.md.
export const AVG_REQUESTS_PER_ITERATION = Number(__ENV.AVG_REQUESTS_PER_ITERATION || 3.3);

export const summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];
