import { useEffect, useState } from 'react';
import { NameSchema } from '@corp/shared';
import { useSettings, ACTION_LABELS, DEFAULT_KEYS, keyLabel, type Action } from '../stores/settings';
import { useSession } from '../stores/session';
import { api } from '../networking/api';
import { voice } from '../voice/voice';
import { sfx } from '../audio/audio';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.code === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`panel anim-pop flex max-h-[90vh] w-full flex-col ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          <button
            className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const [tab, setTab] = useState<'audio' | 'controls' | 'graphics' | 'voice'>('audio');
  const [binding, setBinding] = useState<Action | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!binding) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') s.bind(binding, e.code);
      setBinding(null);
    };
    window.addEventListener('keydown', k, { capture: true });
    return () => window.removeEventListener('keydown', k, { capture: true });
  }, [binding, s]);
  useEffect(() => {
    if (tab === 'voice') void voice.listMics().then(setMics);
  }, [tab]);
  const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'voice') => (
    <label className="block py-2">
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-mist">{Math.round(s[key] * 100)}%</span>
      </div>
      <input
        type="range"
        className="range"
        min={0}
        max={1}
        step={0.05}
        value={s[key]}
        onChange={(e) => s.set({ [key]: Number(e.target.value) })}
        onMouseUp={() => sfx('click')}
      />
    </label>
  );
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <label className="flex items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-mist">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[#2ee6f0]"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-xl bg-black/20 p-1">
        {(['audio', 'controls', 'graphics', 'voice'] as const).map((t) => (
          <button
            key={t}
            className={`font-display flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize ${tab === t ? 'bg-white/15' : 'text-mist hover:bg-white/5'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'audio' && (
        <>
          {slider('Master volume', 'master')}
          {slider('Music', 'music')}
          {slider('Sound effects', 'sfx')}
          {slider('Voice chat', 'voice')}
          {check('Mute all audio', s.muted, (v) => s.set({ muted: v }))}
          <p className="mt-2 text-xs text-mist">
            All music and sound effects are synthesised live in your browser — no recordings, no copyright
            strikes.
          </p>
        </>
      )}
      {tab === 'controls' && (
        <>
          <p className="mb-2 text-xs text-mist">Click a binding, then press the new key. Esc cancels.</p>
          {(Object.keys(ACTION_LABELS) as Action[]).map((a) => (
            <div key={a} className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm">
              <span>{ACTION_LABELS[a]}</span>
              <button
                className={`font-mono min-w-24 rounded-lg px-3 py-1 ${binding === a ? 'anim-blink bg-corp-yellow text-ink' : 'bg-white/10 hover:bg-white/20'}`}
                onClick={() => setBinding(a)}
              >
                {binding === a ? 'press a key' : s.keys[a].map(keyLabel).join(' / ')}
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm mt-3" onClick={() => s.set({ keys: { ...DEFAULT_KEYS } })}>
            Reset controls
          </button>
          <p className="mt-3 text-xs text-mist">
            Esc opens settings / closes windows. Mouse: minigames, voting and UI. Scroll wheel: zoom.
          </p>
        </>
      )}
      {tab === 'graphics' && (
        <>
          <label className="flex items-center justify-between py-2 text-sm">
            <span>
              Graphics quality
              <span className="block text-xs text-mist">
                Low disables glows, particles and floor detail (applies on next match/load).
              </span>
            </span>
            <select
              className="rounded-lg bg-white/10 px-3 py-1.5"
              value={s.quality}
              onChange={(e) => s.set({ quality: e.target.value as 'high' | 'low' })}
            >
              <option value="high">High</option>
              <option value="low">Low (faster)</option>
            </select>
          </label>
          {check(
            'Reduced motion',
            s.reducedMotion,
            (v) => s.set({ reducedMotion: v }),
            'Removes flashing alarms, screen shake and big animations.',
          )}
          {check('Show FPS counter', s.showFps, (v) => s.set({ showFps: v }))}
        </>
      )}
      {tab === 'voice' && (
        <>
          <label className="flex items-center justify-between py-2 text-sm">
            <span>Talk mode</span>
            <select
              className="rounded-lg bg-white/10 px-3 py-1.5"
              value={s.voiceMode}
              onChange={(e) => s.set({ voiceMode: e.target.value as 'ptt' | 'open' })}
            >
              <option value="ptt">Push-to-talk ({keyLabel(s.keys.ptt[0])})</option>
              <option value="open">Open microphone</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>Microphone</span>
            <select
              className="max-w-64 rounded-lg bg-white/10 px-3 py-1.5"
              value={s.micDeviceId ?? ''}
              onChange={(e) => s.set({ micDeviceId: e.target.value || null })}
            >
              <option value="">System default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || 'Microphone'}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-mist">
            Voice is optional and peer audio is never recorded. You can mute any player from the lobby or
            meeting list.
          </p>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- How to play

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play Corporate Sus" onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="👩‍💼 Employees" color="text-corp-mint">
          Complete your tasks (yellow markers) to fill <b>Company Productivity</b>. Report incidents, call HR
          meetings and vote out the Toxic Managers. You win when productivity hits 100% or every manager is
          gone.
        </Card>
        <Card title="😈 Toxic Managers" color="text-corp-red">
          Blend in by faking tasks. Terminate employees when nobody is looking, sabotage the office, and sneak
          through maintenance passages. You win when managers equal employees or a critical emergency runs
          out.
        </Card>
        <Card title="📢 Meetings" color="text-corp-yellow">
          Found an incident? Press <span className="kbd">R</span>. Or hit the red button in the Conference
          Room. Discuss in chat (and voice), then vote. Ties and skips terminate nobody.
        </Card>
        <Card title="👻 Ghosts" color="text-corp-cyan">
          Terminated employees keep working as ghosts: walk through walls and finish tasks. Ghosts can only
          talk to other ghosts.
        </Card>
      </div>
      <h3 className="font-display mt-5 mb-2 text-lg font-bold">Controls</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <K k="W A S D / ↑←↓→" v="Move" />
        <K k="E" v="Use / task / vent" />
        <K k="R" v="Report incident" />
        <K k="Q" v="Terminate (managers)" />
        <K k="F" v="Sabotage (managers)" />
        <K k="Tab" v="Office map" />
        <K k="V" v="Push to talk" />
        <K k="Esc" v="Settings / close" />
        <K k="Scroll" v="Zoom" />
      </div>
      <h3 className="font-display mt-5 mb-2 text-lg font-bold">Emergencies</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
        <li>
          <b className="text-white">Fire alarm</b> and <b className="text-white">server meltdown</b> are
          critical: fix them before the timer ends! The server needs two people holding both cores at once.
        </li>
        <li>
          Power cuts shrink employee vision. Wi-Fi outages and system outages block electronic tasks until
          repaired.
        </li>
        <li>Locked conference doors re-open on their own, or via the override in Security.</li>
      </ul>
    </Modal>
  );
}
function Card({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4">
      <h3 className={`font-display mb-1 text-lg font-bold ${color}`}>{title}</h3>
      <p className="text-sm text-mist">{children}</p>
    </div>
  );
}
function K({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="kbd">{k}</span>
      <span className="text-mist">{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Account

export function AccountModal({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (session.kind === 'user')
      void api
        .me()
        .then((r) => session.setStats(r.user.stats))
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.kind]);
  const go = async () => {
    setErr(null);
    if (!NameSchema.safeParse(u).success) return setErr('Usernames are 2–16 letters, numbers or spaces.');
    setBusy(true);
    try {
      const r = mode === 'login' ? await api.login(u, p) : await api.register(u, p, session.appearance);
      session.setAuth(r.token, 'user', r.user.username);
      session.setProfile(
        session.name || r.user.username,
        mode === 'login' ? r.user.appearance : session.appearance,
      );
      session.setStats(r.user.stats);
      sfx('taskDone');
    } catch (e) {
      setErr((e as Error).message);
      sfx('error');
    } finally {
      setBusy(false);
    }
  };
  if (session.kind === 'user') {
    const st = session.stats ?? {};
    return (
      <Modal title="Your employee file" onClose={onClose}>
        <p className="text-mist">
          Logged in as <b className="text-white">@{session.username}</b>. Your outfit and stats follow you
          across devices.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Matches', st.gamesPlayed],
            ['Total wins', st.wins],
            ['Losses', st.losses],
            ['Employee wins', st.employeeWins],
            ['Manager wins', st.managerWins],
            ['Tasks done', st.tasksCompleted],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-white/5 p-3">
              <div className="font-display text-2xl font-bold">{(v as number) ?? 0}</div>
              <div className="text-xs text-mist">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await api.logout().catch(() => {});
              session.logout();
              setMode('login');
              setP('');
            }}
          >
            Log out
          </button>
          {!confirmDelete ? (
            <button className="btn btn-ghost text-red-300" onClick={() => setConfirmDelete(true)}>
              Delete account…
            </button>
          ) : (
            <form
              className="flex w-full items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.deleteAccount(p);
                  session.logout();
                  onClose();
                } catch (er) {
                  setErr((er as Error).message);
                }
              }}
            >
              <input
                className="input"
                type="password"
                placeholder="Confirm password"
                value={p}
                onChange={(e) => setP(e.target.value)}
              />
              <button className="btn btn-red" type="submit">
                Delete forever
              </button>
            </form>
          )}
        </div>
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      </Modal>
    );
  }
  return (
    <Modal title={mode === 'login' ? 'Log in' : 'Create an account'} onClose={onClose}>
      <p className="mb-4 text-sm text-mist">
        Accounts are optional. Guests can play right away; an account keeps your outfit and match stats.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <input
          className="input"
          placeholder="Username"
          value={u}
          onChange={(e) => setU(e.target.value)}
          autoComplete="username"
          data-testid="acct-username"
        />
        <input
          className="input"
          type="password"
          placeholder={mode === 'register' ? 'Password (8+ chars, letters & numbers)' : 'Password'}
          value={p}
          onChange={(e) => setP(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          data-testid="acct-password"
        />
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn btn-yellow w-full" disabled={busy} type="submit" data-testid="acct-submit">
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>
      </form>
      <button
        className="mt-3 text-sm text-corp-cyan underline"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
      </button>
    </Modal>
  );
}

// ---------------------------------------------------------------- Privacy

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Privacy notice" onClose={onClose}>
      <div className="space-y-3 text-sm text-mist">
        <p>
          <b className="text-white">What we store.</b> Guests: nothing persistent — a random temporary session
          ID lives in your browser tab. Registered players: username, a salted scrypt hash of your password
          (never the password), your outfit, and match statistics (games, wins, tasks, eliminations).
        </p>
        <p>
          <b className="text-white">Voice.</b> Voice chat is opt-in. Your microphone is only requested when
          you press “Join”. Audio is relayed live between players through the voice server and is not recorded
          or retained by Corporate Sus.
        </p>
        <p>
          <b className="text-white">Chat & reports.</b> Chat messages exist only in the live room’s memory. If
          you report a player, the report (names, room code, category, optional note) is stored for
          moderation.
        </p>
        <p>
          <b className="text-white">Your choices.</b> You can delete your account and stats at any time from
          the Account panel. We do not sell data, run ads or track you across sites.
        </p>
      </div>
    </Modal>
  );
}
