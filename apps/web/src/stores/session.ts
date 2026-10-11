import { create } from 'zustand';
import { DEFAULT_APPEARANCE, CHARACTER_COLORS, type Appearance } from '@corp/shared';

export interface SessionState {
  token: string | null;
  kind: 'guest' | 'user' | null;
  username: string | null;
  name: string;
  appearance: Appearance;
  stats: Record<string, number> | null;
  setAuth(token: string, kind: 'guest' | 'user', username?: string | null): void;
  setProfile(name: string, appearance: Appearance): void;
  setStats(s: Record<string, number> | null): void;
  logout(): void;
}

const PROFILE_KEY = 'cs_profile_v1';
const USER_KEY = 'cs_user_v1';
// Guest identities are per-tab (sessionStorage) so a refresh reconnects you,
// while two tabs are two different coworkers.
const GUEST_KEY = 'cs_guest_v1';

function loadProfile(): { name: string; appearance: Appearance } {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { name: v.name ?? '', appearance: { ...DEFAULT_APPEARANCE, ...v.appearance } };
    }
  } catch {}
  const c = CHARACTER_COLORS[Math.floor(Math.random() * CHARACTER_COLORS.length)].id;
  return { name: '', appearance: { ...DEFAULT_APPEARANCE, color: c } };
}

function loadAuth(): { token: string | null; kind: 'guest' | 'user' | null; username: string | null } {
  try {
    const u = localStorage.getItem(USER_KEY);
    if (u) {
      const v = JSON.parse(u);
      return { token: v.token, kind: 'user', username: v.username };
    }
    const g = sessionStorage.getItem(GUEST_KEY);
    if (g) return { token: g, kind: 'guest', username: null };
  } catch {}
  return { token: null, kind: null, username: null };
}

export const useSession = create<SessionState>((set) => ({
  ...loadAuth(),
  ...loadProfile(),
  stats: null,
  setAuth(token, kind, username = null) {
    try {
      if (kind === 'user') localStorage.setItem(USER_KEY, JSON.stringify({ token, username }));
      else sessionStorage.setItem(GUEST_KEY, token);
    } catch {}
    set({ token, kind, username });
  },
  setProfile(name, appearance) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name, appearance }));
    } catch {}
    set({ name, appearance });
  },
  setStats(stats) {
    set({ stats });
  },
  logout() {
    try {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(GUEST_KEY);
    } catch {}
    set({ token: null, kind: null, username: null, stats: null });
  },
}));
