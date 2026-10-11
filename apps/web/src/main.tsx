import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { unlockAudio } from './audio/audio';
import './game/input';

if (new URLSearchParams(location.search).has('forceLoop')) sessionStorage.setItem('cs_forceLoop', '1');

// Browsers only allow audio after a user gesture.
const unlock = () => unlockAudio();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev/test introspection (stripped from production builds).
if (import.meta.env.DEV) {
  void Promise.all([import('./stores/game'), import('./stores/app'), import('./networking/connection')]).then(
    ([g, a, c]) => {
      (window as any).__cs = { useGame: g.useGame, useApp: a.useApp, getConnection: c.getConnection };
    },
  );
}
