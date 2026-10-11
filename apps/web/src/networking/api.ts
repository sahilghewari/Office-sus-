import type { Appearance } from '@corp/shared';
import { useSession } from '../stores/session';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, base = ''): Promise<T> {
  const token = useSession.getState().token;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(base + path, { ...init, headers });
  } catch {
    throw new ApiError('Cannot reach the office server. Is it running?', 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(data.error ?? data.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export interface UserView {
  id: string;
  username: string;
  appearance: Appearance;
  stats: Record<string, number>;
}

export const api = {
  config: () => call<{ protocol: number; voice: boolean; persistentAccounts: boolean }>('/api/config'),
  guest: () => call<{ token: string }>('/api/auth/guest', { method: 'POST' }),
  register: (username: string, password: string, appearance: Appearance) =>
    call<{ token: string; user: UserView }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, appearance }),
    }),
  login: (username: string, password: string) =>
    call<{ token: string; user: UserView }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => call<{ user: UserView }>('/api/me'),
  saveAppearance: (appearance: Appearance) =>
    call('/api/me/appearance', { method: 'PUT', body: JSON.stringify({ appearance }) }),
  deleteAccount: (password: string) =>
    call('/api/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
  createRoom: (isPublic: boolean) =>
    call<{ code: string }>('/api/rooms', { method: 'POST', body: JSON.stringify({ isPublic }) }),
  roomInfo: (code: string) =>
    call<{ code: string; phase: string; players: number; capacity: number; instanceUrl: string | null }>(
      `/api/rooms/${encodeURIComponent(code)}`,
    ),
  matchmake: () =>
    call<{ code: string; instanceUrl: string | null; created: boolean }>('/api/matchmake', {
      method: 'POST',
      body: '{}',
    }),
  publicRooms: () =>
    call<{ rooms: { players: number; capacity: number }[]; waiting: number }>('/api/public-rooms'),
};

/** Make sure we have some identity (guest by default — no forced registration). */
export async function ensureSession(): Promise<string> {
  const s = useSession.getState();
  if (s.token) return s.token;
  const { token } = await api.guest();
  useSession.getState().setAuth(token, 'guest');
  return token;
}
