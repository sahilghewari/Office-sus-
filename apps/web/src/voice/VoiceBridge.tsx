import { useEffect } from 'react';
import { getConnection } from '../networking/connection';
import { useSettings, isAction } from '../stores/settings';
import { typingInField } from '../game/input';
import { voice } from './voice';

/** Wires server voice messages + push-to-talk keys to the voice manager. */
export function VoiceBridge() {
  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;
    const off = conn.onEvent((m) => {
      if (m.t === 'voiceToken') void voice.onToken(m.url, m.token, m.mode);
      else if (m.t === 'voiceUnavailable') voice.unavailable(m.reason);
      else if (m.t === 'voiceGains') voice.setGains(m.g);
    });
    const down = (e: KeyboardEvent) => {
      if (e.repeat || typingInField()) return;
      if (isAction('ptt', e.code) && useSettings.getState().voiceMode === 'ptt')
        void voice.setTransmitting(true);
    };
    const up = (e: KeyboardEvent) => {
      if (isAction('ptt', e.code) && useSettings.getState().voiceMode === 'ptt')
        void voice.setTransmitting(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const unsub = useSettings.subscribe(() => voice.applyGains());
    return () => {
      off();
      unsub();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      void voice.disable();
    };
  }, []);
  return null;
}
