# Testing

## Suites

| Suite | Location | What it proves |
|---|---|---|
| Unit | `tests/unit` | Role distribution and balance limits; vote tally (plurality, ties, skip, ineligible voters); win priority under simultaneous conditions; settings sanitising; legal phase transitions; map integrity (every station, vent and spawn on free floor, in its declared room, and reachable by A*); walls block, doors pass; speed clamping; smooth acceleration and stopping; NaN-safe input; line of sight (walls block, glass doesn't); **all 10 puzzles**: 60 seeds each accepted by the key **and** solvable from public data only, malformed and wrong answers rejected, starting state randomised |
| Room simulation | `tests/multiplayer` | A real `GameRoom` driven by a fake clock and fake sockets: private roles (raw JSON checked for leaks), manager teammates, employee task win, fake tasks award nothing, too-fast and wrong submissions rejected, proximity enforced, elimination → ghost → report → chat isolation → vote → ejection → win, simultaneous reports, tie → no ejection with tasks preserved, emergency-meeting limits, parity win, unauthorised actions (employee kill/sabotage/vent, kill through a wall, non-host settings), speed hacks, walking to a station with real inputs, **every sabotage and its repair**, critical expiry, door lock with push-out (no softlock), meeting clears sabotage, vents, ghost tasks/wall pass/visibility/chat, reconnect, duplicate identity, host transfer, spectators, two consecutive matches with no stale state, reports, chat rate limiting and spam |
| Real-socket integration | `tests/integration/network.test.ts` | A real Fastify + `ws` server: health/config; auth (register, login, logout, delete, duplicate names, weak passwords, hashed storage, forged tokens); WebSocket rejection of bad tokens, codes, versions, garbage and unsafe names; position sync between clients; a **complete 4-player match won by tasks (bots walk A* paths at 20 Hz and solve real puzzles)**; elimination → report → chat → vote → termination → second match; reconnect restores role and tasks; spectators; Quick Match; flood resilience; code brute-force rate limiting |
| Infrastructure | `tests/integration/infra.test.ts` | PostgreSQL via Prisma (users, sessions, profiles, matches, stats, reports, cascading deletes); Redis directory with **two server instances** (unique codes, cross-instance Quick Match and code lookup) |
| Browser E2E | `tests/e2e` | Playwright + Chromium against the real dev servers: all 10 minigames played through their UI; full match flow with a real browser host plus protocol bots; refresh-reconnect; invalid code; accounts UI; **voice through a real LiveKit server** with fake microphones |

Running the suites:

```bash
npm test
```

```bash
TEST_DATABASE_URL=postgresql://user@localhost:5432/corporate_sus_test TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
```

```bash
npm run test:e2e
```

```bash
E2E_NO_VOICE=1 npm run test:e2e
```

```bash
VISUAL_TOUR=1 npx playwright test tests/e2e/visual-tour.spec.ts
```

The second command also runs the PostgreSQL and Redis suites. The fourth skips the LiveKit test. The last writes screenshots of every screen to `test-results/tour`.

**Test hooks** (`ENABLE_TEST_HOOKS=true`, refused in production) let automated tests force roles, teleport and fast-forward cooldowns. All game *validation* still runs: hooks never complete tasks, bypass votes or skip checks.

## Latest results (development machine)

* Vitest: **109 passed** across 6 files (unit 63, simulation 32, network 12, infra 2), with PostgreSQL and Redis available locally.
* Playwright: **16 passed**. That is 10 minigames, 3 match/refresh/invalid-code tests, 1 accounts test and 1 LiveKit voice test, plus the optional visual tour.

## Load testing (measured)

`tests/load/loadtest.ts` starts a real server **process**, connects N×10 WebSocket clients (each walking A* routes with 20 Hz input), starts the matches and samples for 25–30 s. Raw results: `tests/load/results-*.json`.

The machine was an Apple Silicon laptop (10 cores) running Node 22. **The load generator ran on the same machine**, so the server competed with 100–500 simulated clients for CPU.

| Rooms × players | Clients | Server CPU (avg / max, % of one core) | Server RSS | Tick avg / max (50 ms budget) | Msgs to clients/s | kB/s per client | Snapshot delay p50 / p95 / p99 | Failures |
|---|---|---|---|---|---|---|---|---|
| 1 × 10 | 10 | 4.1 / 9.8 | 115 MB | 0.45 / 3.5 ms | 203 | 5.0 | 0 / 1 / 3 ms | 0 |
| 10 × 10 | 100 | 11.2 / 16.1 | 121 MB | 2.1 / 10.7 ms | 2 034 | 4.6 | 0 / 2 / 15 ms | 0 |
| 50 × 10 | 500 | 20.6 / 29.8 | 130 MB | 4.6 / 14.8 ms | 10 128 | 4.7 | 0 / 8 / 167 ms | 0 |

How to read these numbers:

* "Snapshot delay" is server send → client receive on the same machine. The p99 at 50 rooms is dominated by the load generator's own event loop (one Node process parsing about 10 k messages/s and running 500 path-finders), not by the server tick, which stayed under 15 ms.
* Bandwidth is about 5 kB/s down per player.
* These numbers do **not** prove internet-scale capacity. On a small cloud VM, expect lower headroom, and re-run the tool there before making capacity claims. No claims are made beyond 500 concurrent simulated clients on one instance.
