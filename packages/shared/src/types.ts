import type { TaskType } from './tasks';

export type Phase =
  | 'WAITING'
  | 'STARTING'
  | 'ROLE_REVEAL'
  | 'ACTIVE'
  | 'MEETING_INTRO'
  | 'DISCUSSION'
  | 'VOTING'
  | 'VOTE_RESULTS'
  | 'GAME_OVER'
  | 'RETURNING_TO_LOBBY';

export const PHASES: readonly Phase[] = [
  'WAITING',
  'STARTING',
  'ROLE_REVEAL',
  'ACTIVE',
  'MEETING_INTRO',
  'DISCUSSION',
  'VOTING',
  'VOTE_RESULTS',
  'GAME_OVER',
  'RETURNING_TO_LOBBY',
];

/** Legal authoritative transitions of the match state machine. */
export const PHASE_TRANSITIONS: Record<Phase, readonly Phase[]> = {
  WAITING: ['STARTING'],
  STARTING: ['ROLE_REVEAL', 'WAITING'],
  ROLE_REVEAL: ['ACTIVE', 'GAME_OVER'],
  ACTIVE: ['MEETING_INTRO', 'GAME_OVER'],
  MEETING_INTRO: ['DISCUSSION', 'GAME_OVER'],
  DISCUSSION: ['VOTING', 'GAME_OVER'],
  VOTING: ['VOTE_RESULTS', 'GAME_OVER'],
  VOTE_RESULTS: ['ACTIVE', 'GAME_OVER'],
  GAME_OVER: ['RETURNING_TO_LOBBY'],
  RETURNING_TO_LOBBY: ['WAITING'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return PHASE_TRANSITIONS[from].includes(to);
}

export const MEETING_PHASES: readonly Phase[] = ['MEETING_INTRO', 'DISCUSSION', 'VOTING', 'VOTE_RESULTS'];
export function isMeetingPhase(p: Phase): boolean {
  return MEETING_PHASES.includes(p);
}
export function isInMatch(p: Phase): boolean {
  return p !== 'WAITING' && p !== 'GAME_OVER' && p !== 'RETURNING_TO_LOBBY' && p !== 'STARTING';
}

export type Role = 'employee' | 'manager';
export type Team = 'employees' | 'managers';

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

export const CHARACTER_COLORS = [
  { id: 'navy', name: 'Navy', hex: '#2b3a8f' },
  { id: 'blue', name: 'Blue', hex: '#3d7bff' },
  { id: 'purple', name: 'Purple', hex: '#8a5cf6' },
  { id: 'mint', name: 'Mint', hex: '#3ddc97' },
  { id: 'orange', name: 'Orange', hex: '#ff8a3d' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23f' },
  { id: 'red', name: 'Red', hex: '#ef3e4a' },
  { id: 'cyan', name: 'Cyan', hex: '#2ee6f0' },
  { id: 'pink', name: 'Pink', hex: '#ff6fb5' },
  { id: 'white', name: 'White', hex: '#eef1f7' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3b3f4c' },
  { id: 'lime', name: 'Lime', hex: '#a6e33b' },
] as const;
export type CharacterColorId = (typeof CHARACTER_COLORS)[number]['id'];

export const SHIRT_COLORS = [
  { id: 'white', hex: '#f6f7fb' },
  { id: 'sky', hex: '#a9d4ff' },
  { id: 'lilac', hex: '#cdb8ff' },
  { id: 'mint', hex: '#b8f2d8' },
  { id: 'peach', hex: '#ffd0b0' },
  { id: 'lemon', hex: '#fff0a0' },
  { id: 'black', hex: '#23252e' },
  { id: 'gray', hex: '#a7adbb' },
] as const;
export type ShirtColorId = (typeof SHIRT_COLORS)[number]['id'];

export const SKIN_TONES = [
  { id: 's1', hex: '#ffe0c7' },
  { id: 's2', hex: '#f5c49c' },
  { id: 's3', hex: '#d99a6c' },
  { id: 's4', hex: '#a86b45' },
  { id: 's5', hex: '#6e432b' },
] as const;
export type SkinToneId = (typeof SKIN_TONES)[number]['id'];

export const HAIR_COLORS = [
  { id: 'black', hex: '#1f1a1c' },
  { id: 'brown', hex: '#6b3f22' },
  { id: 'blonde', hex: '#e6c06a' },
  { id: 'ginger', hex: '#c85a26' },
  { id: 'silver', hex: '#c9ccd6' },
  { id: 'blue', hex: '#4a6cff' },
] as const;
export type HairColorId = (typeof HAIR_COLORS)[number]['id'];

export const HAIRSTYLES = [
  { id: 'short', name: 'Corporate Crop' },
  { id: 'bun', name: 'Productivity Bun' },
  { id: 'curly', name: 'Brainstorm Curls' },
  { id: 'quiff', name: 'Founder Quiff' },
  { id: 'long', name: 'Long Weekend' },
  { id: 'bald', name: 'Aerodynamic' },
] as const;
export type HairstyleId = (typeof HAIRSTYLES)[number]['id'];

export const OUTFITS = [
  { id: 'suit', name: 'Business Suit' },
  { id: 'shirt', name: 'Formal Shirt' },
  { id: 'hoodie', name: 'Hoodie' },
  { id: 'founder', name: 'Startup Founder' },
  { id: 'casual', name: 'Casual Friday' },
  { id: 'executive', name: 'Executive' },
] as const;
export type OutfitId = (typeof OUTFITS)[number]['id'];

export const ACCESSORIES = [
  { id: 'none', name: 'None' },
  { id: 'glasses', name: 'Glasses' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'coffee', name: 'Coffee Cup' },
  { id: 'tie', name: 'Tie' },
  { id: 'badge', name: 'ID Badge' },
  { id: 'backpack', name: 'Small Backpack' },
  { id: 'laptopbag', name: 'Laptop Bag' },
] as const;
export type AccessoryId = (typeof ACCESSORIES)[number]['id'];

export interface Appearance {
  color: CharacterColorId;
  shirt: ShirtColorId;
  skin: SkinToneId;
  hair: HairstyleId;
  hairColor: HairColorId;
  outfit: OutfitId;
  accessory: AccessoryId;
}

export const DEFAULT_APPEARANCE: Appearance = {
  color: 'blue',
  shirt: 'white',
  skin: 's2',
  hair: 'short',
  hairColor: 'brown',
  outfit: 'suit',
  accessory: 'badge',
};

export function colorHex(id: string): string {
  return CHARACTER_COLORS.find((c) => c.id === id)?.hex ?? '#888888';
}
export function colorName(id: string): string {
  return CHARACTER_COLORS.find((c) => c.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface GameSettings {
  maxPlayers: number;
  /** 0 = automatic (1 for 4–6 players, 2 for 7–10). */
  managers: number;
  killCooldown: number;
  killRange: 'short' | 'normal' | 'long';
  tasksPerPlayer: number;
  playerSpeed: number;
  discussionTime: number;
  votingTime: number;
  anonymousVotes: boolean;
  confirmEjects: boolean;
  employeeVision: number;
  managerVision: number;
  sabotageCooldown: number;
  emergencyMeetings: number;
  isPublic: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 10,
  managers: 0,
  killCooldown: 30,
  killRange: 'normal',
  tasksPerPlayer: 3,
  playerSpeed: 1,
  discussionTime: 60,
  votingTime: 45,
  anonymousVotes: false,
  confirmEjects: true,
  employeeVision: 1,
  managerVision: 1.25,
  sabotageCooldown: 30,
  emergencyMeetings: 1,
  isPublic: false,
};

export const KILL_RANGES: Record<GameSettings['killRange'], number> = { short: 1.0, normal: 1.5, long: 2.0 };

export interface PlayerTask {
  id: string;
  type: TaskType;
  stationId: string;
  done: boolean;
}

export type SabotageKind = 'wifi' | 'fire' | 'power' | 'doors' | 'server' | 'cctv' | 'outage';

export type ChatChannel = 'lobby' | 'meeting' | 'ghost';

export type GameOverReason =
  'tasks' | 'managers_voted_out' | 'parity' | 'critical_sabotage' | 'managers_left' | 'employees_left';
