# Security & privacy

## Identity and sessions

* **Guests:** `POST /api/auth/guest` returns an HMAC-SHA256-signed token (`g_<uuid>`, 7-day expiry). The client never chooses its own identity.
* **Accounts:** passwords are hashed with **scrypt** (N=2¹⁵, r=8, p=1, 16-byte random salt) and compared in constant time. The login path always runs a hash, even for unknown users, so response timing doesn't reveal which usernames exist.
* Each login creates a session row keyed by the SHA-256 of a random session id. Logout and account deletion revoke it. WebSocket handshakes for registered users re-check that the session is still valid.
* Tokens are verified with a timing-safe comparison and an expiry check. `SESSION_SECRET` is required (≥ 32 characters) in production.

## Transport and HTTP

* In production, WebSocket upgrades require an `Origin` listed in `PUBLIC_ORIGIN`, and CORS is restricted to the same list.
* Request bodies are limited to 16 kB and WebSocket frames to 16 kB.
* Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY` and `Referrer-Policy` from the app; HSTS and `Permissions-Policy` from Caddy.
* Rate limits:
  * global 300 requests/min per IP
  * auth endpoints 10/min
  * guest tokens 30/min
  * room creation 10/min
  * matchmaking 20/min
  * WebSocket connections 30 burst, then 1 per 2 s per IP
  * **failed** room joins 10 burst, then 1 per 10 s per IP. Room codes are 6 characters from a 31-symbol alphabet (~887 million combinations), so brute-forcing a private code is impractical.

## Game authority (anti-cheat)

* Every client message is validated with zod (types, ranges, lengths). Unknown or invalid messages are rejected.
* **Movement:** clients send direction intents only. The server integrates them with a per-tick budget (no speed hacks), the same collision rules (no wall clipping) and validated finite numbers. A client can't teleport, because its own position is never accepted from it.
* **Tasks:** the server generates each puzzle and keeps the answer. A completion requires a valid session, proximity, a minimum duration, an un-sabotaged station and a correct answer. Manager completions never count.
* **Eliminations, reports, meetings, votes, sabotage and vents:** role, phase, proximity, line of sight, cooldown and duplicate checks all run on the server.
* **Hidden information:** roles go only to authorised recipients. Positions are filtered by vision and line of sight. Deaths are hidden from the living until a meeting. Vote choices are hidden until results. The elimination animation is sent only to witnesses.
* **Voice:** room membership is decided by server-issued LiveKit grants plus server-side removal on death, so a client cannot keep talking to the living after dying.

## Chat and abuse

* Chat is plain text everywhere. React escapes it and nothing is ever rendered as HTML. Control and bidi-override characters are stripped, length is capped at 200, and a small profanity list is masked.
* Rate limits per player: 1 message/s (burst 3), and the same message is blocked after 2 repeats in 15 s.
* Players can mute anyone (chat and voice, client-side), report players (stored in `Report`, limited to 3/min), and hosts can remove players from the lobby (the removal is sticky for that room).

## Privacy

* Guests store nothing on the server beyond the live session.
* Accounts store: username, password hash, outfit and aggregate stats. There is no email and no tracking.
* Voice is opt-in, the microphone is requested only on Join, and audio is never recorded or retained.
* `DELETE /api/me` (password required) deletes the account and its sessions, profile and stats. Match history keeps the display name but drops the link to the user.
* The in-game Privacy notice summarises all of this.

## Dependency review

`npm audit` was run near the end of development (October 2026):

* **Fixed:** `@fastify/static` was upgraded to 10.1.6 (path-traversal and route-guard advisories), with a follow-up compatibility fix for its new `setHeaders` signature. Probes confirmed that `/../` returns 403 and encoded traversal falls back to the SPA page. `vitest` was upgraded to 5.x (tinypool/mocker advisories, dev-only).
* **Remaining:** `deepmerge-ts`, pulled in by the **Prisma CLI** (`prisma` → `@prisma/config`). The CLI only runs migrations; the running server loads `@prisma/client`, which is not affected. The upstream fix requires a Prisma 7 migration, which is planned.

Re-run `npm audit --omit=dev` before each deploy.
