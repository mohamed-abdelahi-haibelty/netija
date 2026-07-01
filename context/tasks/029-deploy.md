# 029 — Production & Staging Deployment

**Depends on:** all application tasks (through 028)
**Context:** architecture.md (environments, invariant 2/8), the deployment guide decisions (single VPS, Caddy, Cloudflare).

## Goal
Both environments running on the VPS from one repo: hardened, TLS'd, backed up, monitored.

## Requirements
- Production and staging compose files: all six services per environment, pinned versions, restart policies, a memory limit on the worker, internal services with no published ports — only the reverse proxy exposes 80/443; fully separate databases/queues/indexes/volumes per environment (invariant 8).
- Caddy configuration routing the production domain and the staging subdomain to their stacks with automatic TLS; staging responses carry a noindex header.
- Environment templates for both; secrets only via server-side env files (never committed); a deploy script (pull, build, migrate, restart) per environment.
- Backups: nightly database dump shipped off-server plus provider snapshot guidance; a documented and once-executed restore test.
- Uptime monitoring pointed at readiness; Cloudflare setup documented as a checklist (DNS proxying, DDoS defaults, bot mitigation, a WAF rate rule on the search paths, cache rules consistent with task 025 headers, the purge credential for task 022).
- A VPS hardening checklist (non-root deploy user, key-only SSH, firewall allowing only 22/80/443, unattended security updates).

## Out of scope
- CI/CD pipelines (a documented manual deploy is acceptable at this stage).

## Done when
- [ ] Both compose configurations validate; the staging stack boots end to end on the VPS (or a local simulation) with its own data.
- [ ] A restore from backup has been performed once and documented.
- [ ] The hardening and Cloudflare checklists are complete with every item checked.
