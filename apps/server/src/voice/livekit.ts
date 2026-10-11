/**
 * LiveKit integration. Voice permissions are enforced by the server:
 *  - living players (and the lobby) get tokens for `<code>-main` only
 *  - eliminated players get tokens for `<code>-ghost` only and are actively
 *    removed from the main room through the LiveKit server API
 *  - spectators may only listen to the ghost room
 * Distance attenuation uses gains computed server-side from authoritative positions.
 */
export type VoiceMode = 'lobby' | 'alive' | 'ghost' | 'spectator';

export interface VoiceService {
  readonly enabled: boolean;
  readonly url: string | null;
  token(
    roomCode: string,
    identity: string,
    name: string,
    mode: VoiceMode,
  ): Promise<{ token: string; room: string }>;
  removeFromMain(roomCode: string, identity: string): Promise<void>;
  closeRoom(roomCode: string): Promise<void>;
}

export const voiceRoomName = (code: string, mode: VoiceMode) =>
  mode === 'ghost' || mode === 'spectator' ? `${code}-ghost` : `${code}-main`;

export class DisabledVoice implements VoiceService {
  readonly enabled = false;
  readonly url = null;
  async token(): Promise<never> {
    throw new Error('Voice is not configured on this server.');
  }
  async removeFromMain() {}
  async closeRoom() {}
}

export class LiveKitVoice implements VoiceService {
  readonly enabled = true;
  private svc: any;
  constructor(
    readonly url: string,
    private apiKey: string,
    private apiSecret: string,
    private sdk: any,
  ) {
    const httpUrl = url.replace(/^ws/, 'http');
    this.svc = new sdk.RoomServiceClient(httpUrl, apiKey, apiSecret);
  }

  static async create(cfg: { url: string; apiKey: string; apiSecret: string }): Promise<LiveKitVoice> {
    const sdk = await import('livekit-server-sdk');
    return new LiveKitVoice(cfg.url, cfg.apiKey, cfg.apiSecret, sdk);
  }

  async token(roomCode: string, identity: string, name: string, mode: VoiceMode) {
    const room = voiceRoomName(roomCode, mode);
    const at = new this.sdk.AccessToken(this.apiKey, this.apiSecret, { identity, name, ttl: '15m' });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: mode !== 'spectator',
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return { token: await at.toJwt(), room };
  }

  async removeFromMain(roomCode: string, identity: string) {
    try {
      await this.svc.removeParticipant(voiceRoomName(roomCode, 'alive'), identity);
    } catch {
      // participant may not be connected to voice at all — fine
    }
  }

  async closeRoom(roomCode: string) {
    for (const r of [voiceRoomName(roomCode, 'alive'), voiceRoomName(roomCode, 'ghost')]) {
      try {
        await this.svc.deleteRoom(r);
      } catch {}
    }
  }
}

export async function createVoice(
  cfg: { url: string; apiKey: string; apiSecret: string } | null,
  log: (m: string) => void,
): Promise<VoiceService> {
  if (!cfg) {
    log('LiveKit not configured — proximity voice disabled (text chat still works).');
    return new DisabledVoice();
  }
  log(`LiveKit voice enabled (${cfg.url}).`);
  return LiveKitVoice.create(cfg);
}
