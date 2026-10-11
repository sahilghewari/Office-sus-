import Phaser from 'phaser';
import { colorHex, type Appearance } from '@corp/shared';

/**
 * Cartoon, non-violent "corporate elimination" animations and incident markers.
 * Variants (server-chosen):
 *   0 Sudden Termination Letter · 1 Office Chair Express · 2 Buried in Paperwork
 *   3 Endless HR Training       · 4 PERFORMANCE REVIEW stamp
 */

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  scene.textures.addCanvas(key, cv);
  return key;
}

export function makeEffectTextures(scene: Phaser.Scene) {
  canvasTex(scene, 'fx-envelope', 44, 30, (c) => {
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#2b2f3f';
    c.lineWidth = 2;
    c.fillRect(2, 2, 40, 26);
    c.strokeRect(2, 2, 40, 26);
    c.beginPath();
    c.moveTo(2, 2);
    c.lineTo(22, 17);
    c.lineTo(42, 2);
    c.stroke();
    c.fillStyle = '#ef3e4a';
    c.beginPath();
    c.arc(22, 17, 4, 0, Math.PI * 2);
    c.fill();
  });
  canvasTex(scene, 'fx-chair', 48, 60, (c) => {
    c.strokeStyle = '#141a3d';
    c.lineWidth = 2;
    c.fillStyle = '#2d3348';
    c.beginPath();
    c.roundRect(10, 4, 28, 26, 6);
    c.fill();
    c.stroke();
    c.fillStyle = '#454d6e';
    c.beginPath();
    c.roundRect(6, 28, 36, 10, 4);
    c.fill();
    c.stroke();
    c.fillStyle = '#9aa3b8';
    c.fillRect(22, 38, 4, 10);
    c.strokeRect(22, 38, 4, 10);
    c.beginPath();
    c.moveTo(8, 54);
    c.lineTo(40, 54);
    c.moveTo(24, 48);
    c.lineTo(10, 56);
    c.moveTo(24, 48);
    c.lineTo(38, 56);
    c.stroke();
    for (const x of [8, 24, 40]) {
      c.fillStyle = '#141a3d';
      c.beginPath();
      c.arc(x, 57, 2.5, 0, Math.PI * 2);
      c.fill();
    }
  });
  canvasTex(scene, 'fx-tv', 70, 56, (c) => {
    c.fillStyle = '#151a2a';
    c.beginPath();
    c.roundRect(2, 2, 66, 44, 5);
    c.fill();
    const g = c.createLinearGradient(0, 0, 0, 44);
    g.addColorStop(0, '#3d7bff');
    g.addColorStop(1, '#8a5cf6');
    c.fillStyle = g;
    c.fillRect(6, 6, 58, 36);
    c.fillStyle = '#ffffff';
    c.font = 'bold 8px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.fillText('HR TRAINING', 35, 20);
    c.fillStyle = '#ffd23f';
    c.fillText('MODULE 1 / ∞', 35, 32);
    c.fillStyle = '#151a2a';
    c.fillRect(30, 46, 10, 6);
    c.fillRect(22, 51, 26, 4);
  });
  canvasTex(scene, 'fx-stamp', 120, 120, (c) => {
    c.fillStyle = '#7a4a32';
    c.beginPath();
    c.roundRect(46, 4, 28, 50, 8);
    c.fill();
    c.fillStyle = '#5a3424';
    c.fillRect(30, 54, 60, 14);
    c.fillStyle = '#c8202d';
    c.beginPath();
    c.roundRect(14, 66, 92, 30, 4);
    c.fill();
    c.strokeStyle = '#2a0a10';
    c.lineWidth = 2;
    c.stroke();
  });
  canvasTex(scene, 'fx-stampmark', 150, 44, (c) => {
    c.strokeStyle = '#ef3e4a';
    c.lineWidth = 4;
    c.strokeRect(4, 4, 142, 36);
    c.fillStyle = '#ef3e4a';
    c.font = 'bold 15px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.fillText('PERFORMANCE', 75, 21);
    c.fillText('REVIEW', 75, 36);
  });
  canvasTex(scene, 'fx-cone', 26, 34, (c) => {
    c.fillStyle = '#ff8a3d';
    c.strokeStyle = '#3a1a00';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(13, 2);
    c.lineTo(22, 28);
    c.lineTo(4, 28);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(8, 14, 10, 4);
    c.fillStyle = '#3a3f55';
    c.fillRect(1, 28, 24, 5);
  });
  canvasTex(scene, 'fx-puff', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 2, 16, 16, 16);
    g.addColorStop(0, 'rgba(210,215,235,0.95)');
    g.addColorStop(1, 'rgba(210,215,235,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });
}

/** Persistent reportable incident marker left after an elimination. */
export function createIncident(scene: Phaser.Scene, sx: number, sy: number, depth: number, variant: number, victim: Appearance | null, victimName: string) {
  const color = victim ? colorHex(victim.color) : '#ffffff';
  const key = `fx-incident-${variant}-${color}`;
  canvasTex(scene, key, 120, 90, (c) => {
    // caution tape ring on the floor
    c.save();
    c.translate(60, 62);
    c.scale(1, 0.5);
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 7;
    c.setLineDash([10, 7]);
    c.beginPath();
    c.arc(0, 0, 46, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#1b1b1b';
    c.lineDashOffset = 10;
    c.stroke();
    c.restore();
    // scattered papers
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    for (const [x, y, r] of [[30, 58, 0.4], [82, 66, 1.1], [64, 52, -0.4], [44, 72, 2]] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(r);
      c.fillRect(-7, -4, 14, 9);
      c.strokeRect(-7, -4, 14, 9);
      c.restore();
    }
    // the victim's badge, in their colour
    c.save();
    c.translate(60, 60);
    c.rotate(-0.25);
    c.fillStyle = '#ffffff';
    c.fillRect(-12, -16, 24, 30);
    c.strokeStyle = '#141a3d';
    c.lineWidth = 2;
    c.strokeRect(-12, -16, 24, 30);
    c.fillStyle = color;
    c.fillRect(-12, -16, 24, 9);
    c.beginPath();
    c.arc(0, 3, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ef3e4a';
    c.font = 'bold 9px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.save();
    c.rotate(0.2);
    c.fillText('VOID', 0, 14);
    c.restore();
    c.restore();
    // variant prop
    c.font = 'bold 9px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#141a3d';
    if (variant === 1) {
      c.fillStyle = '#2d3348';
      c.fillRect(84, 34, 18, 16);
      c.fillRect(80, 48, 26, 6);
    } else if (variant === 2) {
      c.fillStyle = '#f3f0e6';
      for (let i = 0; i < 5; i++) c.fillRect(20 + i * 3, 44 - i * 5, 26, 6);
    } else if (variant === 3) {
      c.fillStyle = '#3d7bff';
      c.fillRect(82, 30, 26, 18);
      c.fillStyle = '#ffffff';
      c.fillText('∞', 95, 43);
    } else if (variant === 4) {
      c.strokeStyle = '#ef3e4a';
      c.lineWidth = 2;
      c.strokeRect(70, 30, 40, 14);
      c.fillStyle = '#ef3e4a';
      c.fillText('REVIEWED', 90, 41);
    } else {
      c.fillStyle = '#ffffff';
      c.fillRect(80, 30, 26, 17);
      c.strokeStyle = '#141a3d';
      c.strokeRect(80, 30, 26, 17);
      c.beginPath();
      c.moveTo(80, 30);
      c.lineTo(93, 40);
      c.lineTo(106, 30);
      c.stroke();
    }
  });
  const container = scene.add.container(sx, sy).setDepth(depth);
  const img = scene.add.image(0, -8, key).setOrigin(0.5, 0.7);
  const cone = scene.add.image(-34, -10, 'fx-cone').setOrigin(0.5, 1);
  const label = scene.add
    .text(0, -58, `INCIDENT · ${victimName}`, { fontFamily: 'Fredoka', fontSize: '11px', fontStyle: '700', color: '#ffd23f', stroke: '#141a3d', strokeThickness: 4, resolution: 2 })
    .setOrigin(0.5, 1);
  container.add([img, cone, label]);
  scene.tweens.add({ targets: label, y: -62, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.inOut' });
  return container;
}

/** Plays the elimination animation at the victim's feet. Resolves when done. */
export function playElimination(scene: Phaser.Scene, sx: number, sy: number, variant: number, victimSprite: Phaser.GameObjects.Container | null, reduced: boolean): Promise<void> {
  const depth = 8_500_000;
  return new Promise((resolve) => {
    const done = () => {
      victimSprite?.setScale(1).setAngle(0).setY(victimSprite.y);
      resolve();
    };
    const title = scene.add
      .text(sx, sy - 90, ['TERMINATED', 'CHAIR EXPRESS!', 'BURIED IN PAPERWORK', 'MANDATORY TRAINING', ''][variant] ?? '', {
        fontFamily: 'Fredoka',
        fontSize: '16px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#ef3e4a',
        strokeThickness: 5,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(depth + 10)
      .setScale(0.3);
    scene.tweens.add({ targets: title, scale: 1, duration: 260, ease: 'Back.out' });
    scene.time.delayedCall(1500, () => scene.tweens.add({ targets: title, alpha: 0, duration: 300, onComplete: () => title.destroy() }));
    const puff = () => {
      for (let i = 0; i < 8; i++) {
        const p = scene.add.image(sx, sy - 20, 'fx-puff').setDepth(depth + 2).setScale(0.6);
        const ang = (i / 8) * Math.PI * 2;
        scene.tweens.add({ targets: p, x: sx + Math.cos(ang) * 34, y: sy - 20 + Math.sin(ang) * 18, alpha: 0, scale: 1.4, duration: 500, onComplete: () => p.destroy() });
      }
    };
    if (reduced) {
      puff();
      if (victimSprite) victimSprite.setAlpha(0);
      scene.time.delayedCall(400, done);
      return;
    }
    switch (variant) {
      case 0: {
        const env = scene.add.image(sx - 260, sy - 140, 'fx-envelope').setDepth(depth).setAngle(-30);
        scene.tweens.add({
          targets: env,
          x: sx,
          y: sy - 34,
          angle: 720,
          duration: 520,
          ease: 'Quad.in',
          onComplete: () => {
            puff();
            if (victimSprite) scene.tweens.add({ targets: victimSprite, scaleY: 0.1, alpha: 0, duration: 250 });
            scene.cameras.main.shake(140, 0.004);
            scene.tweens.add({ targets: env, y: sy - 120, alpha: 0, duration: 600, delay: 200, onComplete: () => env.destroy() });
            scene.time.delayedCall(700, done);
          },
        });
        break;
      }
      case 1: {
        const chair = scene.add.image(sx - 300, sy - 10, 'fx-chair').setDepth(depth).setOrigin(0.5, 1);
        scene.tweens.add({
          targets: chair,
          x: sx,
          duration: 450,
          ease: 'Quad.in',
          onComplete: () => {
            if (victimSprite) {
              scene.tweens.add({ targets: victimSprite, x: sx + 320, alpha: 0, angle: 15, duration: 700, ease: 'Quad.in' });
            }
            scene.tweens.add({ targets: chair, x: sx + 340, angle: 25, duration: 700, ease: 'Quad.in', onComplete: () => chair.destroy() });
            scene.time.delayedCall(800, done);
          },
        });
        break;
      }
      case 2: {
        for (let i = 0; i < 26; i++) {
          const p = scene.add
            .image(sx + Phaser.Math.Between(-30, 30), sy - 220 - i * 12, 'fx-paper')
            .setDepth(depth + 1)
            .setAngle(Phaser.Math.Between(0, 360));
          scene.tweens.add({ targets: p, y: sy - 8 - Math.min(i, 18) * 2.2, angle: p.angle + 200, duration: 500 + i * 30, ease: 'Quad.in', onComplete: () => i > 18 && p.destroy() });
          scene.time.delayedCall(2200, () => scene.tweens.add({ targets: p, alpha: 0, duration: 400, onComplete: () => p.destroy() }));
        }
        if (victimSprite) scene.time.delayedCall(700, () => scene.tweens.add({ targets: victimSprite, alpha: 0, duration: 400 }));
        scene.time.delayedCall(1500, done);
        break;
      }
      case 3: {
        const tv = scene.add.image(sx, sy - 260, 'fx-tv').setDepth(depth).setOrigin(0.5, 1);
        scene.tweens.add({
          targets: tv,
          y: sy - 30,
          duration: 500,
          ease: 'Bounce.out',
          onComplete: () => {
            if (victimSprite) scene.tweens.add({ targets: victimSprite, scale: 0, y: victimSprite.y - 50, angle: 360, alpha: 0, duration: 700, ease: 'Quad.in' });
            scene.tweens.add({ targets: tv, y: sy - 300, alpha: 0, delay: 900, duration: 500, onComplete: () => tv.destroy() });
            scene.time.delayedCall(1300, done);
          },
        });
        break;
      }
      default: {
        const stamp = scene.add.image(sx, sy - 320, 'fx-stamp').setDepth(depth + 2).setOrigin(0.5, 0.85);
        scene.tweens.add({
          targets: stamp,
          y: sy - 10,
          duration: 300,
          ease: 'Quad.in',
          onComplete: () => {
            scene.cameras.main.shake(200, 0.009);
            if (victimSprite) victimSprite.setAlpha(0);
            const mark = scene.add.image(sx, sy - 20, 'fx-stampmark').setDepth(depth + 1).setScale(0.6).setAngle(-8);
            scene.tweens.add({ targets: mark, scale: 0.75, duration: 150 });
            scene.tweens.add({ targets: stamp, y: sy - 340, alpha: 0, delay: 250, duration: 500, onComplete: () => stamp.destroy() });
            scene.tweens.add({ targets: mark, alpha: 0, delay: 1400, duration: 400, onComplete: () => mark.destroy() });
            scene.time.delayedCall(900, done);
          },
        });
      }
    }
  });
}

export function sparkle(scene: Phaser.Scene, sx: number, sy: number, color = 0xffd23f, n = 14) {
  for (let i = 0; i < n; i++) {
    const s = scene.add.image(sx, sy, 'fx-spark').setDepth(8_600_000).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6);
    const ang = Math.random() * Math.PI * 2;
    const d = 20 + Math.random() * 40;
    scene.tweens.add({ targets: s, x: sx + Math.cos(ang) * d, y: sy + Math.sin(ang) * d * 0.6 - 20, alpha: 0, scale: 0.2, duration: 600 + Math.random() * 300, onComplete: () => s.destroy() });
  }
}

export function ventPuff(scene: Phaser.Scene, sx: number, sy: number) {
  for (let i = 0; i < 10; i++) {
    const p = scene.add.image(sx, sy, 'fx-puff').setDepth(8_600_000).setScale(0.5).setTint(0x9aa3b8);
    const ang = Math.random() * Math.PI * 2;
    scene.tweens.add({ targets: p, x: sx + Math.cos(ang) * 30, y: sy - 10 - Math.random() * 40, alpha: 0, scale: 1.3, duration: 600, onComplete: () => p.destroy() });
  }
}
