import { z } from 'zod';
import { CHAT_MAX_LEN, NAME_MAX_LEN } from './constants';
import type { FixTarget } from './map';
import type { TaskType } from './tasks';
import {
  ACCESSORIES,
  CHARACTER_COLORS,
  HAIR_COLORS,
  HAIRSTYLES,
  OUTFITS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Appearance,
  type ChatChannel,
  type GameOverReason,
  type GameSettings,
  type Phase,
  type PlayerTask,
  type Role,
  type SabotageKind,
  type Team,
} from './types';

/** Bump when the wire format changes incompatibly. */
export const PROTOCOL_VERSION = 3;

const ids = <T extends readonly { id: string }[]>(arr: T) =>
  arr.map((a) => a.id) as unknown as [T[number]['id'], ...T[number]['id'][]];

export const AppearanceSchema = z.object({
  color: z.enum(ids(CHARACTER_COLORS)),
  shirt: z.enum(ids(SHIRT_COLORS)),
  skin: z.enum(ids(SKIN_TONES)),
  hair: z.enum(ids(HAIRSTYLES)),
  hairColor: z.enum(ids(HAIR_COLORS)),
  outfit: z.enum(ids(OUTFITS)),
  accessory: z.enum(ids(ACCESSORIES)),
});

export const NameSchema = z
  .string()
  .trim()
  .min(2)
  .max(NAME_MAX_LEN)
  .regex(/^[\p{L}\p{N} _.\-']+$/u, 'Letters, numbers, spaces and _.-\' only');

const finite = z.number().finite();
const id = z.string().min(1).max(64);

export const SettingsPatchSchema = z
  .object({
    maxPlayers: finite,
    managers: finite,
    killCooldown: finite,
    killRange: z.enum(['short', 'normal', 'long']),
    tasksPerPlayer: finite,
    playerSpeed: finite,
    discussionTime: finite,
    votingTime: finite,
    anonymousVotes: z.boolean(),
    confirmEjects: z.boolean(),
    employeeVision: finite,
    managerVision: finite,
    sabotageCooldown: finite,
    emergencyMeetings: finite,
    isPublic: z.boolean(),
  })
  .partial();

export const SABOTAGE_KINDS = ['wifi', 'fire', 'power', 'doors', 'server', 'cctv', 'outage'] as const;

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    v: z.number().int(),
    token: z.string().min(10).max(2048),
    code: z.string().min(1).max(12),
    name: NameSchema,
    appearance: AppearanceSchema,
  }),
  z.object({ t: z.literal('input'), seq: z.number().int().nonnegative(), mx: finite.min(-1).max(1), my: finite.min(-1).max(1) }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('profile'), name: NameSchema, appearance: AppearanceSchema }),
  z.object({ t: z.literal('settings'), settings: SettingsPatchSchema }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('kick'), target: id }),
  z.object({ t: z.literal('interact'), station: id }),
  z.object({ t: z.literal('taskSubmit'), session: id, answer: z.unknown() }),
  z.object({ t: z.literal('taskClose') }),
  z.object({ t: z.literal('fixHold'), station: id, holding: z.boolean() }),
  z.object({ t: z.literal('fixSubmit'), station: id, answer: z.unknown() }),
  z.object({ t: z.literal('kill'), target: id }),
  z.object({ t: z.literal('report'), body: id }),
  z.object({ t: z.literal('emergency') }),
  z.object({ t: z.literal('sabotage'), kind: z.enum(SABOTAGE_KINDS) }),
  z.object({ t: z.literal('vent'), action: z.enum(['enter', 'move', 'exit']), vent: id.optional() }),
  z.object({ t: z.literal('vote'), target: id }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(CHAT_MAX_LEN) }),
  z.object({ t: z.literal('returnToLobby') }),
  z.object({ t: z.literal('voiceToken') }),
  z.object({ t: z.literal('voiceState'), speaking: z.boolean() }),
  z.object({
    t: z.literal('reportPlayer'),
    target: id,
    category: z.enum(['harassment', 'cheating', 'spam', 'name', 'other']),
    note: z.string().max(300).optional(),
  }),
  z.object({ t: z.literal('ping'), ts: finite }),
  z.object({ t: z.literal('cctv'), open: z.boolean() }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('test'), cmd: z.string().max(40), args: z.record(z.string(), z.unknown()).optional() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageOf<T extends ClientMessage['t']> = Extract<ClientMessage, { t: T }>;

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: string;
  name: string;
  appearance: Appearance;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  /** Dead as far as the recipient is allowed to know. */
  dead: boolean;
  /** Only present for the recipient's own team (managers) or after GAME_OVER. */
  role?: Role;
  registered: boolean;
  ping: number;
  speaking?: boolean;
}

export interface SabotageView {
  kind: SabotageKind;
  critical: boolean;
  startedAt: number;
  endsAt: number | null;
  /** stations that still need fixing */
  pending: FixTarget[];
  /** stations already fixed (multi-station sabotages) */
  fixed: FixTarget[];
  /** live holders for coordinated repair */
  holding: FixTarget[];
}

export interface VoteResultsView {
  counts: Record<string, number>;
  /** voter ids per target; omitted when votes are anonymous */
  voters?: Record<string, string[]>;
  ejectedId: string | null;
  ejectedName: string | null;
  /** null when the host disabled role reveal */
  ejectedWasManager: boolean | null;
  tie: boolean;
  skipped: boolean;
  line: string;
  managersLeft: number | null;
}

export interface MeetingView {
  kind: 'report' | 'emergency';
  reporterId: string;
  victimId: string | null;
  victimName: string | null;
  victimColor: string | null;
  room: string | null;
  votedIds: string[];
  myVote: string | null;
  results: VoteResultsView | null;
  line: string;
}

export interface FinalPlayer {
  id: string;
  name: string;
  appearance: Appearance;
  role: Role;
  alive: boolean;
  tasksDone: number;
  tasksTotal: number;
  eliminations: number;
  won: boolean;
}

export interface GameOverView {
  winner: Team;
  reason: GameOverReason;
  headline: string;
  durationMs: number;
  tasksCompleted: number;
  tasksTotal: number;
  meetings: number;
  eliminations: number;
  players: FinalPlayer[];
}

export interface YouView {
  id: string;
  role: Role | null;
  alive: boolean;
  spectator: boolean;
  teammates: string[];
  tasks: PlayerTask[];
  killReadyAt: number;
  sabotageReadyAt: number;
  doorsReadyAt: number;
  emergencyLeft: number;
  emergencyReadyAt: number;
  inVent: string | null;
  fix: { station: string; progress: number } | null;
  isHost: boolean;
}

export interface StateMsg {
  t: 'state';
  serverTime: number;
  code: string;
  isPublic: boolean;
  phase: Phase;
  phaseEndsAt: number | null;
  settings: GameSettings;
  hostId: string | null;
  players: PublicPlayer[];
  spectators: { id: string; name: string }[];
  progress: { done: number; total: number };
  sabotage: SabotageView | null;
  doorsLockedUntil: number | null;
  cctvOnline: boolean;
  meeting: MeetingView | null;
  gameOver: GameOverView | null;
  autoStartAt: number | null;
  you: YouView;
}

/** compact per-tick player entry */
export interface SnapPlayer {
  i: string;
  x: number;
  y: number;
  /** 0 idle/walk, 1 working, 2 ghost */
  a: number;
}

export interface BodyView {
  id: string;
  victimId: string;
  x: number;
  y: number;
  variant: number;
}

export interface SnapMsg {
  t: 'snap';
  tick: number;
  serverTime: number;
  ack: number;
  me: [number, number, number, number] | null;
  p: SnapPlayer[];
  b: BodyView[];
}

export interface ChatMessage {
  id: number;
  channel: ChatChannel;
  fromId: string | null;
  name: string;
  color: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface CctvFeed {
  id: string;
  name: string;
  players: { id: string; x: number; y: number }[];
}

export type ServerMessage =
  | { t: 'welcome'; you: string; code: string; reconnected: boolean; serverTime: number; testHooks: boolean }
  | { t: 'error'; code: string; message: string }
  | { t: 'notice'; kind: 'info' | 'warn' | 'danger' | 'success'; text: string; sfx?: string }
  | StateMsg
  | SnapMsg
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'chatHistory'; msgs: ChatMessage[] }
  | { t: 'taskOpen'; session: string; taskType: TaskType; station: string; data: unknown; fake: boolean }
  | { t: 'taskResult'; session: string; ok: boolean; line?: string }
  | { t: 'taskClosed'; reason: string }
  | { t: 'fixOpen'; station: string; fix: FixTarget; data?: unknown }
  | { t: 'fixResult'; station: string; ok: boolean }
  | { t: 'elim'; victimId: string; x: number; y: number; variant: number }
  | { t: 'youDied'; variant: number }
  | { t: 'ventFx'; vent: string; kind: 'enter' | 'exit' }
  | { t: 'cctv'; online: boolean; feeds: CctvFeed[] }
  | { t: 'voiceToken'; url: string; token: string; room: string; mode: 'lobby' | 'alive' | 'ghost' | 'spectator' }
  | { t: 'voiceUnavailable'; reason: string }
  | { t: 'voiceGains'; g: Record<string, number> }
  | { t: 'pong'; ts: number; serverTime: number }
  | { t: 'kicked'; reason: string };

export type ServerMessageOf<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;
