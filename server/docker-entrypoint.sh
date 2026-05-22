#!/bin/sh
# Container entrypoint.
#
# When a Litestream replica is configured:
#   1. restore the database from the replica if the local file is missing
#      (i.e. a fresh container / new volume), then
#   2. run the app under `litestream replicate` so the live database is
#      continuously streamed to object storage.
#
# When no replica is configured (local Docker, CI) the app just runs directly.
set -e

: "${WUD_DB:=/data/wud.db}"
export WUD_DB

if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  if [ ! -f "$WUD_DB" ]; then
    echo "[entrypoint] local database missing — restoring from Litestream replica"
    litestream restore -if-replica-exists "$WUD_DB"
  fi
  echo "[entrypoint] starting app under Litestream replication"
  exec litestream replicate -exec "node dist/index.js"
else
  echo "[entrypoint] no LITESTREAM_REPLICA_URL set — running without replication"
  exec node dist/index.js
fi
