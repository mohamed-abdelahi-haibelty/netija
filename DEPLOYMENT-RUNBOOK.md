# Netija — Production Deployment Runbook

Target: a single Hetzner Cloud VPS (Ubuntu 24.04, ~8 GB RAM), Cloudflare in
front (DNS, DDoS, CDN), Caddy on the server for TLS + reverse proxy,
UptimeRobot for uptime monitoring. Written for someone who has never run a
VPS before — every command is spelled out.

This document assumes you've read `context/tracker/architecture.md` and
`context/tracker/deployment.md` (the living deployment notes); this runbook
is the concrete, step-by-step version of what those files describe at a
higher level. Whenever this runbook and `deployment.md` disagree in the
future, update both in the same PR (per `ai-workflow-rules.md`'s
"Keeping Docs in Sync").

---

## Concepts you'll need

Skip this section if you already know hosting/networking basics. Otherwise, read it once before starting — every term below gets used later without being re-explained, and the inline notes in section 3 point back here rather than repeating themselves.

**Server / VPS.** A server is just a computer that's always on and connected to the internet, sitting in a data center instead of on your desk. A VPS ("Virtual Private Server") is a slice of a bigger physical machine that acts like your own private computer — you get full control (root access), your own IP address, and nobody else's software runs on your slice. Hetzner is the company renting you this slice.

**SSH / "SSH into the server."** SSH (Secure Shell) is how you open a remote command-line session on a server, encrypted so nobody in between can read or tamper with it. "SSH into the server" just means "open a terminal connected to it" — the same way you'd open a terminal on your own laptop, except every command you type now runs on the far-away machine instead.

**SSH keys vs. password login.** An SSH key is a matched pair of files: a private key that never leaves your laptop, and a public key you give to the server ahead of time. The server can verify you hold the matching private key without a password ever crossing the network. This is safer than password login because a password can be guessed or brute-forced by anyone hammering the login prompt from anywhere on the internet, while a private key can't realistically be guessed — and once password login is disabled entirely, those brute-force attempts fail outright with nothing to try against.

**DNS and nameservers.** DNS (Domain Name System) is the internet's phone book: it turns a domain name like `example.com`, which humans can remember, into the numeric IP address a computer actually needs to connect. A nameserver is the specific phone book that's treated as authoritative for your domain. "Pointing your domain at Cloudflare" means changing which nameservers your registrar advertises to Cloudflare's — that's the one act that actually hands DNS control to Cloudflare; every other DNS setting only takes effect once that handoff has happened.

**DNS record, specifically an A record.** A DNS record is one entry in that phone book. An A record is the kind that maps a name straight to an IPv4 address: "when someone looks up this name, send them to this IP." The "name" is a prefix in front of your domain — `@` means the bare domain (`example.com`) itself, `www` means `www.example.com`, and `api` means `api.example.com`. Each can point somewhere different, which is why this runbook creates three separate A records (all happening to point at the same server IP here).

**Proxied vs. DNS only (orange cloud vs. grey cloud).** Every DNS record in Cloudflare's dashboard has a toggle shaped like a cloud. Grey ("DNS only") means Cloudflare just answers the phone-book lookup and gets out of the way — visitors connect straight to your server. Orange ("Proxied") means visitor traffic is routed through Cloudflare's own servers first, which then forward it to yours. Proxied is what actually delivers Cloudflare's DDoS protection and CDN caching, since Cloudflare can only filter or cache traffic that actually passes through it — it can't do either for a grey-cloud record it never touches.

**DDoS protection.** A DDoS (Distributed Denial-of-Service) attack floods a server with junk traffic from many machines at once, trying to overwhelm it so real visitors can't get through. Because proxied traffic hits Cloudflare's much larger network first, Cloudflare can absorb and filter that flood before any of it reaches your one small VPS.

**CDN / edge caching.** A CDN (Content Delivery Network) is a set of servers spread around the world that keep copies of your content close to visitors, so someone far from your VPS doesn't have to wait for a round trip all the way there for things that don't change every request. "Edge caching" is Cloudflare storing those copies at the "edge" server nearest each visitor and serving from there when it can, instead of asking your origin server every time.

**TLS/SSL, HTTPS, and a certificate.** HTTPS is the encrypted version of HTTP (the protocol browsers use to talk to web servers) — it's what puts the padlock in the address bar and stops anyone in between (an ISP, a coffee-shop Wi-Fi network) from reading or altering the traffic. TLS is the encryption technology underneath HTTPS; SSL is its older, retired predecessor, but people still say "SSL" out of habit (this is why Cloudflare's setting is labeled "SSL/TLS"). A certificate is a small signed file that proves "this server really is example.com" — without a valid one, a browser refuses to trust the connection and shows a warning instead of the page.

**Let's Encrypt / "Caddy issues a cert automatically."** Let's Encrypt is a free, automated certificate authority — a service that hands out certificates with no human approval step. Caddy (below) speaks Let's Encrypt's protocol itself: the moment it starts up and sees a domain name in its config, it requests a certificate, proves it controls that domain, installs the certificate, and renews it before expiry — no manual steps, no separate tool like the older `certbot`.

**Reverse proxy (what Caddy does).** A reverse proxy is a single server that sits in front of your other services, receives all incoming web traffic, and forwards each request to whichever internal service should actually handle it — here, either `web:3000` or `api:3001`. It's the only piece that needs to be reachable from the outside internet; everything behind it can stay private. That's also why only Caddy publishes ports 80/443 (see "port," below) — it's the one front door, and every other service can safely have none.

**Docker, a container, an image, Docker Compose.** Docker packages an application together with everything it needs to run (code, runtime, libraries, settings) into a single unit called an image, so it behaves identically on your laptop, a teammate's machine, or this VPS. A container is a running instance of an image — if an image is a recipe, a container is the actual dish made from it, and you can make several containers from the same image. "Build an image" means turning source code into that packaged, runnable unit (a step you do once per version); "run a container" means actually starting a process from that image (something you can do, stop, and redo many times without rebuilding). Docker Compose is a tool for describing and starting a whole group of containers together — Postgres, Redis, the API, and so on — from one config file (`docker-compose.prod.yml`), instead of starting each one by hand with its own long command.

**Port.** A port is a numbered channel on a server that one specific program listens on — like a numbered mailbox at an apartment building, so traffic meant for one resident (program) reaches the right door instead of every door at once. Port 443 is the standard one for HTTPS, 80 for plain HTTP, 5432 for Postgres, and so on. "No published ports" for Postgres/Redis/Meilisearch means Docker never opens those services' mailboxes to the outside world at all — they're reachable only from other containers on the same private Docker network, by service name. That's a deliberate security choice: a database with no publicly reachable port can't be attacked from the open internet no matter how weak its password might be, because there's no door to knock on in the first place.

**Firewall / "allow only 22/80/443."** A firewall is a gatekeeper that blocks all network traffic to a server except the specific ports you explicitly allow through. Allowing only 22 (SSH), 80 (HTTP), and 443 (HTTPS) means those are the only three doors into the server, full stop — everything else is refused outright, shrinking what an attacker could even attempt to connect to (on top of Postgres/Redis/Meilisearch already having no published port at all — see above).

**Environment variable and secret.** An environment variable is a named value handed to a running program from outside its code, so the same code can behave differently in dev vs. production just by changing values — no code edits, no rebuild. A secret is any environment variable whose value must stay private (a password, an API key, a signing key). Secrets are kept out of the code and out of git specifically so that reading the source — which might be shared, reviewed, or eventually leaked — never hands someone your production database password; instead they live only in `.env.production` on the server, a file that's never committed to git.

**Migration.** A migration is a small, versioned script that changes the database's structure (adding a table or column, for example) in a controlled, repeatable, forward-only way, so every environment's database schema stays in sync with what the application code expects.

---

## 1. Gap analysis — what existed vs. what production needs

### What the repo already had

- `docker-compose.yml` (repo root) — **local dev only**. Runs just
  Postgres, Redis, and Meilisearch, each with `ports: - "127.0.0.1:PORT:PORT"`
  (host-only). The Next.js app, the Hono API, and the BullMQ queue worker
  all run **on the host** via `npm run dev` (see root `package.json`) — none
  of them are containerized in dev.
- `worker/Dockerfile` — a bare `python:3.12-slim` image that just copies
  `worker.py` and sets it as `ENTRYPOINT`. It isn't referenced by
  `docker-compose.yml` or by any script; nothing in the repo builds or runs
  it today. It also doesn't match how the worker is actually invoked in
  code: `api/src/lib/pythonRunner.ts` spawns `worker/*.py` as a **subprocess
  of the Node api process** (`execFile`), not as a separate networked
  service — architecture.md is explicit that the worker "is invoked as a
  subprocess by `api/src/queueWorker.ts`, one process per job," never over
  HTTP. `deployment.md`'s gotchas log even names this as an open decision:
  *"either bundle Python into the api image or run api directly on the VPS
  alongside worker's venv"*. This runbook resolves it: **bundle Python into
  the api image** (below) — one container that can run both Node and
  spawn Python subprocesses, matching the existing subprocess architecture
  exactly, with no code changes.
- `.env.example` — dev-only values (`127.0.0.1` hosts, no `_prod` naming).
- No `Caddyfile`, no production compose file, no `.dockerignore`, no
  `Dockerfile` for `api/` or `web/`.

### What was missing and has now been created

| File | Purpose |
| --- | --- |
| `api/Dockerfile` (new) | Node 22 + a Python venv with `worker/requirements.txt` installed, so the api container can spawn `worker/*.py` exactly like it does on a developer's host today. Used by both the `api` and `queue-worker` compose services (same image, different command). |
| `web/Dockerfile` (new) | Node 22 image that runs `next build` + `next start`. `web/next.config.ts` has no `output: "standalone"` configured, so this ships full `node_modules` rather than a trimmed standalone bundle — simpler and correct at this project's scale (see the troubleshooting section for the one gotcha this creates: `NEXT_PUBLIC_*` vars are baked in at build time). |
| `docker-compose.prod.yml` (new) | The production topology: `postgres`, `redis`, `meilisearch` (no published ports), `api`, `queue-worker`, `web`, `caddy` (the only service publishing 80/443). Shown in full below. |
| `Caddyfile` (new) | Reverse proxy + automatic HTTPS. Shown in full below. |
| `.dockerignore` (new) | Keeps `node_modules`, `.git`, `.env*`, `uploads/*`, and Python cruft out of build contexts. |
| `.env.production.example` (new) | Every production env var, grouped, with generation instructions (section 2). |

No existing application code was changed. `docker-compose.yml`, the local
`.env.example`, and `worker/Dockerfile` are untouched.

### Production topology decision

One Docker image (`api/Dockerfile`) is used for **two** compose services:

- `api` — runs `npx tsx api/src/server.ts` (the Hono HTTP server, port 3001).
- `queue-worker` — same image, runs `npx tsx api/src/queueWorker.ts` instead
  (the BullMQ consumer; architecture.md: "a second, separate Node process
  ... it never serves HTTP"). **This must run continuously** — confirmed
  imports enqueue a BullMQ job but nothing drains the queue without it
  (`deployment.md`'s existing note).

Both containers share one bind-mounted `uploads/` directory (the volume
`api/src/lib/pythonRunner.ts`'s spawned Python scripts and the Node process
both need to see the same uploaded Excel files).

Per `architecture.md` invariant 2 ("Postgres, Redis, and Meilisearch are
never exposed publicly ... only Caddy listens on 80/443"): `postgres`,
`redis`, and `meilisearch` have **no `ports:` mapping at all** in the
production file — not even a `127.0.0.1`-bound one. They're reachable only
from other containers on the compose-created `internal` network, by service
name (`postgres`, `redis`, `meilisearch`).

### `docker-compose.prod.yml` (full contents)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks: [internal]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--save", "60", "1", "--loglevel", "warning"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [internal]

  meilisearch:
    image: getmeili/meilisearch:v1.11.0
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: production
    volumes:
      - meilisearch_data:/meili_data
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:7700/health | grep -q 'available'"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks: [internal]

  api:
    build:
      context: .
      dockerfile: api/Dockerfile
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      meilisearch:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3001/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks: [internal]

  # Same image as api, different entrypoint — the BullMQ import consumer
  # (architecture.md: "a second, separate Node process ... never serves
  # HTTP"). Must run continuously for confirmed imports to ever process.
  queue-worker:
    build:
      context: .
      dockerfile: api/Dockerfile
    command: ["npx", "tsx", "api/src/queueWorker.ts"]
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      meilisearch:
        condition: service_healthy
    networks: [internal]

  web:
    build:
      context: .
      dockerfile: web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
        NEXT_PUBLIC_APP_ENV: ${NEXT_PUBLIC_APP_ENV}
        NEXT_PUBLIC_SENTRY_DSN: ${NEXT_PUBLIC_SENTRY_DSN}
        NEXT_PUBLIC_POSTHOG_KEY: ${NEXT_PUBLIC_POSTHOG_KEY}
        NEXT_PUBLIC_POSTHOG_HOST: ${NEXT_PUBLIC_POSTHOG_HOST}
    restart: unless-stopped
    env_file:
      - .env.production
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://localhost:3000/"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks: [internal]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - api
    networks: [internal]

volumes:
  postgres_data:
  redis_data:
  meilisearch_data:
  caddy_data:
  caddy_config:

networks:
  internal:
```

**Why `--env-file` matters here**: Docker Compose auto-loads a file
literally named `.env` for `${...}` substitution inside the compose file
itself. Our production env file is deliberately named `.env.production` (to
never collide with local dev's `.env`), so every single compose command in
this runbook passes `--env-file .env.production` explicitly. Forgetting it
means `${POSTGRES_PASSWORD}` etc. silently resolve to empty strings.

### `Caddyfile` (full contents)

```caddyfile
{
	email admin@example.com
}

# Public site (web/, Next.js) — everything visitors and admins load in a
# browser, including /admin.
example.com, www.example.com {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	reverse_proxy web:3000
}

# API subdomain (api/, Hono) — /api/*, /api/auth/* (Better Auth), /health,
# /health/ready. Kept on its own origin because Better Auth's session
# cookie and the api's CORS config (api/src/app.ts, WEB_URL) already treat
# the web app and the API as two distinct origins.
api.example.com {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
	}

	reverse_proxy api:3001
}
```

Replace `example.com` / `api.example.com` / `admin@example.com` with your
real domain and an email you actually check (Let's Encrypt sends expiry
warnings there, though renewal itself is automatic). Caddy requests and
renews certificates for every domain listed with **zero extra
configuration** — no certbot, no cron job.

A subdomain for the API (`api.example.com`) rather than a path prefix on
the same domain was chosen because the app's CORS and Better Auth config
(`WEB_URL`, `BETTER_AUTH_URL`, `trustedOrigins` in `api/src/lib/auth.ts`)
already model the web app and the API as two distinct origins — a
subdomain matches that with zero app-code changes, where a path-based setup
would require rewriting those origin checks.

---

## 2. Environment variables

Grepped from the codebase (`process.env[...]` / `process.env.X` in
`api/`, `web/`, `shared/`; `os.environ.get(...)` in `worker/`) — not
guessed. A ready-to-fill template is at `.env.production.example`
(repo root).

**Known app bug to route around**: `api/src/lib/meili.ts` reads
`MEILI_HOST`, but `api/src/routes/health.ts`'s `/health/ready` check reads
a *different* variable, `MEILISEARCH_URL`. Nothing else in the app uses
`MEILISEARCH_URL`. This wasn't touched (out of scope — "don't change
existing application code"), but the env template sets **both** to the same
value so `/health/ready` doesn't falsely report Meilisearch as down.

### PostgreSQL

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `POSTGRES_DB` | No | `netija` | Database name. |
| `POSTGRES_USER` | No | `netija` | Database user. |
| `POSTGRES_PASSWORD` | **Yes** | — | Generate: `openssl rand -hex 24` |
| `DATABASE_URL` | **Yes** | `postgresql://netija:<POSTGRES_PASSWORD>@postgres:5432/netija` | Used by `api`, `queue-worker` (Node) and `worker/worker.py` (same container, reads it directly). Note the host is the Compose service name `postgres`, not `127.0.0.1`. |

### Redis

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `REDIS_PASSWORD` | **Yes** | — | Generate: `openssl rand -hex 24`. Passed to the `redis` service's `--requirepass` flag in the compose file — no app code change needed. |
| `REDIS_URL` | **Yes** | `redis://:<REDIS_PASSWORD>@redis:6379` | Used by the api (cache, rate limiting) and BullMQ (`api/src/lib/queue.ts`). |

### Meilisearch

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `MEILI_MASTER_KEY` | **Yes** | — | Generate: `openssl rand -hex 32`. |
| `MEILI_HOST` | No | `http://meilisearch:7700` | Read by `api/src/lib/meili.ts`. |
| `MEILISEARCH_URL` | No | `http://meilisearch:7700` | Read by `api/src/routes/health.ts` only — see the bug note above. Set identically to `MEILI_HOST`. |

### Uploads & worker invocation

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `UPLOADS_DIR` | No | `/app/uploads` | **Must be absolute in production.** The code's own default (`resolve(process.cwd(), '../uploads')`, `api/src/routes/imports.ts`) assumes `api/` as cwd, which is true in local dev but not in this container (cwd is `/app`) — an unset value here would resolve to a nonsense path outside the app entirely. |
| `PYTHON_BIN` | No | `/opt/venv/bin/python3` | Points at the venv `api/Dockerfile` builds, not the system `python3`. |
| `WORKER_DIR` | No | `/app/worker` | Absolute path to the bundled `worker/` package inside the image. |

### Application URLs

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `API_URL` | No | `http://api:3001` | **Internal** — the Next.js server's own fetches to the api go container-to-container over the Docker network, bypassing Caddy/Cloudflare entirely. |
| `NEXT_PUBLIC_API_URL` | No | `https://api.example.com` | **Public** — what the browser calls. Only `NEXT_PUBLIC_*` vars reach the browser (architecture.md invariant 4). **Baked into the web image at build time** (see web/Dockerfile) — changing it needs an image rebuild, not just a restart. |
| `WEB_URL` | No | `https://example.com` | Used by the api for CORS (`api/src/app.ts`) and as one of Better Auth's `trustedOrigins`. |

### Better Auth

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | **Yes** | — | Signs session cookies. Generate: `openssl rand -hex 32`. Rotating it logs out every admin. |
| `BETTER_AUTH_URL` | No | `https://api.example.com` | Canonical auth server URL = the api's public origin. |

### Sentry — external account (sentry.io)

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `SENTRY_DSN` | Sensitive | from Sentry project settings | Server-side: api, web (server/edge runtime, `web/instrumentation.ts`), and `worker/worker.py`. |
| `NEXT_PUBLIC_SENTRY_DSN` | No (DSNs are write-only) | same DSN | Browser-side (`web/instrumentation-client.ts`). |

### PostHog — external account (posthog.com, EU region)

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | from PostHog project settings | Browser-only, anonymous-only per project-overview.md. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://eu.i.posthog.com` | |

### Cloudflare — external account

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | **Yes** | — | Create a **custom** token (Cloudflare dashboard → My Profile → API Tokens): `Zone → Cache Purge → Purge`, scoped to this one zone only — do not use a broader template. |
| `CLOUDFLARE_ZONE_ID` | Sensitive | from your domain's Cloudflare Overview page | `api/src/lib/cloudflare.ts` silently no-ops if either is unset — publish/unpublish still works, it just won't purge Cloudflare's edge cache (relying on the app's own short Cache-Control TTLs instead). |

### Deployment tag

| Variable | Secret? | Example | Notes |
| --- | --- | --- | --- |
| `APP_ENV` | No | `production` | Sentry's `environment` tag; also gates `api/scripts/seed.ts`/`verify-seed.ts` (refuses to run the dev fake-data seeder in production). |
| `NEXT_PUBLIC_APP_ENV` | No | `production` | Browser copy of the same tag, for the browser Sentry SDK. |

### Not stored in `.env.production` at all

`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — consumed once by
`npm run auth:create-admin --workspace=api` to provision the first admin
login. Pass them as one-off `-e` flags on that single command (section 3)
rather than leaving a real admin password sitting in a file on disk
indefinitely.

The full fill-in-the-blanks file is `.env.production.example` at the repo
root.

---

## 3. First deploy, step by step

### 3.1 Create the Hetzner server

*What this does: rents you a VPS — see "Server / VPS" in Concepts above — the always-on computer everything in this runbook ends up running on.*

1. Sign up / log in at [Hetzner Cloud Console](https://console.hetzner.cloud).
2. Create a new project (e.g. "netija").
3. **Add Server**:
   - **Location**: closest European region to Mauritania with good
     connectivity — **Falkenstein (fsn1)** is a sensible default (Hetzner's
     main, cheapest DC). Helsinki (hel1) is a fine alternative.
   - **Image**: Ubuntu 24.04.
   - **Type**: shared vCPU, **CPX31** (4 vCPU / 8 GB RAM / 160 GB NVMe) —
     matches the ~8 GB target. CX32 is a similar Intel-based alternative.
   - **SSH key**: paste your local public key (`cat ~/.ssh/id_ed25519.pub`,
     generate one first with `ssh-keygen -t ed25519` if you don't have one)
     so you never need password SSH login. *(See "SSH keys vs. password
     login" in Concepts above for why this is safer.)*
   - Leave the rest default; create the server.
4. Note the server's public IPv4 address — you'll need it for DNS and SSH.

### 3.2 Point your domain at Cloudflare

*What this does: tells the internet's phone book (DNS — see Concepts above)
that your domain lives on Cloudflare, then tells Cloudflare which server to
actually send visitors to.*

1. Sign up at [Cloudflare](https://dash.cloudflare.com) (free plan is
   enough) and **Add a Site** for your domain.
2. Cloudflare scans existing DNS records, then shows you **two nameservers**
   (e.g. `ns1.cloudflare.com`, `ns2.cloudflare.com`). *(A nameserver is the
   phone book that's authoritative for your domain — see "DNS and
   nameservers" in Concepts above.)*
3. At your **domain registrar** (wherever you bought the domain), replace
   its nameservers with the two Cloudflare gave you. This is what actually
   moves DNS control to Cloudflare — it can take a few minutes to 24 hours
   to propagate.
4. Once Cloudflare shows the zone as "Active", go to **DNS → Records** and
   add: *(an A record maps a name to a server IP — see "DNS record,
   specifically an A record" in Concepts above)*
   - `A` record, name `@` (the bare domain), content = your server's IP,
     **Proxy status: Proxied** (orange cloud). This is what gives you
     Cloudflare's DDoS protection and edge caching — traffic hits
     Cloudflare first, then Cloudflare forwards it to your server. *(See
     "Proxied vs. DNS only" in Concepts above for what the orange/grey
     cloud toggle actually changes.)*
   - `A` record, name `www`, same IP, Proxied.
   - `A` record, name `api`, same IP, Proxied.
5. **SSL/TLS → Overview**: set the encryption mode to **Full (strict)**.
   This requires your origin server (Caddy) to present a valid certificate
   — which it will, automatically, once step 3.5 is running. *(TLS/SSL,
   HTTPS, and certificates are explained in Concepts above if those words
   are new.)* Do **not** use "Flexible" mode: it makes Cloudflare talk
   plain HTTP to your server, which conflicts with Caddy's automatic HTTPS
   redirects and causes redirect loops.

### 3.3 Harden the server

*What this does: locks the front door — switches SSH to key-only login
(see "SSH keys vs. password login" in Concepts above) and closes every
network port except the three you actually need (see "Firewall" in
Concepts above), before Docker or the app go anywhere near this box.*

SSH in as root the first time:

```bash
ssh root@<server-ip>
```

Create a non-root user with sudo access and copy your SSH key to it:

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Disable root login and password auth (key-only from here on). Edit
`/etc/ssh/sshd_config`:

```bash
sudo nano /etc/ssh/sshd_config
```

Set (or uncomment) these two lines:

```
PermitRootLogin no
PasswordAuthentication no
```

Apply it, then open a **second** terminal and confirm `ssh deploy@<server-ip>`
still works **before** closing your root session (so you're never locked
out):

```bash
sudo systemctl restart ssh
```

Firewall — only SSH, HTTP, HTTPS: *(`ufw` is Ubuntu's firewall tool — see
"Firewall" and "Port" in Concepts above. This closes every door except
port 22 for SSH, 80 for HTTP, and 443 for HTTPS.)*

```bash
sudo apt update && sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Install Docker + the Compose plugin (official convenience script). *(Docker,
images, containers, and Compose are explained in Concepts above — this
installs the engine that will build and run every service in this
runbook.)*

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker deploy
```

Log out and back in (`exit`, then `ssh deploy@<server-ip>` again) so the
`docker` group membership takes effect, then confirm:

```bash
docker --version
docker compose version
```

From here on, everything runs as `deploy`, never `root`.

### 3.4 Get the code onto the server, place the env file

```bash
git clone <your-repo-url> /home/deploy/netija
cd /home/deploy/netija
```

Copy `.env.production` from your local machine (fill in
`.env.production.example` locally first — never type secrets directly on
the server's shell history if you can avoid it). *(See "Environment
variable and secret" in Concepts above for why these live in a file kept
off git rather than in the code.)*

```bash
# from your LOCAL machine:
scp .env.production deploy@<server-ip>:/home/deploy/netija/.env.production
```

Lock it down on the server:

```bash
chmod 600 /home/deploy/netija/.env.production
```

`uploads/` already exists in the repo (tracked via `uploads/.gitkeep`,
contents gitignored) — this is the bind-mounted volume both `api` and
`queue-worker` share.

### 3.5 Bring up the stack

Infra first, so `api`/`queue-worker`/`web` have something healthy to
depend on:

```bash
cd /home/deploy/netija
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d postgres redis meilisearch
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Wait until all three show `healthy`, then build the application images.
*("Build an image" turns the source code into the packaged, runnable unit
described under "Docker, a container, an image, Docker Compose" in
Concepts above — it doesn't start anything yet, it just prepares what will
be started.)*

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

Run migrations (see 3.6), seed the admin account (see 3.7), **then** start
everything else:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

**How Caddy gets HTTPS**: as soon as the `caddy` container starts and reads
`Caddyfile`, it requests a certificate from Let's Encrypt for each domain
listed, using the HTTP-01 challenge on port 80 (which Cloudflare proxies
through to your server even when orange-clouded). This happens
automatically — no action needed. *(See "Let's Encrypt" and "Reverse
proxy" in Concepts above — Caddy is the reverse proxy, and this is the
"issues a cert automatically" part.)* Check it worked:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy | grep -i certificate
```

### 3.6 Run database migrations

*(One-sentence definition of "migration" in Concepts above, if you haven't
hit the term before.)*

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm api npm run db:migrate --workspace=api
```

This runs `drizzle-kit migrate` with cwd set to `api/` (npm sets that
automatically for `--workspace=api` scripts), so it resolves
`api/drizzle/` exactly like local dev does. Safe to re-run — already-applied
migrations are skipped.

**The migration-journal-guard caveat** (documented in
`context/tracker/deployment.md`'s gotchas log): `drizzle-orm`'s migrator
decides what to apply by comparing each journal entry's `when` timestamp
against `MAX(created_at)` already recorded in the DB — it does **not**
check migration content hashes. If a new migration's `when` timestamp ever
ends up *earlier* than an already-applied one's (possible if migrations
were generated across machines with clock drift), it gets **silently
skipped** while `drizzle-kit` still prints success. `npm run db:generate`
already runs a guard for this locally (`db:check-journal`) before a
migration is ever committed, so a migration reaching `main` should already
be safe — but if `/health/ready` or the app ever behaves as though a
migration you know landed on `main` didn't apply, check
`api/drizzle/meta/_journal.json`'s `when` values are strictly increasing.
Never hand-edit those timestamps; `npm run db:fix-journal` (run locally,
not on the server) clamps them correctly and keeps
`drizzle.__drizzle_migrations` in sync.

### 3.7 Seed the admin account

Pick a real email and a strong password, then run this **once** — it's
idempotent (exits 0 if the account already exists) but there's no reason to
leave the password in your shell history longer than needed:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm \
  -e ADMIN_EMAIL='admin@example.com' \
  -e ADMIN_PASSWORD='choose-a-strong-password-here' \
  -e ADMIN_NAME='Admin' \
  api npm run auth:create-admin --workspace=api
```

### 3.8 Verify

```bash
# api liveness/readiness
curl -s https://api.example.com/health
curl -s https://api.example.com/health/ready

# HTTPS actually works, no cert warnings
curl -vI https://example.com 2>&1 | grep -E "SSL|HTTP/"

# Postgres/Redis/Meilisearch must NOT be reachable from outside —
# run these from your LOCAL machine, not the server. All three should
# hang/timeout or refuse, never connect:
nc -zv -w3 <server-ip> 5432
nc -zv -w3 <server-ip> 6379
nc -zv -w3 <server-ip> 7700
```

`/health/ready` should return `{"postgres":true,"redis":true,"meilisearch":true}`
with HTTP 200. If `meilisearch` shows `false` despite Meilisearch clearly
working (e.g. name search returns results on the site), see the
`MEILI_HOST`/`MEILISEARCH_URL` note in section 2 — you likely only set one
of the two.

### 3.9 UptimeRobot

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free plan: 50
   monitors, 5-minute interval).
2. **Add New Monitor** → HTTP(s) → URL `https://api.example.com/health` —
   this is the liveness endpoint (`api/src/routes/health.ts`: "never
   throws"), so it's the right one for a simple up/down check rather than
   `/health/ready` (which can legitimately 503 during a brief dependency
   blip and would page you for something self-healing).
3. Add a second monitor for `https://example.com` (the public homepage) so
   you're also alerted if Caddy or the `web` container itself is down even
   though the api is fine.
4. Set up an alert contact (email, or Slack/Telegram if you want faster
   notice) under **My Settings**.

### 3.10 Backups

**Hetzner snapshots** (whole-disk, good for "server is completely broken,
restore everything"): Hetzner Cloud Console → your server → **Backups**
tab → enable automatic backups (adds ~20% to the server's monthly cost,
gives you 7 rolling daily snapshots). For extra safety before any risky
change (major dependency bump, Postgres version change), also take a
manual snapshot: **Snapshots** tab → Create Snapshot.

**Nightly `pg_dump`** (logical backup, good for "restore just the data,
inspect a specific table, or migrate to a new server"). Create a small
script on the server:

```bash
mkdir -p /home/deploy/backups
cat > /home/deploy/backups/backup-db.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
cd /home/deploy/netija
STAMP=$(date +%F)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U netija netija | gzip \
  > /home/deploy/backups/netija-"$STAMP".sql.gz
# keep the last 14 days locally
find /home/deploy/backups -name 'netija-*.sql.gz' -mtime +14 -delete
SCRIPT
chmod +x /home/deploy/backups/backup-db.sh
```

Schedule it at 03:00 (matches `deployment.md`'s cron table):

```bash
crontab -e
```

Add:

```
0 3 * * * /home/deploy/backups/backup-db.sh >> /home/deploy/backups/backup.log 2>&1
```

This keeps dumps **on the server**, which doesn't protect you if the whole
VPS is lost. For genuine off-server backup, copy `/home/deploy/backups/` to
somewhere else on a schedule too — e.g. a Hetzner Storage Box or any
object storage, via `rclone` or `rsync`; exact target is up to you, but
don't skip this step, since a disk-level Hetzner incident would otherwise
take out both the live DB and its backups together.

---

## 4. Ongoing deploy flow — "I changed code, ship it"

Per `context/tracker/git-conventions.md`: production deploys only from
annotated tags cut from a verified `main`, never from a branch directly.

### Standard flow

1. **Locally**: work on `task/<n>-<name>` or `fix/<name>`, open a PR, get
   it merged to `main` (squash forbidden per git-conventions.md — use a
   merge commit). CI green.
2. **Locally**, cut a tag from the verified `main`:
   ```bash
   git checkout main && git pull
   git tag -a v1.5.0 -m "short description of what shipped"
   git push origin v1.5.0
   ```
3. **On the server**:
   ```bash
   cd /home/deploy/netija
   git fetch --tags
   git checkout v1.5.0
   ```
4. **See what actually changed**, to know what needs rebuilding/migrating:
   ```bash
   git diff --stat <previous-tag> v1.5.0
   ```
5. **Rebuild the images for whatever changed.** It's always safe (just
   slower) to rebuild everything:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml build
   ```
   Or scope it — e.g. only `web/` changed:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml build web
   ```
6. **Run migrations if `api/drizzle/` gained a new file** (safe to run even
   if nothing changed — already-applied migrations are skipped):
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml \
     run --rm api npm run db:migrate --workspace=api
   ```
   Run this **before** the next step, so the new code never talks to a
   schema it doesn't expect yet.
7. **Recreate the containers whose image changed:**
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d
   ```
   (Compose only recreates containers whose image or config actually
   changed — this is safe to run every time.)
8. **Verify:**
   ```bash
   curl -s https://api.example.com/health/ready
   curl -I https://example.com
   docker compose --env-file .env.production -f docker-compose.prod.yml ps
   ```

### A change that adds a new environment variable

1. Add it to `api/`/`web/`/`worker/` code (already done, since that's what
   prompted this).
2. Add it to `.env.production.example` in the repo (per `deployment.md`'s
   own rule: *"a PR that adds an env var without updating this file and
   `.env.example` is incomplete"* — same applies to the production
   template).
3. On the **server**, edit `.env.production` directly (`nano
   .env.production`) and add the real value.
4. If it's a `NEXT_PUBLIC_*` variable, also add it to `docker-compose.prod.yml`'s
   `web.build.args` block and `web/Dockerfile`'s `ARG`/`ENV` lines — it
   needs to reach the build, not just the running container (see section 2
   and the troubleshooting entry below).
5. Rebuild the affected service(s) and `up -d` as in the standard flow —
   `env_file:` changes alone don't trigger a container recreate, so if you
   only edited `.env.production` and nothing else, force it:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate api queue-worker web
   ```

### A change that adds a new migration

Covered by step 6 of the standard flow — just don't skip it. Migrations are
**forward-only** (architecture.md invariant 8); there's no automatic
down-migration, so if a deploy needs rolling back *and* it included a
migration, rolling back the application code does **not** undo the schema
change. Treat a bad migration as its own incident, not something "rollback"
fixes for free.

### A change that adds a new dependency

Node (`package.json`/`package-lock.json`) or Python
(`worker/requirements.txt`) — no extra step. Both Dockerfiles `COPY` the
manifest files and run `npm ci` / `pip install` as an explicit build layer,
so a plain `build` (step 5 above) picks up the change automatically. Just
don't skip the build step and assume `up -d` alone is enough — without a
rebuild, the container still has the old image.

### Rolling back

```bash
cd /home/deploy/netija
git fetch --tags
git checkout <previous-good-tag>
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Per git-conventions.md: *"if production misbehaves, redeploy the previous
tag first, diagnose second."* This redeploys the previous tag's code
against the **current** database — fine for a bad code deploy, but if the
bad deploy's migration also needs undoing, that's a manual, deliberate SQL
fix, not something this rollback does for you (see above).

### Results-day note

Per `project-overview.md`'s release flow: results day is for **uploading
the new exam-year Excel file**, not for shipping code. Don't deploy code
changes on or immediately before results day — the only thing that should
change production that day is the data (uploaded as unpublished, verified
by the automated smoke check, then published). Land and verify any code
changes well ahead of time; if something code-related is genuinely broken
close to results day, prefer the smallest possible hotfix over a bundled
release.

---

## 5. Troubleshooting

**Caddy isn't getting a certificate / `https://` shows a cert error**
- `docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy`
  — look for ACME/challenge errors.
- Confirm DNS actually resolves to this server: `dig +short example.com`
  should show your server's IP (or Cloudflare's proxy IPs, if proxied).
- Confirm port 80 is reachable from the internet: `sudo ufw status` must
  show `80/tcp ALLOW`, and Cloudflare's SSL/TLS mode must be **Full
  (strict)**, not "Flexible" (see section 3.2).
- If it still fails, temporarily set the DNS record to **DNS only** (grey
  cloud, not orange) in Cloudflare, wait a minute, retry — this rules out
  Cloudflare interfering with the HTTP-01 challenge. Re-enable the orange
  cloud once the cert is issued (Caddy caches it and won't need to
  re-request for ~60 days).

**A service won't start**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs <service>
```
- `api`/`queue-worker` exiting immediately almost always means a missing
  required env var — `api/src/lib/redis.ts`, `queue.ts`, and
  `api/src/lib/auth.ts` all `throw` synchronously at import time if
  `REDIS_URL` or `BETTER_AUTH_SECRET` is unset.
- `web` failing to boot after a successful build usually means a runtime
  env var it expects is missing — check `docker compose ... exec web env`
  against section 2's table.

**Out of memory during a large import**
- `docker stats` while an import runs — pandas loading a 50k-row Excel file
  is memory-hungry. On an 8 GB box this is normally fine, but if you see
  the `queue-worker` container get OOM-killed (`docker compose ... logs
  queue-worker` ending abruptly, `docker inspect <container> --format
  '{{.State.OOMKilled}}'` showing `true`), add swap as a safety margin:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- The import is resumable/safe either way — architecture.md invariant 12:
  a killed import rolls back to zero rows for that run, it never leaves
  partial data.

**A migration seems to have been skipped**
- See the migration-journal-guard caveat in section 3.6. Check
  `api/drizzle/meta/_journal.json` (in the checked-out tag on the server)
  for non-increasing `when` values.
- Confirm what's actually applied:
  ```bash
  docker compose --env-file .env.production -f docker-compose.prod.yml \
    exec postgres psql -U netija -d netija -c \
    "select * from drizzle.__drizzle_migrations order by created_at;"
  ```

**I changed a `NEXT_PUBLIC_*` value and nothing changed on the site**
- Expected — see section 2. `NEXT_PUBLIC_*` vars are compiled into the
  browser bundle at **image build time** (`web/Dockerfile`'s `ARG`/`ENV`
  block), not read at container start. Update `.env.production`, then
  rebuild `web` specifically:
  ```bash
  docker compose --env-file .env.production -f docker-compose.prod.yml build web
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d web
  ```

**`/health/ready` reports Meilisearch down but search works fine on the site**
- The `MEILI_HOST` vs. `MEILISEARCH_URL` app inconsistency documented in
  section 2 — confirm both are set in `.env.production` to the same value
  (`http://meilisearch:7700`).

**Forgot `--env-file .env.production` on a command**
- Compose silently substitutes empty strings for every `${VAR}` and (for
  `postgres`/`redis`/`meilisearch`) can fail health checks or start
  services with blank passwords. If a command's output looks like
  variables just didn't apply, this is almost always why — re-run with the
  flag. Consider a shell alias to make it hard to forget:
  ```bash
  alias dcp='docker compose --env-file /home/deploy/netija/.env.production -f /home/deploy/netija/docker-compose.prod.yml'
  ```
