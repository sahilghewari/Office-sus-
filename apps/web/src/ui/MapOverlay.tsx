import { DOORS, MAP_H, MAP_W, ROOMS, STATIONS, STATION_BY_ID, TASK_INFO } from '@corp/shared';
import { useGame } from '../stores/game';
import { useActions } from '../stores/actions';

const HW = 12;
const HH = 6;
const OX = MAP_H * HW + 20;
const OY = 20;
const P = (x: number, y: number) => [(x - y) * HW + OX, (x + y) * HH + OY] as const;
const poly = (x0: number, y0: number, x1: number, y1: number) =>
  [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)].map((p) => p.join(',')).join(' ');

const FILL: Record<string, string> = {
  server: '#3a4160',
  it: '#3d5fb8',
  ceo: '#7b2c4a',
  hr: '#6b55b0',
  security: '#2b3060',
  workspace: '#a8794d',
  conference: '#3e4ea0',
  gaming: '#4a2a7e',
  printer: '#7d8aa6',
  reception: '#8b8da8',
  cafeteria: '#c06a3a',
  maintenance: '#5a5f70',
  hallN: '#59607d',
  hallS: '#59607d',
};

/** TAB office map: rooms, you, your task locations and active emergencies. Never other players. */
export function MapOverlay() {
  const open = useGame((g) => g.mapOpen);
  const s = useGame((g) => g.state);
  const set = useGame((g) => g.set);
  const pos = useActions((a) => a.myPos);
  if (!open || !s) return null;
  const W = (MAP_W + MAP_H) * HW + 40;
  const H = (MAP_W + MAP_H) * HH + 40;
  const myTasks = s.you.tasks.filter((t) => !t.done);
  const fixes = s.sabotage
    ? STATIONS.filter((st) => st.kind === 'fix' && st.fix && s.sabotage!.pending.includes(st.fix))
    : [];
  const [mx, my] = P(pos[0], pos[1]);
  return (
    <div
      className="absolute inset-0 z-[47] flex items-center justify-center bg-navy-950/80 p-6 backdrop-blur-sm"
      onClick={() => set({ mapOpen: false })}
      data-testid="map-overlay"
    >
      <div
        className="panel anim-pop relative max-h-full w-full max-w-[1100px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">NEXUS HQ · Floor plan</h2>
          <div className="flex items-center gap-4 text-xs text-mist">
            <span>🟡 your tasks</span>
            <span>🔴 emergencies</span>
            <span>🚨 emergency button</span>
            <button
              className="h-9 w-9 rounded-full bg-white/10 text-lg hover:bg-white/20"
              onClick={() => set({ mapOpen: false })}
              aria-label="Close map"
            >
              ✕
            </button>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {ROOMS.map((r) => (
            <g key={r.id}>
              <polygon
                points={poly(r.x0, r.y0, r.x1 + 1, r.y1 + 1)}
                fill={FILL[r.id]}
                stroke="#dfe2f3"
                strokeWidth={1.5}
                opacity={0.9}
              />
            </g>
          ))}
          {DOORS.map((d) =>
            d.tiles.map(([x, y], i) => (
              <polygon
                key={d.id + i}
                points={poly(x, y, x + 1, y + 1)}
                fill={d.lockable && s.doorsLockedUntil ? '#ef3e4a' : '#59607d'}
              />
            )),
          )}
          {ROOMS.filter((r) => !r.isHall).map((r) => {
            const [cx, cy] = P((r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2);
            return (
              <text
                key={r.id}
                x={cx}
                y={cy}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#fff"
                style={{ fontFamily: 'Fredoka' }}
                stroke="#141a3d"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {r.name}
              </text>
            );
          })}
          {(() => {
            const [ex, ey] = P(32, 19);
            return (
              <text x={ex} y={ey + 16} textAnchor="middle" fontSize={14}>
                🚨
              </text>
            );
          })()}
          {myTasks.map((t) => {
            const st = STATION_BY_ID[t.stationId];
            const [x, y] = P(st.x, st.y);
            return (
              <g key={t.id}>
                <circle cx={x} cy={y} r={7} fill="#ffd23f" stroke="#3a2a00" strokeWidth={2}>
                  <animate attributeName="r" values="6;9;6" dur="1.4s" repeatCount="indefinite" />
                </circle>
                <text
                  x={x}
                  y={y - 11}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#ffd23f"
                  fontWeight={700}
                  stroke="#141a3d"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {TASK_INFO[t.type].title}
                </text>
              </g>
            );
          })}
          {fixes.map((st) => {
            const [x, y] = P(st.x, st.y);
            return (
              <circle key={st.id} cx={x} cy={y} r={8} fill="#ef3e4a" stroke="#fff" strokeWidth={2}>
                <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
              </circle>
            );
          })}
          {!s.you.spectator && (
            <g>
              <circle cx={mx} cy={my} r={9} fill="#2ee6f0" stroke="#fff" strokeWidth={3} />
              <text
                x={mx}
                y={my - 13}
                textAnchor="middle"
                fontSize={11}
                fontWeight={800}
                fill="#2ee6f0"
                stroke="#141a3d"
                strokeWidth={3}
                paintOrder="stroke"
              >
                YOU
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
