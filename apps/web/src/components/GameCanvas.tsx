import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { getConnection } from '../networking/connection';
import { createGame } from '../game/createGame';

/** Mounts the Phaser renderer for the current room and tears it down on exit. */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const conn = getConnection();
    if (!ref.current || !conn) return;
    let game: Phaser.Game | null = createGame(ref.current, conn);
    return () => {
      game?.destroy(true);
      game = null;
    };
  }, []);
  return <div ref={ref} className="absolute inset-0" data-testid="game-canvas" />;
}
