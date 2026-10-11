import { create } from 'zustand';
import type { ChatMessage, CctvFeed, FixTarget, ServerMessageOf, StateMsg, TaskType } from '@corp/shared';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'danger' | 'success';
  text: string;
  at: number;
}

export interface TaskModal {
  session: string;
  taskType: TaskType;
  station: string;
  data: any;
  fake: boolean;
  result: { ok: boolean; line?: string; n: number } | null;
}

export interface FixModal {
  station: string;
  fix: FixTarget;
  data?: any;
  result: { ok: boolean; n: number } | null;
}

export interface GameStore {
  status: ConnStatus;
  statusMessage: string | null;
  code: string | null;
  myId: string | null;
  testHooks: boolean;
  state: StateMsg | null;
  clockOffset: number; // serverTime - Date.now()
  ping: number;
  chat: ChatMessage[];
  toasts: Toast[];
  task: TaskModal | null;
  fix: FixModal | null;
  cctv: { online: boolean; feeds: CctvFeed[] } | null;
  died: { variant: number; at: number } | null;
  mapOpen: boolean;
  settingsOpen: boolean;
  sabotageOpen: boolean;
  customizeOpen: boolean;
  chatOpen: boolean;
  voice: { status: 'off' | 'connecting' | 'on' | 'unavailable' | 'denied' | 'error'; mode?: string; detail?: string; speaking: string[]; transmitting: boolean };
  spectateTarget: string | null;
  lastError: ServerMessageOf<'error'> | null;
  set(p: Partial<GameStore>): void;
  toast(kind: Toast['kind'], text: string): void;
  reset(): void;
}

let toastId = 0;

const initial = {
  status: 'idle' as ConnStatus,
  statusMessage: null,
  code: null,
  myId: null,
  testHooks: false,
  state: null,
  clockOffset: 0,
  ping: 0,
  chat: [] as ChatMessage[],
  toasts: [] as Toast[],
  task: null,
  fix: null,
  cctv: null,
  died: null,
  mapOpen: false,
  settingsOpen: false,
  sabotageOpen: false,
  customizeOpen: false,
  chatOpen: false,
  voice: { status: 'off' as const, speaking: [] as string[], transmitting: false },
  spectateTarget: null,
  lastError: null,
};

export const useGame = create<GameStore>((set, get) => ({
  ...initial,
  set: (p) => set(p),
  toast(kind, text) {
    const t: Toast = { id: ++toastId, kind, text, at: Date.now() };
    set({ toasts: [...get().toasts.slice(-4), t] });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== t.id) }), kind === 'danger' ? 6000 : 4200);
  },
  reset: () => set({ ...initial, toasts: get().toasts }),
}));

/** Server time estimate in ms. */
export function serverNow(): number {
  return Date.now() + useGame.getState().clockOffset;
}

export function me() {
  const s = useGame.getState().state;
  if (!s) return null;
  return s.players.find((p) => p.id === s.you.id) ?? null;
}
