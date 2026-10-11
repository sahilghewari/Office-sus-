import { Room, RoomEvent, Track, createLocalAudioTrack, type LocalAudioTrack, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import { useGame } from '../stores/game';
import { useSettings } from '../stores/settings';
import { send } from '../networking/connection';
import { audio } from '../audio/audio';
import { muteKey } from '../ui/ChatPanel';

/**
 * Proximity voice over LiveKit (WebRTC).
 *  - Which room you may join (living / ghost) is decided by the server, which
 *    issues the tokens and removes eliminated players from the living room.
 *  - Distance attenuation uses per-speaker gains computed by the server from
 *    authoritative positions (`voiceGains`), applied here as playback volume.
 *  - The microphone is only requested when you opt in; nothing is recorded.
 */
class VoiceManager {
  private room: Room | null = null;
  private mic: LocalAudioTrack | null = null;
  private gains: Record<string, number> = {};
  private els = new Map<string, HTMLMediaElement>();
  private holder: HTMLDivElement | null = null;
  wanted = false;
  private transmitting = false;

  private status(p: Partial<ReturnType<typeof useGame.getState>['voice']>) {
    const g = useGame.getState();
    g.set({ voice: { ...g.voice, ...p } });
  }

  enable() {
    this.wanted = true;
    this.status({ status: 'connecting' });
    send({ t: 'voiceToken' });
  }

  async disable() {
    this.wanted = false;
    await this.teardown();
    this.status({ status: 'off', speaking: [], transmitting: false });
  }

  private async teardown() {
    this.mic?.stop();
    this.mic = null;
    for (const el of this.els.values()) el.remove();
    this.els.clear();
    const r = this.room;
    this.room = null;
    if (r) await r.disconnect().catch(() => {});
  }

  unavailable(reason: string) {
    this.wanted = false;
    this.status({ status: 'unavailable', detail: reason });
  }

  async onToken(url: string, token: string, mode: string) {
    if (!this.wanted) return;
    await this.teardown();
    this.status({ status: 'connecting', mode });
    const room = new Room({ adaptiveStream: false, dynacast: false, disconnectOnPageLeave: true });
    this.room = room;
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.dataset.identity = participant.identity;
        this.container().appendChild(el);
        this.els.set(participant.identity + track.sid, el);
        this.applyGains();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        track.detach().forEach((e) => e.remove());
        this.els.delete(participant.identity + track.sid);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.status({ speaking: speakers.map((s) => s.identity) });
      })
      .on(RoomEvent.Disconnected, () => {
        if (this.room === room) this.status({ status: this.wanted ? 'connecting' : 'off' });
        // the server may have moved us (e.g. eliminated → ghost room); ask for a fresh token
        if (this.room === room && this.wanted) setTimeout(() => this.wanted && send({ t: 'voiceToken' }), 800);
      });
    try {
      await room.connect(url, token, { autoSubscribe: true });
      await room.startAudio().catch(() => {});
    } catch (e) {
      this.status({ status: 'error', detail: `Could not reach voice server: ${(e as Error).message}` });
      return;
    }
    if (mode !== 'spectator') {
      try {
        const deviceId = useSettings.getState().micDeviceId ?? undefined;
        this.mic = await createLocalAudioTrack({ deviceId, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
        await room.localParticipant.publishTrack(this.mic, { source: Track.Source.Microphone });
        await this.setTransmitting(useSettings.getState().voiceMode === 'open');
        this.status({ status: 'on', mode, detail: undefined });
      } catch (e) {
        const denied = (e as Error).name === 'NotAllowedError';
        this.status({ status: denied ? 'denied' : 'on', mode, detail: denied ? 'Microphone blocked — you can still listen.' : (e as Error).message });
      }
    } else this.status({ status: 'on', mode, detail: 'Listening only' });
    this.applyGains();
  }

  async setTransmitting(on: boolean) {
    this.transmitting = on;
    if (!this.mic) return;
    if (on) await this.mic.unmute();
    else await this.mic.mute();
    this.status({ transmitting: on });
    send({ t: 'voiceState', speaking: on });
  }

  setGains(g: Record<string, number>) {
    this.gains = g;
    this.applyGains();
  }

  applyGains() {
    if (!this.room) return;
    const vol = audio.voiceVolume;
    const s = useGame.getState().state;
    const muted = useSettings.getState().mutedPlayers;
    for (const p of this.room.remoteParticipants.values()) {
      const pl = s?.players.find((x) => x.id === p.identity);
      const isMuted = pl ? muted.includes(muteKey(pl.name, pl.appearance.color)) : false;
      const gain = isMuted ? 0 : (this.gains[p.identity] ?? 0) * vol;
      p.setVolume(Math.max(0, Math.min(1, gain)));
    }
  }

  async listMics(): Promise<MediaDeviceInfo[]> {
    try {
      return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  get isTransmitting() {
    return this.transmitting;
  }

  private container() {
    if (!this.holder) {
      this.holder = document.createElement('div');
      this.holder.style.display = 'none';
      document.body.appendChild(this.holder);
    }
    return this.holder;
  }
}

export const voice = new VoiceManager();
