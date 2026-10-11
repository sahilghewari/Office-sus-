import { CHAT_MAX_LEN } from '@corp/shared';

/**
 * Basic, conservative chat moderation: strips control characters, collapses
 * whitespace, masks a small list of slurs/profanity and blocks repeated spam.
 * Rendering on the client is always plain text (React escapes it).
 */
const BLOCKED = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'asshole',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'kys',
];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED.join('|')})\\w*`, 'gi');

export function sanitizeChat(raw: string): string | null {
  let s = raw.normalize('NFKC');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > CHAT_MAX_LEN) s = s.slice(0, CHAT_MAX_LEN);
  s = s.replace(BLOCKED_RE, (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1)));
  return s;
}

export function sanitizeName(raw: string): string {
  const s = sanitizeChat(raw) ?? 'Employee';
  return s.replace(BLOCKED_RE, 'Employee').slice(0, 16);
}

/** Tracks recent messages per player to block copy-paste spam. */
export class SpamGuard {
  private recent: { text: string; at: number }[] = [];
  constructor(private now: () => number = Date.now) {}
  allow(text: string): boolean {
    const t = this.now();
    this.recent = this.recent.filter((r) => t - r.at < 15_000);
    const key = text.toLowerCase();
    const dupes = this.recent.filter((r) => r.text === key).length;
    if (dupes >= 2) return false;
    this.recent.push({ text: key, at: t });
    return true;
  }
}
