import { useEffect } from 'react';
import { useGame } from '../stores/game';
import { useActions } from '../stores/actions';
import { isAction } from '../stores/settings';
import { send } from '../networking/connection';
import { typingInField } from '../game/input';
import { sfx } from '../audio/audio';

export function performUse() {
  const g = useGame.getState();
  const s = g.state;
  if (!s || s.phase !== 'ACTIVE') return;
  if (s.you.inVent) {
    send({ t: 'vent', action: 'exit' });
    return;
  }
  const a = useActions.getState().use;
  if (!a || a.disabled) return;
  sfx('click');
  if (a.kind === 'emergency') send({ t: 'emergency' });
  else if (a.kind === 'vent') send({ t: 'vent', action: 'enter', vent: a.id });
  else send({ t: 'interact', station: a.id });
}

export function performReport() {
  const r = useActions.getState().report;
  if (r) send({ t: 'report', body: r.bodyId });
}

export function performKill() {
  const k = useActions.getState().kill;
  if (k) send({ t: 'kill', target: k.targetId });
}

export function closeTopOverlay(): boolean {
  const g = useGame.getState();
  if (g.task) {
    send({ t: 'taskClose' });
    g.set({ task: null });
    return true;
  }
  if (g.fix) {
    send({ t: 'taskClose' });
    g.set({ fix: null });
    return true;
  }
  if (g.cctv) {
    send({ t: 'cctv', open: false });
    g.set({ cctv: null });
    return true;
  }
  if (g.sabotageOpen) return (g.set({ sabotageOpen: false }), true);
  if (g.mapOpen) return (g.set({ mapOpen: false }), true);
  if (g.customizeOpen) return (g.set({ customizeOpen: false }), true);
  if (g.settingsOpen) return (g.set({ settingsOpen: false }), true);
  return false;
}

/** Global gameplay hotkeys (configurable in Settings → Controls). */
export function useGameKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (typingInField()) return (document.activeElement as HTMLElement).blur();
        if (!closeTopOverlay()) useGame.getState().set({ settingsOpen: true });
        e.preventDefault();
        return;
      }
      if (typingInField() || e.repeat) return;
      const g = useGame.getState();
      const s = g.state;
      if (!s) return;
      if (isAction('map', e.code)) {
        e.preventDefault();
        if (s.phase === 'ACTIVE' || s.phase === 'WAITING') g.set({ mapOpen: !g.mapOpen });
        return;
      }
      if (g.task || g.fix || g.settingsOpen || g.customizeOpen) return;
      if (isAction('interact', e.code)) performUse();
      else if (isAction('report', e.code)) performReport();
      else if (isAction('kill', e.code)) performKill();
      else if (
        isAction('sabotage', e.code) &&
        s.you.role === 'manager' &&
        s.you.alive &&
        s.phase === 'ACTIVE'
      )
        g.set({ sabotageOpen: !g.sabotageOpen });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
