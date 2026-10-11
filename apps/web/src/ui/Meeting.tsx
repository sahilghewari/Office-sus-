import { useEffect, useMemo, useRef, useState } from 'react';
import { SKIP, colorHex, type PublicPlayer, type StateMsg } from '@corp/shared';
import { useGame } from '../stores/game';
import { useServerNow, secondsLeft } from '../hooks/useNow';
import { send } from '../networking/connection';
import { Avatar } from '../components/Avatar';
import { ChatPanel } from './ChatPanel';
import { sfx } from '../audio/audio';
import type { Expression } from '../game/characterArt';
import { VoiceControls } from '../voice/VoiceControls';

export function Meeting() {
  const s = useGame((g) => g.state)!;
  const m = s.meeting;
  useEffect(() => {
    if (s.phase === 'MEETING_INTRO') sfx(m?.kind === 'report' ? 'report' : 'meeting');
  }, [s.phase, m?.kind]);
  if (!m) return null;
  if (s.phase === 'MEETING_INTRO') return <MeetingIntro s={s} />;
  return <MeetingRoom s={s} />;
}

function MeetingIntro({ s }: { s: StateMsg }) {
  const m = s.meeting!;
  const reporter = s.players.find((p) => p.id === m.reporterId);
  const victim = s.players.find((p) => p.id === m.victimId);
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle,#7a1020,#1a0308_75%)]"
      data-testid="meeting-intro"
    >
      <div className="striped-warning absolute top-0 left-0 h-6 w-full opacity-80" />
      <div className="striped-warning absolute bottom-0 left-0 h-6 w-full opacity-80" />
      <h1
        className="font-display text-shadow-hard text-center text-6xl font-bold text-white sm:text-8xl"
        style={{ animation: 'slam 0.6s cubic-bezier(0.2,1.4,0.4,1) both' }}
      >
        {m.kind === 'report' ? 'INCIDENT REPORTED!' : 'EMERGENCY HR MEETING!'}
      </h1>
      <p className="anim-up mt-4 text-2xl text-red-100" style={{ animationDelay: '0.4s' }}>
        {m.kind === 'report' ? 'Someone is creating a toxic work environment.' : m.line}
      </p>
      <div className="anim-pop mt-8 flex items-end gap-10" style={{ animationDelay: '0.7s' }}>
        {reporter && (
          <div className="flex flex-col items-center">
            <Avatar appearance={reporter.appearance} size={110} expression="shock" />
            <span className="font-display mt-1 text-lg">📢 {reporter.name}</span>
          </div>
        )}
        {victim && (
          <div className="flex flex-col items-center opacity-80">
            <div className="rotate-[-8deg] rounded-xl bg-white p-2 text-ink shadow-xl">
              <div className="h-3 rounded" style={{ background: m.victimColor ?? '#fff' }} />
              <div className="font-display px-3 pt-1 text-lg font-bold">{victim.name}</div>
              <div className="px-3 text-xs font-bold text-corp-red">FOUND IN {m.room?.toUpperCase()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const REACTIONS: Expression[] = ['think', 'shock', 'smug', 'normal', 'sad', 'happy'];

function MeetingRoom({ s }: { s: StateMsg }) {
  const m = s.meeting!;
  const now = useServerNow(250);
  const left = secondsLeft(s.phaseEndsAt, now);
  const voting = s.phase === 'VOTING';
  const results = s.phase === 'VOTE_RESULTS' ? m.results : null;
  const iCanVote = voting && s.you.alive && !s.you.spectator && !m.myVote;
  const [pick, setPick] = useState<string | null>(null);
  const [showEject, setShowEject] = useState(false);
  const lastTick = useRef(0);
  useEffect(() => {
    if (left > 0 && left <= 10 && left !== lastTick.current && (voting || s.phase === 'DISCUSSION'))
      sfx('tick');
    lastTick.current = left;
  }, [left, voting, s.phase]);
  useEffect(() => {
    if (!results) return setShowEject(false);
    const id = setTimeout(() => {
      setShowEject(true);
      sfx(results.ejectedId ? 'terminate' : 'vote');
    }, 2300);
    return () => clearTimeout(id);
  }, [results]);
  const reactions = useMemo(
    () =>
      Object.fromEntries(
        s.players.map((p, i) => [
          p.id,
          REACTIONS[(i * 7 + (m.reporterId.charCodeAt(0) || 0)) % REACTIONS.length],
        ]),
      ),
    [s.players, m.reporterId],
  );
  const living = s.players.filter((p) => !p.dead);
  const dead = s.players.filter((p) => p.dead);
  const reporter = s.players.find((p) => p.id === m.reporterId);
  const victim = s.players.find((p) => p.id === m.victimId);
  const vote = (target: string) => {
    send({ t: 'vote', target });
    sfx('vote');
    setPick(null);
  };

  return (
    <div
      className="absolute inset-0 z-40 flex bg-[linear-gradient(160deg,#1d2558,#0b0f2b)]"
      data-testid="meeting-room"
    >
      <div className="bg-grid absolute inset-0 opacity-40" />
      <main className="relative flex min-w-0 flex-1 flex-col p-6">
        <header className="mb-4 flex flex-wrap items-center gap-4">
          <div className="panel flex items-center gap-3 px-4 py-2">
            <span className="text-3xl">{m.kind === 'report' ? '📢' : '🚨'}</span>
            <div>
              <div className="font-display text-2xl font-bold">
                {results ? 'The votes are in' : voting ? 'VOTING' : 'DISCUSSION'}
              </div>
              <div className="text-xs text-mist">
                Called by <b className="text-white">{reporter?.name}</b>
                {victim && (
                  <>
                    {' '}
                    · <span style={{ color: m.victimColor ?? undefined }}>{victim.name}</span> was found in{' '}
                    {m.room}
                  </>
                )}
              </div>
            </div>
          </div>
          {!results && (
            <div
              className={`font-mono panel px-5 py-2 text-4xl font-bold tabular-nums ${left <= 10 ? 'text-corp-red' : 'text-white'}`}
              data-testid="meeting-timer"
            >
              {left}s
            </div>
          )}
          <p className="flex-1 text-sm text-mist italic">
            {results
              ? ''
              : voting
                ? s.you.alive && !s.you.spectator
                  ? m.myVote
                    ? 'Vote cast. Now look innocent.'
                    : 'Click a coworker to vote, or skip.'
                  : 'Ghosts and spectators cannot vote.'
                : 'Discuss! Voting opens when the timer ends.'}
          </p>
        </header>

        <div
          className="scroll-thin grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-5"
          data-testid="vote-grid"
        >
          {[...living, ...dead].map((p) => (
            <PlayerCard
              key={p.id}
              p={results && p.id === results.ejectedId ? { ...p, dead: false } : p}
              me={p.id === s.you.id}
              voted={m.votedIds.includes(p.id)}
              reporter={p.id === m.reporterId}
              expression={p.dead ? 'sad' : reactions[p.id]}
              selectable={iCanVote && !p.dead}
              selected={pick === p.id}
              onSelect={() => setPick(pick === p.id ? null : p.id)}
              onConfirm={() => vote(p.id)}
              votes={results?.counts[p.id] ?? 0}
              voters={
                results?.voters?.[p.id]?.map((id) => s.players.find((x) => x.id === id)).filter(Boolean) as
                  PublicPlayer[] | undefined
              }
              showResults={!!results}
              myVote={m.myVote === p.id}
              teammate={s.you.role === 'manager' && p.role === 'manager' && p.id !== s.you.id}
            />
          ))}
        </div>

        <footer className="mt-4 flex items-center gap-3">
          {voting && s.you.alive && !s.you.spectator && (
            <button
              className="btn btn-ghost"
              disabled={!iCanVote}
              onClick={() => vote(SKIP)}
              data-testid="skip-vote"
            >
              ⏭ Skip vote {m.myVote === SKIP && '✓'}
            </button>
          )}
          {results && (
            <div className="hud px-4 py-2 text-sm">
              Skipped: <b>{results.counts[SKIP] ?? 0}</b>
              {results.voters?.[SKIP] && (
                <span className="text-mist">
                  {' '}
                  ({results.voters[SKIP].map((id) => s.players.find((p) => p.id === id)?.name).join(', ')})
                </span>
              )}
            </div>
          )}
          <div className="ml-auto w-72">
            <VoiceControls />
          </div>
        </footer>
      </main>

      <aside className="panel relative m-6 ml-0 flex w-[340px] flex-col p-4">
        {s.you.alive && !s.you.spectator ? (
          <ChatPanel
            channels={['meeting']}
            title="Meeting chat"
            placeholder={'"I was fixing the printer!"'}
            className="h-full"
          />
        ) : (
          <>
            <ChatPanel channels={['meeting']} title="Meeting (read-only)" className="h-1/2" readOnly />
            <ChatPanel
              channels={['ghost']}
              title="Ghost chat"
              className="mt-3 h-1/2"
              placeholder="Only ghosts can read this"
            />
          </>
        )}
      </aside>

      {results && showEject && <Ejection s={s} />}
    </div>
  );
}

function PlayerCard(props: {
  p: PublicPlayer;
  me: boolean;
  voted: boolean;
  reporter: boolean;
  expression: Expression;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  votes: number;
  voters?: PublicPlayer[];
  showResults: boolean;
  myVote: boolean;
  teammate: boolean;
}) {
  const { p } = props;
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl border-2 bg-[radial-gradient(circle_at_50%_35%,rgba(61,123,255,0.18),transparent_70%)] p-3 transition ${p.dead ? 'border-white/5 bg-black/30 opacity-50 grayscale' : props.selected ? 'border-corp-yellow bg-corp-yellow/10' : props.selectable ? 'cursor-pointer border-white/10 bg-white/5 hover:-translate-y-1 hover:border-corp-cyan' : 'border-white/10 bg-white/5'}`}
      onClick={props.selectable ? props.onSelect : undefined}
      role={props.selectable ? 'button' : undefined}
      tabIndex={props.selectable ? 0 : undefined}
      onKeyDown={(e) => props.selectable && e.key === 'Enter' && props.onSelect()}
      aria-label={props.selectable ? `Vote for ${p.name}` : p.name}
      data-testid={`vote-card-${p.name}`}
    >
      {props.reporter && (
        <span className="absolute top-2 left-2 text-lg" title="Called the meeting">
          📢
        </span>
      )}
      {props.voted && !props.showResults && (
        <span className="chip absolute top-2 right-2 bg-corp-mint text-[10px] text-ink">voted</span>
      )}
      {props.myVote && !props.showResults && (
        <span className="chip absolute top-8 right-2 bg-corp-yellow text-[10px] text-ink">your vote</span>
      )}
      <div
        className={p.dead ? '' : 'anim-bob'}
        style={{ animationDelay: `${(p.id.charCodeAt(0) % 10) / 10}s` }}
      >
        <Avatar appearance={p.appearance} size={118} expression={props.expression} />
      </div>
      <div
        className={`font-display mt-1 max-w-full truncate text-lg font-semibold ${props.teammate ? 'text-red-300' : ''}`}
      >
        {p.name}
        {props.me && <span className="text-xs text-corp-cyan"> (you)</span>}
      </div>
      {!p.connected && <div className="text-[11px] text-corp-orange">disconnected</div>}
      {p.dead && (
        <div className="font-display absolute top-1/3 rotate-[-12deg] rounded border-2 border-corp-red px-2 text-sm font-bold text-corp-red">
          TERMINATED
        </div>
      )}
      {props.selected && (
        <button
          className="btn btn-yellow btn-sm mt-2"
          onClick={(e) => {
            e.stopPropagation();
            props.onConfirm();
          }}
          data-testid="confirm-vote"
        >
          Vote ✓
        </button>
      )}
      {props.showResults && (
        <div className="mt-2 flex min-h-6 flex-wrap justify-center gap-1">
          {props.voters
            ? props.voters.map((v, i) => (
                <span
                  key={v.id}
                  className="anim-pop h-5 w-5 rounded-full ring-2 ring-white/40"
                  style={{
                    background: `var(--c)`,
                    ['--c' as string]: COLOR(v),
                    animationDelay: `${i * 0.25}s`,
                  }}
                  title={v.name}
                />
              ))
            : Array.from({ length: props.votes }, (_, i) => (
                <span
                  key={i}
                  className="anim-pop h-5 w-5 rounded-full bg-white/80"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
        </div>
      )}
    </div>
  );
}

const COLOR = (p: PublicPlayer) => colorHex(p.appearance.color);

function Ejection({ s }: { s: StateMsg }) {
  const r = s.meeting!.results!;
  const ejected = s.players.find((p) => p.id === r.ejectedId);
  return (
    <div
      className="anim-fade absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0b0f2b]/95"
      data-testid="ejection"
    >
      {ejected ? (
        <>
          <div className="absolute bottom-[22%] left-0 h-1 w-full bg-white/10" />
          <div
            className="absolute bottom-[22%] left-[-10%]"
            style={{ animation: 'walk-out 6s linear 0.3s both' }}
          >
            <div className="relative">
              <Avatar appearance={ejected.appearance} size={120} expression="sad" />
              <div className="absolute -right-6 bottom-6 flex h-12 w-16 items-center justify-center rounded bg-[#c8975e] text-xl shadow-lg ring-2 ring-[#8a5a3c]">
                🪴
              </div>
            </div>
          </div>
          <h2
            className="font-display text-shadow-hard relative text-center text-5xl font-bold sm:text-6xl"
            style={{ animation: 'slam 0.6s both' }}
            data-testid="ejection-title"
          >
            {ejected.name.toUpperCase()} HAS BEEN TERMINATED.
          </h2>
          <p className="relative mt-3 text-xl text-mist">{r.line}</p>
          {r.ejectedWasManager !== null && (
            <p
              className={`font-display anim-up relative mt-6 text-3xl font-bold ${r.ejectedWasManager ? 'text-corp-mint' : 'text-corp-red'}`}
              style={{ animationDelay: '1.2s' }}
            >
              {r.ejectedWasManager ? 'They were a Toxic Manager.' : 'They were not a Toxic Manager.'}
            </p>
          )}
          {r.managersLeft !== null && (
            <p className="anim-up relative mt-2 text-mist" style={{ animationDelay: '1.6s' }}>
              {r.managersLeft} Toxic Manager{r.managersLeft === 1 ? '' : 's'} remain
              {r.managersLeft === 1 ? 's' : ''}.
            </p>
          )}
        </>
      ) : (
        <>
          <h2
            className="font-display text-shadow-hard text-center text-6xl font-bold"
            style={{ animation: 'slam 0.6s both' }}
            data-testid="ejection-title"
          >
            NO ONE WAS TERMINATED.
          </h2>
          <p className="mt-3 text-xl text-mist">
            {r.tie ? 'It was a tie. ' : ''}
            {r.line}
          </p>
        </>
      )}
    </div>
  );
}
