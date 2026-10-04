# docmost-extensions image.
#
# Mirrors the upstream docmost/docmost Dockerfile (same base image, pnpm
# version, runtime pruning, user, volume and CMD) so the running container
# behaves exactly like the official image. The one difference is the builder
# stage: instead of COPYing a checkout, it assembles the source tree from
#   upstream tag (UPSTREAM_VERSION) + extensions/ overlay + patches/
# using the same scripts/build-tree.sh that is used locally.
#
# Railway: point the service at this repo; the Dockerfile at the root is
# detected automatically, no build args are required.

FROM node:26-slim AS base

RUN npm install -g pnpm@11.28.2

# ---------------------------------------------------------------------------
# builder: fetch upstream, apply overlay + patches, build everything
# ---------------------------------------------------------------------------
FROM base AS builder

# git + CA certificates are only needed here to fetch the upstream tag.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY UPSTREAM_VERSION ./
COPY scripts ./scripts
COPY extensions ./extensions
COPY patches ./patches

# Optional override: docker build --build-arg UPSTREAM_VERSION=v0.97.0 .
# When unset, scripts/build-tree.sh reads the UPSTREAM_VERSION file.
ARG UPSTREAM_VERSION
RUN ./scripts/build-tree.sh /app

WORKDIR /app

RUN pnpm install --frozen-lockfile
RUN pnpm build

# ---------------------------------------------------------------------------
# installer: identical to upstream from here on
# ---------------------------------------------------------------------------
FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

# drop npm and corepack
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -rf /usr/local/lib/node_modules/corepack \
  && rm -rf /usr/local/bin/npm \
  && rm -rf /usr/local/bin/npx \
  && rm -rf /usr/local/bin/corepack \
  && rm -rf /root/.npm \
  && rm -rf /root/.node-gyp

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json
COPY --from=builder /app/packages/base-formula/dist /app/packages/base-formula/dist
COPY --from=builder /app/packages/base-formula/package.json /app/packages/base-formula/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN chown -R node:node /app

USER node

RUN pnpm install --frozen-lockfile --prod && rm -rf /home/node/.cache/pnpm

RUN mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]
