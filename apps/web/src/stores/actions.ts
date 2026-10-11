import { create } from 'zustand';

export interface UseAction {
  kind: 'task' | 'fix' | 'cctv' | 'emergency' | 'vent';
  id: string;
  label: string;
  disabled?: string;
}

export interface ActionsState {
  use: UseAction | null;
  report: { bodyId: string; name: string } | null;
  kill: { targetId: string; name: string } | null;
  room: string;
  myPos: [number, number];
  set(p: Partial<ActionsState>): void;
}

/** Context-sensitive actions, computed by the game scene ~10×/s for the HUD. */
export const useActions = create<ActionsState>((set) => ({
  use: null,
  report: null,
  kill: null,
  room: '',
  myPos: [0, 0],
  set: (p) => set(p),
}));
