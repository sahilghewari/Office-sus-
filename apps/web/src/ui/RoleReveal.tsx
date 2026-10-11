import { useEffect } from 'react';
import { useGame } from '../stores/game';
import { Avatar } from '../components/Avatar';
import { sfx } from '../audio/audio';

export function RoleReveal() {
  const s = useGame((g) => g.state)!;
  const manager = s.you.role === 'manager';
  const me = s.players.find((p) => p.id === s.you.id);
  const mates = s.you.teammates.map((id) => s.players.find((p) => p.id === id)).filter(Boolean);
  useEffect(() => {
    if (!s.you.spectator) sfx(manager ? 'roleManager' : 'roleEmployee');
  }, [manager, s.you.spectator]);
  if (s.you.spectator)
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-navy-950/90">
        <h2 className="font-display anim-pop text-5xl font-bold">You are spectating 👀</h2>
      </div>
    );
  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden ${manager ? 'bg-[radial-gradient(circle_at_50%_45%,#5a0f1c,#0b0510_70%)]' : 'bg-[radial-gradient(circle_at_50%_45%,#1f6b5a,#06141a_70%)]'}`}
      data-testid="role-reveal"
    >
      <div
        className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg,rgba(255,255,255,0.04)_0deg_10deg,transparent_10deg_20deg)]"
        style={{ animation: 'spin-slow 30s linear infinite' }}
      />
      <p className="font-display anim-up relative text-xl tracking-[0.4em] text-white/70 uppercase">
        Monday, 9:00 AM
      </p>
      <h1
        className={`font-display text-shadow-hard relative mt-4 text-center text-5xl font-bold sm:text-7xl ${manager ? 'text-corp-red' : 'text-corp-mint'}`}
        style={{ animation: 'slam 0.7s cubic-bezier(0.2,1.4,0.4,1) 0.3s both' }}
        data-testid="role-title"
      >
        {manager ? 'YOU ARE A TOXIC MANAGER.' : 'YOU ARE AN EMPLOYEE.'}
      </h1>
      <p className="anim-up relative mt-4 text-xl text-white/85" style={{ animationDelay: '0.8s' }}>
        {manager ? 'Destroy productivity. Blame the employees.' : 'Finish your work. Survive management.'}
      </p>
      <div className="anim-pop relative mt-8 flex items-end gap-6" style={{ animationDelay: '1s' }}>
        {me && <Avatar appearance={me.appearance} size={170} expression={manager ? 'smug' : 'happy'} />}
        {mates.map((m) => (
          <div key={m!.id} className="flex flex-col items-center">
            <Avatar appearance={m!.appearance} size={90} expression="smug" />
            <span className="font-display text-sm text-red-300">{m!.name}</span>
          </div>
        ))}
      </div>
      {manager && mates.length > 0 && (
        <p className="relative mt-3 text-sm text-red-200">
          Your fellow managers are marked in red. Coordinate. Deny everything.
        </p>
      )}
      {!manager && (
        <p className="relative mt-3 text-sm text-mist">
          There{' '}
          {s.settings.managers === 1 || s.players.length < 7
            ? 'is at least one Toxic Manager'
            : 'are Toxic Managers'}{' '}
          among you.
        </p>
      )}
    </div>
  );
}
