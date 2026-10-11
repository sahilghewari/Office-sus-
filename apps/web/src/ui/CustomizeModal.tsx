import { CustomizePanel } from '../pages/Customize';
import { useGame } from '../stores/game';
import { useSession } from '../stores/session';
import { send } from '../networking/connection';

export function CustomizeModal() {
  const set = useGame((s) => s.set);
  const st = useGame((s) => s.state);
  const taken = (st?.players ?? []).filter((p) => p.id !== st?.you.id).map((p) => p.appearance.color);
  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center overflow-auto bg-navy-950/80 p-6 backdrop-blur-sm" onKeyDown={(e) => e.key === 'Escape' && set({ customizeOpen: false })}>
      <div className="anim-pop relative w-full max-w-4xl">
        <button className="absolute -top-3 -right-3 z-10 h-10 w-10 rounded-full bg-white/10 text-xl hover:bg-white/20" onClick={() => set({ customizeOpen: false })} aria-label="Close">
          ✕
        </button>
        <CustomizePanel
          takenColors={taken}
          doneLabel="Update look"
          onDone={() => {
            const s = useSession.getState();
            send({ t: 'profile', name: s.name, appearance: s.appearance });
            set({ customizeOpen: false });
          }}
        />
      </div>
    </div>
  );
}
