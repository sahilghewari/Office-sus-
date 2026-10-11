import { create } from 'zustand';

export type Screen = 'landing' | 'customize' | 'play' | 'game';
export type Intent =
  { kind: 'create'; isPublic: boolean } | { kind: 'join'; code: string } | { kind: 'quick' } | null;

export interface AppState {
  screen: Screen;
  intent: Intent;
  modal: null | 'howto' | 'settings' | 'account' | 'privacy';
  busy: string | null;
  error: string | null;
  set(p: Partial<AppState>): void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'landing',
  intent: null,
  modal: null,
  busy: null,
  error: null,
  set: (p) => set(p),
}));
