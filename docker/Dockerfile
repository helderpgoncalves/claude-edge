# syntax=docker/dockerfile:1.7

# Bridge server image.
#
# Multi-stage so the runtime layer carries no compiler, no source, and no dev
# dependencies. The result is a small image whose contents are entirely things
# that run in production.
#
# tmux is installed in the runtime stage because the bridge shells out to it.
# In the normal deployment the container talks to a tmux socket bind-mounted
# from the host, where the developer's real Claude Code session lives — the
# container does not run Claude Code itself.

# ------------------------------------------------------------------ base
FROM node:22-alpine AS base

# corepack ships with Node and pins pnpm to the version in package.json, so the
# image cannot silently build with a different package manager than the repo.
RUN corepack enable

WORKDIR /app

# ------------------------------------------------------------------ deps
# Dependencies are installed from lockfile-only inputs, so this layer is reused
# across source edits — the difference between a 3-second and a 60-second build.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ----------------------------------------------------------------- build
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server

# Compiles both packages. tsc fails the build on any type error, so an image
# that exists is an image that typechecked.
RUN pnpm --filter @claude-edge/shared build && \
    pnpm --filter @claude-edge/server build

# Drop dev dependencies now that nothing further needs to compile.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod

# --------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime

# tmux is the whole point of this service; without it the bridge starts and
# then fails its own health check.
RUN apk add --no-cache tmux tini

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app

# Run as a non-root user. The bridge's job is to type into a terminal running an
# AI agent with tool access; there is no version of this where root is warranted.
RUN addgroup -g 10001 -S bridge && \
    adduser -u 10001 -S bridge -G bridge

COPY --from=build --chown=bridge:bridge /app/node_modules ./node_modules
COPY --from=build --chown=bridge:bridge /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=bridge:bridge /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=bridge:bridge /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=bridge:bridge /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=bridge:bridge /app/packages/server/package.json ./packages/server/
COPY --from=build --chown=bridge:bridge /app/packages/server/node_modules ./packages/server/node_modules
COPY --chown=bridge:bridge package.json ./

USER bridge

EXPOSE 8787

# tini reaps the short-lived tmux processes the bridge spawns on every poll.
# Without it they accumulate as zombies until the container hits its PID limit —
# which, at one poll every two seconds, takes hours rather than days.
ENTRYPOINT ["/sbin/tini", "--"]

# The health check hits the one unauthenticated endpoint, so the orchestrator
# does not need a credential to know whether the service is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
