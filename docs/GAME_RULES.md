# Game rules & edge-case behaviour

All rules below are enforced by the server (`apps/server/src/rooms/GameRoom.ts`) using the shared, unit-tested rule functions in `packages/shared/src/rules.ts`.

## Roles

| Players | Toxic Managers (auto) | Host may choose |
|---|---|---|
| 4–6 | 1 | 1 |
| 7–8 | 2 | 1–2 |
| 9–10 | 2 | 1–3 |

Roles are assigned at match start using a server-side PRNG. Each player is told only their own role. Managers are also told who the other managers are.

## Tasks

* Each player gets `tasksPerPlayer` (default 3) *different* task types, each at a random station of that type (14 task stations across the map).
* Opening a task requires standing within 1.45 units of its station during `ACTIVE`, and the station must not be disabled by sabotage.
* The server generates the puzzle and keeps the answer key. The client receives only the public data.
* A submission is accepted only when **all** of these hold: the task session still exists, the player is still near the station (2.4 units), the minimum human-plausible time has passed (2.5–3.5 s depending on the task), the station is not disabled, and the answer matches the key.
* **Managers** get decoy task lists. Their minigames look and play the same, but completing them only ticks their own decoy list and never affects Company Productivity.
* **Ghost employees** keep doing their tasks, and those completions count toward productivity.

## Sabotage

| Sabotage | Effect | Fix | Critical |
|---|---|---|---|
| Disable Wi-Fi | Network task stations offline | Hold 3 s at the IT network terminal | no |
| Fire Alarm | Alarm, 45 s countdown | Hold 2 s at **both** fire panels (Reception + Cafeteria) | **yes** |
| Cut Electricity | Employee vision × 0.38, red emergency light | Flip all 5 breakers in Maintenance | no |
| Lock Conference | All 3 conference doors blocked for 12 s | Wait, or hold 2 s at the Security door override | no |
| Crash Server | Alarm, 45 s countdown | Two players hold Core A and Core B **at the same time** for 1.5 s | **yes** |
| Disable CCTV | Security monitors show NO SIGNAL | Hold 3 s at Security control | no |
| System Outage | Every electronic station (and the cameras) offline | Restore three terminals (Workspace, HR, Reception), 2 s each | no |

* Only one system sabotage at a time. Door locks are tracked separately with their own cooldown.
* Sabotage is unavailable for 10 s after the round starts and after each meeting. Each fix starts the configured cooldown.
* When doors lock, anyone standing in a doorway is pushed out, so nobody can be trapped inside geometry. Locks always expire.
* The emergency button cannot be used during a critical sabotage, but reporting an incident can. **A meeting clears every active sabotage**, including critical ones.

## Eliminations

The server checks: phase `ACTIVE` · killer is a living manager, not in a passage · target is a living employee, not in a passage · distance ≤ the range setting (1.0, 1.5 or 2.0) · clear line of sight · cooldown expired (first available 10 s into the round, then every `killCooldown` seconds; reset after each meeting).

The server picks one of five comedic animations. Only witnesses (players with vision of the spot), the killer and the victim receive the animation event. The victim leaves an incident marker and becomes a ghost.

## Meetings and voting

* **Report:** a living player within 2.2 units of an incident, during `ACTIVE`, for an incident that hasn't been reported yet.
* **Emergency button:** a living player within 2.4 units of the conference table who still has uses left. Not available during the first 15 s of the round or after a meeting, and not during a critical sabotage.
* **Meeting start:** every death becomes public, all incidents are cleared, task, repair and camera windows close, and managers leave the passages. Everyone respawns around the conference table when play resumes.
* **Voting:** living, connected players only, one vote each, for a living player or **skip**. Voting ends early once everyone eligible has voted.
* **Tally:** a unique plurality on a player terminates them. A tie (including a tie with skip), a leading skip, or no votes terminates nobody.
* **Results** show the counts, and who voted for whom unless votes are anonymous. Whether the terminated player's role is revealed follows the host setting.

## Win conditions (deterministic priority)

1. Critical sabotage expired → **Managers**
2. No living managers → **Employees**
3. Living managers ≥ living employees → **Managers**
4. All tasks complete → **Employees**

Win conditions are evaluated during `ROLE_REVEAL`, `ACTIVE` and the meeting phases. After `VOTE_RESULTS` they are evaluated once the result screen has been shown.

## Disconnects and edge cases (spec §24)

| # | Scenario | Behaviour |
|---|---|---|
| 1 | Player disconnects in the lobby | Kept for 20 s (refresh-safe), then removed |
| 2 | Host disconnects | Host passes to the longest-connected player immediately |
| 3 | Disconnect mid-match | The character stays in the world for a 45 s grace period (it can still be eliminated). After that the player "left the company": counted as dead, no incident marker, unfinished tasks removed from the total |
| 4 | Disconnect during voting | Cannot vote while disconnected. Voting ends when the timer runs out or when every *connected* living player has voted |
| 5 | Disconnect during a task | The task window closes and progress isn't counted; the task stays undone |
| 6 | Manager disconnects | Counts as alive during the grace period. On removal the win check runs (it may give the Employees the win, shown as "managers left") |
| 7 | Last surviving employee disconnects | On removal, parity triggers a Managers win |
| 8 | Reconnect | Same identity token → same player record (role, tasks, position, ghost state). A newer connection replaces an older one |
| 9 | Invalid code | `ROOM_NOT_FOUND` with a friendly message. Failed attempts are rate-limited per IP |
| 10 | Room full | `ROOM_FULL` in the lobby. Mid-match joiners become spectators, up to a cap |
| 11 | Match already started | Join as a spectator |
| 12 | Two simultaneous reports | Messages are processed in order: the first starts the meeting, the second is rejected (`BAD_PHASE`) |
| 13 | Elimination and report almost together | Whichever arrives first wins; a kill during a meeting is rejected |
| 14 | Task completion and sabotage at the same time | Sabotage closes sessions on stations it disables, so a submission that arrives afterwards fails. A completion that arrived first counts |
| 15 | Critical countdown expires during another transition | Expiry is checked first, and only during `ACTIVE`. A meeting started earlier has already cleared the sabotage |
| 16 | Message spam | Per-socket token bucket (60/s, burst 120). Repeated floods close the socket. Movement uses its own budget; chat is limited to 1/s (burst 3) plus a duplicate filter |
| 17 | Microphone permission lost | Voice shows "Mic blocked / disconnected". Listening continues and gameplay is unaffected |
| 18 | Voice service unavailable | "Voice unavailable" status. Text chat and gameplay are unaffected |
| 19 | Server restarts | Live rooms are lost. Reconnecting clients get `ROOM_NOT_FOUND` and see a clear "server restarted" message, then return to the menu |
| 20 | Public lobby short on players | Waits. It auto-starts 5 s after at least 4 players are connected and ready |
| – | Stale state on a second match | `resetToLobby` clears roles, tasks, incidents, sabotage, doors, votes and stats, and drops players who left. Covered by tests |
