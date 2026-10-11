import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { getConnection } from '../networking/connection';

/** Mounts the Phaser renderer for the current room and tears it down on exit. Phaser is code-split. */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const conn = getConnection();
    if (!ref.current || !conn) return;
    let game: Phaser.Game | null = null;
    let cancelled = false;
    void import('../game/createGame').then(({ createGame }) => {
      if (!cancelled && ref.current) game = createGame(ref.current, conn);
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
      game = null;
    };
  }, []);
  return <div ref={ref} className="absolute inset-0" data-testid="game-canvas" />;
}
