import { useEffect, useMemo } from 'react';
import { useGame } from '../stores/game';
import { send, leaveRoom } from '../networking/connection';
import { useApp } from '../stores/app';
import { Avatar } from '../components/Avatar';
import { sfx } from '../audio/audio';
import { useSettings } from '../stores/settings';

const REASONS: Record<string, string> = {
  tasks: 'Every task was completed. Productivity: legendary.',
  managers_voted_out: 'Every Toxic Manager was shown the door.',
  managers_left: 'The Toxic Managers quit before HR could fire them.',
  parity: 'Management now outnumbers the workforce.',
  critical_sabotage: 'The office emergency was never resolved.',
  employees_left: 'Everyone else resigned. Management wins by default.',
};

export function GameOver() {
  const s = useGame((g) => g.state)!;
  const go = s.gameOver;
  const appSet = useApp((a) => a.set);
  const reduced = useSettings((x) => x.reducedMotion);
  const employeesWon = go?.winner === 'employees';
  useEffect(() => {
    if (go) sfx(employeesWon ? 'winEmployees' : 'winManagers');
  }, [go, employeesWon]);
  const confetti = useMemo(
    () =>
      Array.from({ length: reduced ? 0 : 46 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: -((i * 0.37) % 6),
        dur: 4 + (i % 5),
        rot: 360 + (i % 4) * 180,
        dx: ((i % 7) - 3) * 30,
        emoji: employeesWon ? ['📄', '📎', '🎉', '📊', '☕'][i % 5] : ['💼', '💸', '👔', '📈', '🏆'][i % 5],
      })),
    [employeesWon, reduced],
  );
  if (!go) return null;
  const me = go.players.find((p) => p.id === s.you.id);
  const winners = go.players.filter((p) => p.won);
  const losers = go.players.filter((p) => !p.won);
  const mins = Math.floor(go.durationMs / 60000);
  const secs = Math.floor((go.durationMs % 60000) / 1000);

  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col items-center overflow-auto p-6 ${employeesWon ? 'bg-[radial-gradient(circle_at_50%_20%,#1f6b5a,#0b0f2b_70%)]' : 'bg-[radial-gradient(circle_at_50%_20%,#6b1020,#0b0510_70%)]'}`}
      data-testid="game-over"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="absolute top-0 text-2xl"
            style={{
              left: `${c.left}%`,
              animation: `fall ${c.dur}s linear ${c.delay}s infinite`,
              ['--rot' as string]: `${c.rot}deg`,
              ['--dx' as string]: `${c.dx}px`,
            }}
          >
            {c.emoji}
          </span>
        ))}
      </div>
      <p className="font-display relative mt-4 tracking-[0.35em] uppercase text-white/70">
        {me ? (me.won ? 'Victory' : 'Defeat') : 'Match over'}
      </p>
      <h1
        className={`font-display text-shadow-hard relative text-center text-5xl font-bold sm:text-7xl ${employeesWon ? 'text-corp-mint' : 'text-corp-red'}`}
        style={{ animation: 'slam 0.7s both' }}
        data-testid="winner-headline"
      >
        {go.headline}
      </h1>
      <p className="relative mt-2 text-lg text-mist">{REASONS[go.reason]}</p>

      <div className="relative mt-6 flex flex-wrap items-end justify-center gap-4">
        {winners.map((p, i) => (
          <div key={p.id} className="flex flex-col items-center">
            <div className="anim-jump" style={{ animationDelay: `${i * 0.12}s` }}>
              <Avatar appearance={p.appearance} size={120} expression="happy" />
            </div>
            <span className="font-display font-semibold">{p.name}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-3 flex flex-wrap items-end justify-center gap-3 opacity-80">
        {losers.map((p) => (
          <div key={p.id} className="flex flex-col items-center">
            <div className="anim-slump">
              <Avatar appearance={p.appearance} size={76} expression="sad" />
            </div>
            <span className="text-sm text-mist">{p.name}</span>
          </div>
        ))}
      </div>

      <div className="relative mt-6 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="panel p-4">
          <h3 className="font-display mb-2 text-lg font-bold">Match report</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat k="Winning team" v={employeesWon ? 'Employees' : 'Toxic Managers'} />
            <Stat k="Duration" v={`${mins}:${String(secs).padStart(2, '0')}`} />
            <Stat k="Tasks completed" v={`${go.tasksCompleted}/${go.tasksTotal}`} />
            <Stat k="HR meetings" v={go.meetings} />
            <Stat k="Eliminations" v={go.eliminations} />
            <Stat k="Players" v={go.players.length} />
          </dl>
        </div>
        <div className="panel p-4">
          <h3 className="font-display mb-2 text-lg font-bold">Final roles</h3>
          <table className="w-full text-sm" data-testid="final-roles">
            <tbody>
              {go.players.map((p) => (
                <tr key={p.id} className="border-b border-white/5">
                  <td className="py-1.5 font-semibold">{p.name}</td>
                  <td className={p.role === 'manager' ? 'text-red-300' : 'text-corp-mint'}>
                    {p.role === 'manager' ? 'Toxic Manager' : 'Employee'}
                  </td>
                  <td className="text-mist">
                    {p.role === 'manager'
                      ? `${p.eliminations} terminations`
                      : `${p.tasksDone}/${p.tasksTotal} tasks`}
                  </td>
                  <td>{p.alive ? '🟢' : '👻'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="relative mt-6 mb-4 flex flex-wrap justify-center gap-3">
        {s.you.isHost ? (
          <>
            <button
              className="btn btn-yellow btn-lg"
              onClick={() => send({ t: 'returnToLobby' })}
              data-testid="play-again"
            >
              🔁 Play Again
            </button>
            <button className="btn btn-lg" onClick={() => send({ t: 'returnToLobby' })}>
              🛋 Return to Lobby
            </button>
          </>
        ) : (
          <div className="hud px-4 py-3 text-mist">
            Waiting for the host to start the next shift… (auto-return in 60 s)
          </div>
        )}
        <button
          className="btn btn-ghost btn-lg"
          onClick={() => {
            leaveRoom();
            history.replaceState(null, '', '/');
            appSet({ screen: 'play' });
          }}
        >
          🏠 Main Menu
        </button>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 p-2">
      <dt className="text-[11px] tracking-wider text-mist/70 uppercase">{k}</dt>
      <dd className="font-display text-xl font-bold">{v}</dd>
    </div>
  );
}
