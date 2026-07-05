# 029 — Production Deployment

**Depends on:** all application tasks (through 028)
**Context:** architecture.md (environments, invariant 2), the deployment guide decisions (single VPS, Caddy, Cloudflare).

## Goal
Production running on the VPS from the repo: hardened, TLS'd, backed up, monitored.

## Requirements
- A production compose file: all six services, pinned versions, restart policies, a memory limit on the worker, internal services with no published ports — only the reverse proxy exposes 80/443.
- Caddy configuration routing the production domain to the stack with automatic TLS.
- An environment template; secrets only via server-side env files (never committed); a deploy script (pull, build, migrate, restart).
- Backups: nightly database dump shipped off-server plus provider snapshot guidance; a documented and once-executed restore test.
- Uptime monitoring pointed at readiness; Cloudflare setup documented as a checklist (DNS proxying, DDoS defaults, bot mitigation, a WAF rate rule on the search paths, cache rules consistent with task 025 headers, the purge credential for task 022).
- A VPS hardening checklist (non-root deploy user, key-only SSH, firewall allowing only 22/80/443, unattended security updates).

## Environment model
This is a solo, budget-conscious project: dev (local Docker Compose) + production only. There is no permanent staging stack — new imports land in production as UNPUBLISHED and are verified there (admin-only, gated by the automated smoke check, spot-checkable live-but-hidden, reversible via unpublish) before publishing, which is the safe-preview role a staging environment would otherwise serve. If a rare, risky infrastructure or migration change ever needs isolated testing, spin up a temporary environment for that change only and tear it down afterward — do not stand up a continuously running second stack.

## Out of scope
- CI/CD pipelines (a documented manual deploy is acceptable at this stage).

## Done when
- [ ] The compose configuration validates; the stack boots end to end on the VPS (or a local simulation) with its own data.
- [ ] A restore from backup has been performed once and documented.
- [ ] The hardening and Cloudflare checklists are complete with every item checked.
