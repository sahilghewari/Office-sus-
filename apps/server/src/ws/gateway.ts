import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessageSchema, PROTOCOL_VERSION, ROOM_CODE_RE, type ServerMessage } from '@corp/shared';
import type { TokenService } from '../authentication/tokens';
import type { Store } from '../database/store';
import { KeyedLimiter, TokenBucket } from '../security/rateLimit';
import { sanitizeName } from '../security/moderation';
import type { RoomManager } from '../rooms/RoomManager';
import type { Conn, GameRoom, Player } from '../rooms/GameRoom';

export interface GatewayOptions {
  server: Server;
  manager: RoomManager;
  tokens: TokenService;
  store: Store;
  allowedOrigins: string[];
  enforceOrigin: boolean;
  log: (m: string) => void;
}

const MAX_MESSAGE_BYTES = 16 * 1024;

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

export function attachGateway(o: GatewayOptions) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const connectLimiter = new KeyedLimiter(30, 0.5); // per IP
  const joinLimiter = new KeyedLimiter(12, 0.2); // failed/attempted joins per IP (anti code brute-force)

  o.server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const origin = req.headers.origin;
    if (o.enforceOrigin && origin && !o.allowedOrigins.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return socket.destroy();
    }
    if (!connectLimiter.take(clientIp(req))) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = clientIp(req);
    let room: GameRoom | null = null;
    let player: Player | null = null;
    let alive = true;
    let pingSentAt = 0;
    const bucket = new TokenBucket(120, 60);
    let violations = 0;

    const conn: Conn = {
      send(msg: ServerMessage) {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Drop non-essential snapshots for slow clients instead of buffering forever.
        if (msg.t === 'snap' && ws.bufferedAmount > 512 * 1024) return;
        ws.send(JSON.stringify(msg));
      },
      close(code = 1000, reason = '') {
        try {
          ws.close(code, reason);
        } catch {}
      },
    };
    const fail = (code: string, message: string, close = true) => {
      conn.send({ t: 'error', code, message });
      if (close) setTimeout(() => conn.close(4000, code), 50);
    };

    const helloTimer = setTimeout(() => {
      if (!player) fail('TIMEOUT', 'Handshake timed out.');
    }, 10_000);

    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      pingSentAt = performance.now();
      try {
        ws.ping();
      } catch {}
    }, 5000);
    ws.on('pong', () => {
      alive = true;
      if (player && pingSentAt) {
        const rtt = Math.round(performance.now() - pingSentAt);
        if (Math.abs(player.ping - rtt) > 5) {
          player.ping = rtt;
          room?.markDirty();
        }
      }
    });

    ws.on('message', async (raw, isBinary) => {
      if (isBinary) return fail('BAD_MESSAGE', 'Binary frames are not supported.');
      if (!bucket.take()) {
        if (++violations > 200) {
          o.log(`closing flooding client ${ip}`);
          return conn.close(4008, 'rate limit');
        }
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return fail('BAD_MESSAGE', 'Malformed message.', false);
      }
      const parsed = ClientMessageSchema.safeParse(data);
      if (!parsed.success) return fail('BAD_MESSAGE', 'Invalid message.', false);
      const msg = parsed.data;

      if (!player) {
        if (msg.t !== 'hello') return fail('NO_HELLO', 'Say hello first.');
        if (msg.v !== PROTOCOL_VERSION) return fail('VERSION', 'Your game client is out of date. Please refresh the page.');
        const tok = o.tokens.verify(msg.token);
        if (!tok) return fail('AUTH', 'Your session has expired. Please refresh.');
        if (tok.kind === 'user') {
          const ok = tok.sid ? await o.store.sessionValid(tok.sid, tok.sub.slice(2)).catch(() => false) : false;
          if (!ok) return fail('AUTH', 'Please log in again.');
        }
        const code = msg.code.toUpperCase();
        if (!ROOM_CODE_RE.test(code)) return fail('ROOM_NOT_FOUND', 'That is not a valid office code.');
        if (!joinLimiter.take(ip)) return fail('RATE_LIMIT', 'Too many join attempts. Take a coffee break and try again.');
        const res = o.manager.join(code, tok.sub, sanitizeName(msg.name), msg.appearance, tok.kind === 'user', conn);
        if ('error' in res) return fail(res.error!, res.message!);
        clearTimeout(helloTimer);
        room = res.room;
        player = res.player;
        return;
      }
      if (msg.t === 'hello') return;
      try {
        room!.handle(player, msg);
      } catch (e) {
        o.log(`[${room?.code}] handler error: ${(e as Error).stack}`);
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      clearInterval(heartbeat);
      if (room && player) room.disconnect(player, conn);
    });
    ws.on('error', () => {});
  });

  return wss;
}
