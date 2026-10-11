# CORPORATE SUS

> **Trust Nobody. Especially Management.**

Corporate Sus is a 2.5D isometric, real-time multiplayer social-deduction game for 4–10 players, played in the browser. Everyone works at **Nexus HQ**, a very well-funded tech startup. Most players are **Employees** who complete corporate minigames and try to expose the **Toxic Managers** hiding among them. The managers fake work, sabotage the office, sneak through maintenance passages and "terminate" coworkers in cartoon, non-violent ways (a giant PERFORMANCE REVIEW stamp, an endless HR training video, and so on).

The repository holds the complete game: an authoritative multiplayer server, the isometric Phaser client, ten real minigames, seven sabotages, meetings with voting, ghosts and spectators, matchmaking, accounts, proximity voice over LiveKit, plus tests, load tests and deployment configuration.

---

## Contents

1. [Project overview](#1-project-overview)
2. [Architecture summary](#2-architecture-summary)
3. [Technology stack](#3-technology-stack)
4. [Prerequisites](#4-prerequisites)
5. [Installation](#5-installation)
6. [Environment variables](#6-environment-variables)
7. [Database setup](#7-database-setup)
8. [Development commands](#8-development-commands)
9. [Running the multiplayer server](#9-running-the-multiplayer-server)
10. [Running the frontend](#10-running-the-frontend)
11. [Running Redis and PostgreSQL](#11-running-redis-and-postgresql)
12. [Configuring voice infrastructure](#12-configuring-voice-infrastructure)
13. [Running automated tests](#13-running-automated-tests)
14. [Building for production](#14-building-for-production)
15. [Docker deployment](#15-docker-deployment)
16. [Game rules](#16-game-rules)
17. [Controls](#17-controls)
18. [Host settings](#18-host-settings)
19. [Troubleshooting](#19-troubleshooting)
20. [Known limitations](#20-known-limitations)
21. [Feature checklist & verification status](#21-feature-checklist--verification-status)

More detail lives in [`docs/`](docs): [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [testing and load results](docs/TESTING.md), [game rules and edge cases](docs/GAME_RULES.md), and [security](docs/SECURITY.md).

---

## 1. Project overview

| | |
|---|---|
| Genre | Online multiplayer social deduction |
| Players | 4–10 per match (1 Toxic Manager for 4–6 players, 2 for 7–10; the host can adjust within balance limits) |
| Platform | Desktop browsers (Chrome, Edge, Firefox, Safari). No install. |
| Map | **Nexus HQ**: 12 areas (Reception, Open Workspace, Conference Room, HR, CEO Cabin, Cafeteria, Gaming Room, Server Room, IT Support, Printer & Storage, Security Office, Maintenance & Electrical) plus two hallways |
| Match length | About 5–12 minutes |

**A match, start to finish:** create or join a room, customise your character, mark ready, and the host starts. Roles are revealed privately. Employees complete tasks. Managers fake tasks, sabotage and eliminate. Incidents get reported to HR, an emergency meeting is called, players discuss in chat and voice, then vote. The terminated player is revealed (if the host allows it) and play resumes until one team wins. After the results screen, players can rematch from the same lobby.

## 2. Architecture summary

```
 Browser (React UI + Phaser 2.5D renderer)                Game server (Node.js, single process per instance)
 ┌───────────────────────────────────────┐   WebSocket   ┌──────────────────────────────────────────────┐
 │ UI (React, Zustand)  minigames, HUD   │◀────/ws──────▶│ Gateway: auth handshake, zod validation,     │
 │ Phaser scene: iso world, prediction,  │   JSON 20 Hz  │ per-socket rate limiting                     │
 │   interpolation, vision, occlusion    │               │ RoomManager ─▶ GameRoom × N (20 Hz tick)     │
 │ WebAudio synth (all SFX + music)      │   REST /api   │   state machine · physics · tasks · sabotage │
 │ LiveKit client (opt-in voice)         │◀─────────────▶│   meetings · voting · visibility filtering   │
 └──────────────┬────────────────────────┘               │ Fastify API: guest/accounts, rooms, matchmake│
                │ WebRTC (voice only)                     └───────┬──────────────┬──────────────┬────────┘
        ┌───────▼────────┐                                ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼──────┐
        │ LiveKit server │◀── server-issued tokens / ─────│ PostgreSQL │  │   Redis    │  │  LiveKit    │
        │  (SFU + TURN)  │    participant removal         │ (Prisma)   │  │ (optional) │  │  server API │
        └────────────────┘                                └────────────┘  └────────────┘  └─────────────┘
```

* **Authoritative server.** Every rule is decided on the server: movement and collision, task verification, eliminations, sabotage, meetings, votes and win conditions. Clients only send *intents* (movement direction, "interact with station X", "vote for Y").
* **Shared rules package.** `packages/shared` holds the map, collision physics, task puzzle generators and verifiers, the vote tally, win evaluation and the network protocol schemas. Both server and client import it, so client-side prediction uses exactly the same movement code as the server.
* **Per-recipient state.** The server builds a separate state message for each player. Roles go only to authorised players. Other players' positions are filtered by vision radius and line of sight, so the client never receives what its player cannot see.
* **Persistence boundary.** Live rooms exist only in server memory. PostgreSQL stores accounts, profiles, match history, stats and moderation reports. Redis is an optional room directory that lets several server instances share room codes and Quick Match.

Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Repository layout

```
corporate-sus/
├─ apps/
│  ├─ server/            Node game server (Fastify + ws), Prisma schema & migrations
│  │  └─ src/{api,authentication,database,matchmaking,rooms,security,voice,ws}
│  └─ web/               React + Vite + Phaser client
│     └─ src/{game,ui,ui/minigames,pages,components,stores,networking,audio,voice,hooks,styles}
├─ packages/shared/      map, physics, rules, tasks, protocol (single source of truth)
├─ tests/
│  ├─ unit/              rules, map/physics, all 10 puzzle generators/verifiers
│  ├─ multiplayer/       deterministic GameRoom simulation (fake clock)
│  ├─ integration/       real sockets/HTTP, PostgreSQL, Redis multi-instance
│  ├─ e2e/               Playwright: all minigames, full match, voice, accounts, visual tour
│  ├─ load/              load generator + measured results
│  └─ support/           protocol bot, bot "brain", in-process room harness
├─ infrastructure/docker Dockerfile, docker-compose, Caddyfile, livekit.yaml
├─ infrastructure/deployment  fly.toml example
├─ scripts/              dev runner, play-test bots, production smoke test
└─ docs/
```

## 3. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 (strict) | npm workspaces monorepo |
| Client UI | React 19, Zustand 5, Tailwind CSS 4, Vite 7 | |
| Renderer | Phaser 3.90 (WebGL) | Procedural Canvas2D art baked into textures |
| Server | Node 22, Fastify 5, `ws` 8 | **Custom authoritative rooms instead of Colyseus**: the game needs strict per-recipient state filtering (hidden roles, vision-limited positions). A small purpose-built room runtime made that simpler and easier to verify. |
| Validation | zod 4 | Every client message is schema-validated |
| Database | PostgreSQL + Prisma 6 | Falls back to an in-memory store when `DATABASE_URL` is unset (dev/tests) |
| Coordination | Redis (ioredis 5) | Optional; enables multi-instance room codes and matchmaking |
| Voice | LiveKit (WebRTC SFU) via `livekit-server-sdk` / `livekit-client` | Optional; the game is fully playable without it |
| Audio | Web Audio API | Every sound and music track is synthesised at runtime (original, no samples) |
| Tests | Vitest 5, Playwright 1.64 | |
| Deploy | Docker, Docker Compose, Caddy (automatic HTTPS) | |

## 4. Prerequisites

**Required:** Node.js ≥ 20.11 (developed on 22) and npm ≥ 10.

**Optional:**

* **PostgreSQL 14+.** Needed for persistent accounts and stats. Without it, accounts live in memory until the server restarts.
* **Redis 6+.** Only needed when you run more than one game-server instance.
* **LiveKit server** (self-hosted) or a **LiveKit Cloud** project. Only needed for voice chat.
* **Docker** + Docker Compose, for container deployment.

## 5. Installation

```bash
git clone <your-fork-url> corporate-sus && cd corporate-sus
```

```bash
npm install
```

```bash
cp .env.example .env
```

`npm install` also runs `prisma generate`.

## 6. Environment variables

All variables are read by the game server. The web client has **no secrets**: it talks to its own origin (`/api`, `/ws`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `2567` | HTTP + WebSocket port |
| `HOST` | no | `0.0.0.0` | Bind address |
| `NODE_ENV` | prod | `development` | `production` enables Origin checks, strict CORS and secret validation |
| `PUBLIC_ORIGIN` | prod | `http://localhost:5173` | Allowed browser origin(s), comma-separated |
| `SESSION_SECRET` | **prod** | dev fallback | HMAC key for session tokens (≥ 32 random chars; the server refuses to start in production without one) |
| `DATABASE_URL` | no | – | PostgreSQL URL; unset means in-memory store |
| `REDIS_URL` | no | – | Enables the Redis room directory |
| `INSTANCE_URL` | multi-instance | – | Public base URL of *this* instance (Quick Match redirects) |
| `LIVEKIT_URL` | voice | – | `wss://…` URL of LiveKit |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | voice | – | LiveKit credentials (server-side only) |
| `SERVE_WEB` | no | `false` | Serve the built client from the game server (single-container deploys) |
| `ENABLE_TEST_HOOKS` | tests only | `false` | Enables forced roles, teleport and fast-forward for automated tests; **refused in production** |
| `RATE_LIMIT_SCALE` | load tests | `1` | Multiplies per-IP limits so one machine can simulate hundreds of clients |

See [`.env.example`](.env.example). Never commit a real `.env`.

## 7. Database setup

```bash
createdb corporate_sus
```

Set `DATABASE_URL=postgresql://USER@localhost:5432/corporate_sus` in `.env`. Prisma commands read `DATABASE_URL` from the environment, so export it (or prefix the command) when running them. Apply migrations:

```bash
DATABASE_URL=postgresql://USER@localhost:5432/corporate_sus npm run db:deploy
```

During development, after changing `apps/server/prisma/schema.prisma`, create a new migration with `npm run db:migrate` (with `DATABASE_URL` set the same way).

Schema (in `apps/server/prisma/schema.prisma`): `User`, `Session` (stores only the SHA-256 of the session id), `Profile`, `PlayerStats`, `Match`, `MatchPlayer`, `Report`. Live room state never touches the database.

## 8. Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Server (`:2567`, auto-reload) + Vite client (`:5173`) together |
| `npm run dev:server` / `npm run dev:web` | Each on its own |
| `npm run bots -- <CODE> 3` | Adds 3 autonomous bots to a room, so one person can play-test a full match (`--aggressive` makes bot managers sabotage and eliminate) |
| `npm test` | Unit + simulation + integration tests (Vitest) |
| `npm run test:e2e` | Browser end-to-end tests (Playwright) |
| `npm run loadtest -- --rooms 10 --players 10 --seconds 30` | Load test |
| `npm run typecheck` / `npm run lint` / `npm run format` | Quality gates |
| `npm run build` | Production build (server bundle + static client) |

Dev-only helpers: `/?gallery` opens a minigame gallery for visual QA. `/?forceLoop=1` keeps rendering in background tabs, which automation needs.

## 9. Running the multiplayer server

```bash
npm run dev:server
```

Check it with `curl localhost:2567/api/health`. In production, run `npm start` after `npm run build`.

## 10. Running the frontend

```bash
npm run dev:web
```

Open http://localhost:5173. Vite proxies `/api` and `/ws` to `GAME_SERVER_URL` (default `http://localhost:2567`). To test multiplayer on one machine, open several tabs: each tab is a separate guest identity, and refreshing a tab reconnects you as the same player.

## 11. Running Redis and PostgreSQL

Pick whichever setup you prefer.

```bash
brew install postgresql@16 redis && brew services start postgresql@16 && brew services start redis
```

```bash
docker run -d --name cs-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
```

```bash
docker run -d --name cs-redis -p 6379:6379 redis:7-alpine
```

Then set `DATABASE_URL` and (optionally) `REDIS_URL` in `.env`. At startup the server logs which store, directory and voice backends it is using.

## 12. Configuring voice infrastructure

Voice is optional. Without it, players see a clear "Voice unavailable" status and text meetings work normally.

**Local development** (the same setup the automated voice test uses):

```bash
brew install livekit
```

```bash
livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1
```

Then add the dev credentials to `.env`:

```
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

**Production:** use either LiveKit Cloud (paste the project URL, key and secret) or the self-hosted `livekit` service in `infrastructure/docker`. TURN/UDP requirements are covered in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#voice-turn--network).

**How voice is enforced:**

* The server issues every voice token. Living players and the lobby can only join `<CODE>-main`. Eliminated players can only join `<CODE>-ghost`. Spectators can only *listen* to the ghost room.
* When someone is eliminated or terminated, the server removes them from the living room through LiveKit's server API. Muting their microphone in the client is not what separates ghosts from the living.
* Proximity uses per-speaker gains that the server computes from authoritative positions: full volume within 1.5 units, fading to silence at 5 units, muffled through walls. During meetings every living player hears every other living player at full volume.
* The microphone is requested only when you press **Join**. Push-to-talk (**V**) is the default, and open-mic is available. Nothing is recorded.

## 13. Running automated tests

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` runs unit, simulation and integration tests. The PostgreSQL and Redis suites skip automatically when those services are unreachable; set `TEST_DATABASE_URL` and `TEST_REDIS_URL` to run them. `npm run test:e2e` boots its own server on `:2600` and client on `:5190`.

The voice e2e test needs a LiveKit server at `ws://127.0.0.1:7880`. Set `E2E_NO_VOICE=1` to skip it, and run with `VISUAL_TOUR=1` to capture screenshots of every screen into `test-results/tour`.

**Latest results on the development machine** (macOS, Apple M-series, Node 22):

| Suite | Result |
|---|---|
| Vitest: unit, room simulation, real-socket integration, PostgreSQL, Redis | **109 passed** (PostgreSQL and Redis suites ran against local services) |
| Playwright: 10 minigames played through the UI | **10/10 passed** |
| Playwright: full browser match (lobby → roles → UI task → elimination → report → chat → vote → ejection → victory → rematch), refresh-reconnect, invalid code | **3/3 passed** |
| Playwright: real LiveKit voice (2 browsers, fake mics; proximity gains, ghost removal and room change) | **1/1 passed** |
| Playwright: registration / login / logout UI | **1/1 passed** |

Load results are in [docs/TESTING.md](docs/TESTING.md#load-testing-measured).

## 14. Building for production

```bash
npm run build
```

This produces `apps/server/dist/index.js` (one ESM bundle that includes the shared package) and `apps/web/dist` (static client). The client is code-split, so Phaser and LiveKit are only downloaded when needed (initial JS is about 150 kB gzipped).

```bash
NODE_ENV=production SERVE_WEB=true PUBLIC_ORIGIN=https://your.domain SESSION_SECRET=$(openssl rand -hex 32) DATABASE_URL=postgresql://… npm start
```

To smoke-test the running server with headless Chromium:

```bash
node scripts/smoke.mjs https://your.domain
```

## 15. Docker deployment

```bash
cp .env.example .env
```

In `.env`, set `PUBLIC_DOMAIN`, `SESSION_SECRET`, `POSTGRES_PASSWORD` and the LiveKit keys. Then start the stack:

```bash
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d --build
```

The stack contains the game server (which also serves the client and runs migrations at startup), PostgreSQL, Redis, LiveKit and Caddy (automatic HTTPS and the WebSocket proxy). For a cheaper setup, remove the `livekit` service and use LiveKit Cloud.

> **Not verified here:** Docker was not available on the development machine, so the image and compose stack have not been built or run. Their individual steps (production build, `prisma migrate deploy`, serving the client from the server, health check) were each exercised outside Docker. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting options, costs, TURN setup and scaling.

## 16. Game rules

* **Teams:** Employees and Toxic Managers. Managers know who the other managers are (red nameplates); Employees don't.
* **Employees win** when every assigned task is completed (ghost Employees count too) **or** every Toxic Manager has been voted out or left.
* **Managers win** when the number of living managers is equal to or greater than the number of living employees, **or** a critical sabotage (Fire Alarm or Server Meltdown) runs out.
* If several conditions become true in the same tick, the server resolves them deterministically: critical sabotage, then managers gone, then parity, then tasks.
* **Eliminations:** default range 1.5 units, 30 s cooldown, line of sight required, both players alive, not inside a passage, during active play only. The victim leaves a reportable **incident marker**, becomes a ghost, and nobody else learns who did it.
* **Meetings:** report an incident (within 2.2 units) or press the emergency button (1 per player by default, not during critical sabotage). Discussion (60 s) is followed by voting (45 s). A unique plurality terminates that player; ties and a leading skip terminate nobody. Votes are hidden until the tally.
* **Sabotages:** Wi-Fi (network tasks offline), Fire Alarm (critical: reset two panels), Power Cut (employee vision shrinks), Lock Conference Room (12 s, override in Security), Server Meltdown (critical: two players hold both cores at the same time), CCTV Offline, and Company-wide Outage (all electronic stations blocked until three terminals are restored; no countdown). Only one system sabotage can run at a time, each has a cooldown, and meetings clear all of them.
* **Maintenance passages:** three linked networks, managers only. Anyone who can see the hatch sees the entry/exit puff.
* **Ghosts** walk through walls, finish their tasks and chat only with other ghosts. **Spectators** (late joiners) can follow players or use a free camera but cannot act, and they never see roles before the match ends.

Full rules, the disconnect policy and edge cases: [docs/GAME_RULES.md](docs/GAME_RULES.md).

## 17. Controls

| Key | Action |
|---|---|
| W A S D / arrow keys | Move (screen-relative: up always moves up the screen) |
| E | Use / do task / repair / cameras / vent |
| R | Report incident |
| Q | Terminate (managers) |
| F | Sabotage menu (managers) |
| Tab | Office map |
| V (hold) | Push-to-talk |
| Esc | Close the current window / open Settings |
| Mouse | Minigames, voting, UI. The wheel zooms. |

Every key can be rebound in **Settings → Controls**. Settings also include master, music, SFX and voice volume, mute-all, reduced motion (no flashing, shake or big animations), graphics quality and microphone selection.

## 18. Host settings

Max players (4–10) · Toxic Managers (auto, or 1–3 within balance limits) · tasks per player (1–6) · elimination cooldown (10–60 s) · elimination range (short/normal/long) · player speed (0.75–1.5×) · discussion time (0–180 s) · voting time (15–180 s) · anonymous votes · reveal role on termination · employee vision · manager vision · sabotage cooldown · emergency meetings per player (0–5) · public/private.

The server clamps every value. Only the host can change settings, and only in the lobby. If the host leaves, the next connected player becomes host. The host can remove players from the lobby.

## 19. Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the office server" | Make sure the server is running (`npm run dev:server`) and port `2567` is free. In dev, Vite proxies to it. |
| Stuck on "Badging in…" the first time | Vite is optimising dependencies on first load; it reloads once by itself. |
| Port 5173 already in use | Run `npm run dev -w @corp/web -- --port 5180`. |
| "Your session has expired" | The server's `SESSION_SECRET` changed. Refreshing gets you a new guest identity. |
| Voice shows "unavailable" | `LIVEKIT_*` is not set on the server, or LiveKit is unreachable. The game still works. |
| Voice connects but nobody is heard | Distance matters: get within about 5 units, or wait for a meeting. Check that you haven't muted the player. On real networks, configure TURN ([docs](docs/DEPLOYMENT.md#voice-turn--network)). |
| "Mic blocked" | Allow microphone access for the site in the browser's address bar, then press Join again. |
| "The office server restarted…" | Live rooms live in memory; create a new room. |
| Game doesn't animate in a background tab | Browsers pause rendering in hidden tabs. The network keeps running and the game catches up when you return. |
| Wrong DB errors at startup | Run `npm run db:deploy` with `DATABASE_URL` set. |

## 20. Known limitations

* **Docker and the compose stack are untested** (no Docker on the build machine). Hosted LiveKit Cloud, real TURN traversal across NATs, and HTTPS through Caddy have not been exercised either. Voice was verified against a local `livekit-server --dev`.
* **Browsers:** automated and manual testing used Chromium (Playwright and the in-app browser). Firefox, Safari and Edge use only standard APIs (WebGL, Web Audio, WebRTC, Pointer Events) but were **not tested**.
* **Proximity attenuation is client-applied.** The server decides who may join which voice room (ghost and living separation is enforced). Distance volume is a server-computed gain that the client applies, so a modified client inside the living room could ignore distance falloff.
* **Load numbers** come from a single laptop that also ran the load generator (see [docs/TESTING.md](docs/TESTING.md)). Capacity on smaller cloud VMs will differ.
* **Moderation** is basic: a profanity mask, spam and rate limits, mute and report. Reports are stored in the database, but there is no admin dashboard yet.
* **Match statistics** are persisted for registered players only (guests are anonymous).
* **Art:** characters have front and back facings (mirrored for left and right). Long furniture can show minor depth-sort artifacts at some angles.
* **Multi-instance:** Redis matchmaking across instances was tested with two in-process instances. Cross-instance redirects require each instance to be publicly reachable at its `INSTANCE_URL`.
* **One map** (Nexus HQ). Mobile and touch controls are not implemented, although input is abstracted so they could be added.
* **Recovery:** a server restart ends live matches. Clients show a clear message and return to the menu.

## 21. Feature checklist & verification status

✅ = implemented and verified by automated tests and/or in a real browser · ⚠️ = implemented, partially verified · ❌ = not done

| Feature | Status | How it was verified |
|---|---|---|
| Application starts (dev + production build) | ✅ | dev servers, `npm run build`, production smoke test |
| 2.5D isometric office renders | ✅ | browser screenshots of every room (visual tour) |
| Character movement / animations / collision | ✅ | physics unit tests, simulation, browser |
| Create / join rooms, room codes, invite links | ✅ | integration + e2e |
| Multiplayer sync (server-authoritative, prediction, interpolation) | ✅ | integration (two clients see movement), e2e |
| 4–10 players | ✅ | simulation (8 and 10), load test (10 per room) |
| Private role assignment, no role leaks | ✅ | simulation (raw JSON inspected), integration |
| Employee tasks: all 10 minigames playable | ✅ | 10 Playwright UI tests + generator/verifier unit tests |
| Fake tasks award nothing | ✅ | simulation + integration |
| Eliminations (validated range, LoS, cooldown) | ✅ | simulation + e2e |
| All 7 sabotages + recovery | ✅ | simulation tests for each |
| Secret passages | ✅ | simulation |
| Reporting / emergency meetings | ✅ | simulation + e2e |
| Real-time meeting chat (rate limits, moderation) | ✅ | integration + e2e |
| Voting, tally rules, results, ejection screen | ✅ | unit + simulation + e2e |
| Ghost mode (tasks, wall pass, isolation) | ✅ | simulation + integration |
| Spectator mode | ✅ | simulation + integration |
| Employee / manager victory, game-over stats, rematch | ✅ | simulation + integration + e2e |
| Public matchmaking (Quick Match, auto-start) | ✅ | integration (memory + Redis multi-instance) |
| Guest play | ✅ | everywhere |
| Registered accounts, profiles, stats, deletion | ✅ | integration (memory + PostgreSQL), e2e UI |
| Voice chat when configured | ✅ | Playwright + local LiveKit (fake media) |
| Ghost / living voice permissions enforced server-side | ✅ | voice e2e (LiveKit participant lists) |
| Reconnection, duplicate-identity replacement, refresh | ✅ | integration + e2e |
| Security validations (authz, rate limits, forged tokens, brute force) | ✅ | integration + simulation |
| Audio (synth SFX, music, ambience, settings) | ⚠️ | implemented; checked in browser, not asserted by tests |
| Accessibility (reduced motion, key remap, focus rings, contrast) | ⚠️ | implemented; manual check only |
| Docker / compose / Caddy deployment | ⚠️ | files written; **not built or run** |
| Firefox / Safari / Edge | ⚠️ | not tested |

---

All characters, art, map, UI, dialogue, music and sound effects are original and generated procedurally in code. No external images or audio are hot-linked at runtime; the only runtime-loaded external resource is Google Fonts.
