import { useEffect, useMemo, useState } from 'react';
import {
  CHARACTER_COLORS,
  DEFAULT_APPEARANCE,
  LOADING_LINES,
  ROOM_CODE_ALPHABET,
  type Appearance,
} from '@corp/shared';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { useApp } from '../stores/app';
import { useSession } from '../stores/session';
import { runIntent } from '../networking/flow';
import { sfx } from '../audio/audio';
import { audio } from '../audio/audio';

const CAST: Appearance[] = [
  {
    ...DEFAULT_APPEARANCE,
    color: 'blue',
    outfit: 'hoodie',
    hair: 'curly',
    hairColor: 'black',
    skin: 's4',
    accessory: 'headphones',
  },
  {
    ...DEFAULT_APPEARANCE,
    color: 'mint',
    outfit: 'shirt',
    hair: 'bun',
    hairColor: 'ginger',
    skin: 's1',
    accessory: 'coffee',
    shirt: 'white',
  },
  {
    ...DEFAULT_APPEARANCE,
    color: 'red',
    outfit: 'executive',
    hair: 'quiff',
    hairColor: 'silver',
    skin: 's2',
    accessory: 'tie',
    shirt: 'black',
  },
  {
    ...DEFAULT_APPEARANCE,
    color: 'yellow',
    outfit: 'casual',
    hair: 'long',
    hairColor: 'brown',
    skin: 's3',
    accessory: 'glasses',
  },
  {
    ...DEFAULT_APPEARANCE,
    color: 'purple',
    outfit: 'founder',
    hair: 'bald',
    skin: 's5',
    accessory: 'laptopbag',
    shirt: 'black',
  },
];

const FLOATERS = ['📄', '☕', '📎', '📊', '🗂️', '📌', '💼', '🖇️', '📝', '⏰'];

export function Landing() {
  const set = useApp((s) => s.set);
  const busy = useApp((s) => s.busy);
  const error = useApp((s) => s.error);
  const name = useSession((s) => s.name);
  const [code, setCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 3200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    audio.setMood('menu');
  }, []);
  const floaters = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        e: FLOATERS[i % FLOATERS.length],
        left: (i * 53) % 100,
        delay: -((i * 1.7) % 18),
        dur: 16 + (i % 6) * 3,
        size: 18 + (i % 4) * 8,
        dx: ((i % 5) - 2) * 40,
        rot: ((i % 3) - 1) * 280,
      })),
    [],
  );

  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6 || [...c].some((ch) => !ROOM_CODE_ALPHABET.includes(ch))) {
      set({ error: 'Office codes are 6 characters (no 0, O, 1, I or L).' });
      return;
    }
    void runIntent({ kind: 'join', code: c });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-navy-950">
      {/* animated background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#3a2a8f_0%,#141a3d_45%,#0b0f2b_100%)]" />
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {floaters.map((f, i) => (
          <span
            key={i}
            className="absolute bottom-[-60px] opacity-40"
            style={{
              left: `${f.left}%`,
              fontSize: f.size,
              animation: `drift ${f.dur}s linear ${f.delay}s infinite`,
              ['--dx' as string]: `${f.dx}px`,
              ['--rot' as string]: `${f.rot}deg`,
            }}
          >
            {f.e}
          </span>
        ))}
      </div>
      {/* skyline */}
      <svg
        className="absolute bottom-0 left-0 w-full opacity-70"
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="#1d2558"
          d="M0 220V120h60V70h50v50h40V40h70v80h30V90h60v130zM330 220V60h90v40h30V20h60v100h40V80h70v140zM700 220V110h50V50h80v60h40V30h60v190zM1030 220V90h40V40h90v80h30V70h60v40h40V20h70v200z"
        />
        <g fill="#ffd23f" opacity="0.55">
          {Array.from({ length: 60 }, (_, i) => (
            <rect key={i} x={((i * 97) % 1400) + 20} y={60 + ((i * 37) % 130)} width="6" height="8" />
          ))}
        </g>
      </svg>

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col items-center justify-center px-6">
        <div className="anim-up flex flex-col items-center">
          <Logo size="xl" />
          <p className="font-display mt-2 text-lg font-semibold tracking-[0.3em] text-corp-yellow/90 uppercase">
            Trust nobody. Especially management.
          </p>
        </div>

        {/* cast */}
        <div className="mt-6 flex items-end gap-1 sm:gap-4" aria-hidden>
          {CAST.map((a, i) => (
            <div
              key={i}
              className={i === 2 ? 'relative -mx-1' : ''}
              style={{ animation: `bob ${2 + i * 0.3}s ease-in-out ${i * 0.2}s infinite` }}
            >
              <Avatar
                appearance={a}
                size={i === 2 ? 104 : 84}
                expression={i === 2 ? 'smug' : i === 0 ? 'think' : i === 3 ? 'shock' : 'happy'}
              />
              {i === 2 && (
                <div className="font-display absolute -top-2 left-1/2 -translate-x-1/2 rotate-[-6deg] rounded-md bg-corp-red px-2 py-0.5 text-xs font-bold text-white shadow-lg">
                  SUS?
                </div>
              )}
            </div>
          ))}
        </div>

        <h1 className="font-display text-shadow-hard mt-6 text-center text-4xl font-bold text-white sm:text-6xl">
          WELCOME TO YOUR WORST WORKPLACE.
        </h1>
        <p className="mt-3 text-center text-lg text-mist">
          Complete your tasks. Expose Toxic Managers. Survive Monday.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            className="btn btn-yellow btn-lg anim-pop text-2xl"
            style={{ animationDelay: '0.2s' }}
            onClick={() => {
              sfx('click');
              set({ screen: name ? 'play' : 'customize', intent: null });
            }}
            data-testid="start-working"
          >
            START WORKING
          </button>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              className="btn btn-purple"
              onClick={() => void runIntent({ kind: 'create', isPublic: false })}
              disabled={!!busy}
              data-testid="landing-create"
            >
              🏢 Create Room
            </button>
            <button className="btn" onClick={() => setJoinOpen((v) => !v)} disabled={!!busy}>
              🔑 Join Room
            </button>
            <button
              className="btn btn-mint"
              onClick={() => void runIntent({ kind: 'quick' })}
              disabled={!!busy}
            >
              ⚡ Quick Match
            </button>
            <button className="btn btn-ghost" onClick={() => set({ modal: 'howto' })}>
              📘 How to Play
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => set({ modal: 'settings' })}
              aria-label="Settings"
            >
              ⚙️ Settings
            </button>
          </div>
          {joinOpen && (
            <form
              className="panel anim-pop flex items-center gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <input
                autoFocus
                className="input font-mono w-44 text-center text-xl tracking-[0.3em] uppercase"
                placeholder="ABC234"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                aria-label="Office code"
              />
              <button className="btn" type="submit">
                Join
              </button>
            </form>
          )}
          {busy && <p className="anim-blink font-display text-corp-cyan">{busy}</p>}
          {error && (
            <p role="alert" className="anim-shake rounded-xl bg-corp-red/20 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>

        <p
          className="font-mono absolute bottom-4 left-0 w-full text-center text-xs text-mist/60"
          aria-live="polite"
        >
          {LOADING_LINES[line]}
        </p>
        <button
          className="absolute bottom-4 right-4 text-xs text-mist/50 underline hover:text-mist"
          onClick={() => set({ modal: 'privacy' })}
        >
          Privacy
        </button>
      </div>
      <span className="hidden">{CHARACTER_COLORS.length}</span>
    </div>
  );
}
