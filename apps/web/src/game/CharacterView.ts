import Phaser from 'phaser';
import type { Appearance } from '@corp/shared';
import { FEET_X, FEET_Y, FRAME_H, FRAME_W, SHEET_SCALE, buildSheet } from './characterArt';

const CHAR_SCALE = 0.86 / SHEET_SCALE;

function appearanceKey(a: Appearance): string {
  return `char-${a.color}-${a.shirt}-${a.skin}-${a.hair}-${a.hairColor}-${a.outfit}-${a.accessory}`;
}

/** Ensures the sprite sheet + animations for an appearance exist; returns the texture key. */
export function ensureCharacterTexture(scene: Phaser.Scene, a: Appearance): string {
  const key = appearanceKey(a);
  if (scene.textures.exists(key)) return key;
  const { canvas, anims } = buildSheet(a);
  const tex = scene.textures.addCanvas(key, canvas)!;
  const cols = 8;
  let total = 0;
  for (const an of anims) total = Math.max(total, ...an.frames);
  for (let i = 0; i <= total; i++) {
    tex.add(
      i,
      0,
      (i % cols) * FRAME_W * SHEET_SCALE,
      Math.floor(i / cols) * FRAME_H * SHEET_SCALE,
      FRAME_W * SHEET_SCALE,
      FRAME_H * SHEET_SCALE,
    );
  }
  for (const an of anims) {
    scene.anims.create({
      key: `${key}:${an.name}`,
      frames: an.frames.map((f) => ({ key, frame: f })),
      frameRate: an.rate,
      repeat: an.loop ? -1 : 0,
    });
  }
  return key;
}

export type CharMode = 'normal' | 'working' | 'ghost' | 'cheer' | 'sad';

/**
 * A character in the world: shadow, animated sprite, nameplate and optional
 * teammate marker. Movement comes from outside (prediction/interpolation);
 * this class only turns motion into animation.
 */
export class CharacterView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  private marker: Phaser.GameObjects.Text | null = null;
  private speaking: Phaser.GameObjects.Text | null = null;
  private texKey = '';
  private facingBack = false;
  private flip = false;
  private anim = '';
  private lastX = 0;
  private lastY = 0;
  private moveAmt = 0;
  mode: CharMode = 'normal';
  visibleTarget = true;
  name = '';

  constructor(
    private scene: Phaser.Scene,
    readonly id: string,
    appearance: Appearance,
    name: string,
    private isMe: boolean,
  ) {
    this.shadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.5).setScale(0.9);
    this.sprite = scene.add.sprite(0, 0, '__DEFAULT');
    this.sprite.setOrigin(FEET_X / FRAME_W, FEET_Y / FRAME_H).setScale(CHAR_SCALE);
    this.container = scene.add.container(0, 0, [this.shadow, this.sprite]);
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: 'Fredoka, sans-serif',
        fontSize: '13px',
        fontStyle: '600',
        color: '#ffffff',
        stroke: '#141a3d',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(9_000_000);
    if (isMe) this.label.setColor('#ffe27a');
    this.setAppearance(appearance, name);
  }

  setAppearance(a: Appearance, name: string) {
    const key = ensureCharacterTexture(this.scene, a);
    this.name = name;
    this.label.setText(name);
    if (key !== this.texKey) {
      this.texKey = key;
      this.anim = '';
      this.sprite.setTexture(key, 0);
    }
  }

  setTeammateMarker(on: boolean) {
    if (on && !this.marker) {
      this.marker = this.scene.add
        .text(0, 0, '▼ MANAGER', {
          fontFamily: 'Fredoka, sans-serif',
          fontSize: '10px',
          fontStyle: '700',
          color: '#ff5662',
          stroke: '#2a0a10',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(9_000_001);
      this.label.setColor('#ff8a90');
    } else if (!on && this.marker) {
      this.marker.destroy();
      this.marker = null;
      this.label.setColor(this.isMe ? '#ffe27a' : '#ffffff');
    }
  }

  setSpeaking(on: boolean) {
    if (on && !this.speaking) {
      this.speaking = this.scene.add
        .text(0, 0, '🔊', { fontSize: '12px', resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(9_000_002);
    } else if (!on && this.speaking) {
      this.speaking.destroy();
      this.speaking = null;
    }
  }

  /** sx, sy = screen position of the feet; depth for painter sorting. */
  update(sx: number, sy: number, depth: number, dtMs: number, labelVisible = true) {
    const dx = sx - this.lastX;
    const dy = sy - this.lastY;
    const dist = Math.hypot(dx, dy);
    this.lastX = sx;
    this.lastY = sy;
    // smooth "is moving" so tiny jitter never flickers the walk cycle
    const speed = dtMs > 0 ? dist / dtMs : 0;
    this.moveAmt += ((speed > 0.02 ? 1 : 0) - this.moveAmt) * Math.min(1, dtMs / 90);
    const moving = this.moveAmt > 0.5;
    if (dist > 0.3) {
      if (Math.abs(dx) > 0.15) this.flip = dx < 0;
      if (Math.abs(dy) > 0.15) this.facingBack = dy < 0;
    }
    let anim: string;
    switch (this.mode) {
      case 'working':
        anim = 'work';
        break;
      case 'ghost':
        anim = this.facingBack ? 'ghost_b' : 'ghost_f';
        break;
      case 'cheer':
        anim = 'cheer';
        break;
      case 'sad':
        anim = 'sad';
        break;
      default:
        anim = moving ? (this.facingBack ? 'walk_b' : 'walk_f') : this.facingBack ? 'idle_b' : 'idle_f';
    }
    if (anim !== this.anim) {
      this.anim = anim;
      this.sprite.play(`${this.texKey}:${anim}`, true);
    }
    this.sprite.setFlipX(this.flip);
    this.container.setPosition(sx, sy);
    this.container.setDepth(depth);
    const ghost = this.mode === 'ghost';
    this.shadow.setVisible(!ghost);
    this.sprite.setAlpha(ghost ? 0.62 : 1);
    const a =
      this.container.alpha + ((this.visibleTarget ? 1 : 0) - this.container.alpha) * Math.min(1, dtMs / 120);
    this.container.setAlpha(a);
    const top = sy - 64;
    this.label.setPosition(sx, top).setAlpha(labelVisible ? a : 0);
    this.marker?.setPosition(sx, top - 14).setAlpha(a);
    this.speaking?.setPosition(sx + this.label.width / 2 + 10, top - 1).setAlpha(a);
  }

  destroy() {
    this.container.destroy();
    this.label.destroy();
    this.marker?.destroy();
    this.speaking?.destroy();
  }
}
