import { CAMERAS } from '@corp/shared';
import { useGame } from '../stores/game';
import { closeTopOverlay } from '../hooks/useGameKeys';
import { Avatar } from '../components/Avatar';

/** Security monitor wall: live (server-filtered) feeds of four camera zones. */
export function CctvOverlay() {
  const cctv = useGame((g) => g.cctv);
  const players = useGame((g) => g.state?.players ?? []);
  if (!cctv) return null;
  return (
    <div
      className="absolute inset-0 z-[48] flex items-center justify-center bg-navy-950/75 p-4"
      data-testid="cctv-overlay"
    >
      <div className="panel anim-pop w-full max-w-[900px] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">📹 Security Monitors</h2>
          <button
            className="h-10 w-10 rounded-full bg-white/10 text-xl hover:bg-white/20"
            onClick={() => closeTopOverlay()}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CAMERAS.map((cam) => {
            const feed = cctv.feeds.find((f) => f.id === cam.id);
            const bw = cam.box.x1 - cam.box.x0;
            const bh = cam.box.y1 - cam.box.y0;
            return (
              <div
                key={cam.id}
                className="relative aspect-video overflow-hidden rounded-xl bg-[#0d1a22] ring-1 ring-corp-cyan/30"
              >
                {cctv.online && feed ? (
                  <>
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(46,230,240,0.06)_1px,transparent_1px)] bg-[length:100%_4px]" />
                    <div className="absolute inset-4 rounded border border-corp-cyan/20" />
                    {feed.players.map((fp) => {
                      const p = players.find((x) => x.id === fp.id);
                      if (!p) return null;
                      return (
                        <div
                          key={fp.id}
                          className="absolute -translate-x-1/2 -translate-y-full transition-all duration-200"
                          style={{
                            left: `${((fp.x - cam.box.x0) / bw) * 90 + 5}%`,
                            top: `${((fp.y - cam.box.y0) / bh) * 70 + 25}%`,
                          }}
                        >
                          <Avatar appearance={p.appearance} size={28} />
                          <div className="-mt-1 text-center text-[9px] font-bold text-corp-cyan">
                            {p.name}
                          </div>
                        </div>
                      );
                    })}
                    {feed.players.length === 0 && (
                      <p className="absolute inset-0 flex items-center justify-center font-mono text-xs text-corp-cyan/40">
                        — no movement —
                      </p>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[repeating-radial-gradient(circle_at_30%_40%,#222_0_2px,#333_2px_4px)]">
                    <span className="font-mono rounded bg-black/70 px-3 py-1 text-sm font-bold text-corp-red">
                      NO SIGNAL
                    </span>
                  </div>
                )}
                <div className="absolute top-2 left-2 font-mono text-[11px] font-bold text-white/80">
                  {cam.name}
                </div>
                {cctv.online && (
                  <div className="anim-blink absolute top-2 right-2 font-mono text-[11px] font-bold text-corp-red">
                    ● REC
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-mist">
          Feeds show living employees in public areas. Someone in the security office is watching… everyone
          can see that you are.
        </p>
      </div>
    </div>
  );
}
