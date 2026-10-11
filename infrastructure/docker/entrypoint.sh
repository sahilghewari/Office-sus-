#!/bin/sh
# Applies pending database migrations (if a database is configured), then starts the server.
set -e
if [ -n "$DATABASE_URL" ] && [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "[corp-sus] applying database migrations…"
  npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
fi
exec node apps/server/dist/index.js
