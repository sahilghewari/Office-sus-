# Deployment

The first launch is free-to-play for friends and small groups, so the default target is **one small VM** running the whole stack with Docker Compose. Every piece can later be moved to managed services without changing the code.

> ⚠️ **Verification status.** Docker was not available on the development machine, so `infrastructure/docker/*` has not been built or run. Each step those files perform was exercised directly: `npm run build`, `prisma migrate deploy`, `SERVE_WEB=true` production server, the `/api/health` check and the headless smoke test. Treat the first container deploy as a shakedown.

## What has to run

| Component | Must be persistent? | Notes |
|---|---|---|
| Game server (Node) | **Yes, a long-running process** | Holds live rooms in memory and keeps WebSockets open. Static hosting and serverless functions **cannot** run it. |
| Web client | static files | Served by the game server (`SERVE_WEB=true`) or any CDN. Same origin is simplest (no CORS, cookies or WS origin issues). |
| PostgreSQL | yes | Accounts, stats, matches, reports. Small: a few MB for thousands of players. |
| Redis | optional | Only for more than one game-server instance. |
| LiveKit | optional | Voice. Self-host it next to the game, or use LiveKit Cloud. |
| Reverse proxy | yes (HTTPS) | Caddy, with automatic Let's Encrypt and WebSocket proxying. |

## Option A: single VM with Docker Compose (recommended start)

1. Create a VM (2 vCPU / 2–4 GB is plenty; see the load results). Point `play.example.com` and `turn.example.com` A-records at it.
2. Open these ports: `80`, `443` (TCP + UDP), LiveKit `7881/tcp`, `3478/udp`, `5349/tcp`, `50000-50200/udp`.
3. Copy the env template:

   ```bash
   cp .env.example .env
   ```

   Then set `PUBLIC_DOMAIN=play.example.com`, `SESSION_SECRET=$(openssl rand -hex 32)`, `POSTGRES_PASSWORD=…`, `LIVEKIT_API_KEY=…` and `LIVEKIT_API_SECRET=…` (the key is any id; the secret should be ≥ 32 random characters).
4. Edit `infrastructure/docker/livekit.yaml` and set `turn.domain` to `turn.example.com`.
5. Start the stack:

   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d --build
   ```

6. Check it:

   ```bash
   curl https://play.example.com/api/health
   ```

   ```bash
   node scripts/smoke.mjs https://play.example.com
   ```

Migrations run automatically when the game container starts (`prisma migrate deploy` in `entrypoint.sh`). To skip them, set `SKIP_MIGRATIONS=true`.

## Option B: managed pieces (no VM to babysit)

* **Game server:** any platform that runs a persistent container with WebSockets, for example Fly.io (see `infrastructure/deployment/fly.toml`), Railway, Render (paid instance types; free tiers sleep) or a DigitalOcean App. Run **one** instance until you add Redis.
* **PostgreSQL:** Neon, Supabase, Render or Fly Postgres. Set `DATABASE_URL`.
* **Voice:** LiveKit Cloud. Set `LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. LiveKit Cloud provides TURN, so there is no UDP setup on your side.
* **Redis:** Upstash or similar. Only needed for multiple instances.

## Environment checklist (production)

* `NODE_ENV=production`: enables WebSocket Origin checks, strict CORS and secret validation.
* `PUBLIC_ORIGIN=https://play.example.com`: must exactly match the browser origin.
* `SESSION_SECRET`: ≥ 32 random characters. **Changing it logs everyone out.**
* `SERVE_WEB=true`, if the game server also serves the client.
* `ENABLE_TEST_HOOKS` must stay unset (the server refuses to start with it in production).
* `RATE_LIMIT_SCALE` should be left at 1.
* `TRUST_PROXY`: set it to match what sits in front of the server (next section).

## Client IPs behind a proxy

Every per-IP limit (HTTP rate limits, WebSocket connects, failed room joins) keys on the client IP, so the server must not believe a forged `X-Forwarded-For`. `TRUST_PROXY` says which source to use:

| Setup | Value | Why |
|---|---|---|
| Direct, or `npm run host` (LAN) | unset / `false` | No proxy: the socket address is the client. |
| Docker Compose with Caddy | `1` | Caddy overwrites `X-Forwarded-For` with the real peer. |
| Render | `1` | Render's proxy appends the client to `X-Forwarded-For`; earlier entries can be forged. |
| Fly.io | `header:Fly-Client-IP` | fly-proxy sets this header itself. |
| Your own chain of N proxies that each append | `N` | The client is N entries from the right. |

`true` is rejected on purpose: trusting every hop means using the leftmost entry, which the client chooses.

The server logs its choice at startup (`Client IPs from: …`). Platforms change, so check after deploying. Send a few requests with a forged header and confirm they are still limited together:

```bash
for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "X-Forwarded-For: 10.0.0.$i" https://your-app.example.com/api/auth/login -H 'content-type: application/json' -d '{"username":"nobody","password":"x"}'; done
```

The last two should be `429` (login allows 10 per minute). If every request returns `401`, the forged header is being trusted: lower the hop count or switch to a platform header.

## Database migrations

* On deploy: the container runs `prisma migrate deploy` on start. To do it by hand:

  ```bash
  DATABASE_URL=… npm run db:deploy
  ```

* When changing the schema: run `npm run db:migrate` locally (with `DATABASE_URL` set), commit the generated `apps/server/prisma/migrations/*`, and deploy.
* Backups: use daily `pg_dump`, or your provider's point-in-time recovery.

## Voice: TURN & network

WebRTC needs a media path between players and LiveKit:

* **Self-hosted LiveKit** needs UDP `50000-50200` (media) and TCP `7881` (fallback) reachable from the internet, with `rtc.use_external_ip: true` on a VM that has a public IP.
* Many corporate or school networks block UDP, so enable LiveKit's **built-in TURN** (`turn.enabled: true`). Give it a DNS name (`turn.example.com`) and expose `3478/udp` and `5349/tcp`. For TURN/TLS, provide a certificate (`turn.cert_file`/`key_file`), or put TURN/TLS on 443 behind a layer-4 proxy.
* The Caddyfile proxies LiveKit **signalling** at `/livekit`. Media does not go through Caddy.
* LiveKit Cloud handles all of this for you.

## Health & monitoring

* `GET /api/health` reports: liveness, room and player counts, DB health, directory and voice backends, tick timing (average and maximum ms; the budget is 50 ms) and RSS. Point your uptime monitor at it (the Docker `HEALTHCHECK` already does).
* What to watch:
  * `tick.maxMs` > 25 means the instance is getting busy. Add instances (Redis) or a bigger VM.
  * Memory growth over days.
  * WebSocket error and close rates at the proxy.
  * PostgreSQL connections.
  * LiveKit room and participant metrics (its dashboard or Prometheus endpoint).
* Logs: the server writes structured-ish lines prefixed `[corp-sus]` (room created/closed, match results, rejected invalid phase transitions, handler errors). Ship container stdout to your log service (Loki, Better Stack, CloudWatch, …).
* Recommended alerts: health check failing for more than 1 minute, `tick.maxMs` above 40 for more than 5 minutes, DB unhealthy, 5xx rate above 1%.

## Scaling out

1. Add Redis (`REDIS_URL`) to every instance.
2. Give each instance its own public hostname and set `INSTANCE_URL` (for example `https://game-2.example.com`).
3. Players can hit any instance: room codes are unique cluster-wide, and `/api/rooms/:code` and `/api/matchmake` return the owning instance, which the client connects to directly. One room always lives on one process, so there is no shared game state to synchronise.
4. Scale LiveKit separately (LiveKit Cloud, or a LiveKit cluster with Redis).

## Estimated running costs (verify current pricing)

Prices change. These are rough, order-of-magnitude figures for small usage, as of the author's knowledge; check each provider before you commit.

| Item | Typical small-scale option | Rough monthly cost |
|---|---|---|
| VM running everything (2 vCPU / 4 GB) | Hetzner, DigitalOcean, Linode, … | ~$5–25 |
| Managed Postgres (tiny) | Neon / Supabase free tiers, or small paid plans | $0–20 |
| Redis (only when multi-instance) | Upstash free tier, or a small paid plan | $0–10 |
| Voice | Self-hosted on the same VM: bandwidth only. LiveKit Cloud: free developer tier, then usage-based per participant-minute | $0 → usage-based |
| Domain + TLS | Any registrar; Let's Encrypt via Caddy is free | ~$1 |

Voice is usually the largest variable cost once traffic grows: audio is about 30–50 kbps per published track, multiplied by listeners. Proximity limits keep the number of effectively audible streams small, but the SFU still forwards them.
