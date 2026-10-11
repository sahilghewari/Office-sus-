import { LOADING_LINES } from '@corp/shared';
import { useGame } from '../stores/game';
import { useServerNow, secondsLeft } from '../hooks/useNow';
import { useEffect, useMemo } from 'react';
import { sfx } from '../audio/audio';

export function StartingOverlay() {
  const ends = useGame((g) => g.state?.phaseEndsAt);
  const now = useServerNow(100);
  const n = secondsLeft(ends, now);
  const line = useMemo(() => LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)], []);
  useEffect(() => {
    if (n > 0) sfx('tick');
  }, [n]);
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-navy-950/85 backdrop-blur-sm">
      <p className="font-display tracking-[0.3em] text-mist uppercase">Clocking in</p>
      <div key={n} className="font-display anim-pop text-[10rem] leading-none font-bold text-corp-yellow">
        {n || '☕'}
      </div>
      <p className="font-mono mt-4 text-mist">{line}</p>
    </div>
  );
}
