# Architecture

## Process model

One **game-server process** does three jobs:

* serves the REST API (Fastify)
* accepts WebSockets on `/ws` (`ws`, attached to the same HTTP server)
* runs every room it owns on a single 20 Hz loop (`RoomManager.tickAll`), with drift compensation

Optionally it also serves the built web client (`SERVE_WEB=true`), so a small deployment is just one container.

```
apps/server/src
├─ index.ts              boot + graceful shutdown
├─ app.ts                wiring: config → store → directory → voice → manager → HTTP → gateway
├─ config.ts             env parsing + production guards
├─ api/routes.ts         /api/health, /config, /auth/*, /me, /rooms, /matchmake, /public-rooms
├─ ws/gateway.ts         upgrade, origin check, per-IP connect limits, hello handshake, zod validation,
│                        per-socket token bucket, heartbeat RTT, failed-join limiter
├─ rooms/RoomManager.ts  room lifecycle, code reservation, directory publishing, quick match, empty-room GC
├─ rooms/GameRoom.ts     the authoritative match (state machine, all game systems, per-recipient state)
├─ authentication/       HMAC session tokens, scrypt password hashing
├─ database/store.ts     Store interface → PrismaStore (PostgreSQL) | MemoryStore
├─ matchmaking/          RoomDirectory → RedisDirectory | MemoryDirectory
├─ security/             token buckets, chat sanitising/moderation, spam guard
└─ voice/livekit.ts      token issuing with per-mode grants, participant removal
```

## Shared rules (`packages/shared`)

| Module | Contents |
|---|---|
| `map.ts` | Nexus HQ rooms, doors (lockable), furniture, interaction stations, vents, CCTV zones and spawns. Generates the tile grid and thin-wall colliders. |
| `physics.ts` | Spatial collider index, circle-vs-box collision with sliding, `stepMovement` (acceleration and speed clamping), line of sight, screen→iso input mapping |
| `tasks.ts` | 10 puzzle generators (public `data` + private `key`), verifiers, the power-panel puzzle, and `solveFromData` (bots and tests solve from public data only) |
| `rules.ts` | role assignment, balance limits, vote tally, deterministic win evaluation, settings sanitising, start validation |
| `protocol.ts` | zod schemas for every client message + typed server messages |
| `types.ts` | phases and the legal transition table, appearance catalogue, settings |
| `nav.ts` | A* pathfinding (bots, load tests, map reachability tests) |

The client imports the same `stepMovement` and colliders as the server, so local prediction only diverges because of timing, never because of different rules.

## Match state machine

```
WAITING ─start─▶ STARTING (3 s) ─▶ ROLE_REVEAL (5 s) ─▶ ACTIVE ─report/button─▶ MEETING_INTRO (3.5 s)
   ▲                                                       │                          │
   │                                                       │ win                      ▼
RETURNING_TO_LOBBY ◀─ host / 60 s ─ GAME_OVER ◀───────────┴─── VOTE_RESULTS ◀─ VOTING ◀─ DISCUSSION
```

`PHASE_TRANSITIONS` in `packages/shared/src/types.ts` lists every legal edge. `GameRoom.setPhase` refuses (and logs) any other transition, and each message handler checks the phase before doing anything.

## Tick order (per room, every 50 ms)

1. **Movement.** Each player's queued inputs are processed through a movement budget: one step per tick, with a burst of 4. A flooding or speed-hacking client cannot go faster than real time, and excess inputs are dropped.
2. **Timers.** Critical sabotage expiry is checked first. Then door unlocks, then phase timers.
3. **Repairs.** Hold progress and the two-person server-core synchronisation.
4. **Task leashes.** A task window closes if its player walks away.
5. **Disconnect grace.** Players disconnected for longer than 45 s (20 s in the lobby) are removed, and the win condition is re-evaluated.
6. **Snapshots.** Each recipient gets their own snapshot: visible players, visible incidents, their own authoritative position plus the last acknowledged input.
7. **State.** A full per-recipient state message is sent whenever something changed (dirty flag).
8. **Voice gains** (every 250 ms) and **CCTV feeds** (every 200 ms, to viewers only).

## Networking model

* **Client → server:** `input {seq, mx, my}` every 50 ms while moving, plus discrete intents (`interact`, `taskSubmit`, `kill`, `report`, `vote`, `chat`, …).
* **Server → client:** `snap` at 20 Hz (about 5 kB/s per client measured), `state` on change, and events (`elim`, `ventFx`, `taskOpen`, `notice`, `chat`, …).
* **Local player:** fixed-step prediction at the server's tick rate. On every snapshot the client starts from the authoritative position, replays the inputs the server hasn't acknowledged yet, and eases out any small error over about 90 ms. Teleports (meetings, passages) snap instantly.
* **Remote players:** a 110 ms interpolation buffer, reset on teleports, so latency doesn't make characters jump.
* **Reliability:** WebSocket (TCP). Reconnection retries with backoff inside the 45 s grace window. The server keeps the player record, so a reconnecting player gets the same role, tasks and position. A second connection with the same identity replaces the first.

## Visibility and hidden information

* **Roles:** your own; fellow managers' roles if you are a manager; everyone's at `GAME_OVER`. Nothing else.
* **Deaths:** living players only learn about deaths when a meeting starts (`deathKnown`). Ghosts and spectators see the true state.
* **Positions:** a living viewer only receives players inside their vision radius *and* line of sight (opaque walls block, glass doesn't). Ghosts are visible only to ghosts and spectators. Players in a passage are visible to nobody.
* **Elimination and vent animations** are sent only to players who could see that spot.
* **Votes:** before results, clients only see *who* has voted. Individual choices appear at results unless anonymous voting is on.

## Rendering (client)

* All art is procedural: Canvas2D draws the floor (a single large texture), the thin wall segments and about 40 furniture types. Identical pieces share one texture (deduplicated cache), and each piece is a Phaser image.
* **Depth sorting:** painter's algorithm keyed on each object's iso footprint centre (`x + y`). Large objects are built from near-square parts so sorting stays correct.
* **Occlusion:** walls and tall furniture that sit in front of and overlap the local player fade to 28%.
* **Characters:** per-appearance sprite sheets (42 frames: idle, walk, work, ghost, cheer, sad × 2 facings), drawn by the same Canvas2D routine that renders the UI avatars.
* **Vision:** an elliptical soft mask texture plus four screen fills follow the player. The power-cut sabotage shrinks it for employees.
* **Environment animation:** blinking server LEDs, monitor glows, coffee steam, flickering neon, a pulsing emergency button, alarm beacons and door lock barriers.
* **React and Phaser are decoupled.** High-frequency snapshots go straight to the scene, never through React state. The HUD reads context actions from a tiny store that the scene updates about 10 times per second.

## Scaling

* **One instance:** capacity is measured in [TESTING.md](TESTING.md). 50 rooms (500 clients) used about 21% of one core.
* **Horizontal:** run N instances with `REDIS_URL` and a distinct public `INSTANCE_URL` each.
  * Room codes are reserved with `SET NX` in Redis, so they are unique across instances.
  * Rooms publish listings with a TTL.
  * `GET /api/rooms/:code` and `POST /api/matchmake` return the owning instance's URL, and the client connects there directly. A room always lives on exactly one instance, so no cross-instance state sync is needed.
* Put each instance behind its own hostname (for example `game-1.example.com`). Alternatively, route `/ws?instance=` through a sticky load balancer.
* LiveKit scales independently (LiveKit Cloud, or a LiveKit cluster backed by Redis).
