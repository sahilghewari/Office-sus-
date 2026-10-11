import { useGame } from '../stores/game';

const STYLE: Record<string, string> = {
  info: 'border-corp-blue/50 bg-navy-800/95',
  warn: 'border-corp-orange/60 bg-[#3a2410]/95',
  danger: 'border-corp-red/70 bg-[#3a0f16]/95',
  success: 'border-corp-mint/60 bg-[#0f3324]/95',
};
const ICON: Record<string, string> = { info: '💬', warn: '⚠️', danger: '🚨', success: '✅' };

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div
      className="pointer-events-none absolute bottom-28 left-1/2 z-[60] flex w-[min(560px,90vw)] -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`anim-up flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-xl backdrop-blur ${STYLE[t.kind]}`}
        >
          <span aria-hidden>{ICON[t.kind]}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
