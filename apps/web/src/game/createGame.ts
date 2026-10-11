import Phaser from 'phaser';
import type { GameConnection } from '../networking/connection';
import { useSettings } from '../stores/settings';
import { OfficeScene } from './OfficeScene';

export function createGame(parent: HTMLElement, conn: GameConnection): Phaser.Game {
  const low = useSettings.getState().quality === 'low';
  // Automated tests run in hidden/background tabs where requestAnimationFrame is paused.
  if (new URLSearchParams(location.search).has('forceLoop')) sessionStorage.setItem('cs_forceLoop', '1');
  const forceLoop = sessionStorage.getItem('cs_forceLoop') === '1';
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b0f2b',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
    resolution: low ? 1 : Math.min(2, window.devicePixelRatio || 1),
    fps: { target: 60, smoothStep: true, forceSetTimeOut: forceLoop },
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false },
  } as Phaser.Types.Core.GameConfig);
  game.scene.add('office', OfficeScene, true, { conn });
  if (forceLoop) {
    // keep simulating while the tab is hidden (tests only)
    game.events.once('ready', () => {
      game.events.off('hidden');
      game.events.off('blur');
    });
  }
  return game;
}
