import { api, ensureSession } from './api';
import { connectToRoom } from './connection';
import { useApp, type Intent } from '../stores/app';
import { useSession } from '../stores/session';

/** Runs a "go play" intent: make sure we have an identity + profile, then connect. */
export async function runIntent(intent: Intent) {
  const app = useApp.getState();
  if (!intent) return;
  if (!useSession.getState().name || useSession.getState().name.length < 2) {
    app.set({ screen: 'customize', intent });
    return;
  }
  app.set({
    busy:
      intent.kind === 'quick'
        ? 'Finding a public office…'
        : intent.kind === 'join'
          ? 'Badging in…'
          : 'Setting up your office…',
    error: null,
  });
  try {
    await ensureSession();
    let code: string;
    let base: string | null = null;
    if (intent.kind === 'create') code = (await api.createRoom(intent.isPublic)).code;
    else if (intent.kind === 'join') {
      code = intent.code.trim().toUpperCase();
      const info = await api.roomInfo(code);
      base = info.instanceUrl;
    } else {
      const r = await api.matchmake();
      code = r.code;
      base = r.instanceUrl;
    }
    connectToRoom(code, base);
    app.set({ screen: 'game', intent: null, busy: null });
    history.replaceState(null, '', `?room=${code}`);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) {
      // stale token (server restarted with a new secret) → get a fresh guest identity
      useSession.getState().logout();
      await ensureSession().catch(() => {});
    }
    app.set({ busy: null, error: (e as Error).message });
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}/?room=${code}`;
}
