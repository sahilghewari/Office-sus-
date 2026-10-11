import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LEN, type ChatChannel } from '@corp/shared';
import { useGame } from '../stores/game';
import { useSettings } from '../stores/settings';
import { send } from '../networking/connection';

export function muteKey(name: string, color: string) {
  return `${name}|${color}`;
}

/**
 * Text chat. The server decides the channel: lobby (everyone), meeting (living
 * players; ghosts can read) or ghost (eliminated players + spectators only).
 */
export function ChatPanel({
  channels,
  title,
  placeholder,
  className = '',
  compact = false,
  readOnly = false,
}: {
  channels: ChatChannel[];
  title?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const chat = useGame((s) => s.chat);
  const players = useGame((s) => s.state?.players ?? []);
  const myId = useGame((s) => s.myId);
  const muted = useSettings((s) => s.mutedPlayers);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const msgs = chat
    .filter((m) => channels.includes(m.channel))
    .filter((m) => {
      if (!m.fromId || m.fromId === myId) return true;
      const p = players.find((pp) => pp.id === m.fromId);
      return !p || !muted.includes(muteKey(p.name, p.appearance.color));
    });
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length]);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    send({ t: 'chat', text: t.slice(0, CHAT_MAX_LEN) });
    setText('');
  };
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      {title && <div className="mb-2 text-xs font-bold tracking-widest text-mist/70 uppercase">{title}</div>}
      <div
        ref={listRef}
        className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        data-testid="chat-log"
      >
        {msgs.length === 0 && (
          <p className="text-sm text-mist/50 italic">No messages yet. Awkward silence.</p>
        )}
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`anim-fade text-sm leading-snug ${m.system ? 'text-corp-yellow/90 italic' : ''} ${m.channel === 'ghost' ? 'opacity-80' : ''}`}
          >
            {!m.system && (
              <span className="font-display mr-1.5 font-semibold" style={{ color: m.color }}>
                {m.channel === 'ghost' && '👻 '}
                {m.name}:
              </span>
            )}
            {/* Rendered as text: user content is never interpreted as HTML. */}
            <span className="break-words text-white/90">{m.text}</span>
          </div>
        ))}
      </div>
      {!readOnly && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className={`input ${compact ? 'py-1.5 text-sm' : ''}`}
            value={text}
            maxLength={CHAT_MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder ?? 'Say something professional…'}
            aria-label="Chat message"
            data-testid="chat-input"
            onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
          />
          <button className="btn btn-sm" type="submit" aria-label="Send">
            ➤
          </button>
        </form>
      )}
    </div>
  );
}
