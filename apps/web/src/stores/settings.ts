import { create } from 'zustand';

export type Action =
  'up' | 'down' | 'left' | 'right' | 'interact' | 'report' | 'kill' | 'sabotage' | 'map' | 'ptt';

export const DEFAULT_KEYS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'],
  report: ['KeyR'],
  kill: ['KeyQ'],
  sabotage: ['KeyF'],
  map: ['Tab'],
  ptt: ['KeyV'],
};

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  interact: 'Interact / Use',
  report: 'Report incident',
  kill: 'Eliminate (managers)',
  sabotage: 'Sabotage menu (managers)',
  map: 'Office map',
  ptt: 'Push to talk',
};

export interface SettingsState {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  muted: boolean;
  reducedMotion: boolean;
  quality: 'high' | 'low';
  showFps: boolean;
  keys: Record<Action, string[]>;
  voiceMode: 'ptt' | 'open';
  micDeviceId: string | null;
  mutedPlayers: string[]; // by display name + color key (public ids change per room)
  set(p: Partial<Omit<SettingsState, 'set' | 'bind' | 'reset'>>): void;
  bind(a: Action, code: string): void;
  reset(): void;
}

const KEY = 'cs_settings_v1';
const defaults = {
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  voice: 1,
  muted: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality: 'high' as const,
  showFps: false,
  keys: DEFAULT_KEYS,
  voiceMode: 'ptt' as const,
  micDeviceId: null,
  mutedPlayers: [] as string[],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const v = JSON.parse(raw);
    return { ...defaults, ...v, keys: { ...DEFAULT_KEYS, ...(v.keys ?? {}) } };
  } catch {
    return defaults;
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set(p) {
    set(p);
    persist(get());
  },
  bind(a, code) {
    // A key can only do one thing: remove it from other actions first.
    const keys = Object.fromEntries(
      Object.entries(get().keys).map(([k, v]) => [k, v.filter((c) => c !== code)]),
    ) as Record<Action, string[]>;
    keys[a] = [code, ...(keys[a] ?? []).filter((c) => c !== code)].slice(0, 2);
    set({ keys });
    persist(get());
  },
  reset() {
    set({ ...defaults });
    persist(get());
  },
}));

function persist(s: SettingsState) {
  try {
    const { set: _s, bind: _b, reset: _r, ...data } = s;
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Tab: 'Tab',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    Escape: 'Esc',
  };
  return map[code] ?? code;
}

export function isAction(a: Action, code: string): boolean {
  return useSettings.getState().keys[a]?.includes(code) ?? false;
}
