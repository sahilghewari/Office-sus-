import WebSocket from 'ws';
import {
  CHARACTER_COLORS,
  DEFAULT_APPEARANCE,
  PROTOCOL_VERSION,
  STATION_BY_ID,
  TASK_INFO,
  VENT_BY_ID,
  createColliders,
  findPath,
  solveFromData,
  type ClientMessage,
  type ServerMessage,
  type ServerMessageOf,
  type SnapMsg,
  type StateMsg,
} from '@corp/shared';

const cols = createColliders();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A headless player that speaks the real WebSocket protocol. Used by the
 * integration tests, the browser end-to-end test and the load tester.
 */
export class Bot {
  ws!: WebSocket;
  id = '';
  state: StateMsg | null = null;
  snap: SnapMsg | null = null;
  msgs: ServerMessage[] = [];
  errors: ServerMessageOf<'error'>[] = [];
  received = 0;
  bytes = 0;
  private seq = 0;
  private waiters: { pred: (m: ServerMessage) => boolean; res: (m: ServerMessage) => void }[] = [];
  closed = false;
  token = '';
  snapDelays: number[] = [];

  constructor(
    readonly baseUrl: string,
    readonly name: string,
    readonly colorIndex = 0,
  ) {}

  static async token(baseUrl: string): Promise<string> {
    const r = await fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' });
    return ((await r.json()) as { token: string }).token;
  }

  static async createRoom(baseUrl: string, token: string, isPublic = false): Promise<string> {
    const r = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isPublic }),
    });
    return ((await r.json()) as { code: string }).code;
  }

  async connect(code: string, token?: string): Promise<this> {
    const tok = token ?? (await Bot.token(this.baseUrl));
    this.token = tok;
    this.ws = new WebSocket(this.baseUrl.replace(/^http/, 'ws') + '/ws');
    await new Promise<void>((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
    this.ws.on('message', (raw) => {
      const text = raw.toString();
      this.bytes += text.length;
      this.received++;
      const m = JSON.parse(text) as ServerMessage;
      if (m.t === 'snap') {
        this.snap = m;
        // one-way delay from server send → client receive (same-machine clocks in load tests)
        if (this.snapDelays.length < 4000) this.snapDelays.push(Date.now() - m.serverTime);
      } else {
        if (m.t === 'state') this.state = m;
        if (m.t === 'welcome') this.id = m.you;
        if (m.t === 'error') this.errors.push(m);
        this.msgs.push(m);
        if (this.msgs.length > 500) this.msgs.splice(0, 250);
      }
      for (const w of [...this.waiters]) {
        if (w.pred(m)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.res(m);
        }
      }
    });
    this.ws.on('close', () => (this.closed = true));
    const appearance = {
      ...DEFAULT_APPEARANCE,
      color: CHARACTER_COLORS[this.colorIndex % CHARACTER_COLORS.length].id,
    };
    this.send({ t: 'hello', v: PROTOCOL_VERSION, token: tok, code, name: this.name, appearance });
    const first = await this.waitFor((m) => m.t === 'welcome' || m.t === 'error', 5000);
    if (first.t === 'error') throw new Error(`${first.code}: ${first.message}`);
    await this.waitFor((m) => m.t === 'state', 3000);
    return this;
  }

  send(m: ClientMessage) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  waitFor<T extends ServerMessage = ServerMessage>(
    pred: (m: ServerMessage) => boolean,
    timeout = 10_000,
  ): Promise<T> {
    return new Promise((res, rej) => {
      const w = { pred, res: res as (m: ServerMessage) => void };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          rej(new Error(`${this.name}: timeout waiting for message`));
        }
      }, timeout);
    });
  }

  /** Like waitFor, but also matches messages that already arrived. */
  expectMsg<T extends ServerMessage = ServerMessage>(
    pred: (m: ServerMessage) => boolean,
    timeout = 5000,
  ): Promise<T> {
    const hit = this.msgs.find(pred);
    return hit ? Promise.resolve(hit as T) : this.waitFor<T>(pred, timeout);
  }

  async waitPhase(phase: string, timeout = 15_000) {
    if (this.state?.phase === phase) return this.state;
    return this.waitFor<StateMsg>((m) => m.t === 'state' && m.phase === phase, timeout);
  }

  get me(): [number, number] {
    return this.snap?.me ? [this.snap.me[0], this.snap.me[1]] : [0, 0];
  }

  /** Walks along an A* path using real 20 Hz inputs. */
  async walkTo(x: number, y: number, timeoutMs = 30_000): Promise<boolean> {
    const start = Date.now();
    await sleep(60);
    const [sx, sy] = this.me;
    const path = findPath(sx, sy, x, y, cols);
    if (!path) return false;
    let stuck = 0;
    let last: [number, number] = [sx, sy];
    while (path.length && Date.now() - start < timeoutMs) {
      if (this.state && !['WAITING', 'ACTIVE', 'GAME_OVER'].includes(this.state.phase)) return false;
      const [px, py] = this.me;
      const [tx, ty] = path[0];
      const dx = tx - px;
      const dy = ty - py;
      const d = Math.hypot(dx, dy);
      if (d < (path.length === 1 ? 0.2 : 0.35)) {
        path.shift();
        continue;
      }
      this.send({ t: 'input', seq: ++this.seq, mx: dx / d, my: dy / d });
      await sleep(50);
      if (Math.hypot(px - last[0], py - last[1]) < 0.01) stuck++;
      else stuck = 0;
      last = [px, py];
      if (stuck > 40) return false;
    }
    for (let i = 0; i < 6; i++) {
      this.send({ t: 'input', seq: ++this.seq, mx: 0, my: 0 });
      await sleep(50);
    }
    return Math.hypot(this.me[0] - x, this.me[1] - y) < 1.2;
  }

  /** Walk to a task, open it, wait the minimum time and solve from PUBLIC data. */
  async doTask(stationId: string): Promise<boolean> {
    const st = STATION_BY_ID[stationId];
    await this.walkTo(st.x, st.y);
    this.send({ t: 'interact', station: stationId });
    const open = await this.waitFor<ServerMessageOf<'taskOpen'>>(
      (m) => m.t === 'taskOpen' || m.t === 'error',
      3000,
    ).catch(() => null);
    if (!open || open.t !== 'taskOpen') return false;
    await sleep(TASK_INFO[open.taskType].minMs + 150);
    this.send({ t: 'taskSubmit', session: open.session, answer: solveFromData(open.taskType, open.data) });
    const res = await this.waitFor<ServerMessageOf<'taskResult'>>(
      (m) => m.t === 'taskResult' || m.t === 'taskClosed',
      3000,
    ).catch(() => null);
    return !!res && res.t === 'taskResult' && res.ok;
  }

  async doAllTasks(): Promise<number> {
    let n = 0;
    for (const t of this.state?.you.tasks ?? []) {
      if (t.done) continue;
      if (this.state?.phase !== 'ACTIVE') break;
      if (await this.doTask(t.stationId)) n++;
    }
    return n;
  }

  async hold(stationId: string, ms: number) {
    const st = STATION_BY_ID[stationId];
    await this.walkTo(st.x, st.y);
    this.send({ t: 'interact', station: stationId });
    await sleep(100);
    this.send({ t: 'fixHold', station: stationId, holding: true });
    await sleep(ms);
    this.send({ t: 'fixHold', station: stationId, holding: false });
  }

  ventPos(id: string): [number, number] {
    return [VENT_BY_ID[id].x, VENT_BY_ID[id].y];
  }

  close() {
    try {
      this.send({ t: 'leave' });
      this.ws.close();
    } catch {}
  }
}

export { sleep };
