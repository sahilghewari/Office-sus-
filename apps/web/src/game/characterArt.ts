import { HAIR_COLORS, SHIRT_COLORS, SKIN_TONES, colorHex, type Appearance } from '@corp/shared';

/**
 * Original procedural character art for Corporate Sus office workers:
 * oversized heads, compact bodies, readable silhouettes. Drawn with Canvas2D so
 * the exact same art powers the in-game sprite sheets and every UI avatar.
 *
 * Coordinates are in "1x pixels" with the origin at the character's feet.
 */

export type Facing = 'front' | 'back';
export type Expression = 'normal' | 'happy' | 'shock' | 'sad' | 'think' | 'smug';

export interface Pose {
  facing: Facing;
  legSwing: number; // -1..1
  armL: number; // radians, 0 = hanging
  armR: number;
  bob: number; // vertical body offset (px, negative = up)
  lift: number; // whole-body hop
  ghost?: boolean;
  laptop?: boolean;
  expression?: Expression;
  squash?: number; // 1 = none
  blink?: boolean;
}

const hex = (h: string) => h;

function shade(h: string, amt: number): string {
  const n = parseInt(h.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt < 0) {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  } else {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  }
  return `rgb(${r},${g},${b})`;
}
export { shade };

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const OUTLINE = 'rgba(20,16,40,0.85)';

function fillStroke(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, lw = 1.4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function pantsColor(a: Appearance): string {
  switch (a.outfit) {
    case 'suit':
      return '#262b45';
    case 'shirt':
      return '#4a4f63';
    case 'hoodie':
      return '#3a3d4a';
    case 'founder':
      return '#c9b48a';
    case 'casual':
      return '#3b5a9a';
    case 'executive':
      return '#22232b';
  }
}

export function drawCharacter(ctx: CanvasRenderingContext2D, a: Appearance, p: Pose) {
  const main = colorHex(a.color);
  const shirt = SHIRT_COLORS.find((s) => s.id === a.shirt)?.hex ?? '#ffffff';
  const skin = SKIN_TONES.find((s) => s.id === a.skin)?.hex ?? '#f5c49c';
  const hair = HAIR_COLORS.find((s) => s.id === a.hairColor)?.hex ?? '#3a2a1a';
  const front = p.facing === 'front';
  const sq = p.squash ?? 1;

  ctx.save();
  ctx.translate(0, -p.lift);
  ctx.scale(1 / sq, sq);

  // --- legs (or ghost tail)
  const legTop = -13;
  if (p.ghost) {
    const g = ctx.createLinearGradient(0, -14, 0, 2);
    g.addColorStop(0, shade(main, 0.35));
    g.addColorStop(1, 'rgba(190,225,255,0)');
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.quadraticCurveTo(-9, -4, -3 + Math.sin(p.legSwing * 3) * 3, 2);
    ctx.quadraticCurveTo(2, -3, 8, -1 + Math.cos(p.legSwing * 3) * 2);
    ctx.quadraticCurveTo(9, -8, 10, -14);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    const pc = pantsColor(a);
    const s = p.legSwing;
    for (const side of [-1, 1]) {
      const sw = s * side;
      const lx = side * 4.2 + sw * 2.2;
      const ly = legTop + Math.max(0, -sw) * -1.5;
      rr(ctx, lx - 3, ly, 6, 12 - Math.max(0, sw) * 1.2, 2.5);
      fillStroke(ctx, side < 0 ? shade(pc, -0.12) : pc);
      // shoe
      rr(ctx, lx - 3.6 + (front ? 0.6 : 0), ly + 9.5 - Math.max(0, sw) * 1.2, 7.2, 3.6, 1.8);
      fillStroke(ctx, a.outfit === 'casual' || a.outfit === 'hoodie' ? '#f2f2f6' : '#1c1a22', 1.1);
    }
  }

  ctx.translate(0, p.bob);

  // --- backpack behind body (front view: peeks out)
  if (a.accessory === 'backpack') {
    rr(ctx, -11, -30, 22, 18, 5);
    fillStroke(ctx, '#ff8a3d');
    if (!front) {
      rr(ctx, -6, -23, 12, 7, 2);
      fillStroke(ctx, '#e2661c', 1);
    }
  }

  // --- arms behind (back arm drawn first)
  const drawArm = (side: number, angle: number, front: boolean) => {
    ctx.save();
    ctx.translate(side * 10.5, -27);
    ctx.rotate(angle * side);
    const sleeve = a.outfit === 'shirt' ? main : a.outfit === 'casual' ? skin : main;
    rr(ctx, -2.9, -1.5, 5.8, 13.5, 2.9);
    fillStroke(ctx, side < 0 ? shade(sleeve, -0.1) : sleeve, 1.2);
    if (a.outfit === 'casual') {
      rr(ctx, -3.1, -1.8, 6.2, 5, 2.4);
      fillStroke(ctx, main, 1.1);
    }
    if (a.outfit === 'shirt') {
      rr(ctx, -3, 6.6, 6, 2.2, 1);
      fillStroke(ctx, shade(main, -0.2), 0.8);
    }
    ctx.beginPath();
    ctx.arc(0, 13, 3, 0, Math.PI * 2);
    fillStroke(ctx, skin, 1.1);
    if (front && side > 0 && a.accessory === 'coffee' && !p.laptop) {
      rr(ctx, -2.5, 10.5, 6, 7.5, 1.5);
      fillStroke(ctx, '#ffffff', 1);
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(-2.5, 12.2, 6, 1.8);
      ctx.beginPath();
      ctx.moveTo(-1.5, 9.5);
      ctx.lineTo(3, 9.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  };

  drawArm(-1, p.armL, front);

  // --- torso
  const tg = ctx.createLinearGradient(-11, -31, 11, -12);
  const body = a.outfit === 'shirt' ? main : main;
  tg.addColorStop(0, shade(body, 0.18));
  tg.addColorStop(1, shade(body, -0.12));
  ctx.beginPath();
  ctx.moveTo(-9.5, -31);
  ctx.quadraticCurveTo(0, -33.5, 9.5, -31);
  ctx.quadraticCurveTo(12, -22, 11, -12.5);
  ctx.quadraticCurveTo(0, -10.5, -11, -12.5);
  ctx.quadraticCurveTo(-12, -22, -9.5, -31);
  ctx.closePath();
  fillStroke(ctx, tg);

  if (front) {
    switch (a.outfit) {
      case 'suit':
      case 'executive': {
        // shirt V + lapels
        ctx.beginPath();
        ctx.moveTo(-4.5, -31.5);
        ctx.lineTo(0, -21);
        ctx.lineTo(4.5, -31.5);
        ctx.closePath();
        ctx.fillStyle = hex(shirt);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4.8, -31.5);
        ctx.lineTo(-1, -20);
        ctx.lineTo(-6.5, -26);
        ctx.moveTo(4.8, -31.5);
        ctx.lineTo(1, -20);
        ctx.lineTo(6.5, -26);
        ctx.stroke();
        ctx.fillStyle = shade(main, -0.35);
        for (const y of [-18, -15]) {
          ctx.beginPath();
          ctx.arc(0, y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        if (a.outfit === 'executive') {
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(4.5, -24, 3.5, 2);
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-10.5, -13.5);
          ctx.lineTo(10.5, -13.5);
          ctx.stroke();
        }
        break;
      }
      case 'shirt': {
        ctx.fillStyle = shirt;
        ctx.beginPath();
        ctx.moveTo(-5, -31.5);
        ctx.lineTo(-1.5, -27.5);
        ctx.lineTo(0, -30.5);
        ctx.lineTo(1.5, -27.5);
        ctx.lineTo(5, -31.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(main, -0.3);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -28);
        ctx.lineTo(0, -13);
        ctx.stroke();
        ctx.fillStyle = shade(main, -0.35);
        for (const y of [-25, -21, -17]) ctx.fillRect(-0.6, y, 1.2, 1.2);
        break;
      }
      case 'hoodie': {
        ctx.beginPath();
        ctx.ellipse(0, -31, 7, 3, 0, 0, Math.PI * 2);
        fillStroke(ctx, shade(main, -0.15), 1);
        ctx.strokeStyle = shirt;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-2.5, -29);
        ctx.lineTo(-2.8, -23);
        ctx.moveTo(2.5, -29);
        ctx.lineTo(2.8, -23);
        ctx.stroke();
        rr(ctx, -6.5, -19, 13, 5.5, 2.5);
        fillStroke(ctx, shade(main, -0.12), 1);
        break;
      }
      case 'founder': {
        // turtleneck + puffer vest
        ctx.fillStyle = shirt;
        rr(ctx, -4.5, -33, 9, 4, 2);
        ctx.fill();
        ctx.fillStyle = shirt;
        ctx.beginPath();
        ctx.moveTo(-3.5, -30);
        ctx.lineTo(3.5, -30);
        ctx.lineTo(2.5, -12);
        ctx.lineTo(-2.5, -12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(main, -0.25);
        ctx.lineWidth = 0.9;
        for (const y of [-26, -21, -16]) {
          ctx.beginPath();
          ctx.moveTo(-10.5, y);
          ctx.lineTo(-3.5, y + 0.5);
          ctx.moveTo(3.5, y + 0.5);
          ctx.lineTo(10.5, y);
          ctx.stroke();
        }
        break;
      }
      case 'casual': {
        ctx.fillStyle = shade(main, -0.2);
        ctx.beginPath();
        ctx.ellipse(0, -31.2, 5, 1.8, 0, 0, Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -22, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = shirt;
        ctx.fill();
        ctx.fillStyle = main;
        ctx.font = 'bold 4.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N', 0, -20.4);
        break;
      }
    }
    // accessories on chest
    if (a.accessory === 'tie') {
      ctx.beginPath();
      ctx.moveTo(-1.6, -29.5);
      ctx.lineTo(1.6, -29.5);
      ctx.lineTo(2.4, -17);
      ctx.lineTo(0, -14.5);
      ctx.lineTo(-2.4, -17);
      ctx.closePath();
      fillStroke(ctx, '#ef3e4a', 0.9);
    }
    if (a.accessory === 'badge') {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, -31);
      ctx.lineTo(-4.5, -22);
      ctx.moveTo(4, -31);
      ctx.lineTo(-3, -22);
      ctx.stroke();
      rr(ctx, -7, -22.5, 6, 7.5, 1);
      fillStroke(ctx, '#ffffff', 0.9);
      ctx.fillStyle = main;
      ctx.fillRect(-6.5, -22, 5, 2);
      ctx.fillStyle = '#9aa2c2';
      ctx.fillRect(-6, -18.5, 4, 0.8);
      ctx.fillRect(-6, -17.2, 3, 0.8);
    }
    if (a.accessory === 'backpack') {
      ctx.strokeStyle = '#e2661c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -31);
      ctx.lineTo(-7, -18);
      ctx.moveTo(6, -31);
      ctx.lineTo(7, -18);
      ctx.stroke();
    }
    if (a.accessory === 'laptopbag') {
      ctx.strokeStyle = '#5b3a24';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-8, -31);
      ctx.lineTo(9, -14);
      ctx.stroke();
      rr(ctx, 6, -17, 9, 7, 1.5);
      fillStroke(ctx, '#7a4e30', 1);
    }
  } else {
    if (a.outfit === 'hoodie') {
      ctx.beginPath();
      ctx.ellipse(0, -29, 8, 5, 0, 0, Math.PI * 2);
      fillStroke(ctx, shade(main, -0.12), 1);
    }
    if (a.accessory === 'laptopbag') {
      ctx.strokeStyle = '#5b3a24';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(8, -31);
      ctx.lineTo(-9, -14);
      ctx.stroke();
    }
    if (a.accessory === 'backpack') {
      rr(ctx, -9, -30, 18, 17, 5);
      fillStroke(ctx, '#ff8a3d');
      rr(ctx, -6, -21, 12, 6, 2);
      fillStroke(ctx, '#e2661c', 1);
    }
  }

  // --- ghost laptop held in front
  if (p.ghost && p.laptop && front) {
    ctx.save();
    ctx.translate(0, -16);
    rr(ctx, -9, -3, 18, 10, 1.5);
    fillStroke(ctx, '#c8ccd8', 1);
    rr(ctx, -7.5, -2, 15, 7, 1);
    ctx.fillStyle = '#7ff3ff';
    ctx.fill();
    ctx.fillStyle = 'rgba(20,40,80,0.5)';
    ctx.fillRect(-6, 0, 8, 0.8);
    ctx.fillRect(-6, 2, 11, 0.8);
    ctx.restore();
  }

  drawArm(1, p.armR, front);

  // --- head
  const hy = -43;
  const hr = 12;
  // ears
  ctx.beginPath();
  ctx.arc(-hr + 0.5, hy + 1, 2.6, 0, Math.PI * 2);
  ctx.arc(hr - 0.5, hy + 1, 2.6, 0, Math.PI * 2);
  fillStroke(ctx, shade(skin, -0.08), 1);
  const hg = ctx.createRadialGradient(-4, hy - 5, 2, 0, hy, hr + 2);
  hg.addColorStop(0, shade(skin, 0.18));
  hg.addColorStop(1, shade(skin, -0.08));
  ctx.beginPath();
  ctx.ellipse(0, hy, hr, hr * 0.96, 0, 0, Math.PI * 2);
  fillStroke(ctx, hg, 1.5);

  // long hair back layer
  if (a.hair === 'long') {
    ctx.beginPath();
    ctx.moveTo(-hr - 1, hy - 2);
    ctx.quadraticCurveTo(-hr - 3, hy + 14, -hr + 2, hy + 16);
    ctx.lineTo(hr - 2, hy + 16);
    ctx.quadraticCurveTo(hr + 3, hy + 14, hr + 1, hy - 2);
    ctx.closePath();
    if (front) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      fillStroke(ctx, shade(hair, -0.08), 1.2);
      ctx.restore();
    } else fillStroke(ctx, hair, 1.2);
  }

  if (front) {
    // face
    const ex = 4.6;
    const ey = hy + 1;
    const expr = p.expression ?? 'normal';
    ctx.fillStyle = '#1e1a28';
    if (p.blink) {
      ctx.fillRect(-ex - 1.8, ey, 3.6, 1.1);
      ctx.fillRect(ex - 1.8, ey, 3.6, 1.1);
    } else if (expr === 'happy') {
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#1e1a28';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * ex, ey + 1, 2, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else {
      const big = expr === 'shock' ? 1.35 : 1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * ex, ey, 1.8 * big, 2.3 * big, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s * ex + 0.6, ey - 0.8, 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1a28';
      }
    }
    // brows
    ctx.strokeStyle = shade(hair, -0.2);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const browTilt = expr === 'smug' ? 1.2 : expr === 'sad' ? -1.2 : expr === 'think' ? 0.8 : 0;
    ctx.moveTo(-ex - 2.2, ey - 4.5 + browTilt);
    ctx.lineTo(-ex + 1.8, ey - 4.8 - browTilt * 0.5);
    ctx.moveTo(ex - 1.8, ey - 4.8 + (expr === 'think' ? -1.2 : -browTilt * 0.5));
    ctx.lineTo(ex + 2.2, ey - 4.5 + browTilt);
    ctx.stroke();
    // cheeks
    ctx.fillStyle = 'rgba(255,110,130,0.28)';
    ctx.beginPath();
    ctx.ellipse(-ex - 2.5, ey + 4, 2.3, 1.4, 0, 0, Math.PI * 2);
    ctx.ellipse(ex + 2.5, ey + 4, 2.3, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.strokeStyle = '#3a1f24';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    if (expr === 'shock') {
      ctx.fillStyle = '#5a1f2a';
      ctx.ellipse(0, ey + 6, 2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expr === 'sad') {
      ctx.arc(0, ey + 8.5, 2.6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (expr === 'happy') {
      ctx.fillStyle = '#5a1f2a';
      ctx.arc(0, ey + 4.6, 3.2, 0, Math.PI);
      ctx.fill();
    } else if (expr === 'smug') {
      ctx.moveTo(-2.5, ey + 6);
      ctx.quadraticCurveTo(1, ey + 7.2, 3.2, ey + 4.8);
      ctx.stroke();
    } else if (expr === 'think') {
      ctx.moveTo(-2, ey + 6.2);
      ctx.lineTo(2.2, ey + 5.8);
      ctx.stroke();
    } else {
      ctx.arc(0, ey + 4.2, 2.6, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  // hair
  drawHair(ctx, a.hair, hair, front, hy, hr);

  // head accessories
  if (a.accessory === 'glasses' && front) {
    ctx.strokeStyle = '#1e1a28';
    ctx.lineWidth = 1.2;
    rr(ctx, -8.6, hy - 2, 7, 5.6, 1.8);
    ctx.stroke();
    rr(ctx, 1.6, hy - 2, 7, 5.6, 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.6, hy);
    ctx.lineTo(1.6, hy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,230,255,0.25)';
    rr(ctx, -8.6, hy - 2, 7, 5.6, 1.8);
    ctx.fill();
    rr(ctx, 1.6, hy - 2, 7, 5.6, 1.8);
    ctx.fill();
  }
  if (a.accessory === 'headphones') {
    ctx.strokeStyle = '#2b2f3f';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, hy - 1, hr + 1.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    for (const s of [-1, 1]) {
      rr(ctx, s * (hr + 1) - 3, hy - 3, 6, 9, 2.5);
      fillStroke(ctx, '#2ee6f0', 1.1);
    }
  }

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  style: string,
  color: string,
  front: boolean,
  hy: number,
  hr: number,
) {
  const g = ctx.createLinearGradient(0, hy - hr - 4, 0, hy);
  g.addColorStop(0, shade(color, 0.2));
  g.addColorStop(1, shade(color, -0.1));
  if (style === 'bald') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-4, hy - 7, 3.5, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (!front) {
    // back of head covered
    ctx.beginPath();
    ctx.ellipse(0, hy - 1, hr + 0.8, hr + 0.5, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(hr * 0.8, hy + 6);
    ctx.quadraticCurveTo(0, hy + 9, -hr * 0.8, hy + 6);
    ctx.closePath();
    fillStroke(ctx, g, 1.3);
    if (style === 'bun') {
      ctx.beginPath();
      ctx.arc(0, hy - hr - 2, 5, 0, Math.PI * 2);
      fillStroke(ctx, g, 1.2);
    }
    if (style === 'curly') {
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * (hr + 0.5), hy + Math.sin(ang) * (hr + 0.5), 4, 0, Math.PI * 2);
        fillStroke(ctx, g, 1);
      }
    }
    return;
  }
  ctx.beginPath();
  switch (style) {
    case 'short':
      ctx.moveTo(-hr - 0.5, hy + 1);
      ctx.bezierCurveTo(-hr - 1, hy - hr - 2, hr + 1, hy - hr - 3, hr + 0.5, hy + 1);
      ctx.quadraticCurveTo(hr - 2, hy - 6, 3, hy - 6.5);
      ctx.quadraticCurveTo(-4, hy - 8, -hr + 2, hy - 4);
      ctx.closePath();
      fillStroke(ctx, g, 1.3);
      break;
    case 'bun':
      ctx.moveTo(-hr - 0.5, hy);
      ctx.bezierCurveTo(-hr, hy - hr - 2, hr, hy - hr - 2, hr + 0.5, hy);
      ctx.quadraticCurveTo(4, hy - 9, -hr - 0.5, hy);
      ctx.closePath();
      fillStroke(ctx, g, 1.3);
      ctx.beginPath();
      ctx.arc(0, hy - hr - 3, 5, 0, Math.PI * 2);
      fillStroke(ctx, g, 1.2);
      break;
    case 'curly':
      for (let i = 0; i < 9; i++) {
        const ang = Math.PI * 0.92 + (i / 8) * Math.PI * 1.16;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * (hr - 0.5), hy - 1 + Math.sin(ang) * (hr - 0.5), 4.4, 0, Math.PI * 2);
        fillStroke(ctx, g, 1);
      }
      ctx.beginPath();
      ctx.ellipse(0, hy - 7, hr - 2, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      break;
    case 'quiff':
      ctx.moveTo(-hr - 0.5, hy + 1);
      ctx.bezierCurveTo(-hr - 1, hy - hr - 1, -2, hy - hr - 7, 8, hy - hr - 5);
      ctx.quadraticCurveTo(hr + 3, hy - hr + 2, hr + 0.5, hy + 1);
      ctx.quadraticCurveTo(hr - 3, hy - 6, 0, hy - 7);
      ctx.quadraticCurveTo(-5, hy - 7, -hr + 2, hy - 3);
      ctx.closePath();
      fillStroke(ctx, g, 1.3);
      break;
    case 'long':
      ctx.moveTo(-hr - 1, hy + 10);
      ctx.bezierCurveTo(-hr - 3, hy - hr - 2, hr + 3, hy - hr - 2, hr + 1, hy + 10);
      ctx.lineTo(hr - 2.5, hy + 10);
      ctx.quadraticCurveTo(hr - 1, hy - 5, 2, hy - 7);
      ctx.quadraticCurveTo(-6, hy - 5, -hr + 2.5, hy + 10);
      ctx.closePath();
      fillStroke(ctx, g, 1.3);
      break;
  }
}

// ---------------------------------------------------------------------------
// Sprite-sheet generation
// ---------------------------------------------------------------------------

export const FRAME_W = 72;
export const FRAME_H = 100;
export const SHEET_SCALE = 2;
/** feet position inside each frame (1x px) */
export const FEET_X = 36;
export const FEET_Y = 92;

export interface AnimDef {
  name: string;
  frames: Pose[];
  rate: number;
  loop: boolean;
}

export function animDefs(): AnimDef[] {
  const walk = (facing: Facing, ghost = false): Pose[] =>
    Array.from({ length: 8 }, (_, i) => {
      const t = (i / 8) * Math.PI * 2;
      return {
        facing,
        legSwing: Math.sin(t),
        armL: Math.sin(t) * 0.55,
        armR: -Math.sin(t) * 0.55,
        bob: -Math.abs(Math.cos(t)) * 1.6,
        lift: 0,
        ghost,
        laptop: ghost,
      };
    });
  const idle = (facing: Facing, ghost = false): Pose[] =>
    Array.from({ length: 4 }, (_, i) => ({
      facing,
      legSwing: ghost ? i / 2 : 0,
      armL: 0.08 + Math.sin((i / 4) * Math.PI * 2) * 0.03,
      armR: 0.08 + Math.sin((i / 4) * Math.PI * 2) * 0.03,
      bob: ghost ? -2 - Math.sin((i / 4) * Math.PI * 2) * 2 : -Math.sin((i / 4) * Math.PI * 2) * 0.7,
      lift: ghost ? 3 : 0,
      ghost,
      laptop: ghost,
      blink: !ghost && i === 3,
    }));
  const ghostWalk = (facing: Facing): Pose[] =>
    Array.from({ length: 4 }, (_, i) => ({
      facing,
      legSwing: i / 1.3,
      armL: -0.9,
      armR: -0.9,
      bob: -2 - Math.sin((i / 4) * Math.PI * 2) * 2,
      lift: 4,
      ghost: true,
      laptop: true,
    }));
  return [
    { name: 'idle_f', frames: idle('front'), rate: 3, loop: true },
    { name: 'idle_b', frames: idle('back'), rate: 3, loop: true },
    { name: 'walk_f', frames: walk('front'), rate: 12, loop: true },
    { name: 'walk_b', frames: walk('back'), rate: 12, loop: true },
    {
      name: 'work',
      frames: Array.from({ length: 4 }, (_, i) => ({
        facing: 'back' as Facing,
        legSwing: 0,
        armL: -1.1 - (i % 2) * 0.25,
        armR: -1.1 - ((i + 1) % 2) * 0.25,
        bob: 0,
        lift: 0,
      })),
      rate: 8,
      loop: true,
    },
    { name: 'ghost_f', frames: ghostWalk('front'), rate: 5, loop: true },
    { name: 'ghost_b', frames: ghostWalk('back'), rate: 5, loop: true },
    {
      name: 'cheer',
      frames: [0, 1, 2, 3].map((i) => ({
        facing: 'front' as Facing,
        legSwing: 0,
        armL: -2.6 + (i % 2) * 0.3,
        armR: -2.6 + ((i + 1) % 2) * 0.3,
        bob: 0,
        lift: [0, 8, 12, 6][i],
        expression: 'happy' as Expression,
        squash: i === 0 ? 1.06 : 1,
      })),
      rate: 7,
      loop: true,
    },
    {
      name: 'sad',
      frames: [0, 1].map((i) => ({
        facing: 'front' as Facing,
        legSwing: 0,
        armL: 0.05,
        armR: 0.05,
        bob: 2 + i,
        lift: 0,
        expression: 'sad' as Expression,
      })),
      rate: 1.5,
      loop: true,
    },
  ];
}

/** Builds a sprite sheet canvas and returns frame rectangles per animation. */
export function buildSheet(a: Appearance): {
  canvas: HTMLCanvasElement;
  anims: { name: string; frames: number[]; rate: number; loop: boolean }[];
  frameCount: number;
} {
  const defs = animDefs();
  const total = defs.reduce((n, d) => n + d.frames.length, 0);
  const cols = 8;
  const rows = Math.ceil(total / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * FRAME_W * SHEET_SCALE;
  canvas.height = rows * FRAME_H * SHEET_SCALE;
  const ctx = canvas.getContext('2d')!;
  let i = 0;
  const anims: { name: string; frames: number[]; rate: number; loop: boolean }[] = [];
  for (const d of defs) {
    const frames: number[] = [];
    for (const pose of d.frames) {
      const cx = (i % cols) * FRAME_W * SHEET_SCALE;
      const cy = Math.floor(i / cols) * FRAME_H * SHEET_SCALE;
      ctx.save();
      ctx.translate(cx + FEET_X * SHEET_SCALE, cy + FEET_Y * SHEET_SCALE);
      ctx.scale(SHEET_SCALE, SHEET_SCALE);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (pose.ghost) ctx.globalAlpha = 0.85;
      drawCharacter(ctx, a, pose);
      if (pose.ghost) {
        // cool translucent ghost tint
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(-FEET_X, -FEET_Y, FRAME_W, FRAME_H);
      }
      ctx.restore();
      frames.push(i);
      i++;
    }
    anims.push({ name: d.name, frames, rate: d.rate, loop: d.loop });
  }
  return { canvas, anims, frameCount: total };
}

/** Draws a single static avatar (used by React UI). */
export function renderAvatar(
  canvas: HTMLCanvasElement,
  a: Appearance,
  opts: { expression?: Expression; ghost?: boolean; pose?: Partial<Pose>; scale?: number } = {},
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 72;
  const cssH = canvas.clientHeight || 100;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = (opts.scale ?? Math.min(cssW / FRAME_W, cssH / FRAME_H)) * dpr;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height - 8 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // soft shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (opts.ghost) ctx.globalAlpha = 0.7;
  drawCharacter(ctx, a, {
    facing: 'front',
    legSwing: 0,
    armL: 0.1,
    armR: 0.1,
    bob: 0,
    lift: opts.ghost ? 4 : 0,
    ghost: opts.ghost,
    laptop: opts.ghost,
    expression: opts.expression,
    ...opts.pose,
  });
  ctx.restore();
}
