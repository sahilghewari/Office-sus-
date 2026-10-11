import { createHmac, randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Compact HMAC-signed session tokens: base64url(payload).base64url(sig).
 * Guests get a random identity; registered users additionally have a
 * server-side session row so logout/revocation works.
 */
export interface TokenPayload {
  sub: string; // stable identity: g_<uuid> or u_<userId>
  kind: 'guest' | 'user';
  sid?: string; // session id hash (registered users)
  exp: number; // epoch ms
}

const b64 = (b: Buffer) => b.toString('base64url');

export class TokenService {
  constructor(private secret: string) {}

  sign(p: TokenPayload): string {
    const body = b64(Buffer.from(JSON.stringify(p)));
    const sig = b64(createHmac('sha256', this.secret).update(body).digest());
    return `${body}.${sig}`;
  }

  verify(token: string): TokenPayload | null {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (typeof p.sub !== 'string' || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
      if (p.kind !== 'guest' && p.kind !== 'user') return null;
      return p;
    } catch {
      return null;
    }
  }

  guest(ttlMs = 1000 * 60 * 60 * 24 * 7): string {
    return this.sign({ sub: `g_${randomUUID()}`, kind: 'guest', exp: Date.now() + ttlMs });
  }
}

export function newSessionSecret(): { secret: string; id: string } {
  const secret = randomBytes(32).toString('base64url');
  return { secret, id: hashSecret(secret) };
}

export function hashSecret(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
