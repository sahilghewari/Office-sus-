import { useState } from 'react';
import { MIN_PLAYERS, effectiveManagerCount, type GameSettings, type PublicPlayer } from '@corp/shared';
import { useGame } from '../stores/game';
import { useSettings } from '../stores/settings';
import { send, leaveRoom } from '../networking/connection';
import { inviteLink } from '../networking/flow';
import { Avatar } from '../components/Avatar';
import { ChatPanel, muteKey } from './ChatPanel';
import { useApp } from '../stores/app';
import { sfx } from '../audio/audio';
import { useServerNow, secondsLeft } from '../hooks/useNow';
import { VoiceControls } from '../voice/VoiceControls';

export function LobbyPanel() {
  const s = useGame((g) => g.state)!;
  const ping = useGame((g) => g.ping);
  const set = useGame((g) => g.set);
  const appSet = useApp((a) => a.set);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'players' | 'settings'>('players');
  const now = useServerNow(500);
  const me = s.players.find((p) => p.id === s.you.id);
  const isHost = s.you.isHost;
  const connected = s.players.filter((p) => p.connected);
  const notReady = connected.filter((p) => !p.ready);
  const canStart = isHost && connected.length >= MIN_PLAYERS && notReady.length === 0;

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? s.code : inviteLink(s.code);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked; the code is visible anyway */
    }
    setCopied(what);
    sfx('click');
    setTimeout(() => setCopied(null), 1500);
  };
  const invite = async () => {
    const url = inviteLink(s.code);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Corporate Sus',
          text: `Join my office in Corporate Sus! Code ${s.code}`,
          url,
        });
        return;
      } catch {}
    }
    void copy('link');
  };

  return (
    <>
      {/* left column: room + players */}
      <aside
        className="panel absolute top-4 left-4 z-30 flex max-h-[calc(100%-9rem)] w-[340px] flex-col p-4"
        data-testid="lobby-panel"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-widest text-mist/70 uppercase">
              {s.isPublic ? 'Public office' : 'Private office'} code
            </div>
            <button
              className="font-mono text-3xl font-bold tracking-[0.25em] text-corp-yellow hover:text-white"
              onClick={() => copy('code')}
              title="Copy code"
              data-testid="room-code"
            >
              {s.code}
            </button>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <span
              className={`chip ${ping < 120 ? 'bg-corp-mint/20 text-corp-mint' : ping < 250 ? 'bg-corp-yellow/20 text-corp-yellow' : 'bg-corp-red/20 text-red-300'}`}
            >
              ● {ping} ms
            </span>
            <span className="text-mist/60">
              {connected.length}/{s.settings.maxPlayers} players
            </span>
          </div>
        </div>
        <div className="mb-3 flex gap-2">
          <button className="btn btn-sm btn-ghost flex-1" onClick={() => copy('code')}>
            {copied === 'code' ? '✓ Copied' : '📋 Copy code'}
          </button>
          <button className="btn btn-sm btn-purple flex-1" onClick={invite}>
            {copied === 'link' ? '✓ Link copied' : '✉️ Invite friends'}
          </button>
        </div>

        <div className="mb-2 flex gap-1 rounded-xl bg-black/20 p-1">
          {(['players', 'settings'] as const).map((t) => (
            <button
              key={t}
              className={`font-display flex-1 rounded-lg py-1.5 text-sm font-semibold ${tab === t ? 'bg-white/15' : 'text-mist/70 hover:bg-white/5'}`}
              onClick={() => setTab(t)}
            >
              {t === 'players' ? `Players (${connected.length})` : isHost ? 'Match settings' : 'Settings'}
            </button>
          ))}
        </div>

        {tab === 'players' ? (
          <ul
            className="scroll-thin -mr-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-2"
            data-testid="player-list"
          >
            {s.players.map((p) => (
              <PlayerRow key={p.id} p={p} me={p.id === s.you.id} host={isHost} />
            ))}
            {s.spectators.map((sp) => (
              <li
                key={sp.id}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-mist/70"
              >
                👀 {sp.name} <span className="text-xs">(spectating)</span>
              </li>
            ))}
            {connected.length < MIN_PLAYERS && (
              <li className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-center text-sm text-mist/60">
                Waiting for {MIN_PLAYERS - connected.length} more coworker
                {MIN_PLAYERS - connected.length > 1 ? 's' : ''}…
              </li>
            )}
          </ul>
        ) : (
          <SettingsForm settings={s.settings} editable={isHost} players={connected.length} />
        )}

        <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => set({ customizeOpen: true })}
            data-testid="lobby-customize"
          >
            👔 Outfit
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              leaveRoom();
              appSet({ screen: 'play' });
              history.replaceState(null, '', '/');
            }}
          >
            🚪 Leave
          </button>
        </div>
      </aside>

      {/* bottom centre: ready / start */}
      <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
        {s.autoStartAt && (
          <div className="font-display anim-pop rounded-full bg-corp-mint px-4 py-1 font-bold text-ink">
            Public match starting in {secondsLeft(s.autoStartAt, now)}…
          </div>
        )}
        <div className="hud flex items-center gap-3 p-2">
          {isHost ? (
            <button
              className="btn btn-yellow btn-lg"
              disabled={!canStart}
              onClick={() => send({ t: 'start' })}
              data-testid="start-game"
            >
              ▶ START MATCH
            </button>
          ) : (
            <button
              className={`btn btn-lg ${me?.ready ? 'btn-mint' : 'btn-yellow'}`}
              onClick={() => {
                sfx('click');
                send({ t: 'ready', ready: !me?.ready });
              }}
              data-testid="ready-toggle"
            >
              {me?.ready ? '✓ READY' : 'MARK READY'}
            </button>
          )}
          <div className="max-w-[240px] pr-2 text-xs text-mist">
            {connected.length < MIN_PLAYERS
              ? `Need ${MIN_PLAYERS}–10 players. Share the code!`
              : notReady.length
                ? `Waiting on: ${notReady.map((p) => p.name).join(', ')}`
                : isHost
                  ? 'Everyone is ready. Open the office!'
                  : 'Waiting for the host to start…'}
          </div>
        </div>
      </div>

      {/* right: chat */}
      <aside className="panel absolute top-4 right-4 z-30 flex h-[46%] w-[320px] flex-col p-4">
        <ChatPanel channels={['lobby']} title="Lobby chat" placeholder="Small talk by the water cooler…" />
      </aside>
      <div className="absolute bottom-24 left-4 z-30 w-[340px]">
        <VoiceControls />
      </div>
      <div className="hud pointer-events-none absolute right-4 bottom-6 z-20 max-w-[320px] p-3 text-xs text-mist">
        <b className="text-white">Lounge tip:</b> walk around with <span className="kbd">W</span>
        <span className="kbd">A</span>
        <span className="kbd">S</span>
        <span className="kbd">D</span> while you wait. Scroll to zoom.
      </div>
    </>
  );
}

function PlayerRow({ p, me, host }: { p: PublicPlayer; me: boolean; host: boolean }) {
  const muted = useSettings((s) => s.mutedPlayers);
  const setS = useSettings((s) => s.set);
  const [menu, setMenu] = useState(false);
  const key = muteKey(p.name, p.appearance.color);
  const isMuted = muted.includes(key);
  return (
    <li
      className={`relative flex items-center gap-2 rounded-xl px-2 py-1.5 ${me ? 'bg-corp-blue/20 ring-1 ring-corp-blue/50' : 'bg-white/5'} ${p.connected ? '' : 'opacity-50'}`}
    >
      <div className="h-11 w-9 overflow-hidden">
        <Avatar appearance={p.appearance} size={34} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display flex items-center gap-1 truncate font-semibold">
          {p.isHost && <span title="Host">👑</span>}
          <span className="truncate">{p.name}</span>
          {me && <span className="text-xs text-corp-cyan">(you)</span>}
          {p.registered && (
            <span title="Registered account" className="text-xs">
              ✔︎
            </span>
          )}
        </div>
        <div className="text-[11px] text-mist/60">
          {p.connected ? `${p.ping || '–'} ms` : 'reconnecting…'}
        </div>
      </div>
      <span className={`chip ${p.ready ? 'bg-corp-mint/20 text-corp-mint' : 'bg-white/10 text-mist/60'}`}>
        {p.isHost ? 'host' : p.ready ? 'ready' : 'not ready'}
      </span>
      {!me && (
        <button
          className="rounded-lg px-1.5 py-1 text-mist hover:bg-white/10"
          aria-label={`Options for ${p.name}`}
          onClick={() => setMenu((m) => !m)}
        >
          ⋯
        </button>
      )}
      {menu && !me && (
        <div
          className="panel anim-pop absolute top-full right-0 z-40 mt-1 flex w-44 flex-col p-1 text-sm"
          onMouseLeave={() => setMenu(false)}
        >
          <button
            className="rounded-lg px-3 py-2 text-left hover:bg-white/10"
            onClick={() => setS({ mutedPlayers: isMuted ? muted.filter((m) => m !== key) : [...muted, key] })}
          >
            {isMuted ? '🔈 Unmute' : '🔇 Mute (chat + voice)'}
          </button>
          <ReportButton p={p} onDone={() => setMenu(false)} />
          {host && (
            <button
              className="rounded-lg px-3 py-2 text-left text-red-300 hover:bg-white/10"
              onClick={() => send({ t: 'kick', target: p.id })}
            >
              🥾 Remove from lobby
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function ReportButton({ p, onDone }: { p: { id: string; name: string }; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="rounded-lg px-3 py-2 text-left hover:bg-white/10" onClick={() => setOpen(true)}>
        🚩 Report player
      </button>
    );
  return (
    <div className="flex flex-col gap-1 p-1">
      {(['harassment', 'cheating', 'spam', 'name', 'other'] as const).map((c) => (
        <button
          key={c}
          className="rounded-lg bg-white/5 px-2 py-1 text-left text-xs capitalize hover:bg-white/10"
          onClick={() => {
            send({ t: 'reportPlayer', target: p.id, category: c });
            onDone();
          }}
        >
          {c === 'name' ? 'Inappropriate name' : c}
        </button>
      ))}
    </div>
  );
}

function SettingsForm({
  settings,
  editable,
  players,
}: {
  settings: GameSettings;
  editable: boolean;
  players: number;
}) {
  const upd = (p: Partial<GameSettings>) => editable && send({ t: 'settings', settings: p });
  const num = (
    label: string,
    key: keyof GameSettings,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string = String,
  ) => (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-mist">{label}</span>
      <span className="flex items-center gap-1">
        <button
          className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
          disabled={!editable || (settings[key] as number) <= min}
          onClick={() => upd({ [key]: Math.round(((settings[key] as number) - step) * 100) / 100 })}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="font-mono w-16 text-center font-bold">{fmt(settings[key] as number)}</span>
        <button
          className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30"
          disabled={!editable || (settings[key] as number) >= max}
          onClick={() => upd({ [key]: Math.round(((settings[key] as number) + step) * 100) / 100 })}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </span>
    </label>
  );
  const toggle = (label: string, key: keyof GameSettings) => (
    <label className="flex items-center justify-between py-1 text-sm">
      <span className="text-mist">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[#2ee6f0]"
        disabled={!editable}
        checked={settings[key] as boolean}
        onChange={(e) => upd({ [key]: e.target.checked })}
      />
    </label>
  );
  const eff = effectiveManagerCount(settings, Math.max(4, players));
  return (
    <div className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2" data-testid="settings-form">
      {!editable && (
        <p className="mb-2 rounded-lg bg-white/5 p-2 text-xs text-mist/70">Only the host can change these.</p>
      )}
      {num('Max players', 'maxPlayers', 4, 10, 1)}
      {num('Toxic Managers', 'managers', 0, 3, 1, (v) => (v === 0 ? `auto (${eff})` : String(v)))}
      {num('Tasks per player', 'tasksPerPlayer', 1, 6, 1)}
      {num('Elimination cooldown', 'killCooldown', 10, 60, 5, (v) => `${v}s`)}
      <label className="flex items-center justify-between py-1 text-sm">
        <span className="text-mist">Elimination range</span>
        <select
          className="rounded-lg bg-white/10 px-2 py-1 text-sm"
          disabled={!editable}
          value={settings.killRange}
          onChange={(e) => upd({ killRange: e.target.value as GameSettings['killRange'] })}
        >
          <option value="short">Short</option>
          <option value="normal">Normal</option>
          <option value="long">Long</option>
        </select>
      </label>
      {num('Player speed', 'playerSpeed', 0.75, 1.5, 0.05, (v) => `${v.toFixed(2)}×`)}
      {num('Discussion', 'discussionTime', 0, 180, 5, (v) => `${v}s`)}
      {num('Voting', 'votingTime', 15, 180, 5, (v) => `${v}s`)}
      {num('Employee vision', 'employeeVision', 0.5, 1.5, 0.05, (v) => `${v.toFixed(2)}×`)}
      {num('Manager vision', 'managerVision', 0.5, 1.75, 0.05, (v) => `${v.toFixed(2)}×`)}
      {num('Sabotage cooldown', 'sabotageCooldown', 10, 90, 5, (v) => `${v}s`)}
      {num('Emergency meetings', 'emergencyMeetings', 0, 5, 1)}
      {toggle('Anonymous votes', 'anonymousVotes')}
      {toggle('Reveal role on termination', 'confirmEjects')}
      {toggle('Public lobby (Quick Match)', 'isPublic')}
    </div>
  );
}
