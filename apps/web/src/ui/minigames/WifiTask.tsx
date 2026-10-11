import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/audio';
import type { MinigameProps } from './common';

const HEX: Record<string, string> = { red: '#ef3e4a', blue: '#3d7bff', yellow: '#ffd23f', green: '#3ddc97', purple: '#8a5cf6', orange: '#ff8a3d' };

/** Drag each loose cable to the matching port. Correct links light up. */
export function WifiTask({ data, submit }: MinigameProps<{ left: string[]; right: string[] }>) {
  const box = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<Record<number, number>>({});
  const [drag, setDrag] = useState<{ from: number; x: number; y: number } | null>(null);
  const [bad, setBad] = useState<number | null>(null);
  const W = 520;
  const H = 300;
  const rowY = (i: number) => 50 + i * 66;

  useEffect(() => {
    if (Object.keys(links).length === data.left.length) {
      const t = setTimeout(() => submit(Object.entries(links).map(([l, r]) => [Number(l), r])), 450);
      return () => clearTimeout(t);
    }
  }, [links, data.left.length, submit]);

  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const drop = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = local(e);
    let target = -1;
    data.right.forEach((_, i) => {
      if (Math.hypot(p.x - (W - 60), p.y - rowY(i)) < 34) target = i;
    });
    if (target >= 0 && !Object.values(links).includes(target)) {
      if (data.right[target] === data.left[drag.from]) {
        setLinks((l) => ({ ...l, [drag.from]: target }));
        sfx('cable');
      } else {
        setBad(target);
        sfx('error');
        setTimeout(() => setBad(null), 400);
      }
    }
    setDrag(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2 text-xs text-mist">
        Network status:
        {data.left.map((_, i) => (
          <span key={i} className={`h-3 w-3 rounded-full ${links[i] !== undefined ? 'bg-corp-mint shadow-[0_0_8px_#3ddc97]' : 'bg-corp-red/60'}`} />
        ))}
      </div>
      <div
        ref={box}
        className="relative w-full max-w-[520px] touch-none rounded-2xl bg-[#1a2033] ring-1 ring-white/10"
        style={{ aspectRatio: `${W}/${H}` }}
        onPointerMove={(e) => drag && setDrag({ ...drag, ...local(e) })}
        onPointerUp={drop}
        onPointerLeave={() => setDrag(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          <rect x={W - 100} y={10} width={90} height={H - 20} rx={12} fill="#232a40" stroke="#3a4160" />
          <text x={W - 55} y={H - 16} textAnchor="middle" fill="#9aa3b8" fontSize="11" fontWeight="700">
            SWITCH
          </text>
          {data.right.map((c, i) => (
            <g key={c}>
              <rect x={W - 82} y={rowY(i) - 16} width={44} height={32} rx={6} fill={bad === i ? '#ef3e4a' : '#151a2a'} stroke={HEX[c]} strokeWidth={3} data-testid={`port-${c}`} />
              <rect x={W - 70} y={rowY(i) - 6} width={20} height={12} rx={2} fill="#000" />
              <circle cx={W - 24} cy={rowY(i)} r={5} fill={Object.values(links).includes(i) ? '#3ddc97' : '#3a3f55'} />
            </g>
          ))}
          {data.left.map((c, i) => {
            const to = links[i];
            const sx = 70;
            const sy = rowY(i);
            const ex = to !== undefined ? W - 82 : drag?.from === i ? drag.x : sx + 20;
            const ey = to !== undefined ? rowY(to) : drag?.from === i ? drag.y : sy;
            return (
              <g key={c}>
                <path d={`M ${sx} ${sy} C ${sx + 120} ${sy}, ${ex - 120} ${ey}, ${ex} ${ey}`} stroke={HEX[c]} strokeWidth={10} fill="none" strokeLinecap="round" />
                <path d={`M ${sx} ${sy} C ${sx + 120} ${sy}, ${ex - 120} ${ey}, ${ex} ${ey}`} stroke="rgba(255,255,255,0.3)" strokeWidth={3} fill="none" strokeLinecap="round" />
                <rect x={sx - 50} y={sy - 14} width={50} height={28} rx={6} fill="#2b2f3f" stroke={HEX[c]} strokeWidth={3} />
                <rect
                  x={ex - 12}
                  y={ey - 10}
                  width={22}
                  height={20}
                  rx={4}
                  fill={HEX[c]}
                  stroke="#141a3d"
                  strokeWidth={2}
                  style={{ cursor: to === undefined ? 'grab' : 'default' }}
                  onPointerDown={(e) => {
                    if (to !== undefined) return;
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setDrag({ from: i, ...local(e) });
                  }}
                  data-testid={`cable-${c}`}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-mist">Tip: the IT ticket says "have you tried plugging it in?"</p>
    </div>
  );
}
