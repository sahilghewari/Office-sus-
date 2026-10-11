import { useState } from 'react';
import { ROOM_BY_ID, STATION_BY_ID, TASK_INFO, VENT_BY_ID, roomName, type SabotageKind } from '@corp/shared';
import { useGame } from '../stores/game';
import { useActions } from '../stores/actions';
import { useSettings, keyLabel } from '../stores/settings';
import { useServerNow, secondsLeft } from '../hooks/useNow';
import { performUse, performReport, performKill } from '../hooks/useGameKeys';
import { send } from '../networking/connection';
import { ChatPanel } from './ChatPanel';
import { VoiceControls } from '../voice/VoiceControls';

const SABOTAGES: { kind: SabotageKind; icon: string; name: string; desc: string; critical?: boolean }[] = [
  { kind: 'fire', icon: '🔥', name: 'Fire Alarm', desc: 'Critical! 45 s to reset two panels or you win.', critical: true },
  { kind: 'server', icon: '💥', name: 'Crash Server', desc: 'Critical! Two people must hold both cores at once.', critical: true },
  { kind: 'power', icon: '🔌', name: 'Cut Electricity', desc: 'Lights out. Employees can barely see.' },
  { kind: 'wifi', icon: '📡', name: 'Disable Wi-Fi', desc: 'Network tasks stop working.' },
  { kind: 'outage', icon: '🖥️', name: 'System Outage', desc: 'All electronic stations go offline until 3 terminals are restored.' },
  { kind: 'cctv', icon: '📹', name: 'Disable CCTV', desc: 'Security cameras go dark.' },
  { kind: 'doors', icon: '🔒', name: 'Lock Conference', desc: 'Conference room doors lock for 12 s.' },
];

const SAB_NAMES: Record<SabotageKind, string> = {
  fire: 'FIRE ALARM',
  server: 'SERVER MELTDOWN',
  power: 'POWER CUT',
  wifi: 'WI-FI DOWN',
  outage: 'SYSTEM OUTAGE',
  cctv: 'CCTV OFFLINE',
  doors: 'DOORS LOCKED',
};

const FIX_WHERE: Record<string, string> = {
  wifi: 'IT Support',
  fireA: 'Reception',
  fireB: 'Cafeteria',
  power: 'Maintenance',
  serverA: 'Server Room (Core A)',
  serverB: 'Server Room (Core B)',
  cctv: 'Security Office',
  outageA: 'Open Workspace',
  outageB: 'HR Department',
  outageC: 'Reception',
};

export function Hud() {
  const s = useGame((g) => g.state)!;
  const ping = useGame((g) => g.ping);
  const set = useGame((g) => g.set);
  const sabotageOpen = useGame((g) => g.sabotageOpen);
  const spectateTarget = useGame((g) => g.spectateTarget);
  const actions = useActions();
  const keys = useSettings((k) => k.keys);
  const reduced = useSettings((k) => k.reducedMotion);
  const now = useServerNow(200);
  const manager = s.you.role === 'manager';
  const ghost = !s.you.alive && !s.you.spectator;
  const pct = s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : 0;
  const sab = s.sabotage;
  const crit = sab?.critical ? secondsLeft(sab.endsAt, now) : 0;
  const killCd = secondsLeft(s.you.killReadyAt, now);
  const sabCd = secondsLeft(s.you.sabotageReadyAt, now);
  const doorCd = secondsLeft(s.you.doorsReadyAt, now);
  const k = (a: keyof typeof keys) => keyLabel(keys[a][0] ?? '');
  const [taskOpen, setTaskOpen] = useState(true);

  if (s.phase !== 'ACTIVE') return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* critical alarm vignette */}
      {sab?.critical && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 160px 40px rgba(239,62,74,0.55)',
            animation: reduced ? undefined : 'alarm-vignette 1.4s ease-in-out infinite',
            opacity: reduced ? 0.45 : undefined,
          }}
        />
      )}

      {/* TOP LEFT: tasks */}
      <section className="hud pointer-events-auto absolute top-4 left-4 w-[290px] p-3" data-testid="task-list">
        <button className="flex w-full items-center justify-between" onClick={() => setTaskOpen((v) => !v)} aria-expanded={taskOpen}>
          <span className="font-display text-sm font-bold tracking-wider text-corp-yellow uppercase">{s.you.spectator ? 'Spectating' : manager ? 'Fake tasks (blend in)' : 'Your tasks'}</span>
          <span className={`chip ${manager ? 'bg-corp-red/25 text-red-300' : 'bg-corp-mint/20 text-corp-mint'}`}>{s.you.spectator ? 'viewer' : manager ? 'Toxic Manager' : 'Employee'}</span>
        </button>
        {taskOpen && !s.you.spectator && (
          <ul className="mt-2 space-y-1">
            {s.you.tasks.map((t) => {
              const st = STATION_BY_ID[t.stationId];
              return (
                <li key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${t.done ? 'text-mist/50 line-through' : 'bg-white/5'}`}>
                  <span aria-hidden>{t.done ? '✅' : '⬜'}</span>
                  <span className="flex-1">{TASK_INFO[t.type].title}</span>
                  <span className="text-[11px] text-mist/60">{ROOM_BY_ID[st.room].name}</span>
                </li>
              );
            })}
            {manager && s.you.teammates.length > 0 && (
              <li className="pt-1 text-xs text-red-300">Fellow managers: {s.you.teammates.map((id) => s.players.find((p) => p.id === id)?.name).join(', ')}</li>
            )}
            {ghost && <li className="pt-1 text-xs text-corp-cyan">👻 You're a ghost. {manager ? 'Haunt quietly.' : 'Finish your tasks to help the team!'}</li>}
          </ul>
        )}
        {s.you.spectator && <SpectatorList />}
      </section>

      {/* TOP CENTER: productivity + emergencies */}
      <section className="absolute top-4 left-1/2 flex w-[min(520px,46vw)] -translate-x-1/2 flex-col items-center gap-2">
        <div className="hud w-full px-4 py-2.5" data-testid="productivity">
          <div className="mb-1 flex items-center justify-between text-xs font-bold tracking-widest uppercase">
            <span>Company productivity</span>
            <span className="font-mono text-corp-mint">{pct}%</span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
            <div className="relative h-full rounded-full bg-gradient-to-r from-corp-mint to-corp-cyan transition-all duration-700" style={{ width: `${pct}%` }}>
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div className="h-full w-1/3 bg-white/30" style={{ animation: reduced ? undefined : 'sweep 2.4s linear infinite' }} />
              </div>
            </div>
          </div>
        </div>
        {sab && (
          <div className={`hud anim-pop w-full px-4 py-2 ${sab.critical ? 'border-corp-red bg-[#3a0f16]/95' : 'border-corp-orange/60'}`} role="alert" data-testid="sabotage-banner">
            <div className="flex items-center justify-between">
              <span className={`font-display text-lg font-bold ${sab.critical ? 'text-red-300' : 'text-corp-orange'}`}>⚠ {SAB_NAMES[sab.kind]}</span>
              {sab.critical && <span className="font-mono text-2xl font-bold text-white tabular-nums">{crit}s</span>}
            </div>
            <div className="text-xs text-mist">
              Fix at:{' '}
              {sab.pending.map((f, i) => (
                <span key={f}>
                  {i > 0 && ', '}
                  <b className="text-white">{FIX_WHERE[f] ?? f}</b>
                  {sab.holding.includes(f) && ' (holding)'}
                </span>
              ))}
              {sab.fixed.length > 0 && <span className="text-corp-mint"> · {sab.fixed.length} restored</span>}
            </div>
          </div>
        )}
        {s.doorsLockedUntil && (
          <div className="hud px-3 py-1.5 text-sm text-corp-yellow">🔒 Conference doors locked · {secondsLeft(s.doorsLockedUntil, now)}s · override in Security</div>
        )}
      </section>

      {/* TOP RIGHT */}
      <section className="pointer-events-auto absolute top-4 right-4 flex items-center gap-2">
        <span className={`chip ${ping < 120 ? 'bg-corp-mint/20 text-corp-mint' : ping < 250 ? 'bg-corp-yellow/20 text-corp-yellow' : 'bg-corp-red/20 text-red-300'}`} title="Latency to the office server">
          ● {ping} ms
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => set({ mapOpen: true })} data-testid="open-map">
          🗺️ Map <span className="kbd ml-1">{k('map')}</span>
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => set({ settingsOpen: true })} aria-label="Settings">
          ⚙️
        </button>
      </section>

      {/* BOTTOM LEFT: voice + ghost chat */}
      <section className="pointer-events-auto absolute bottom-4 left-4 flex w-[320px] flex-col gap-2">
        {(ghost || s.you.spectator) && (
          <div className="hud h-48 p-3">
            <ChatPanel channels={['ghost']} title="Ghost chat (living can't see this)" placeholder="Boo…" compact />
          </div>
        )}
        <VoiceControls />
        <div className="hud px-3 py-1.5 text-xs text-mist">📍 {actions.room}</div>
      </section>

      {/* vent controls */}
      {s.you.inVent && (
        <section className="pointer-events-auto absolute bottom-32 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div className="hud px-4 py-2 font-display text-corp-cyan">In the maintenance passages · {roomName(VENT_BY_ID[s.you.inVent].room)}</div>
          <div className="flex gap-2">
            {VENT_BY_ID[s.you.inVent].links.map((id) => (
              <button key={id} className="btn btn-purple" onClick={() => send({ t: 'vent', action: 'move', vent: id })}>
                ➜ {roomName(VENT_BY_ID[id].room)}
              </button>
            ))}
            <button className="btn btn-yellow" onClick={() => send({ t: 'vent', action: 'exit' })}>
              Exit <span className="kbd ml-1">{k('interact')}</span>
            </button>
          </div>
        </section>
      )}

      {/* BOTTOM RIGHT: actions */}
      {!s.you.spectator && (
        <section className="pointer-events-auto absolute right-4 bottom-4 flex items-end gap-3" data-testid="actions">
          {manager && s.you.alive && (
            <>
              <div className="relative">
                <ActionButton icon="💣" label="Sabotage" hotkey={k('sabotage')} color="btn-orange" cooldown={sab ? 0 : sabCd} onClick={() => set({ sabotageOpen: !sabotageOpen })} />
                {sabotageOpen && <SabotageMenu sabCd={sabCd} doorCd={doorCd} active={!!sab} doorsLocked={!!s.doorsLockedUntil} onClose={() => set({ sabotageOpen: false })} />}
              </div>
              <ActionButton icon="📄" label={actions.kill ? `Terminate ${actions.kill.name}` : 'Terminate'} hotkey={k('kill')} color="btn-red" disabled={!actions.kill} cooldown={killCd} onClick={performKill} testId="kill-btn" />
            </>
          )}
          <ActionButton icon="📢" label="Report to HR" hotkey={k('report')} color="btn-red" disabled={!actions.report} onClick={performReport} big={!!actions.report} testId="report-btn" />
          <ActionButton
            icon={actions.use?.kind === 'emergency' ? '🚨' : actions.use?.kind === 'vent' ? '🕳️' : actions.use?.kind === 'fix' ? '🔧' : actions.use?.kind === 'cctv' ? '📹' : '✋'}
            label={actions.use ? (actions.use.disabled ? actions.use.disabled : actions.use.label) : 'Use'}
            hotkey={k('interact')}
            color="btn-yellow"
            disabled={!actions.use || !!actions.use.disabled}
            onClick={performUse}
            big
            testId="use-btn"
          />
        </section>
      )}
    </div>
  );
}

function ActionButton({ icon, label, hotkey, color, disabled, cooldown = 0, onClick, big, testId }: { icon: string; label: string; hotkey: string; color: string; disabled?: boolean; cooldown?: number; onClick: () => void; big?: boolean; testId?: string }) {
  const cd = cooldown > 0;
  return (
    <button className={`btn ${color} relative flex-col !gap-0 ${big ? 'h-24 w-28' : 'h-20 w-24'} !p-1`} disabled={disabled || cd} onClick={onClick} data-testid={testId} title={label}>
      <span className="text-3xl leading-none">{icon}</span>
      <span className="mt-1 line-clamp-2 text-center text-[11px] leading-tight">{label}</span>
      <span className="kbd absolute top-1 right-1 !h-5 !min-w-5 text-[10px]">{hotkey}</span>
      {cd && <span className="font-display absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/55 text-3xl font-bold">{cooldown}</span>}
    </button>
  );
}

function SabotageMenu({ sabCd, doorCd, active, doorsLocked, onClose }: { sabCd: number; doorCd: number; active: boolean; doorsLocked: boolean; onClose: () => void }) {
  return (
    <div className="panel anim-pop absolute right-0 bottom-full mb-3 w-[360px] p-3" data-testid="sabotage-menu">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-lg font-bold text-corp-orange">Sabotage the company</span>
        <button onClick={onClose} aria-label="Close" className="text-mist hover:text-white">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {SABOTAGES.map((sb) => {
          const isDoor = sb.kind === 'doors';
          const cd = isDoor ? doorCd : sabCd;
          const blocked = isDoor ? doorsLocked : active;
          return (
            <button
              key={sb.kind}
              disabled={cd > 0 || blocked}
              onClick={() => {
                send({ t: 'sabotage', kind: sb.kind });
                onClose();
              }}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${sb.critical ? 'bg-corp-red/15' : 'bg-white/5'}`}
              data-testid={`sabotage-${sb.kind}`}
            >
              <span className="text-2xl">{sb.icon}</span>
              <span className="flex-1">
                <span className="font-display block font-semibold">{sb.name}</span>
                <span className="block text-xs text-mist">{sb.desc}</span>
              </span>
              {cd > 0 && <span className="font-mono text-sm">{cd}s</span>}
            </button>
          );
        })}
      </div>
      {active && <p className="mt-2 text-xs text-mist">One office emergency at a time. HR has limits.</p>}
    </div>
  );
}

function SpectatorList() {
  const s = useGame((g) => g.state)!;
  const target = useGame((g) => g.spectateTarget);
  const set = useGame((g) => g.set);
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs text-mist">Follow a player (or drag / WASD for free camera):</p>
      <div className="flex flex-wrap gap-1">
        {s.players.map((p) => (
          <button key={p.id} className={`rounded-lg px-2 py-1 text-xs ${target === p.id ? 'bg-corp-cyan text-ink' : 'bg-white/10 hover:bg-white/20'}`} onClick={() => set({ spectateTarget: p.id })}>
            {p.name}
          </button>
        ))}
        <button className={`rounded-lg px-2 py-1 text-xs ${!target ? 'bg-corp-cyan text-ink' : 'bg-white/10'}`} onClick={() => set({ spectateTarget: null })}>
          Free cam
        </button>
      </div>
    </div>
  );
}
