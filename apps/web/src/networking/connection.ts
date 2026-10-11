import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage, type ServerMessageOf } from '@corp/shared';
import { useGame } from '../stores/game';
import { useSession } from '../stores/session';
import { sfx } from '../audio/audio';

type Listener<T> = (m: T) => void;

/**
 * One live connection to a game room. Owns reconnection (within the server's
 * 45 s grace window), clock sync and routing of messages to the UI store or
 * directly to the Phaser scene (high-frequency snapshots never touch React).
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private closedByUser = false;
  private pingTimer: number | null = null;
  private snapListeners = new Set<Listener<ServerMessageOf<'snap'>>>();
  private eventListeners = new Set<Listener<ServerMessage>>();
  private bestRtt = Infinity;
  welcomed = false;

  constructor(
    readonly code: string,
    private baseUrl: string | null = null,
  ) {}

  private url(): string {
    if (this.baseUrl) return this.baseUrl.replace(/\/$/, '') + '/ws';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect() {
    this.closedByUser = false;
    // A fresh handshake is required on every (re)connection; if the server restarted
    // and the room is gone, the hello is answered with ROOM_NOT_FOUND → fail cleanly.
    this.welcomed = false;
    const g = useGame.getState();
    g.set({ status: this.attempts ? 'reconnecting' : 'connecting', code: this.code });
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      const s = useSession.getState();
      this.raw({
        t: 'hello',
        v: PROTOCOL_VERSION,
        token: s.token!,
        code: this.code,
        name: s.name,
        appearance: s.appearance,
      });
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.route(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.stopPing();
      const fatal = ev.code === 4000 || ev.code === 4001 || ev.code === 4003 || this.closedByUser;
      if (fatal) {
        if (!this.closedByUser) useGame.getState().set({ status: 'failed' });
        return;
      }
      // Transient drop: retry with backoff inside the grace period.
      this.attempts++;
      if (this.attempts > 12) {
        useGame.getState().set({ status: 'failed', statusMessage: 'Lost connection to the office.' });
        return;
      }
      useGame.getState().set({ status: 'reconnecting' });
      setTimeout(() => !this.closedByUser && this.connect(), Math.min(4000, 400 * this.attempts));
    };
  }

  private route(msg: ServerMessage) {
    const g = useGame.getState();
    switch (msg.t) {
      case 'welcome':
        this.attempts = 0;
        this.welcomed = true;
        g.set({
          status: 'connected',
          myId: msg.you,
          code: msg.code,
          testHooks: msg.testHooks,
          statusMessage: null,
          clockOffset: msg.serverTime - Date.now(),
        });
        sessionStorage.setItem('cs_room', JSON.stringify({ code: msg.code, base: this.baseUrl }));
        this.startPing();
        if (msg.reconnected) g.toast('success', 'Reconnected. Your desk was kept warm.');
        break;
      case 'state': {
        const prev = g.state;
        g.set({ state: msg });
        if (prev && prev.phase !== msg.phase) this.emit(msg);
        break;
      }
      case 'snap':
        for (const l of this.snapListeners) l(msg);
        return;
      case 'chat':
        g.set({ chat: [...g.chat.slice(-150), msg.msg] });
        if (msg.msg.fromId !== g.myId) sfx('chat');
        break;
      case 'chatHistory':
        g.set({ chat: msg.msgs });
        break;
      case 'notice':
        g.toast(msg.kind, msg.text);
        if (msg.sfx) sfx(msg.sfx as any);
        break;
      case 'error':
        g.set({ lastError: msg });
        if (
          [
            'ROOM_NOT_FOUND',
            'ROOM_FULL',
            'AUTH',
            'VERSION',
            'KICKED',
            'ROOM_CLOSED',
            'TIMEOUT',
            'RATE_LIMIT',
          ].includes(msg.code) &&
          !this.welcomed
        ) {
          g.set({
            status: 'failed',
            statusMessage:
              msg.code === 'ROOM_NOT_FOUND' && this.attempts > 0
                ? 'The office server restarted and this room no longer exists. Please create or join a new room.'
                : msg.message,
          });
          sessionStorage.removeItem('cs_room');
          this.close(false);
        } else {
          g.toast('warn', msg.message);
          sfx('error');
        }
        break;
      case 'taskOpen':
        g.set({
          task: {
            session: msg.session,
            taskType: msg.taskType,
            station: msg.station,
            data: msg.data,
            fake: msg.fake,
            result: null,
          },
        });
        sfx('open');
        break;
      case 'taskResult': {
        const t = g.task;
        if (t && t.session === msg.session)
          g.set({ task: { ...t, result: { ok: msg.ok, line: msg.line, n: (t.result?.n ?? 0) + 1 } } });
        sfx(msg.ok ? 'taskDone' : 'error');
        break;
      }
      case 'taskClosed':
        if (g.task || g.fix || g.cctv) {
          if (msg.reason === 'too_far') g.toast('info', 'You walked away from your desk.');
          if (msg.reason === 'sabotage') g.toast('warn', 'That station just went offline!');
        }
        g.set({ task: null, fix: null, cctv: null });
        break;
      case 'fixOpen':
        g.set({ fix: { station: msg.station, fix: msg.fix, data: msg.data, result: null } });
        sfx('open');
        break;
      case 'fixResult': {
        const f = g.fix;
        if (f) g.set({ fix: { ...f, result: { ok: msg.ok, n: (f.result?.n ?? 0) + 1 } } });
        if (!msg.ok) sfx('error');
        break;
      }
      case 'cctv':
        g.set({ cctv: { online: msg.online, feeds: msg.feeds } });
        break;
      case 'youDied':
        g.set({ died: { variant: msg.variant, at: Date.now() }, task: null, fix: null, cctv: null });
        break;
      case 'pong': {
        const rtt = Date.now() - msg.ts;
        // Keep the offset from the lowest-latency sample (NTP-style).
        if (rtt <= this.bestRtt * 1.2) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          g.set({ clockOffset: msg.serverTime + rtt / 2 - Date.now() });
        }
        g.set({ ping: rtt });
        break;
      }
      case 'kicked':
        g.set({ status: 'failed', statusMessage: msg.reason });
        this.close(false);
        break;
      default:
        break;
    }
    this.emit(msg);
  }

  private emit(msg: ServerMessage) {
    for (const l of this.eventListeners) l(msg);
  }

  onSnap(l: Listener<ServerMessageOf<'snap'>>) {
    this.snapListeners.add(l);
    return () => this.snapListeners.delete(l);
  }
  onEvent(l: Listener<ServerMessage>) {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }

  private raw(m: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  send(m: ClientMessage) {
    if (!this.welcomed && m.t !== 'hello') return;
    this.raw(m);
  }

  private startPing() {
    this.stopPing();
    const ping = () => this.raw({ t: 'ping', ts: Date.now() });
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }
  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  close(sendLeave = true) {
    this.closedByUser = true;
    if (sendLeave) this.raw({ t: 'leave' });
    this.stopPing();
    try {
      this.ws?.close(1000);
    } catch {}
    this.ws = null;
    if (sendLeave) sessionStorage.removeItem('cs_room');
  }
}

let current: GameConnection | null = null;

export function connectToRoom(code: string, baseUrl: string | null = null): GameConnection {
  current?.close(false);
  useGame.getState().reset();
  current = new GameConnection(code.toUpperCase(), baseUrl);
  current.connect();
  return current;
}

export function getConnection(): GameConnection | null {
  return current;
}

export function leaveRoom() {
  current?.close(true);
  current = null;
  useGame.getState().reset();
}

export function send(m: ClientMessage) {
  current?.send(m);
}
