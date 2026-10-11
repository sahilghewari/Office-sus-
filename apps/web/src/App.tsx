import { useEffect } from 'react';
import { useApp } from './stores/app';
import { useGame } from './stores/game';
import { useSession } from './stores/session';
import { useSettings } from './stores/settings';
import { Landing } from './pages/Landing';
import { CustomizeScreen } from './pages/Customize';
import { PlayHub } from './pages/PlayHub';
import { Game } from './pages/Game';
import { AccountModal, HowToPlayModal, PrivacyModal, SettingsModal } from './ui/Modals';
import { runIntent } from './networking/flow';
import { connectToRoom } from './networking/connection';
import { api, ensureSession } from './networking/api';
import { Gallery } from './pages/Gallery';

const GALLERY = import.meta.env.DEV && new URLSearchParams(location.search).has('gallery');

export function App() {
  const screen = useApp((s) => s.screen);
  const intent = useApp((s) => s.intent);
  const modal = useApp((s) => s.modal);
  const set = useApp((s) => s.set);
  const gameSettings = useGame((s) => s.settingsOpen);
  const setGame = useGame((s) => s.set);
  const reduced = useSettings((s) => s.reducedMotion);

  // Boot: resume a room after refresh, or follow an invite link.
  useEffect(() => {
    if (GALLERY) return;
    void (async () => {
      const params = new URLSearchParams(location.search);
      const invite = params.get('room');
      const saved = sessionStorage.getItem('cs_room');
      const s = useSession.getState();
      if (s.kind === 'user') {
        api
          .me()
          .then((r) => s.setStats(r.user.stats))
          .catch((e) => e.status === 401 && s.logout());
      }
      if (saved && s.token && s.name) {
        const { code, base } = JSON.parse(saved);
        if (!invite || invite.toUpperCase() === code) {
          await ensureSession().catch(() => {});
          connectToRoom(code, base);
          set({ screen: 'game' });
          return;
        }
      }
      if (invite) void runIntent({ kind: 'join', code: invite });
    })();
  }, [set]);

  return (
    <div className={`relative h-full w-full ${reduced ? 'reduce-motion' : ''}`}>
      {GALLERY && <Gallery />}
      {!GALLERY && screen === 'landing' && <Landing />}
      {screen === 'customize' && (
        <CustomizeScreen
          onDone={() => {
            if (intent) void runIntent(intent);
            else set({ screen: 'play' });
          }}
        />
      )}
      {screen === 'play' && <PlayHub />}
      {screen === 'game' && <Game />}
      {modal === 'settings' && <SettingsModal onClose={() => set({ modal: null })} />}
      {gameSettings && <SettingsModal onClose={() => setGame({ settingsOpen: false })} />}
      {modal === 'howto' && <HowToPlayModal onClose={() => set({ modal: null })} />}
      {modal === 'account' && <AccountModal onClose={() => set({ modal: null })} />}
      {modal === 'privacy' && <PrivacyModal onClose={() => set({ modal: null })} />}
    </div>
  );
}
