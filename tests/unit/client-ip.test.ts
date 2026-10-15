import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { parseProxyTrust, resolveClientIp } from '../../apps/server/src/security/clientIp';

const req = (socketIp: string, headers: Record<string, string> = {}) =>
  ({ socket: { remoteAddress: socketIp }, headers }) as unknown as IncomingMessage;

describe('parseProxyTrust', () => {
  it('defaults to trusting nothing', () => {
    for (const v of [undefined, '', 'false', '0', ' 0 '])
      expect(parseProxyTrust(v)).toEqual({ mode: 'none' });
  });
  it('parses hop counts and platform headers', () => {
    expect(parseProxyTrust('2')).toEqual({ mode: 'hops', hops: 2 });
    expect(parseProxyTrust('header:Fly-Client-IP')).toEqual({ mode: 'header', header: 'fly-client-ip' });
  });
  it('rejects "true" and junk', () => {
    expect(() => parseProxyTrust('true')).toThrow(/not supported/);
    expect(() => parseProxyTrust('header:')).toThrow();
    expect(() => parseProxyTrust('loopback')).toThrow();
  });
});

describe('resolveClientIp', () => {
  const forged = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' };

  it('ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(resolveClientIp(req('198.51.100.1', forged), { mode: 'none' })).toBe('198.51.100.1');
  });
  it('takes the entry N hops from the right, never the client-chosen left end', () => {
    expect(resolveClientIp(req('10.0.0.2', forged), { mode: 'hops', hops: 1 })).toBe('203.0.113.9');
    expect(resolveClientIp(req('10.0.0.2', forged), { mode: 'hops', hops: 2 })).toBe('6.6.6.6');
  });
  it('stops at the leftmost entry when there are fewer entries than hops', () => {
    expect(
      resolveClientIp(req('10.0.0.2', { 'x-forwarded-for': '203.0.113.9' }), { mode: 'hops', hops: 3 }),
    ).toBe('203.0.113.9');
    expect(resolveClientIp(req('10.0.0.2'), { mode: 'hops', hops: 1 })).toBe('10.0.0.2');
  });
  it('uses the platform header, falling back to the socket', () => {
    const t = { mode: 'header', header: 'fly-client-ip' } as const;
    expect(resolveClientIp(req('10.0.0.2', { ...forged, 'fly-client-ip': '203.0.113.7' }), t)).toBe(
      '203.0.113.7',
    );
    expect(resolveClientIp(req('10.0.0.2', forged), t)).toBe('10.0.0.2');
  });
});
