# Production image for the Next.js app. next.config.ts has no
# `output: "standalone"` configured, so this ships full node_modules and
# runs `next start` rather than a trimmed standalone server — simpler and
# correct for this project's scale (single VPS, one web replica).
#
# IMPORTANT — build-time vs runtime env:
# Next.js inlines every NEXT_PUBLIC_* variable into the browser bundle at
# BUILD time, not at container start. docker-compose.prod.yml passes them
# as build `args` (sourced from .env.production via `docker compose
# --env-file`), so changing a NEXT_PUBLIC_* value requires rebuilding this
# image, not just restarting the container (see the runbook's
# troubleshooting section).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
RUN npm ci

COPY web web
COPY shared shared

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NODE_ENV=production

RUN npm run build --workspace=web

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=web"]
