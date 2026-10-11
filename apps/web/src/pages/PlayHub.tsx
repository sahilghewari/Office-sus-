import { useEffect, useState } from 'react';
import { ROOM_CODE_ALPHABET } from '@corp/shared';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { useApp } from '../stores/app';
import { useSession } from '../stores/session';
import { runIntent } from '../networking/flow';
import { api } from '../networking/api';
import { sfx } from '../audio/audio';

export function PlayHub() {
  const set = useApp((s) => s.set);
  const busy = useApp((s) => s.busy);
  const error = useApp((s) => s.error);
  const s = useSession();
  const [code, setCode] = useState('');
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () =>
      api
        .publicRooms()
        .then((r) => alive && setWaiting(r.waiting))
        .catch(() => alive && setWaiting(null));
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6 || [...c].some((ch) => !ROOM_CODE_ALPHABET.includes(ch))) {
      set({ error: 'Office codes are 6 characters (no 0, O, 1, I or L).' });
      sfx('error');
      return;
    }
    void runIntent({ kind: 'join', code: c });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-auto bg-[radial-gradient(ellipse_at_top,#2b2f7a,#0b0f2b)]">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <button onClick={() => set({ screen: 'landing' })} aria-label="Back to title">
          <Logo size="sm" />
        </button>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => set({ modal: 'howto' })}>
            How to play
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => set({ modal: 'settings' })}>
            ⚙️ Settings
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-8 pb-10 lg:grid-cols-[320px_1fr]">
        {/* badge */}
        <section className="panel flex flex-col items-center p-6">
          <div className="w-full rounded-2xl bg-white p-4 text-ink shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-corp-purple">NEXUS HQ</span>
              <span className="chip bg-corp-yellow/80 text-[10px] text-ink">
                {s.kind === 'user' ? 'EMPLOYEE' : 'CONTRACTOR'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-[#e8ecff] p-1">
                <Avatar appearance={s.appearance} size={68} expression="happy" />
              </div>
              <div className="min-w-0">
                <div className="font-display truncate text-2xl font-bold">{s.name || 'New Hire'}</div>
                <div className="text-xs text-slate-500">
                  {s.kind === 'user' ? `@${s.username}` : 'Guest badge · temporary'}
                </div>
              </div>
            </div>
            {s.stats && (
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
                <Stat k="Games" v={s.stats.gamesPlayed} />
                <Stat k="Wins" v={s.stats.wins} />
                <Stat k="Tasks" v={s.stats.tasksCompleted} />
              </div>
            )}
          </div>
          <button
            className="btn btn-ghost mt-4 w-full"
            onClick={() => set({ screen: 'customize' })}
            data-testid="edit-character"
          >
            👔 Edit character
          </button>
          <button className="btn btn-ghost mt-2 w-full" onClick={() => set({ modal: 'account' })}>
            {s.kind === 'user' ? '👤 Account & stats' : '🔐 Log in / Register'}
          </button>
        </section>

        {/* modes */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Card
            color="from-[#8a5cf6] to-[#5b3fd0]"
            icon="🏢"
            title="Create Private Room"
            text="Get a code, send it to friends, start when everyone's in."
          >
            <button
              className="btn btn-yellow w-full"
              disabled={!!busy}
              onClick={() => void runIntent({ kind: 'create', isPublic: false })}
              data-testid="create-room"
            >
              Create room
            </button>
          </Card>
          <Card
            color="from-[#3ddc97] to-[#1fae72]"
            icon="⚡"
            title="Quick Match"
            text={
              waiting === null
                ? 'Join a public office with strangers.'
                : `${waiting} ${waiting === 1 ? 'person is' : 'people are'} waiting in public lobbies right now.`
            }
          >
            <button
              className="btn w-full"
              disabled={!!busy}
              onClick={() => void runIntent({ kind: 'quick' })}
              data-testid="quick-match"
            >
              Find a match
            </button>
          </Card>
          <Card
            color="from-[#3d7bff] to-[#2a5ad6]"
            icon="🔑"
            title="Join with Code"
            text="Someone sent you a six-character office code."
          >
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <input
                className="input font-mono text-center text-lg tracking-[0.3em] uppercase"
                placeholder="ABC234"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                aria-label="Office code"
                data-testid="join-code"
              />
              <button className="btn btn-yellow" type="submit" disabled={!!busy} data-testid="join-submit">
                Join
              </button>
            </form>
          </Card>
          <Card
            color="from-[#ff8a3d] to-[#e2661c]"
            icon="🌐"
            title="Host a Public Lobby"
            text="Open an office anyone can find through Quick Match."
          >
            <button
              className="btn btn-ghost w-full"
              disabled={!!busy}
              onClick={() => void runIntent({ kind: 'create', isPublic: true })}
            >
              Open public lobby
            </button>
          </Card>
          {(busy || error) && (
            <div className="md:col-span-2">
              {busy && <p className="anim-blink font-display text-center text-corp-cyan">{busy}</p>}
              {error && (
                <p
                  role="alert"
                  className="anim-shake mx-auto max-w-lg rounded-xl bg-corp-red/20 px-4 py-2 text-center text-sm text-red-200"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-lg bg-[#eef1ff] py-1">
      <div className="font-display text-lg font-bold">{v ?? 0}</div>
      <div className="text-[10px] tracking-wider text-slate-500 uppercase">{k}</div>
    </div>
  );
}

function Card({
  color,
  icon,
  title,
  text,
  children,
}: {
  color: string;
  icon: string;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel group relative flex flex-col overflow-hidden p-5 transition hover:-translate-y-1">
      <div
        className={`absolute -top-10 -right-10 h-36 w-36 rounded-full bg-gradient-to-br ${color} opacity-30 blur-xl transition group-hover:opacity-50`}
      />
      <div
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-2xl shadow-lg`}
      >
        {icon}
      </div>
      <h3 className="font-display text-2xl font-bold">{title}</h3>
      <p className="mt-1 mb-4 flex-1 text-sm text-mist">{text}</p>
      {children}
    </div>
  );
}
