# syntax=docker/dockerfile:1.7
# Images for the backend workspaces. Build from the repo root:
#
#   docker build --build-arg APP=api    -t uptime-watch-api .
#   docker build --build-arg APP=worker -t uptime-watch-worker .
#   docker build --build-arg APP=pusher -t uptime-watch-pusher .
#   docker build --build-arg APP=store --build-arg APP_DIR=packages/store \
#                --target migrate -t uptime-watch-migrate .
#
# A service image holds one bundled file: `bun build` keeps only the code the
# service imports, so the Prisma CLI and other dev tools (over 1 GB) stay out.
ARG BUN_VERSION=1.4.2

# 1. Cut the monorepo down to APP and the workspace packages it imports.
FROM oven/bun:${BUN_VERSION}-slim AS prune
WORKDIR /repo
COPY . .
ARG APP
RUN bunx turbo@2.11.7 prune "${APP}" --docker --out-dir /out

# 2. Install from the pruned package.json files and lockfile first, so this
#    layer is reused until a dependency changes; then add the sources and
#    bundle the service.
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY --from=prune /out/json/ ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts
COPY --from=prune /out/full/ ./
ARG APP
ARG APP_DIR=apps/${APP}
RUN bun build "${APP_DIR}/index.ts" --target=bun --sourcemap=linked --outdir /dist

# 3a. The database migration job: needs the Prisma CLI and packages/store,
#     so it keeps node_modules. `prisma db update` rewrites
#     migrations/app/refs, so that folder belongs to the bun user.
FROM build AS migrate
ENV NODE_ENV=production
WORKDIR /app/packages/store
RUN chown -R bun:bun migrations
USER bun
CMD ["bun", "run", "migrate"]

# 3b. api, worker, pusher (the default target): the bundle and nothing else.
FROM oven/bun:${BUN_VERSION}-slim AS service
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /dist/ ./
USER bun
CMD ["bun", "index.js"]
