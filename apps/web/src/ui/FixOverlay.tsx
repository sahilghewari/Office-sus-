import { useEffect, useState } from 'react';
import { STATION_BY_ID } from '@corp/shared';
import { useGame } from '../stores/game';
import { send } from '../networking/connection';
import { closeTopOverlay } from '../hooks/useGameKeys';
import { sfx } from '../audio/audio';

const FLAVOR: Record<string, { icon: string; title: string; text: string; verb: string }> = {
  wifi: {
    icon: '📡',
    title: 'Network Terminal',
    text: 'Hold to power-cycle the core router. (Have you tried turning it off and on again?)',
    verb: 'HOLD TO REBOOT',
  },
  fireA: {
    icon: '🧯',
    title: 'Fire Panel — Reception',
    text: 'Hold the reset key. Both fire panels must be reset!',
    verb: 'HOLD TO RESET',
  },
  fireB: {
    icon: '🧯',
    title: 'Fire Panel — Cafeteria',
    text: 'Hold the reset key. Both fire panels must be reset!',
    verb: 'HOLD TO RESET',
  },
  doorsOverride: {
    icon: '🔓',
    title: 'Door Override',
    text: 'Hold to force the conference room locks open.',
    verb: 'HOLD TO UNLOCK',
  },
  serverA: {
    icon: '🗄️',
    title: 'Server Core A',
    text: 'Hold this core while a coworker holds Core B at the same time.',
    verb: 'HOLD CORE A',
  },
  serverB: {
    icon: '🗄️',
    title: 'Server Core B',
    text: 'Hold this core while a coworker holds Core A at the same time.',
    verb: 'HOLD CORE B',
  },
  cctv: {
    icon: '📹',
    title: 'Security Control',
    text: 'Hold to re-sync the camera feeds.',
    verb: 'HOLD TO RESTORE',
  },
  outageA: {
    icon: '🖥️',
    title: 'Workspace Systems',
    text: 'Hold to restore this cluster. Three clusters need restoring.',
    verb: 'HOLD TO RESTORE',
  },
  outageB: {
    icon: '🖥️',
    title: 'HR Systems',
    text: 'Hold to restore this cluster. Three clusters need restoring.',
    verb: 'HOLD TO RESTORE',
  },
  outageC: {
    icon: '🖥️',
    title: 'Reception Systems',
    text: 'Hold to restore this cluster. Three clusters need restoring.',
    verb: 'HOLD TO RESTORE',
  },
};

export function FixOverlay() {
  const fix = useGame((g) => g.fix);
  const s = useGame((g) => g.state);
  if (!fix || !s) return null;
  return (
    <div
      className="absolute inset-0 z-[48] flex items-center justify-center bg-navy-950/70 p-4"
      data-testid="fix-overlay"
    >
      <div className="panel anim-pop relative w-full max-w-[520px] p-6">
        <button
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-xl hover:bg-white/20"
          onClick={() => closeTopOverlay()}
          aria-label="Close"
        >
          ✕
        </button>
        {fix.fix === 'power' ? <PowerPanel /> : <HoldFix />}
      </div>
    </div>
  );
}

function HoldFix() {
  const fix = useGame((g) => g.fix)!;
  const s = useGame((g) => g.state)!;
  const [holding, setHolding] = useState(false);
  const f = FLAVOR[fix.fix] ?? {
    icon: '🔧',
    title: STATION_BY_ID[fix.station]?.name,
    text: 'Hold to repair.',
    verb: 'HOLD',
  };
  const progress = s.you.fix?.station === fix.station ? s.you.fix.progress : 0;
  const isServer = fix.fix === 'serverA' || fix.fix === 'serverB';
  const otherHeld = isServer && s.sabotage?.holding.includes(fix.fix === 'serverA' ? 'serverB' : 'serverA');
  useEffect(() => {
    send({ t: 'fixHold', station: fix.station, holding });
  }, [holding, fix.station]);
  useEffect(() => () => send({ t: 'fixHold', station: fix.station, holding: false }), [fix.station]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && (e.preventDefault(), setHolding(true));
    const up = (e: KeyboardEvent) => e.code === 'Space' && setHolding(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  const R = 70;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-5xl">{f.icon}</div>
      <h2 className="font-display mt-2 text-2xl font-bold">{f.title}</h2>
      <p className="mt-1 text-sm text-mist">{f.text}</p>
      {isServer && (
        <div className="mt-3 flex gap-3 text-sm">
          <span className={`chip ${holding ? 'bg-corp-mint/25 text-corp-mint' : 'bg-white/10'}`}>
            This core: {holding ? 'held' : 'idle'}
          </span>
          <span
            className={`chip ${otherHeld ? 'bg-corp-mint/25 text-corp-mint' : 'bg-corp-red/20 text-red-300'}`}
          >
            Other core: {otherHeld ? 'held ✓' : 'waiting…'}
          </span>
        </div>
      )}
      <button
        className="relative mt-5 h-44 w-44 rounded-full select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setHolding(true);
          sfx('beep');
        }}
        onPointerUp={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="hold-button"
        aria-label={f.verb}
      >
        <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
          <circle cx="80" cy="80" r={R} stroke="rgba(255,255,255,0.1)" strokeWidth="12" fill="none" />
          <circle
            cx="80"
            cy="80"
            r={R}
            stroke="#3ddc97"
            strokeWidth="12"
            fill="none"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.12s linear' }}
          />
        </svg>
        <span
          className={`font-display absolute inset-5 flex items-center justify-center rounded-full text-sm font-bold transition ${holding ? 'scale-95 bg-corp-red shadow-[0_0_40px_#ef3e4a]' : 'bg-corp-orange shadow-xl'}`}
        >
          {f.verb}
        </span>
      </button>
      <p className="mt-3 text-xs text-mist">
        Hold the button (or <span className="kbd">Space</span>). Letting go or walking away cancels.
      </p>
    </div>
  );
}

function PowerPanel() {
  const fix = useGame((g) => g.fix)!;
  const initial: boolean[] = fix.data?.switches ?? [false, false, false, false, false];
  const [sw, setSw] = useState(initial);
  useEffect(() => setSw(initial), [fix.result?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = sw.every(Boolean);
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-5xl">⚡</div>
      <h2 className="font-display mt-2 text-2xl font-bold">Electrical Panel</h2>
      <p className="mt-1 text-sm text-mist">Flip every breaker back ON to restore the lights.</p>
      <div className="mt-4 flex gap-3 rounded-2xl bg-[#9aa3b8] p-4 shadow-inner">
        {sw.map((on, i) => (
          <button
            key={i}
            onClick={() => {
              sfx('click');
              setSw((x) => x.map((v, j) => (j === i ? !v : v)));
            }}
            className="flex h-32 w-14 flex-col items-center justify-between rounded-lg bg-[#2b2f3f] p-2"
            aria-label={`Breaker ${i + 1} ${on ? 'on' : 'off'}`}
            data-testid={`breaker-${i}`}
          >
            <span
              className={`h-3 w-3 rounded-full ${on ? 'bg-corp-mint shadow-[0_0_8px_#3ddc97]' : 'bg-corp-red'}`}
            />
            <span className="relative h-20 w-6 rounded bg-black/50">
              <span
                className={`absolute left-0 h-9 w-6 rounded bg-[#e6e9f5] transition-all ${on ? 'top-0' : 'top-11'}`}
              />
            </span>
            <span className="font-mono text-[10px] text-mist">{on ? 'ON' : 'OFF'}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-yellow mt-5"
        disabled={!all}
        onClick={() => send({ t: 'fixSubmit', station: fix.station, answer: sw })}
        data-testid="power-restore"
      >
        Restore power
      </button>
      {fix.result && !fix.result.ok && (
        <p className="mt-2 text-sm text-red-300">The panel sparks. Try again in a second.</p>
      )}
    </div>
  );
}
