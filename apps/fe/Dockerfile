# syntax=docker/dockerfile:1.7
# The Next.js frontend. Build from the repo root:
#
#   docker build -f apps/fe/Dockerfile -t uptime-watch-fe .
#
# The browser calls /api/*, which Next forwards to API_URL. Rewrites are fixed
# at build time, so API_URL is a build argument: by default the `api` Service
# in the same Kubernetes namespace.
ARG BUN_VERSION=1.4.2

# 1. Cut the monorepo down to fe and the workspace packages it imports.
FROM oven/bun:${BUN_VERSION}-slim AS prune
WORKDIR /repo
COPY . .
RUN bunx turbo@2.11.7 prune fe --docker --out-dir /out

# 2. Install (reused until a dependency changes), then build.
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY --from=prune /out/json/ ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ ./
ARG API_URL=http://api:3000
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
RUN cd apps/fe && bun run build

# 3. Runtime: Next's standalone server plus its static files, on Node.
#    Server-rendered pages (the public status page) also call API_URL.
FROM node:24-alpine
ARG API_URL=http://api:3000
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 API_URL=${API_URL}
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/fe/.next/standalone/ ./
COPY --from=build --chown=node:node /app/apps/fe/.next/static/ ./apps/fe/.next/static/
COPY --from=build --chown=node:node /app/apps/fe/public/ ./apps/fe/public/
USER node
EXPOSE 3000
CMD ["node", "apps/fe/server.js"]
