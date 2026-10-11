import { useEffect } from 'react';
import { isMeetingPhase } from '@corp/shared';
import { GameCanvas } from '../components/GameCanvas';
import { useGame } from '../stores/game';
import { useApp } from '../stores/app';
import { leaveRoom } from '../networking/connection';
import { audio } from '../audio/audio';
import { LobbyPanel } from '../ui/LobbyPanel';
import { Toasts } from '../ui/Toasts';
import { CustomizeModal } from '../ui/CustomizeModal';
import { Hud } from '../ui/Hud';
import { RoleReveal } from '../ui/RoleReveal';
import { Meeting } from '../ui/Meeting';
import { GameOver } from '../ui/GameOver';
import { TaskOverlay } from '../ui/TaskOverlay';
import { FixOverlay } from '../ui/FixOverlay';
import { CctvOverlay } from '../ui/CctvOverlay';
import { MapOverlay } from '../ui/MapOverlay';
import { DeathOverlay } from '../ui/DeathOverlay';
import { StartingOverlay } from '../ui/StartingOverlay';
import { useGameKeys } from '../hooks/useGameKeys';
import { VoiceBridge } from '../voice/VoiceBridge';

export function Game() {
  const status = useGame((s) => s.status);
  const statusMessage = useGame((s) => s.statusMessage);
  const phase = useGame((s) => s.state?.phase);
  const hasState = useGame((s) => !!s.state);
  const customizeOpen = useGame((s) => s.customizeOpen);
  const appSet = useApp((s) => s.set);
  useGameKeys();

  useEffect(() => {
    if (!phase) return;
    if (phase === 'WAITING' || phase === 'RETURNING_TO_LOBBY') audio.setMood('menu');
    else if (isMeetingPhase(phase)) audio.setMood('meeting');
    else if (phase === 'GAME_OVER') audio.setMood('gameover');
    else audio.setMood('game');
  }, [phase]);
  useEffect(() => () => audio.setMood('menu'), []);

  if (status === 'failed') {
    return (
      <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,#2b2f7a,#0b0f2b)] p-6">
        <div className="panel anim-pop max-w-md p-8 text-center">
          <div className="text-5xl">🚪</div>
          <h2 className="font-display mt-3 text-3xl font-bold">You've left the building</h2>
          <p className="mt-2 text-mist" data-testid="fail-message">
            {statusMessage ?? 'The connection to the office was lost.'}
          </p>
          <button
            className="btn btn-yellow mt-6"
            onClick={() => {
              leaveRoom();
              sessionStorage.removeItem('cs_room');
              history.replaceState(null, '', '/');
              appSet({ screen: 'play' });
            }}
          >
            Back to the lobby menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-navy-950 select-none">
      <GameCanvas />
      {!hasState && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-navy-950/90">
          <p className="font-display anim-blink text-2xl text-corp-cyan">
            {status === 'reconnecting' ? 'Reconnecting to the office…' : 'Badging in…'}
          </p>
        </div>
      )}
      {hasState && (
        <>
          {phase === 'WAITING' && <LobbyPanel />}
          {(phase === 'ACTIVE' || phase === 'ROLE_REVEAL') && <Hud />}
          {phase === 'STARTING' && <StartingOverlay />}
          {phase === 'ROLE_REVEAL' && <RoleReveal />}
          {phase && isMeetingPhase(phase) && <Meeting />}
          {phase === 'GAME_OVER' && <GameOver />}
          {phase === 'RETURNING_TO_LOBBY' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-navy-950/80">
              <p className="font-display text-3xl">Returning to the lounge…</p>
            </div>
          )}
          <TaskOverlay />
          <FixOverlay />
          <CctvOverlay />
          <MapOverlay />
          <DeathOverlay />
          {customizeOpen && <CustomizeModal />}
          <VoiceBridge />
        </>
      )}
      {status === 'reconnecting' && hasState && (
        <div className="absolute top-0 left-0 z-[70] w-full bg-corp-orange py-1 text-center text-sm font-bold text-ink">
          Connection lost — reconnecting… your desk is being held for 45 s.
        </div>
      )}
      <Toasts />
    </div>
  );
}
