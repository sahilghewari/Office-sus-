import { useGame } from '../stores/game';
import { useSettings, keyLabel } from '../stores/settings';
import { voice } from './voice';

export function VoiceControls() {
  const v = useGame((g) => g.voice);
  const mode = useSettings((s) => s.voiceMode);
  const ptt = useSettings((s) => s.keys.ptt[0]);
  const setS = useSettings((s) => s.set);
  const ghost = useGame((g) => g.state && !g.state.you.alive && g.state.phase !== 'WAITING');
  const label: Record<string, string> = {
    off: 'Voice off',
    connecting: 'Connecting…',
    on: v.mode === 'ghost' ? 'Ghost voice' : v.mode === 'spectator' ? 'Listening' : 'Proximity voice',
    unavailable: 'Voice unavailable',
    denied: 'Mic blocked',
    error: 'Voice error',
  };
  const dot = v.status === 'on' ? 'bg-corp-mint' : v.status === 'connecting' ? 'bg-corp-yellow anim-blink' : v.status === 'off' ? 'bg-white/30' : 'bg-corp-red';
  return (
    <div className="hud pointer-events-auto flex items-center gap-2 px-3 py-2 text-xs" data-testid="voice-controls">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-semibold" title={v.detail}>
        {label[v.status]}
        {ghost && v.status === 'on' && ' 👻'}
      </span>
      {v.status === 'on' && v.mode !== 'spectator' && (
        <span className={`chip ${v.transmitting ? 'bg-corp-red text-white' : 'bg-white/10 text-mist'}`}>{v.transmitting ? '● LIVE' : mode === 'ptt' ? `Hold ${keyLabel(ptt)}` : 'Muted'}</span>
      )}
      <span className="flex-1" />
      {v.status === 'off' || v.status === 'unavailable' || v.status === 'error' ? (
        <button className="btn btn-sm btn-ghost !px-2 !py-1 text-xs" onClick={() => voice.enable()} title={v.detail ?? 'Join voice chat (asks for your microphone)'} data-testid="voice-join">
          🎙 Join
        </button>
      ) : (
        <>
          <button className="btn btn-sm btn-ghost !px-2 !py-1 text-xs" onClick={() => setS({ voiceMode: mode === 'ptt' ? 'open' : 'ptt' })} title="Toggle push-to-talk / open mic">
            {mode === 'ptt' ? 'PTT' : 'Open'}
          </button>
          {mode === 'open' && (
            <button className="btn btn-sm btn-ghost !px-2 !py-1 text-xs" onClick={() => voice.setTransmitting(!voice.isTransmitting)}>
              {v.transmitting ? '🔇' : '🎙'}
            </button>
          )}
          <button className="btn btn-sm btn-ghost !px-2 !py-1 text-xs" onClick={() => voice.disable()} title="Leave voice">
            ✕
          </button>
        </>
      )}
    </div>
  );
}
