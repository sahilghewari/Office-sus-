import type { IncomingMessage } from 'node:http';

/**
 * How far to trust proxy headers when deciding a client's IP (used as the key for every
 * per-IP limit). Anything a client sends can be forged, so the default trusts nothing.
 *
 *  - none:   the socket's peer address (direct / LAN hosting)
 *  - hops:   N proxies we control sit in front and each appends to X-Forwarded-For;
 *            the client is the entry N places from the right (counting the socket peer)
 *  - header: a single header the platform's proxy always overwrites (e.g. Fly-Client-IP)
 */
export type ProxyTrust =
  { mode: 'none' } | { mode: 'hops'; hops: number } | { mode: 'header'; header: string };

/** Parses TRUST_PROXY: unset/"false"/"0", a hop count like "1", or "header:<Name>". */
export function parseProxyTrust(raw: string | undefined): ProxyTrust {
  const v = (raw ?? '').trim();
  if (v === '' || v === 'false' || v === '0') return { mode: 'none' };
  if (/^\d+$/.test(v)) return { mode: 'hops', hops: Math.min(Number(v), 16) };
  const m = v.match(/^header:([A-Za-z0-9-]+)$/);
  if (m) return { mode: 'header', header: m[1].toLowerCase() };
  throw new Error(
    `TRUST_PROXY="${v}" is not valid. Use "false", a proxy hop count such as "1", or "header:<Header-Name>". ` +
      '("true" is not supported: trusting every hop lets clients forge their IP.)',
  );
}

export function describeProxyTrust(t: ProxyTrust): string {
  if (t.mode === 'none') return 'socket address';
  if (t.mode === 'hops') return `X-Forwarded-For, ${t.hops} trusted hop(s)`;
  return `${t.header} header`;
}

const first = (h: string | string[] | undefined) => (Array.isArray(h) ? h.join(',') : h);

export function resolveClientIp(req: IncomingMessage, trust: ProxyTrust): string {
  const socketIp = req.socket.remoteAddress ?? 'unknown';
  if (trust.mode === 'none') return socketIp;
  if (trust.mode === 'header') {
    // If a client also sent the header, a proxy that appends would put the real value last.
    const parts = (first(req.headers[trust.header]) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.at(-1) ?? socketIp;
  }
  // Same rule as proxy-addr with a numeric trust: walk right-to-left past the trusted hops.
  const fwd = (first(req.headers['x-forwarded-for']) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [socketIp, ...fwd.reverse()];
  return chain[Math.min(trust.hops, chain.length - 1)];
}
