# Corporate Sus — single image: authoritative game server + built web client.
# Build from the repository root:  docker build -f infrastructure/docker/Dockerfile -t corporate-sus .

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
RUN npm ci --ignore-scripts && npx prisma generate --schema apps/server/prisma/schema.prisma
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=2567 \
    HOST=0.0.0.0 \
    SERVE_WEB=true
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
  && groupadd -r corp && useradd -r -g corp corp
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
RUN npm ci --omit=dev --ignore-scripts -w @corp/server \
  && npm i --no-save prisma@6 \
  && npx prisma generate --schema apps/server/prisma/schema.prisma \
  && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY infrastructure/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R corp:corp /app
USER corp
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
