import { MAX_PLAYERS, MIN_PLAYERS } from './constants';
import { shuffle, type Rng } from './rng';
import { DEFAULT_SETTINGS, type GameOverReason, type GameSettings, type Role, type Team } from './types';

/**
 * Centralised, pure game rules. The server is the only caller that acts on
 * these results; the client only uses them for display hints.
 */

export function defaultManagerCount(players: number): number {
  return players >= 7 ? 2 : 1;
}

/** Upper balance limit: managers must be a clear minority. */
export function maxManagers(players: number): number {
  if (players <= 6) return 1;
  if (players <= 8) return 2;
  return 3;
}

export function effectiveManagerCount(settings: GameSettings, players: number): number {
  const wanted = settings.managers > 0 ? settings.managers : defaultManagerCount(players);
  return Math.max(1, Math.min(wanted, maxManagers(players)));
}

export function assignRoles(playerIds: string[], managerCount: number, rng: Rng): Map<string, Role> {
  const order = shuffle(rng, playerIds);
  const roles = new Map<string, Role>();
  order.forEach((id, i) => roles.set(id, i < managerCount ? 'manager' : 'employee'));
  return roles;
}

export interface WinCheckInput {
  aliveEmployees: number;
  aliveManagers: number;
  tasksDone: number;
  tasksTotal: number;
  criticalExpired: boolean;
  /** true once roles are assigned (never evaluate a lobby) */
  started: boolean;
}

export interface WinResult {
  winner: Team;
  reason: GameOverReason;
}

/**
 * Deterministic win evaluation. When several conditions are true in the same
 * tick, the priority order below decides:
 *   1. critical sabotage expired          → managers
 *   2. no managers alive                  → employees
 *   3. managers >= employees (parity)     → managers
 *   4. all tasks complete                 → employees
 */
export function evaluateWin(s: WinCheckInput): WinResult | null {
  if (!s.started) return null;
  if (s.criticalExpired) return { winner: 'managers', reason: 'critical_sabotage' };
  if (s.aliveManagers === 0) return { winner: 'employees', reason: 'managers_voted_out' };
  if (s.aliveManagers >= s.aliveEmployees) return { winner: 'managers', reason: 'parity' };
  if (s.tasksTotal > 0 && s.tasksDone >= s.tasksTotal) return { winner: 'employees', reason: 'tasks' };
  return null;
}

export const SKIP = 'skip';

export interface TallyResult {
  counts: Record<string, number>;
  ejected: string | null;
  tie: boolean;
  skipped: boolean;
}

/**
 * votes: voterId -> targetId | 'skip'. Only votes from eligible voters for
 * eligible targets are counted; everything else is ignored.
 * Rules: a unique plurality on a player ejects them. A tie (including a tie
 * with skip) or a leading skip ejects nobody. No votes → nobody.
 */
export function tallyVotes(votes: Map<string, string>, eligibleVoters: Set<string>, eligibleTargets: Set<string>): TallyResult {
  const counts: Record<string, number> = {};
  for (const [voter, target] of votes) {
    if (!eligibleVoters.has(voter)) continue;
    if (target !== SKIP && !eligibleTargets.has(target)) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  let best = 0;
  let leaders: string[] = [];
  for (const [t, c] of Object.entries(counts)) {
    if (c > best) {
      best = c;
      leaders = [t];
    } else if (c === best) leaders.push(t);
  }
  if (best === 0) return { counts, ejected: null, tie: false, skipped: true };
  if (leaders.length > 1) return { counts, ejected: null, tie: true, skipped: false };
  if (leaders[0] === SKIP) return { counts, ejected: null, tie: false, skipped: true };
  return { counts, ejected: leaders[0], tie: false, skipped: false };
}

const clamp = (v: unknown, min: number, max: number, def: number, step = 1): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  const c = Math.min(max, Math.max(min, n));
  return Math.round(c / step) * step;
};

/** Sanitise host-submitted settings into a valid, balanced configuration. */
export function sanitizeSettings(input: Partial<GameSettings>, current: GameSettings = DEFAULT_SETTINGS, playerCount = 0): GameSettings {
  const s: GameSettings = { ...current };
  const i = input as Record<string, unknown>;
  s.maxPlayers = clamp(i.maxPlayers ?? s.maxPlayers, Math.max(MIN_PLAYERS, playerCount), MAX_PLAYERS, s.maxPlayers);
  s.managers = clamp(i.managers ?? s.managers, 0, 3, s.managers);
  s.killCooldown = clamp(i.killCooldown ?? s.killCooldown, 10, 60, s.killCooldown, 5);
  if (i.killRange === 'short' || i.killRange === 'normal' || i.killRange === 'long') s.killRange = i.killRange;
  s.tasksPerPlayer = clamp(i.tasksPerPlayer ?? s.tasksPerPlayer, 1, 6, s.tasksPerPlayer);
  s.playerSpeed = clamp(i.playerSpeed ?? s.playerSpeed, 0.75, 1.5, s.playerSpeed, 0.05);
  s.discussionTime = clamp(i.discussionTime ?? s.discussionTime, 0, 180, s.discussionTime, 5);
  s.votingTime = clamp(i.votingTime ?? s.votingTime, 15, 180, s.votingTime, 5);
  if (typeof i.anonymousVotes === 'boolean') s.anonymousVotes = i.anonymousVotes;
  if (typeof i.confirmEjects === 'boolean') s.confirmEjects = i.confirmEjects;
  s.employeeVision = clamp(i.employeeVision ?? s.employeeVision, 0.5, 1.5, s.employeeVision, 0.05);
  s.managerVision = clamp(i.managerVision ?? s.managerVision, 0.5, 1.75, s.managerVision, 0.05);
  s.sabotageCooldown = clamp(i.sabotageCooldown ?? s.sabotageCooldown, 10, 90, s.sabotageCooldown, 5);
  s.emergencyMeetings = clamp(i.emergencyMeetings ?? s.emergencyMeetings, 0, 5, s.emergencyMeetings);
  if (typeof i.isPublic === 'boolean') s.isPublic = i.isPublic;
  return s;
}

/** Validates that a match can start. Returns an error string or null. */
export function canStartMatch(playerCount: number, settings: GameSettings): string | null {
  if (playerCount < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} employees to open the office.`;
  if (playerCount > settings.maxPlayers) return 'Too many players for the configured room size.';
  return null;
}
