# syntax=docker/dockerfile:1
#
# WUD backend — multi-stage production image.
#  • build stage:   installs all deps, compiles TypeScript, prunes dev deps.
#  • runtime stage: slim glibc image with Litestream + the compiled app only.
#
# better-sqlite3 is a native module; it is built once in the build stage and
# the resulting node_modules (with the compiled binary) is copied forward, so
# the runtime image needs no compilers and no network at boot.

# --- build stage ----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Toolchain for compiling native modules if no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- runtime stage --------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WUD_DB=/data/wud.db

# Litestream — streaming SQLite backup/replication (pinned version).
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && wget -qO /tmp/litestream.tar.gz \
       "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" \
    && tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz \
    && rm /tmp/litestream.tar.gz \
    && apt-get purge -y wget && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Compiled app + production node_modules (native binary already built).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Persistent database volume — must outlive container restarts/deploys.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data

USER node
EXPOSE 4000

# Readiness probe — fails the container if the DB stops answering.
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
