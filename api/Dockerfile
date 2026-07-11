# Production image for the api service AND the queue-worker service —
# both run this exact image, just with a different `command:` in
# docker-compose.prod.yml (see architecture.md: queueWorker.ts is "a
# second, separate Node process ... not part of the Hono app").
#
# The api process spawns worker/*.py as a subprocess (api/src/lib/
# pythonRunner.ts) rather than calling it over the network, so this image
# bundles a real Python interpreter + worker/'s dependencies alongside
# Node — the "bundle Python into the api image" option deployment.md left
# open. worker/Dockerfile (a bare python:3.12-slim ENTRYPOINT) is NOT used
# in production for this reason; it's unused tooling, kept as-is.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install JS deps first for Docker layer caching. npm workspaces need every
# workspace's package.json present before `npm ci` can resolve the tree,
# even though this image only ever runs api/'s code.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
RUN npm ci

# Python deps in an isolated venv — Debian 12's system Python is externally
# managed (PEP 668), so a bare `pip install` is refused.
COPY worker/requirements.txt worker/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r worker/requirements.txt

COPY api api
COPY shared shared
COPY worker worker

# api/'s "build" script is only `tsc --noEmit` (typecheck, no compiled
# output) — the app is designed to run directly via tsx in every
# environment, so this image ships tsx/typescript (devDependencies) and
# runs source directly rather than a compiled dist/.
ENV NODE_ENV=production \
    PYTHON_BIN=/opt/venv/bin/python3 \
    WORKER_DIR=/app/worker \
    UPLOADS_DIR=/app/uploads \
    PORT=3001

RUN mkdir -p /app/uploads

EXPOSE 3001

# Overridden to `npx tsx api/src/queueWorker.ts` for the queue-worker
# service in docker-compose.prod.yml.
CMD ["npx", "tsx", "api/src/server.ts"]
