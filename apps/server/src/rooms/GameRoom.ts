import { randomBytes } from 'node:crypto';
import {
  BASE_SPEED,
  BASE_VISION,
  CAMERAS,
  CRITICAL_SABOTAGE_MS,
  DEFAULT_SETTINGS,
  DOOR_LOCK_MS,
  ELIMINATION_NAMES,
  EMERGENCY_GRACE_MS,
  EMERGENCY_RANGE,
  GAME_OVER_AUTO_RETURN_MS,
  INTERACT_RANGE,
  KILL_GRACE_AFTER_START_MS,
  KILL_RANGES,
  LIGHTS_OUT_VISION_FACTOR,
  LOBBY_RECONNECT_GRACE_MS,
  LOBBY_SPAWNS,
  MAP,
  MAX_PLAYERS,
  MEETING_INTRO_MS,
  MEETING_LINES,
  MEETING_SPAWNS,
  MIN_PLAYERS,
  NO_TERMINATION_LINES,
  RECONNECT_GRACE_MS,
  REPORT_RANGE,
  RETURNING_MS,
  ROLE_REVEAL_MS,
  SABOTAGE_GRACE_AFTER_START_MS,
  SABOTAGE_LINES,
  SKIP,
  STARTING_MS,
  STATIONS,
  STATION_BY_ID,
  TASK_DONE_LINES,
  TASK_INFO,
  TASK_LEASH,
  TASK_TYPES,
  TERMINATION_LINES,
  TICK_DT,
  VENT_BY_ID,
  VENT_COOLDOWN_MS,
  VENT_RANGE,
  VOICE_FULL_VOLUME_RADIUS,
  VOICE_RADIUS,
  VOTE_RESULTS_MS,
  assignRoles,
  canStartMatch,
  canTransition,
  colorHex,
  createColliders,
  createRng,
  dist,
  effectiveManagerCount,
  evaluateWin,
  generatePowerPuzzle,
  generatePuzzle,
  isInMatch,
  isMeetingPhase,
  lineOfSight,
  pick,
  randomSeed,
  resolveCollisions,
  roomAt,
  roomName,
  sample,
  sanitizeSettings,
  stepMovement,
  tallyVotes,
  verifyAnswer,
  verifyPower,
  CHARACTER_COLORS,
  type Appearance,
  type BodyView,
  type ChatChannel,
  type ChatMessage,
  type ClientMessage,
  type ColliderIndex,
  type FixTarget,
  type GameOverView,
  type GameSettings,
  type MeetingView,
  type Phase,
  type PlayerTask,
  type PublicPlayer,
  type Puzzle,
  type Rng,
  type Role,
  type SabotageKind,
  type ServerMessage,
  type SnapPlayer,
  type StateMsg,
  type Station,
  type Team,
  type WinResult,
} from '@corp/shared';
import { TokenBucket } from '../security/rateLimit';
import { SpamGuard, sanitizeChat } from '../security/moderation';
import type { MatchRecordInput, ReportInput } from '../database/store';
import type { VoiceService, VoiceMode } from '../voice/livekit';

export interface Conn {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

export interface RoomDeps {
  now?: () => number;
  seed?: number;
  voice?: VoiceService;
  testHooks?: boolean;
  onMatchEnd?: (m: MatchRecordInput) => void;
  onReport?: (r: ReportInput) => void;
  onChange?: (room: GameRoom) => void;
  log?: (m: string) => void;
}

interface TaskSession {
  id: string;
  stationId: string;
  taskId: string;
  puzzle: Puzzle;
  startedAt: number;
  fake: boolean;
}

interface FixSession {
  stationId: string;
  fix: FixTarget;
  openedAt: number;
  holding: boolean;
  holdSince: number;
  puzzle?: Puzzle;
}

export class Player {
  publicId = randomBytes(5).toString('hex');
  conn: Conn | null = null;
  connected = false;
  disconnectedAt = 0;
  ready = false;
  spectator = false;
  ping = 0;
  joinedAt: number;
  // match state
  role: Role | null = null;
  alive = true;
  deathKnown = false;
  left = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  inputs: { seq: number; mx: number; my: number }[] = [];
  lastSeq = 0;
  moveBudget: number;
  tasks: PlayerTask[] = [];
  taskSession: TaskSession | null = null;
  fixSession: FixSession | null = null;
  killReadyAt = 0;
  emergencyLeft = 0;
  inVent: string | null = null;
  ventReadyAt = 0;
  kills = 0;
  viewingCctv = false;
  voiceEnabled = false;
  speaking = false;
  chatBucket: TokenBucket;
  spam: SpamGuard;
  actionBucket: TokenBucket;
  reportBucket: TokenBucket;

  constructor(
    readonly identity: string,
    public name: string,
    public appearance: Appearance,
    readonly registered: boolean,
    now: () => number,
  ) {
    this.joinedAt = now();
    this.chatBucket = new TokenBucket(3, 1, now);
    this.spam = new SpamGuard(now);
    this.actionBucket = new TokenBucket(20, 10, now);
    this.reportBucket = new TokenBucket(3, 1 / 60, now);
    this.moveBudget = 3;
  }

  get userDbId(): string | null {
    return this.registered ? this.identity.slice(2) : null;
  }
}

interface SabotageState {
  kind: SabotageKind;
  critical: boolean;
  startedAt: number;
  endsAt: number | null;
  pending: Set<FixTarget>;
  fixed: Set<FixTarget>;
  serverBothSince: number;
}

interface Body {
  id: string;
  victim: Player;
  x: number;
  y: number;
  variant: number;
  room: string;
}

interface MeetingState {
  kind: 'report' | 'emergency';
  reporter: Player;
  victim: Player | null;
  room: string | null;
  votes: Map<string, string>; // publicId -> target publicId | skip
  results: MeetingView['results'];
  line: string;
}

const SABOTAGE_FIXES: Record<Exclude<SabotageKind, 'doors'>, FixTarget[]> = {
  wifi: ['wifi'],
  fire: ['fireA', 'fireB'],
  power: ['power'],
  server: ['serverA', 'serverB'],
  cctv: ['cctv'],
  outage: ['outageA', 'outageB', 'outageC'],
};

const HOLD_MS: Partial<Record<FixTarget, number>> = {
  wifi: 3000,
  fireA: 2000,
  fireB: 2000,
  doorsOverride: 2000,
  cctv: 3000,
  outageA: 2000,
  outageB: 2000,
  outageC: 2000,
};
const SERVER_SYNC_MS = 1500;

export class GameRoom {
  readonly code: string;
  readonly createdAt: number;
  settings: GameSettings;
  phase: Phase = 'WAITING';
  phaseEndsAt: number | null = null;
  hostId: string | null = null; // identity
  players = new Map<string, Player>(); // identity -> Player
  private byPublic = new Map<string, Player>();
  private kicked = new Set<string>();
  private cols: ColliderIndex = createColliders();
  private rng: Rng;
  private now: () => number;
  private tickNo = 0;
  private dirty = true;
  private sessionCounter = 0;
  private chatId = 0;
  private chatLog: ChatMessage[] = [];
  private forcedManagers: string[] | null = null;

  // match
  matchNo = 0;
  matchStartedAt = 0;
  sabotage: SabotageState | null = null;
  sabotageReadyAt = 0;
  doorsReadyAt = 0;
  doorsLockedUntil: number | null = null;
  bodies: Body[] = [];
  meeting: MeetingState | null = null;
  gameOver: GameOverView | null = null;
  autoStartAt: number | null = null;
  private emergencyReadyAt = 0;
  private stats = { meetings: 0, eliminations: 0 };
  private criticalExpired = false;
  disposed = false;

  constructor(
    code: string,
    isPublic: boolean,
    private deps: RoomDeps = {},
  ) {
    this.code = code;
    this.now = deps.now ?? Date.now;
    this.createdAt = this.now();
    this.rng = createRng(deps.seed ?? randomSeed());
    this.settings = { ...DEFAULT_SETTINGS, isPublic };
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  get activePlayers(): Player[] {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  get playerCount(): number {
    return this.activePlayers.length;
  }

  get isEmpty(): boolean {
    return ![...this.players.values()].some((p) => p.connected);
  }

  playerByPublic(id: string): Player | undefined {
    return this.byPublic.get(id);
  }

  /** Returns an error code or the joined player. */
  join(
    identity: string,
    name: string,
    appearance: Appearance,
    registered: boolean,
    conn: Conn,
  ): { error: string; message: string } | { player: Player; reconnected: boolean } {
    if (this.disposed) return { error: 'ROOM_CLOSED', message: 'This office has closed.' };
    if (this.kicked.has(identity)) return { error: 'KICKED', message: 'You were removed from this lobby by the host.' };
    const existing = this.players.get(identity);
    if (existing) {
      // Reconnect (or second tab with the same identity): newest connection wins.
      if (existing.conn && existing.conn !== conn) {
        existing.conn.send({ t: 'kicked', reason: 'You connected from another tab or device.' });
        existing.conn.close(4001, 'replaced');
      }
      existing.conn = conn;
      existing.connected = true;
      existing.disconnectedAt = 0;
      existing.inputs = [];
      if (this.phase === 'WAITING') {
        existing.name = name;
        existing.appearance = this.uniqueAppearance(appearance, existing);
      }
      if (!this.hostId || !this.players.get(this.hostId)?.connected) this.assignHost();
      this.sendWelcome(existing, true);
      this.notifyAll(`${existing.name} reconnected.`, 'info', existing);
      this.markDirty();
      return { player: existing, reconnected: true };
    }
    const lobbyFull = this.playerCount >= this.settings.maxPlayers;
    const spectator = this.phase !== 'WAITING' || lobbyFull;
    if (spectator && this.players.size >= MAX_PLAYERS + 6) return { error: 'ROOM_FULL', message: 'This office is at capacity.' };
    if (this.phase === 'WAITING' && lobbyFull) return { error: 'ROOM_FULL', message: 'This lobby is full.' };
    const p = new Player(identity, name, this.uniqueAppearance(appearance), registered, this.now);
    p.conn = conn;
    p.connected = true;
    p.spectator = spectator;
    if (spectator) {
      p.alive = false;
      p.x = 32;
      p.y = 19;
    } else {
      const spawn = LOBBY_SPAWNS[this.players.size % LOBBY_SPAWNS.length];
      [p.x, p.y] = resolveCollisions(this.cols, spawn[0], spawn[1]);
    }
    this.players.set(identity, p);
    this.byPublic.set(p.publicId, p);
    if (!this.hostId && !spectator) this.hostId = identity;
    this.sendWelcome(p, false);
    this.systemChat(spectator ? `${p.name} is spectating.` : `${p.name} joined the company.`, this.phase === 'WAITING' ? 'lobby' : 'ghost');
    this.markDirty();
    return { player: p, reconnected: false };
  }

  private sendWelcome(p: Player, reconnected: boolean) {
    this.send(p, {
      t: 'welcome',
      you: p.publicId,
      code: this.code,
      reconnected,
      serverTime: this.now(),
      testHooks: !!this.deps.testHooks,
    });
    const visible = this.chatLog.filter((m) => this.canReadChannel(p, m.channel)).slice(-40);
    this.send(p, { t: 'chatHistory', msgs: visible });
    this.sendState(p);
  }

  private uniqueAppearance(a: Appearance, self?: Player): Appearance {
    const taken = new Set([...this.players.values()].filter((p) => p !== self && !p.spectator).map((p) => p.appearance.color));
    if (!taken.has(a.color)) return a;
    const free = CHARACTER_COLORS.find((c) => !taken.has(c.id));
    return { ...a, color: free ? free.id : a.color };
  }

  disconnect(p: Player, conn: Conn) {
    if (p.conn !== conn) return; // an older socket closing after a reconnect
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = this.now();
    p.inputs = [];
    p.viewingCctv = false;
    if (p.fixSession) p.fixSession.holding = false;
    if (p.taskSession) p.taskSession = null;
    if (this.hostId === p.identity) this.assignHost();
    this.markDirty();
  }

  /** Permanently removes a player (explicit leave, kick, or grace expiry). */
  remove(p: Player, reason: 'left' | 'kicked' | 'timeout') {
    if (!this.players.has(p.identity)) return;
    if (isInMatch(this.phase) && !p.spectator && p.role) {
      // Leaving mid-match counts as leaving the company: no body, no report.
      if (p.alive) {
        p.alive = false;
        p.deathKnown = true;
        p.left = true;
        p.tasks = p.tasks.filter((t) => t.done);
        if (this.meeting) this.meeting.votes.delete(p.publicId);
        p.conn = null;
        p.connected = false;
        this.notifyAll(`${p.name} left the company.`, 'warn');
        this.deps.voice?.removeFromMain(this.code, p.publicId);
        if (this.hostId === p.identity) this.assignHost();
        this.markDirty();
        return; // keep the record for end-of-match stats
      }
      p.left = true;
      p.conn = null;
      p.connected = false;
      if (this.hostId === p.identity) this.assignHost();
      this.markDirty();
      return;
    }
    this.players.delete(p.identity);
    this.byPublic.delete(p.publicId);
    if (reason === 'kicked') this.kicked.add(p.identity);
    if (this.hostId === p.identity) this.assignHost();
    this.systemChat(`${p.name} ${reason === 'kicked' ? 'was escorted out by security' : 'left the company'}.`, 'lobby');
    this.markDirty();
  }

  private assignHost() {
    const candidates = this.activePlayers.filter((p) => p.connected && !p.left).sort((a, b) => a.joinedAt - b.joinedAt);
    const prev = this.hostId;
    this.hostId = candidates[0]?.identity ?? (this.activePlayers.find((p) => !p.left)?.identity ?? null);
    if (prev && this.hostId && prev !== this.hostId) {
      const h = this.players.get(this.hostId);
      if (h) this.notifyAll(`${h.name} is now the host.`, 'info');
    }
    this.markDirty();
  }

  // -------------------------------------------------------------------------
  // Messaging helpers
  // -------------------------------------------------------------------------

  private send(p: Player, msg: ServerMessage) {
    if (p.conn && p.connected) p.conn.send(msg);
  }

  private notify(p: Player, text: string, kind: 'info' | 'warn' | 'danger' | 'success' = 'info', sfx?: string) {
    this.send(p, { t: 'notice', kind, text, sfx });
  }

  private notifyAll(text: string, kind: 'info' | 'warn' | 'danger' | 'success' = 'info', except?: Player, sfx?: string) {
    for (const p of this.players.values()) if (p !== except) this.notify(p, text, kind, sfx);
  }

  private reject(p: Player, code: string, message: string) {
    this.send(p, { t: 'error', code, message });
  }

  markDirty() {
    this.dirty = true;
  }

  private canReadChannel(p: Player, ch: ChatChannel): boolean {
    if (ch === 'lobby' || ch === 'meeting') return true;
    return p.spectator || !p.alive || this.phase === 'GAME_OVER';
  }

  private pushChat(msg: Omit<ChatMessage, 'id' | 'ts'>) {
    const m: ChatMessage = { ...msg, id: ++this.chatId, ts: this.now() };
    this.chatLog.push(m);
    if (this.chatLog.length > 200) this.chatLog.splice(0, this.chatLog.length - 200);
    for (const p of this.players.values()) if (this.canReadChannel(p, m.channel)) this.send(p, { t: 'chat', msg: m });
  }

  private systemChat(text: string, channel: ChatChannel) {
    this.pushChat({ channel, fromId: null, name: 'HR Bot', color: '#ffd23f', text, system: true });
  }

  // -------------------------------------------------------------------------
  // Phase machine
  // -------------------------------------------------------------------------

  private setPhase(to: Phase, durationMs: number | null) {
    if (!canTransition(this.phase, to)) {
      this.deps.log?.(`[${this.code}] rejected invalid transition ${this.phase} -> ${to}`);
      return false;
    }
    this.phase = to;
    this.phaseEndsAt = durationMs === null ? null : this.now() + durationMs;
    this.markDirty();
    this.deps.onChange?.(this);
    return true;
  }

  private startCountdown(): string | null {
    if (this.phase !== 'WAITING') return 'The match has already started.';
    const players = this.activePlayers.filter((p) => p.connected);
    const err = canStartMatch(players.length, this.settings);
    if (err) return err;
    if (!this.setPhase('STARTING', STARTING_MS)) return 'Invalid state';
    this.autoStartAt = null;
    this.systemChat('The workday begins in 3… 2… 1…', 'lobby');
    return null;
  }

  private beginMatch() {
    // Drop anyone who is not connected at start; they become spectators if they return.
    for (const p of this.activePlayers) {
      if (!p.connected) {
        this.players.delete(p.identity);
        this.byPublic.delete(p.publicId);
      }
    }
    const roster = this.activePlayers;
    if (roster.length < MIN_PLAYERS) {
      this.setPhase('WAITING', null);
      this.notifyAll('Not enough players — back to the lobby.', 'warn');
      return;
    }
    this.matchNo++;
    this.matchStartedAt = this.now();
    this.stats = { meetings: 0, eliminations: 0 };
    this.criticalExpired = false;
    this.bodies = [];
    this.meeting = null;
    this.gameOver = null;
    this.sabotage = null;
    this.unlockDoors();
    const managerCount = effectiveManagerCount(this.settings, roster.length);
    let roles: Map<string, Role>;
    if (this.forcedManagers && this.deps.testHooks) {
      roles = new Map(roster.map((p) => [p.identity, this.forcedManagers!.includes(p.publicId) ? 'manager' : 'employee']));
    } else {
      roles = assignRoles(
        roster.map((p) => p.identity),
        managerCount,
        this.rng,
      );
    }
    const t = this.now();
    roster.forEach((p, i) => {
      p.role = roles.get(p.identity)!;
      p.alive = true;
      p.deathKnown = false;
      p.left = false;
      p.kills = 0;
      p.inVent = null;
      p.taskSession = null;
      p.fixSession = null;
      p.viewingCctv = false;
      p.emergencyLeft = this.settings.emergencyMeetings;
      p.killReadyAt = t + ROLE_REVEAL_MS + KILL_GRACE_AFTER_START_MS;
      p.tasks = this.assignTasks(p);
      const s = MEETING_SPAWNS[i % MEETING_SPAWNS.length];
      this.place(p, s[0], s[1]);
    });
    this.sabotageReadyAt = t + ROLE_REVEAL_MS + SABOTAGE_GRACE_AFTER_START_MS;
    this.doorsReadyAt = this.sabotageReadyAt;
    this.emergencyReadyAt = t + ROLE_REVEAL_MS + EMERGENCY_GRACE_MS;
    this.setPhase('ROLE_REVEAL', ROLE_REVEAL_MS);
    this.deps.log?.(`[${this.code}] match ${this.matchNo} started with ${roster.length} players, ${managerCount} manager(s)`);
    this.refreshVoiceForAll();
  }

  private assignTasks(p: Player): PlayerTask[] {
    const n = Math.min(this.settings.tasksPerPlayer, TASK_TYPES.length);
    return sample(this.rng, TASK_TYPES, n).map((type, i) => {
      const stations = STATIONS.filter((s) => s.kind === 'task' && s.taskType === type);
      return { id: `${p.publicId}-${i}`, type, stationId: pick(this.rng, stations).id, done: false };
    });
  }

  private place(p: Player, x: number, y: number) {
    [p.x, p.y] = resolveCollisions(this.cols, x, y);
    p.vx = 0;
    p.vy = 0;
    p.inputs = [];
  }

  private endMatch(win: WinResult) {
    if (!this.setPhase('GAME_OVER', GAME_OVER_AUTO_RETURN_MS)) return;
    this.sabotage = null;
    this.unlockDoors();
    this.meeting = null;
    for (const p of this.players.values()) {
      p.taskSession = null;
      p.fixSession = null;
      p.inVent = null;
      p.viewingCctv = false;
    }
    const roster = this.activePlayers.filter((p) => p.role);
    const endedAt = this.now();
    const headline = win.winner === 'employees' ? 'THE EMPLOYEES SURVIVED MONDAY!' : 'MANAGEMENT HAS TAKEN OVER.';
    const progress = this.progress();
    this.gameOver = {
      winner: win.winner,
      reason: win.reason,
      headline,
      durationMs: endedAt - this.matchStartedAt,
      tasksCompleted: progress.done,
      tasksTotal: progress.total,
      meetings: this.stats.meetings,
      eliminations: this.stats.eliminations,
      players: roster.map((p) => ({
        id: p.publicId,
        name: p.name,
        appearance: p.appearance,
        role: p.role!,
        alive: p.alive,
        tasksDone: p.role === 'employee' ? p.tasks.filter((t) => t.done).length : 0,
        tasksTotal: p.role === 'employee' ? p.tasks.length : 0,
        eliminations: p.kills,
        won: (p.role === 'manager') === (win.winner === 'managers'),
      })),
    };
    // Celebration positions: winners gather in CEO cabin (managers) or the workspace (employees).
    const spots: [number, number][] =
      win.winner === 'managers'
        ? [[25.5, 6], [24, 6.6], [27, 6.6], [23, 5.5], [28, 5.5], [25.5, 7.6], [24, 8], [27, 8], [22.8, 7.3], [28.6, 7.4]]
        : [[17, 20], [18.5, 20.5], [15.5, 20.5], [17, 21.8], [19.8, 21], [14.2, 21.4], [12.6, 20], [21.2, 20.2], [17.5, 19.3], [16, 19.5]];
    // Everyone (ghosts included) is visible again during GAME_OVER — see omniscient().
    roster.forEach((p, i) => this.place(p, spots[i % spots.length][0], spots[i % spots.length][1]));
    this.systemChat(`${headline} (${win.reason.replace(/_/g, ' ')})`, 'lobby');
    this.deps.onMatchEnd?.({
      roomCode: this.code,
      startedAt: new Date(this.matchStartedAt),
      endedAt: new Date(endedAt),
      winningTeam: win.winner,
      reason: win.reason,
      players: roster.map((p) => ({
        userId: p.userDbId,
        displayName: p.name,
        role: p.role!,
        won: (p.role === 'manager') === (win.winner === 'managers'),
        tasksCompleted: p.role === 'employee' ? p.tasks.filter((t) => t.done).length : 0,
        eliminations: p.kills,
      })),
    });
    this.deps.log?.(`[${this.code}] match ${this.matchNo} over: ${win.winner} (${win.reason})`);
    this.refreshVoiceForAll();
  }

  private returnToLobby() {
    if (!this.setPhase('RETURNING_TO_LOBBY', RETURNING_MS)) return;
  }

  private resetToLobby() {
    // Remove anyone who left/disconnected during the match.
    for (const p of [...this.players.values()]) {
      if (p.left || !p.connected) {
        this.players.delete(p.identity);
        this.byPublic.delete(p.publicId);
      }
    }
    let i = 0;
    for (const p of this.players.values()) {
      if (p.spectator && this.playerCount < this.settings.maxPlayers) p.spectator = false;
      p.role = null;
      p.alive = true;
      p.deathKnown = false;
      p.left = false;
      p.ready = false;
      p.tasks = [];
      p.taskSession = null;
      p.fixSession = null;
      p.inVent = null;
      p.kills = 0;
      p.viewingCctv = false;
      if (!p.spectator) {
        const s = LOBBY_SPAWNS[i++ % LOBBY_SPAWNS.length];
        this.place(p, s[0], s[1]);
        p.appearance = this.uniqueAppearance(p.appearance, p);
      }
    }
    this.bodies = [];
    this.meeting = null;
    this.gameOver = null;
    this.sabotage = null;
    this.unlockDoors();
    this.forcedManagers = null;
    if (!this.hostId || !this.players.has(this.hostId)) this.assignHost();
    this.setPhase('WAITING', null);
    this.refreshVoiceForAll();
  }

  private progress(): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const p of this.activePlayers) {
      if (p.role !== 'employee') continue;
      total += p.tasks.length;
      done += p.tasks.filter((t) => t.done).length;
    }
    return { done, total };
  }

  private checkWin(): boolean {
    if (!isInMatch(this.phase)) return false;
    const roster = this.activePlayers.filter((p) => p.role);
    const alive = roster.filter((p) => p.alive);
    const prog = this.progress();
    const res = evaluateWin({
      started: true,
      criticalExpired: this.criticalExpired,
      aliveEmployees: alive.filter((p) => p.role === 'employee').length,
      aliveManagers: alive.filter((p) => p.role === 'manager').length,
      tasksDone: prog.done,
      tasksTotal: prog.total,
    });
    if (!res) return false;
    // Distinguish "all managers gone because they left" for the results screen.
    if (res.reason === 'managers_voted_out' && roster.filter((p) => p.role === 'manager').every((p) => p.left)) res.reason = 'managers_left';
    if (res.reason === 'parity' && roster.filter((p) => p.role === 'employee' && p.left).length > 0 && this.stats.eliminations === 0)
      res.reason = 'employees_left';
    this.endMatch(res);
    return true;
  }

  // -------------------------------------------------------------------------
  // Meetings
  // -------------------------------------------------------------------------

  private startMeeting(kind: 'report' | 'emergency', reporter: Player, body: Body | null) {
    if (!this.setPhase('MEETING_INTRO', MEETING_INTRO_MS)) return;
    this.stats.meetings++;
    // Every elimination becomes public knowledge when a meeting is called.
    for (const p of this.players.values()) if (!p.alive) p.deathKnown = true;
    if (this.sabotage) this.sabotage = null; // meetings resolve sabotage (incl. critical)
    this.unlockDoors();
    for (const p of this.players.values()) {
      if (p.taskSession) this.send(p, { t: 'taskClosed', reason: 'meeting' });
      if (p.fixSession) this.send(p, { t: 'taskClosed', reason: 'meeting' });
      p.taskSession = null;
      p.fixSession = null;
      p.inVent = null;
      p.viewingCctv = false;
      p.inputs = [];
      p.vx = 0;
      p.vy = 0;
    }
    this.meeting = {
      kind,
      reporter,
      victim: body?.victim ?? null,
      room: body ? body.room : null,
      votes: new Map(),
      results: null,
      line: pick(this.rng, MEETING_LINES),
    };
    this.bodies = [];
    this.refreshVoiceForAll();
  }

  private finishVoting() {
    if (!this.meeting) return;
    const living = this.activePlayers.filter((p) => p.alive && p.role);
    const voters = new Set(living.filter((p) => !p.left).map((p) => p.publicId));
    const targets = new Set(living.map((p) => p.publicId));
    const tally = tallyVotes(this.meeting.votes, voters, targets);
    const ejected = tally.ejected ? this.byPublic.get(tally.ejected) ?? null : null;
    let voterMap: Record<string, string[]> | undefined;
    if (!this.settings.anonymousVotes) {
      voterMap = {};
      for (const [v, t] of this.meeting.votes) if (voters.has(v)) (voterMap[t] ??= []).push(v);
    }
    if (ejected) {
      ejected.alive = false;
      ejected.deathKnown = true;
      this.deps.voice?.removeFromMain(this.code, ejected.publicId);
    }
    const managersLeft = this.activePlayers.filter((p) => p.alive && p.role === 'manager').length;
    this.meeting.results = {
      counts: tally.counts,
      voters: voterMap,
      ejectedId: ejected?.publicId ?? null,
      ejectedName: ejected?.name ?? null,
      ejectedWasManager: ejected && this.settings.confirmEjects ? ejected.role === 'manager' : null,
      tie: tally.tie,
      skipped: tally.skipped,
      line: ejected ? pick(this.rng, TERMINATION_LINES) : pick(this.rng, NO_TERMINATION_LINES),
      managersLeft: this.settings.confirmEjects ? managersLeft : null,
    };
    this.setPhase('VOTE_RESULTS', VOTE_RESULTS_MS);
  }

  private resumeAfterMeeting() {
    if (this.checkWinAfterResults()) return;
    const t = this.now();
    const alive = this.activePlayers.filter((p) => p.role);
    alive.forEach((p, i) => {
      const s = MEETING_SPAWNS[i % MEETING_SPAWNS.length];
      this.place(p, s[0], s[1]);
      if (p.role === 'manager') p.killReadyAt = t + this.settings.killCooldown * 1000;
    });
    this.sabotageReadyAt = Math.max(this.sabotageReadyAt, t + 10_000);
    this.doorsReadyAt = Math.max(this.doorsReadyAt, t + 10_000);
    this.emergencyReadyAt = t + EMERGENCY_GRACE_MS;
    this.meeting = null;
    this.setPhase('ACTIVE', null);
    this.refreshVoiceForAll();
  }

  private checkWinAfterResults(): boolean {
    // VOTE_RESULTS is not "in match" for live checks; evaluate explicitly at its end.
    const roster = this.activePlayers.filter((p) => p.role);
    const alive = roster.filter((p) => p.alive);
    const prog = this.progress();
    const res = evaluateWin({
      started: true,
      criticalExpired: false,
      aliveEmployees: alive.filter((p) => p.role === 'employee').length,
      aliveManagers: alive.filter((p) => p.role === 'manager').length,
      tasksDone: prog.done,
      tasksTotal: prog.total,
    });
    if (!res) return false;
    this.endMatch(res);
    return true;
  }

  // -------------------------------------------------------------------------
  // Sabotage
  // -------------------------------------------------------------------------

  private stationDisabled(st: Station): boolean {
    if (!this.sabotage) return false;
    if (this.sabotage.kind === 'outage' && (st.electronic || st.kind === 'cctv')) return true;
    if (this.sabotage.kind === 'wifi' && (st.network || st.taskType === 'wifi')) return true;
    if (this.sabotage.kind === 'cctv' && st.kind === 'cctv') return true;
    return false;
  }

  get cctvOnline(): boolean {
    return !this.sabotage || (this.sabotage.kind !== 'cctv' && this.sabotage.kind !== 'outage');
  }

  private startSabotage(p: Player, kind: SabotageKind): string | null {
    const t = this.now();
    if (this.phase !== 'ACTIVE') return 'Sabotage is only possible during the workday.';
    if (p.role !== 'manager' || !p.alive) return 'Only living Toxic Managers can sabotage.';
    if (p.inVent) return 'Leave the maintenance passage first.';
    if (kind === 'doors') {
      if (this.doorsLockedUntil) return 'Doors are already locked.';
      if (t < this.doorsReadyAt) return 'Door sabotage is cooling down.';
      this.lockDoors();
      this.doorsReadyAt = t + DOOR_LOCK_MS + this.settings.sabotageCooldown * 1000;
      this.notifyAll(SABOTAGE_LINES.doors, 'warn', undefined, 'doorLock');
      this.markDirty();
      return null;
    }
    if (this.sabotage) return 'Another sabotage is already in progress.';
    if (t < this.sabotageReadyAt) return 'Sabotage is cooling down.';
    const critical = kind === 'fire' || kind === 'server';
    this.sabotage = {
      kind,
      critical,
      startedAt: t,
      endsAt: critical ? t + CRITICAL_SABOTAGE_MS : null,
      pending: new Set(SABOTAGE_FIXES[kind]),
      fixed: new Set(),
      serverBothSince: 0,
    };
    // Close task sessions on stations this sabotage disables.
    for (const pl of this.players.values()) {
      if (pl.taskSession && this.stationDisabled(STATION_BY_ID[pl.taskSession.stationId])) {
        pl.taskSession = null;
        this.send(pl, { t: 'taskClosed', reason: 'sabotage' });
      }
      if (pl.viewingCctv && !this.cctvOnline) this.send(pl, { t: 'cctv', online: false, feeds: [] });
    }
    const sfx = kind === 'fire' ? 'alarm' : kind === 'server' ? 'serverFail' : kind === 'power' ? 'powerDown' : 'warning';
    this.notifyAll(SABOTAGE_LINES[kind], critical ? 'danger' : 'warn', undefined, sfx);
    this.markDirty();
    return null;
  }

  private resolveSabotage(by: Player | null) {
    if (!this.sabotage) return;
    const kind = this.sabotage.kind;
    this.sabotage = null;
    this.sabotageReadyAt = this.now() + this.settings.sabotageCooldown * 1000;
    for (const p of this.players.values()) if (p.fixSession && p.fixSession.fix !== 'doorsOverride') p.fixSession = null;
    const label: Record<SabotageKind, string> = {
      wifi: 'Wi-Fi restored. Everyone is back to pretending to work.',
      fire: 'Fire alarm reset. Nobody was barbecued.',
      power: 'Electricity restored. The coffee machine lives again.',
      doors: 'Doors unlocked.',
      server: 'Server back online. IT takes full credit.',
      cctv: 'Security cameras back online.',
      outage: 'All systems restored. Productivity may resume.',
    };
    this.notifyAll(label[kind] + (by ? ` (thanks, ${by.name})` : ''), 'success', undefined, 'fixed');
    this.markDirty();
  }

  private lockDoors() {
    this.doorsLockedUntil = this.now() + DOOR_LOCK_MS;
    for (const [doorId, boxes] of MAP.lockColliders) this.cols.setDynamic(doorId, boxes);
    // Nudge anyone standing in a doorway out of it (never trap a player inside geometry).
    for (const p of this.players.values()) {
      if (!p.alive || p.spectator) continue;
      [p.x, p.y] = resolveCollisions(this.cols, p.x, p.y);
    }
  }

  private unlockDoors() {
    this.doorsLockedUntil = null;
    for (const doorId of MAP.lockColliders.keys()) this.cols.setDynamic(doorId, null);
    for (const p of this.players.values()) if (p.fixSession?.fix === 'doorsOverride') p.fixSession = null;
  }

  private fixRelevant(fix: FixTarget): boolean {
    if (fix === 'doorsOverride') return !!this.doorsLockedUntil;
    return !!this.sabotage && this.sabotage.pending.has(fix);
  }

  private markFixed(fix: FixTarget, by: Player) {
    if (fix === 'doorsOverride') {
      this.unlockDoors();
      this.notifyAll(`Door override engaged by ${by.name}. Conference rooms unlocked.`, 'success', undefined, 'doorOpen');
      this.markDirty();
      return;
    }
    const s = this.sabotage;
    if (!s || !s.pending.has(fix)) return;
    s.pending.delete(fix);
    s.fixed.add(fix);
    if (by.fixSession?.fix === fix) by.fixSession = null;
    if (s.pending.size === 0) this.resolveSabotage(by);
    else {
      this.notify(by, 'Station restored. Others still need fixing!', 'success', 'fixed');
      this.markDirty();
    }
  }

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  visionRadius(p: Player): number {
    const base = BASE_VISION * (p.role === 'manager' ? this.settings.managerVision : this.settings.employeeVision);
    if (this.sabotage?.kind === 'power' && p.role !== 'manager') return base * LIGHTS_OUT_VISION_FACTOR;
    return base;
  }

  private omniscient(viewer: Player): boolean {
    return viewer.spectator || !viewer.alive || this.phase === 'GAME_OVER' || this.phase === 'WAITING' || this.phase === 'RETURNING_TO_LOBBY';
  }

  /** Can `viewer` see position (x,y) right now? */
  canSeePoint(viewer: Player, x: number, y: number): boolean {
    if (this.omniscient(viewer)) return true;
    if (viewer.inVent) return dist(viewer.x, viewer.y, x, y) < 3;
    const r = this.visionRadius(viewer);
    if (dist(viewer.x, viewer.y, x, y) > r) return false;
    return lineOfSight(viewer.x, viewer.y, x, y);
  }

  canSeePlayer(viewer: Player, target: Player): boolean {
    if (viewer === target) return true;
    if (target.spectator || target.left) return false;
    if (!target.connected && this.phase === 'WAITING') return false;
    if (target.inVent) return false;
    if (!target.alive && isInMatch(this.phase)) return viewer.spectator || !viewer.alive;
    return this.canSeePoint(viewer, target.x, target.y);
  }

  // -------------------------------------------------------------------------
  // Input handling
  // -------------------------------------------------------------------------

  handle(p: Player, msg: ClientMessage) {
    if (msg.t !== 'input' && msg.t !== 'ping' && !p.actionBucket.take()) {
      return this.reject(p, 'RATE_LIMIT', 'Slow down! Even interns need breaks.');
    }
    switch (msg.t) {
      case 'input':
        return this.onInput(p, msg.seq, msg.mx, msg.my);
      case 'ready':
        if (this.phase !== 'WAITING' || p.spectator) return;
        p.ready = msg.ready;
        this.markDirty();
        return this.maybeScheduleAutoStart();
      case 'profile':
        if (this.phase !== 'WAITING') return this.reject(p, 'BAD_PHASE', 'You can only change outfits in the lobby.');
        {
          const taken = [...this.players.values()].some((o) => o !== p && !o.spectator && o.appearance.color === msg.appearance.color);
          if (taken) return this.reject(p, 'COLOR_TAKEN', 'That colour is already taken by a coworker.');
          p.name = msg.name.trim();
          p.appearance = msg.appearance;
          this.markDirty();
        }
        return;
      case 'settings':
        if (!this.isHost(p)) return this.reject(p, 'NOT_HOST', 'Only the host can change settings.');
        if (this.phase !== 'WAITING') return this.reject(p, 'BAD_PHASE', 'Settings are locked during a match.');
        this.settings = sanitizeSettings(msg.settings, this.settings, this.playerCount);
        this.markDirty();
        this.deps.onChange?.(this);
        return;
      case 'start': {
        if (!this.isHost(p)) return this.reject(p, 'NOT_HOST', 'Only the host can start the match.');
        const notReady = this.activePlayers.filter((o) => o !== p && o.connected && !o.ready);
        if (this.phase === 'WAITING' && notReady.length)
          return this.reject(p, 'NOT_READY', `Waiting for ${notReady.map((o) => o.name).join(', ')} to be ready.`);
        const err = this.startCountdown();
        if (err) this.reject(p, 'CANNOT_START', err);
        return;
      }
      case 'kick': {
        if (!this.isHost(p) || this.phase !== 'WAITING') return this.reject(p, 'NOT_HOST', 'Only the host can do that in the lobby.');
        const target = this.byPublic.get(msg.target);
        if (!target || target === p) return;
        this.send(target, { t: 'kicked', reason: 'The host removed you from the lobby.' });
        target.conn?.close(4003, 'kicked');
        this.remove(target, 'kicked');
        return;
      }
      case 'interact':
        return this.onInteract(p, msg.station);
      case 'taskSubmit':
        return this.onTaskSubmit(p, msg.session, msg.answer);
      case 'taskClose':
        p.taskSession = null;
        p.fixSession = null;
        this.markDirty();
        return;
      case 'fixHold':
        return this.onFixHold(p, msg.station, msg.holding);
      case 'fixSubmit':
        return this.onFixSubmit(p, msg.station, msg.answer);
      case 'kill':
        return this.onKill(p, msg.target);
      case 'report':
        return this.onReport(p, msg.body);
      case 'emergency':
        return this.onEmergency(p);
      case 'sabotage': {
        const err = this.startSabotage(p, msg.kind);
        if (err) this.reject(p, 'SABOTAGE', err);
        return;
      }
      case 'vent':
        return this.onVent(p, msg.action, msg.vent);
      case 'vote':
        return this.onVote(p, msg.target);
      case 'chat':
        return this.onChat(p, msg.text);
      case 'returnToLobby':
        if (this.phase !== 'GAME_OVER') return;
        if (!this.isHost(p)) return this.reject(p, 'NOT_HOST', 'Waiting for the host to return everyone to the lobby.');
        return this.returnToLobby();
      case 'voiceToken':
        return void this.sendVoiceToken(p);
      case 'voiceState':
        if (p.speaking !== msg.speaking) {
          p.speaking = msg.speaking;
          this.markDirty();
        }
        return;
      case 'reportPlayer': {
        const target = this.byPublic.get(msg.target);
        if (!target || target === p) return;
        if (!p.reportBucket.take()) return this.reject(p, 'RATE_LIMIT', 'You have filed enough reports for now.');
        this.deps.onReport?.({
          reporterUserId: p.userDbId,
          reporterName: p.name,
          reportedId: target.identity,
          reportedName: target.name,
          roomCode: this.code,
          category: msg.category,
          note: msg.note ? sanitizeChat(msg.note) ?? undefined : undefined,
        });
        this.notify(p, `Thanks — your report about ${target.name} was filed with the moderation team.`, 'success');
        return;
      }
      case 'cctv':
        if (!msg.open) p.viewingCctv = false;
        return;
      case 'ping':
        return this.send(p, { t: 'pong', ts: msg.ts, serverTime: this.now() });
      case 'leave':
        p.conn?.close(1000, 'left');
        this.remove(p, 'left');
        this.checkWin();
        return;
      case 'test':
        return this.onTestHook(p, msg.cmd, msg.args ?? {});
      case 'hello':
        return;
    }
  }

  isHost(p: Player): boolean {
    return this.hostId === p.identity;
  }

  private canMove(p: Player): boolean {
    if (p.spectator) return true; // free camera is client-side; position ignored
    return (this.phase === 'WAITING' || this.phase === 'ACTIVE' || this.phase === 'GAME_OVER') && !p.inVent;
  }

  private onInput(p: Player, seq: number, mx: number, my: number) {
    if (seq <= p.lastSeq && p.lastSeq - seq < 1e6) return; // stale / duplicate
    if (p.inputs.length > 30) p.inputs.shift(); // flood protection: drop oldest
    p.inputs.push({ seq, mx, my });
  }

  private speedFor(p: Player): number {
    return BASE_SPEED * this.settings.playerSpeed * (p.alive || !isInMatch(this.phase) ? 1 : 1.15);
  }

  private simulateMovement() {
    for (const p of this.players.values()) {
      if (p.spectator) {
        p.inputs = [];
        continue;
      }
      if (!this.canMove(p)) {
        if (p.inputs.length) {
          p.lastSeq = p.inputs[p.inputs.length - 1].seq;
          p.inputs = [];
        }
        continue;
      }
      // Speed-hack protection: each tick grants one input step of budget,
      // with a small burst allowance to absorb network jitter.
      p.moveBudget = Math.min(p.moveBudget + 1, 4);
      while (p.inputs.length && p.moveBudget >= 1) {
        const inp = p.inputs.shift()!;
        p.moveBudget -= 1;
        const ghost = isInMatch(this.phase) && !p.alive;
        const s = stepMovement(p, inp.mx, inp.my, this.speedFor(p), TICK_DT, this.cols, ghost);
        p.x = s.x;
        p.y = s.y;
        p.vx = s.vx;
        p.vy = s.vy;
        p.lastSeq = inp.seq;
      }
      if (p.inputs.length > 8) {
        // Client is far ahead of real time (or cheating): drop the excess.
        p.lastSeq = p.inputs[p.inputs.length - 1].seq;
        p.inputs = [];
      }
    }
  }

  private nearStation(p: Player, st: Station, range = INTERACT_RANGE): boolean {
    return dist(p.x, p.y, st.x, st.y) <= range + 0.05;
  }

  private onInteract(p: Player, stationId: string) {
    if (this.phase !== 'ACTIVE') return this.reject(p, 'BAD_PHASE', 'Nothing to interact with right now.');
    if (p.spectator) return this.reject(p, 'SPECTATOR', 'Spectators cannot interact.');
    if (p.inVent) return;
    const st = STATION_BY_ID[stationId];
    if (!st) return this.reject(p, 'BAD_STATION', 'Unknown station.');
    if (st.kind === 'emergency') return this.onEmergency(p);
    if (st.kind === 'vent') return;
    if (!this.nearStation(p, st)) return this.reject(p, 'TOO_FAR', 'Get closer to interact.');

    if (st.kind === 'cctv') {
      if (!this.cctvOnline) return this.reject(p, 'OFFLINE', 'Security cameras are offline.');
      p.viewingCctv = true;
      this.sendCctv(p);
      return;
    }

    if (st.kind === 'fix') {
      if (!p.alive) return this.reject(p, 'GHOST', 'Ghosts cannot repair office systems.');
      if (!st.fix || !this.fixRelevant(st.fix)) return this.notify(p, 'This system is working fine. Suspiciously fine.');
      const fs: FixSession = { stationId: st.id, fix: st.fix, openedAt: this.now(), holding: false, holdSince: 0 };
      if (st.fix === 'power') fs.puzzle = generatePowerPuzzle(this.rng);
      p.fixSession = fs;
      p.taskSession = null;
      this.send(p, { t: 'fixOpen', station: st.id, fix: st.fix, data: fs.puzzle?.data });
      this.markDirty();
      return;
    }

    // task station
    if (!p.alive && p.role === 'manager') return this.reject(p, 'GHOST', 'Eliminated managers have nothing left to fake.');
    const task = p.tasks.find((t) => t.stationId === st.id && !t.done);
    if (!task) return this.notify(p, p.tasks.some((t) => t.stationId === st.id) ? 'Already done. No raise approved.' : 'This is not on your task list.');
    if (this.stationDisabled(st)) return this.reject(p, 'DISABLED', 'This station is offline due to an ongoing outage.');
    const puzzle = generatePuzzle(task.type, this.rng);
    const session: TaskSession = {
      id: `s${++this.sessionCounter}`,
      stationId: st.id,
      taskId: task.id,
      puzzle,
      startedAt: this.now(),
      fake: p.role === 'manager',
    };
    p.taskSession = session;
    p.fixSession = null;
    this.send(p, { t: 'taskOpen', session: session.id, taskType: task.type, station: st.id, data: puzzle.data, fake: session.fake });
    this.markDirty();
  }

  private onTaskSubmit(p: Player, sessionId: string, answer: unknown) {
    const s = p.taskSession;
    if (!s || s.id !== sessionId) return this.reject(p, 'NO_SESSION', 'That task window has expired.');
    if (this.phase !== 'ACTIVE') return this.reject(p, 'BAD_PHASE', 'Tasks are paused.');
    const st = STATION_BY_ID[s.stationId];
    if (!this.nearStation(p, st, TASK_LEASH)) {
      p.taskSession = null;
      return this.send(p, { t: 'taskClosed', reason: 'too_far' });
    }
    if (this.stationDisabled(st)) {
      p.taskSession = null;
      return this.send(p, { t: 'taskClosed', reason: 'sabotage' });
    }
    const task = p.tasks.find((t) => t.id === s.taskId);
    if (!task || task.done) return this.reject(p, 'DONE', 'Already done.');
    if (this.now() - s.startedAt < TASK_INFO[task.type].minMs) {
      return this.send(p, { t: 'taskResult', session: s.id, ok: false, line: 'Too fast. Suspiciously productive.' });
    }
    if (!verifyAnswer(s.puzzle, answer)) {
      return this.send(p, { t: 'taskResult', session: s.id, ok: false, line: 'Not quite. Check your work.' });
    }
    // Correct: mark complete. Manager "fake" completions only update their own decoy list.
    task.done = true;
    p.taskSession = null;
    this.send(p, { t: 'taskResult', session: s.id, ok: true, line: pick(this.rng, TASK_DONE_LINES) });
    this.markDirty();
    if (!s.fake) this.checkWin();
  }

  private onFixHold(p: Player, stationId: string, holding: boolean) {
    const fs = p.fixSession;
    if (!fs || fs.stationId !== stationId) return;
    if (!holding) {
      fs.holding = false;
      this.markDirty();
      return;
    }
    if (this.phase !== 'ACTIVE' || !p.alive) return;
    if (fs.fix === 'power') return; // power uses a puzzle
    if (!fs.holding) {
      fs.holding = true;
      fs.holdSince = this.now();
      this.markDirty();
    }
  }

  private onFixSubmit(p: Player, stationId: string, answer: unknown) {
    const fs = p.fixSession;
    if (!fs || fs.stationId !== stationId || fs.fix !== 'power') return;
    if (this.phase !== 'ACTIVE' || !p.alive) return;
    if (!this.nearStation(p, STATION_BY_ID[stationId], TASK_LEASH)) return;
    if (this.now() - fs.openedAt < 1500 || !verifyPower(answer)) return this.send(p, { t: 'fixResult', station: stationId, ok: false });
    this.send(p, { t: 'fixResult', station: stationId, ok: true });
    this.markFixed('power', p);
  }

  private updateFixes() {
    const t = this.now();
    let serverA: Player | null = null;
    let serverB: Player | null = null;
    for (const p of this.players.values()) {
      const fs = p.fixSession;
      if (!fs) continue;
      const st = STATION_BY_ID[fs.stationId];
      if (!p.alive || !p.connected || !this.nearStation(p, st, TASK_LEASH) || !this.fixRelevant(fs.fix)) {
        p.fixSession = null;
        this.send(p, { t: 'taskClosed', reason: 'fix_cancelled' });
        this.markDirty();
        continue;
      }
      if (!fs.holding) continue;
      if (fs.fix === 'serverA') serverA = p;
      else if (fs.fix === 'serverB') serverB = p;
      else {
        const need = HOLD_MS[fs.fix] ?? 2000;
        if (t - fs.holdSince >= need) this.markFixed(fs.fix, p);
      }
    }
    const s = this.sabotage;
    if (s?.kind === 'server') {
      if (serverA && serverB) {
        if (!s.serverBothSince) {
          s.serverBothSince = t;
          this.markDirty();
        } else if (t - s.serverBothSince >= SERVER_SYNC_MS) {
          s.pending.clear();
          s.fixed.add('serverA').add('serverB');
          this.resolveSabotage(serverA);
        }
      } else if (s.serverBothSince) {
        s.serverBothSince = 0;
        this.markDirty();
      }
    }
  }

  private onKill(p: Player, targetId: string) {
    const t = this.now();
    const target = this.byPublic.get(targetId);
    const fail = (m: string) => this.reject(p, 'KILL', m);
    if (this.phase !== 'ACTIVE') return fail('Not during this phase.');
    if (p.role !== 'manager' || !p.alive || p.spectator) return fail('You are not authorised to do that.');
    if (p.inVent) return fail('Leave the passage first.');
    if (!target || target.spectator || !target.alive || target.role !== 'employee') return fail('Invalid target.');
    if (t < p.killReadyAt) return fail('Termination is on cooldown.');
    if (target.inVent) return fail('Invalid target.');
    const range = KILL_RANGES[this.settings.killRange];
    if (dist(p.x, p.y, target.x, target.y) > range + 0.05) return fail('Too far away.');
    if (!lineOfSight(p.x, p.y, target.x, target.y)) return fail('There is a wall in the way.');
    const lockedBetween = this.doorsLockedUntil && roomAt(p.x, p.y) !== roomAt(target.x, target.y) && !lineOfSight(p.x, p.y, target.x, target.y);
    if (lockedBetween) return fail('Blocked.');

    const variant = Math.floor(this.rng() * ELIMINATION_NAMES.length);
    target.alive = false;
    target.taskSession = null;
    target.fixSession = null;
    target.viewingCctv = false;
    target.vx = 0;
    target.vy = 0;
    p.kills++;
    p.killReadyAt = t + this.settings.killCooldown * 1000;
    p.taskSession = null;
    this.stats.eliminations++;
    const body: Body = { id: `b${this.stats.eliminations}-${this.matchNo}`, victim: target, x: target.x, y: target.y, variant, room: roomName(roomAt(target.x, target.y)) };
    this.bodies.push(body);
    // Only players who could actually witness it get the animation event.
    for (const o of this.players.values()) {
      if (o === target || o === p || this.canSeePoint(o, body.x, body.y)) {
        this.send(o, { t: 'elim', victimId: target.publicId, x: body.x, y: body.y, variant });
      }
    }
    this.send(target, { t: 'youDied', variant });
    this.deps.voice?.removeFromMain(this.code, target.publicId);
    if (target.voiceEnabled) void this.sendVoiceToken(target);
    this.markDirty();
    this.checkWin();
  }

  private onReport(p: Player, bodyId: string) {
    if (this.phase !== 'ACTIVE') return this.reject(p, 'BAD_PHASE', 'A meeting is already in progress.');
    if (!p.alive || p.spectator) return this.reject(p, 'GHOST', 'Ghosts cannot file reports.');
    if (p.inVent) return;
    const body = this.bodies.find((b) => b.id === bodyId);
    if (!body) return this.reject(p, 'NO_BODY', 'That incident was already reported.');
    if (dist(p.x, p.y, body.x, body.y) > REPORT_RANGE + 0.05) return this.reject(p, 'TOO_FAR', 'Get closer to report.');
    this.startMeeting('report', p, body);
  }

  private onEmergency(p: Player) {
    const t = this.now();
    if (this.phase !== 'ACTIVE') return this.reject(p, 'BAD_PHASE', 'A meeting is already in progress.');
    if (!p.alive || p.spectator) return this.reject(p, 'GHOST', 'Ghosts cannot call meetings.');
    if (p.inVent) return;
    if (this.sabotage?.critical) return this.reject(p, 'CRITICAL', 'Deal with the emergency first!');
    if (p.emergencyLeft <= 0) return this.reject(p, 'NO_MEETINGS', 'You have used all your emergency meetings.');
    if (t < this.emergencyReadyAt) return this.reject(p, 'COOLDOWN', `The button is warming up (${Math.ceil((this.emergencyReadyAt - t) / 1000)}s).`);
    if (!this.nearStation(p, STATION_BY_ID.emergency, EMERGENCY_RANGE)) return this.reject(p, 'TOO_FAR', 'Get to the conference table.');
    p.emergencyLeft--;
    this.startMeeting('emergency', p, null);
  }

  private onVent(p: Player, action: 'enter' | 'move' | 'exit', ventId?: string) {
    const t = this.now();
    if (this.phase !== 'ACTIVE' || p.role !== 'manager' || !p.alive) return this.reject(p, 'VENT', 'Employees may not use maintenance passages.');
    if (action === 'enter') {
      const v = ventId ? VENT_BY_ID[ventId] : undefined;
      if (!v || p.inVent || t < p.ventReadyAt) return;
      if (dist(p.x, p.y, v.x, v.y) > VENT_RANGE + 0.35) return this.reject(p, 'TOO_FAR', 'Get closer to the access panel.');
      p.taskSession = null;
      p.inVent = v.id;
      p.x = v.x;
      p.y = v.y;
      p.vx = p.vy = 0;
      p.inputs = [];
      p.ventReadyAt = t + VENT_COOLDOWN_MS;
      this.ventFx(v.id, 'enter', p);
    } else if (action === 'move') {
      const cur = p.inVent ? VENT_BY_ID[p.inVent] : undefined;
      if (!cur || !ventId || !cur.links.includes(ventId) || t < p.ventReadyAt - VENT_COOLDOWN_MS + 250) return;
      const v = VENT_BY_ID[ventId];
      p.inVent = v.id;
      p.x = v.x;
      p.y = v.y;
      p.ventReadyAt = t + 250;
    } else {
      if (!p.inVent || t < p.ventReadyAt - VENT_COOLDOWN_MS + 300) return;
      const v = VENT_BY_ID[p.inVent];
      p.inVent = null;
      p.ventReadyAt = t + VENT_COOLDOWN_MS;
      this.ventFx(v.id, 'exit', p);
    }
    this.markDirty();
  }

  private ventFx(ventId: string, kind: 'enter' | 'exit', actor: Player) {
    const v = VENT_BY_ID[ventId];
    for (const o of this.players.values()) {
      if (o === actor || this.canSeePoint(o, v.x, v.y)) this.send(o, { t: 'ventFx', vent: ventId, kind });
    }
  }

  private onVote(p: Player, target: string) {
    if (this.phase !== 'VOTING' || !this.meeting) return this.reject(p, 'BAD_PHASE', 'Voting is not open.');
    if (!p.alive || p.spectator || !p.role) return this.reject(p, 'GHOST', 'Only living employees can vote.');
    if (this.meeting.votes.has(p.publicId)) return this.reject(p, 'ALREADY_VOTED', 'You already voted.');
    if (target !== SKIP) {
      const t = this.byPublic.get(target);
      if (!t || !t.alive || t.spectator || !t.role) return this.reject(p, 'BAD_TARGET', 'You cannot vote for them.');
    }
    this.meeting.votes.set(p.publicId, target);
    this.markDirty();
    const eligible = this.activePlayers.filter((o) => o.alive && o.role && o.connected);
    if (eligible.every((o) => this.meeting!.votes.has(o.publicId))) {
      // Everyone voted: end voting shortly so the last vote animates.
      this.phaseEndsAt = Math.min(this.phaseEndsAt ?? Infinity, this.now() + 1200);
    }
  }

  private onChat(p: Player, raw: string) {
    let channel: ChatChannel;
    if (this.phase === 'WAITING' || this.phase === 'STARTING' || this.phase === 'GAME_OVER' || this.phase === 'RETURNING_TO_LOBBY') channel = 'lobby';
    else if (p.spectator || !p.alive) channel = 'ghost';
    else if (isMeetingPhase(this.phase) && this.phase !== 'VOTE_RESULTS') channel = 'meeting';
    else if (isMeetingPhase(this.phase)) channel = 'meeting';
    else return this.reject(p, 'CHAT_CLOSED', 'Chat opens during HR meetings. Use your voice (or your eyes).');
    if (!p.chatBucket.take()) return this.reject(p, 'RATE_LIMIT', 'You are typing faster than HR can read.');
    const text = sanitizeChat(raw);
    if (!text) return;
    if (!p.spam.allow(text)) return this.reject(p, 'SPAM', 'Please do not repeat the same message.');
    this.pushChat({ channel, fromId: p.publicId, name: p.name, color: colorHex(p.appearance.color), text });
  }

  private onTestHook(p: Player, cmd: string, args: Record<string, unknown>) {
    if (!this.deps.testHooks) return this.reject(p, 'FORBIDDEN', 'Unknown command.');
    if (cmd === 'forceManagers' && this.phase === 'WAITING' && Array.isArray(args.ids)) this.forcedManagers = args.ids.map(String);
    if (cmd === 'teleport' && typeof args.x === 'number' && typeof args.y === 'number') this.place(p, args.x, args.y);
    if (cmd === 'fastForward' && typeof args.ms === 'number') {
      // Shortens current timers (tests only).
      if (this.phaseEndsAt) this.phaseEndsAt -= args.ms;
      for (const o of this.players.values()) o.killReadyAt -= args.ms;
      this.sabotageReadyAt -= args.ms;
      this.doorsReadyAt -= args.ms;
      this.emergencyReadyAt -= args.ms;
      if (this.sabotage?.endsAt) this.sabotage.endsAt -= args.ms;
      if (this.doorsLockedUntil) this.doorsLockedUntil -= args.ms;
    }
    this.markDirty();
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  private voiceMode(p: Player): VoiceMode {
    if (p.spectator) return 'spectator';
    if (isInMatch(this.phase) && !p.alive) return 'ghost';
    return isInMatch(this.phase) ? 'alive' : 'lobby';
  }

  async sendVoiceToken(p: Player) {
    const v = this.deps.voice;
    if (!v || !v.enabled || !v.url) return this.send(p, { t: 'voiceUnavailable', reason: 'Voice chat is not configured on this server.' });
    try {
      p.voiceEnabled = true;
      const mode = this.voiceMode(p);
      this.lastVoiceModes.set(p.identity, mode);
      const { token, room } = await v.token(this.code, p.publicId, p.name, mode);
      this.send(p, { t: 'voiceToken', url: v.url, token, room, mode });
    } catch (e) {
      this.send(p, { t: 'voiceUnavailable', reason: (e as Error).message });
    }
  }

  private lastVoiceModes = new Map<string, VoiceMode>();
  private refreshVoiceForAll() {
    for (const p of this.players.values()) {
      const mode = this.voiceMode(p);
      const prev = this.lastVoiceModes.get(p.identity);
      this.lastVoiceModes.set(p.identity, mode);
      const room = (m: VoiceMode) => (m === 'ghost' || m === 'spectator' ? 'ghost' : 'main');
      if (p.voiceEnabled && prev && room(prev) !== room(mode)) void this.sendVoiceToken(p);
    }
  }

  private sendVoiceGains() {
    const meeting = isMeetingPhase(this.phase);
    const open = !isInMatch(this.phase);
    for (const listener of this.players.values()) {
      if (!listener.voiceEnabled || !listener.connected) continue;
      const g: Record<string, number> = {};
      const lMode = this.voiceMode(listener);
      for (const sp of this.players.values()) {
        if (sp === listener) continue;
        const sMode = this.voiceMode(sp);
        const sameRoom = (lMode === 'ghost' || lMode === 'spectator') === (sMode === 'ghost' || sMode === 'spectator');
        if (!sameRoom) continue;
        if (open || meeting || lMode === 'ghost' || lMode === 'spectator') {
          g[sp.publicId] = 1;
          continue;
        }
        if (sp.inVent) {
          g[sp.publicId] = 0;
          continue;
        }
        const d = dist(listener.x, listener.y, sp.x, sp.y);
        let gain = d <= VOICE_FULL_VOLUME_RADIUS ? 1 : d >= VOICE_RADIUS ? 0 : 1 - (d - VOICE_FULL_VOLUME_RADIUS) / (VOICE_RADIUS - VOICE_FULL_VOLUME_RADIUS);
        if (gain > 0 && !lineOfSight(listener.x, listener.y, sp.x, sp.y)) gain *= 0.35;
        g[sp.publicId] = Math.round(gain * gain * 100) / 100;
      }
      this.send(listener, { t: 'voiceGains', g });
    }
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  tick() {
    if (this.disposed) return;
    this.tickNo++;
    const t = this.now();
    this.simulateMovement();
    this.updateTimers(t);
    if (this.phase === 'ACTIVE') {
      this.updateFixes();
      this.updateTaskLeashes();
      if (this.tickNo % 2 === 0) this.refreshHolders();
    }
    this.updateDisconnects(t);
    this.sendSnapshots();
    if (this.dirty) {
      this.dirty = false;
      for (const p of this.players.values()) this.sendState(p);
    }
    if (this.tickNo % 5 === 0) this.sendVoiceGains();
    if (this.tickNo % 4 === 0) for (const p of this.players.values()) if (p.viewingCctv) this.sendCctv(p);
  }

  private updateTimers(t: number) {
    // Sabotage timers first: a critical countdown that hits zero in the same
    // tick as another transition is resolved deterministically here.
    if (this.phase === 'ACTIVE') {
      if (this.sabotage?.critical && this.sabotage.endsAt && t >= this.sabotage.endsAt) {
        this.criticalExpired = true;
        this.checkWin();
        return;
      }
      if (this.doorsLockedUntil && t >= this.doorsLockedUntil) {
        this.unlockDoors();
        this.notifyAll('Conference room doors unlocked.', 'info', undefined, 'doorOpen');
        this.markDirty();
      }
    }
    if (this.phaseEndsAt !== null && t >= this.phaseEndsAt) {
      switch (this.phase) {
        case 'STARTING':
          this.beginMatch();
          break;
        case 'ROLE_REVEAL':
          if (!this.checkWin()) this.setPhase('ACTIVE', null);
          break;
        case 'MEETING_INTRO':
          if (this.settings.discussionTime > 0) this.setPhase('DISCUSSION', this.settings.discussionTime * 1000);
          else {
            this.setPhase('DISCUSSION', 0);
          }
          break;
        case 'DISCUSSION':
          this.setPhase('VOTING', this.settings.votingTime * 1000);
          break;
        case 'VOTING':
          this.finishVoting();
          break;
        case 'VOTE_RESULTS':
          this.resumeAfterMeeting();
          break;
        case 'GAME_OVER':
          this.returnToLobby();
          break;
        case 'RETURNING_TO_LOBBY':
          this.resetToLobby();
          break;
      }
    }
    if (this.phase === 'STARTING' && this.activePlayers.filter((p) => p.connected).length < MIN_PLAYERS) {
      this.setPhase('WAITING', null);
      this.notifyAll('Someone left — not enough players to start.', 'warn');
    }
    if (this.phase === 'WAITING' && this.autoStartAt && t >= this.autoStartAt) {
      this.autoStartAt = null;
      this.startCountdown();
    }
  }

  /** Public lobbies start automatically once enough players are ready. */
  private maybeScheduleAutoStart() {
    if (!this.settings.isPublic || this.phase !== 'WAITING') return;
    const connected = this.activePlayers.filter((p) => p.connected);
    const allReady = connected.length >= MIN_PLAYERS && connected.every((p) => p.ready);
    const next = allReady ? (this.autoStartAt ?? this.now() + 5000) : null;
    if (next !== this.autoStartAt) {
      this.autoStartAt = next;
      this.markDirty();
    }
  }

  private updateTaskLeashes() {
    for (const p of this.players.values()) {
      const s = p.taskSession;
      if (!s) continue;
      if (!this.nearStation(p, STATION_BY_ID[s.stationId], TASK_LEASH) || !p.connected) {
        p.taskSession = null;
        this.send(p, { t: 'taskClosed', reason: 'too_far' });
        this.markDirty();
      }
    }
  }

  private updateDisconnects(t: number) {
    for (const p of [...this.players.values()]) {
      if (p.connected || p.left) continue;
      const grace = this.phase === 'WAITING' ? LOBBY_RECONNECT_GRACE_MS : RECONNECT_GRACE_MS;
      if (t - p.disconnectedAt > grace) {
        this.remove(p, 'timeout');
        if (isInMatch(this.phase)) this.checkWin();
      }
    }
    if (this.phase === 'WAITING') this.maybeScheduleAutoStart();
  }

  private sendSnapshots() {
    const working = (p: Player) => !!(p.taskSession || p.fixSession?.holding);
    const bodies = this.bodies;
    for (const viewer of this.players.values()) {
      if (!viewer.connected) continue;
      if (isMeetingPhase(this.phase) || this.phase === 'ROLE_REVEAL' || this.phase === 'STARTING') {
        // nothing moves in these phases; send a light keep-alive every second
        if (this.tickNo % 20 !== 0) continue;
      }
      const ps: SnapPlayer[] = [];
      for (const o of this.players.values()) {
        if (o === viewer || !this.canSeePlayer(viewer, o)) continue;
        if (!o.connected && this.phase === 'WAITING') continue;
        ps.push({
          i: o.publicId,
          x: Math.round(o.x * 100) / 100,
          y: Math.round(o.y * 100) / 100,
          a: !o.alive && isInMatch(this.phase) ? 2 : working(o) ? 1 : 0,
        });
      }
      const bs: BodyView[] = [];
      for (const b of bodies) {
        if (this.canSeePoint(viewer, b.x, b.y)) bs.push({ id: b.id, victimId: b.victim.publicId, x: b.x, y: b.y, variant: b.variant });
      }
      this.send(viewer, {
        t: 'snap',
        tick: this.tickNo,
        serverTime: this.now(),
        ack: viewer.lastSeq,
        me: viewer.spectator ? null : [viewer.x, viewer.y, viewer.vx, viewer.vy],
        p: ps,
        b: bs,
      });
    }
  }

  private sendCctv(p: Player) {
    if (!this.cctvOnline || this.phase !== 'ACTIVE') {
      p.viewingCctv = false;
      return this.send(p, { t: 'cctv', online: false, feeds: [] });
    }
    if (!this.nearStation(p, STATION_BY_ID.cctv, TASK_LEASH)) {
      p.viewingCctv = false;
      return this.send(p, { t: 'taskClosed', reason: 'too_far' });
    }
    const feeds = CAMERAS.map((c) => ({
      id: c.id,
      name: c.name,
      players: this.activePlayers
        .filter((o) => o.alive && !o.inVent && o.x >= c.box.x0 && o.x <= c.box.x1 && o.y >= c.box.y0 && o.y <= c.box.y1)
        .map((o) => ({ id: o.publicId, x: Math.round(o.x * 10) / 10, y: Math.round(o.y * 10) / 10 })),
    }));
    this.send(p, { t: 'cctv', online: true, feeds });
  }

  // -------------------------------------------------------------------------
  // Per-recipient state (role data only goes to authorised players)
  // -------------------------------------------------------------------------

  buildState(viewer: Player): StateMsg {
    const omni = viewer.spectator || !viewer.alive;
    const over = this.phase === 'GAME_OVER';
    const players: PublicPlayer[] = this.activePlayers
      .filter((o) => !(o.left && !isInMatch(this.phase) && !over))
      .map((o) => {
        const pp: PublicPlayer = {
          id: o.publicId,
          name: o.name,
          appearance: o.appearance,
          ready: o.ready || this.hostId === o.identity,
          connected: o.connected,
          isHost: this.hostId === o.identity,
          dead: isInMatch(this.phase) ? (o === viewer || omni ? !o.alive : o.deathKnown && !o.alive) : false,
          registered: o.registered,
          ping: o.ping,
          speaking: o.speaking,
        };
        if (over) pp.role = o.role ?? undefined;
        else if (viewer.role === 'manager' && o.role === 'manager' && isInMatch(this.phase)) pp.role = 'manager';
        else if (o === viewer && viewer.role) pp.role = viewer.role;
        return pp;
      });
    const meeting: MeetingView | null = this.meeting
      ? {
          kind: this.meeting.kind,
          reporterId: this.meeting.reporter.publicId,
          victimId: this.meeting.victim?.publicId ?? null,
          victimName: this.meeting.victim?.name ?? null,
          victimColor: this.meeting.victim ? colorHex(this.meeting.victim.appearance.color) : null,
          room: this.meeting.room,
          votedIds: [...this.meeting.votes.keys()],
          myVote: this.meeting.votes.get(viewer.publicId) ?? null,
          results: this.meeting.results,
          line: this.meeting.line,
        }
      : null;
    const s = this.sabotage;
    const holding: FixTarget[] = [];
    for (const o of this.players.values()) if (o.fixSession?.holding) holding.push(o.fixSession.fix);
    const fs = viewer.fixSession;
    let fixView: StateMsg['you']['fix'] = null;
    if (fs) {
      let progress = 0;
      if (fs.holding) {
        if (fs.fix === 'serverA' || fs.fix === 'serverB') progress = s?.serverBothSince ? Math.min(1, (this.now() - s.serverBothSince) / SERVER_SYNC_MS) : 0;
        else progress = Math.min(1, (this.now() - fs.holdSince) / (HOLD_MS[fs.fix] ?? 2000));
      }
      fixView = { station: fs.stationId, progress };
    }
    return {
      t: 'state',
      serverTime: this.now(),
      code: this.code,
      isPublic: this.settings.isPublic,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      settings: this.settings,
      hostId: this.hostId ? (this.players.get(this.hostId)?.publicId ?? null) : null,
      players,
      spectators: [...this.players.values()].filter((o) => o.spectator && o.connected).map((o) => ({ id: o.publicId, name: o.name })),
      progress: this.progress(),
      sabotage: s
        ? {
            kind: s.kind,
            critical: s.critical,
            startedAt: s.startedAt,
            endsAt: s.endsAt,
            pending: [...s.pending],
            fixed: [...s.fixed],
            holding,
          }
        : null,
      doorsLockedUntil: this.doorsLockedUntil,
      cctvOnline: this.cctvOnline,
      meeting,
      gameOver: this.gameOver,
      autoStartAt: this.autoStartAt,
      you: {
        id: viewer.publicId,
        role: viewer.role,
        alive: viewer.alive,
        spectator: viewer.spectator,
        teammates:
          viewer.role === 'manager'
            ? this.activePlayers.filter((o) => o !== viewer && o.role === 'manager').map((o) => o.publicId)
            : [],
        tasks: viewer.tasks,
        killReadyAt: viewer.killReadyAt,
        sabotageReadyAt: this.sabotageReadyAt,
        doorsReadyAt: this.doorsReadyAt,
        emergencyLeft: viewer.emergencyLeft,
        emergencyReadyAt: this.emergencyReadyAt,
        inVent: viewer.inVent,
        fix: fixView,
        isHost: this.hostId === viewer.identity,
      },
    };
  }

  private sendState(p: Player) {
    if (!p.connected) return;
    this.send(p, this.buildState(p));
  }

  /** Keeps live fix-progress bars moving for holders. */
  refreshHolders() {
    for (const p of this.players.values()) if (p.fixSession?.holding) this.markDirty();
  }

  dispose() {
    this.disposed = true;
    for (const p of this.players.values()) p.conn?.close(1001, 'room closed');
    void this.deps.voice?.closeRoom(this.code);
  }
}
