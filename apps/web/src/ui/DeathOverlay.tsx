import { useEffect, useState } from 'react';
import { ELIMINATION_NAMES, GHOST_LINES } from '@corp/shared';
import { useGame } from '../stores/game';
import { Avatar } from '../components/Avatar';
import { sfx } from '../audio/audio';

export function DeathOverlay() {
  const died = useGame((g) => g.died);
  const me = useGame((g) => g.state?.players.find((p) => p.id === g.state?.you.id));
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!died) return;
    setVisible(true);
    sfx('terminate');
    const id = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(id);
  }, [died]);
  if (!visible || !died || !me) return null;
  return (
    <div
      className="absolute inset-0 z-[45] flex flex-col items-center justify-center bg-[#0b0510]/85 backdrop-blur-sm"
      onClick={() => setVisible(false)}
      data-testid="death-overlay"
    >
      <p className="font-display tracking-[0.3em] text-red-300 uppercase">You have been eliminated by</p>
      <h2
        className="font-display text-shadow-hard anim-pop mt-2 text-6xl font-bold text-white"
        style={{ animation: 'slam 0.6s both' }}
      >
        {ELIMINATION_NAMES[died.variant] ?? 'Management'}
      </h2>
      <div className="anim-float mt-6">
        <Avatar appearance={me.appearance} size={120} ghost />
      </div>
      <p className="mt-4 max-w-md text-center text-lg text-corp-cyan">
        {GHOST_LINES[died.variant % GHOST_LINES.length]}
      </p>
      <p className="mt-2 text-sm text-mist">
        You're a ghost now: walk through walls, finish tasks, chat with other ghosts. You can't talk to the
        living.
      </p>
    </div>
  );
}
