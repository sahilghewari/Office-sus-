import { useEffect, useState } from 'react';
import { serverNow } from '../stores/game';

/** Re-renders every `ms` and returns the estimated server time. */
export function useServerNow(ms = 250): number {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return serverNow();
}

export function secondsLeft(endsAt: number | null | undefined, now: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
