import { useEffect, useRef, useState } from 'react';

export interface MinigameProps<T = any> {
  data: T;
  submit: (answer: unknown) => void;
  /** increments each time the server rejects an answer */
  failures: number;
}

/** Click-or-drag sorting: pick an item, then drop it on a bin (or drag it there). */
export function useSorter<K extends string>(ids: string[]) {
  const [assign, setAssign] = useState<Record<string, K>>({});
  const [held, setHeld] = useState<string | null>(null);
  const place = (id: string, bin: K) => {
    setAssign((a) => ({ ...a, [id]: bin }));
    setHeld(null);
  };
  const unassigned = ids.filter((id) => !assign[id]);
  return { assign, setAssign, held, setHeld, place, unassigned, complete: unassigned.length === 0 };
}

export function Bin({
  label,
  icon,
  onDrop,
  active,
  children,
  testId,
}: {
  label: string;
  icon?: string;
  onDrop: (id: string) => void;
  active: boolean;
  children?: React.ReactNode;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex min-h-24 flex-col rounded-2xl border-2 border-dashed p-2 transition ${over ? 'scale-[1.02] border-corp-cyan bg-corp-cyan/15' : active ? 'border-corp-yellow/70 bg-corp-yellow/5' : 'border-white/15 bg-white/5'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id);
      }}
      onClick={() => active && onDrop('')}
      role="button"
      tabIndex={0}
      aria-label={`Put in ${label}`}
      data-testid={testId}
    >
      <div className="font-display mb-1 flex items-center gap-1 text-sm font-bold">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function Draggable({
  id,
  held,
  onPick,
  children,
  className = '',
  testId,
}: {
  id: string;
  held: boolean;
  onPick: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        onPick();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={`cursor-grab rounded-xl transition active:cursor-grabbing ${held ? 'scale-105 ring-4 ring-corp-yellow' : 'hover:-translate-y-0.5'} ${className}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onPick()}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function useShakeOn(n: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!n || !ref.current) return;
    ref.current.classList.remove('anim-shake');
    void ref.current.offsetWidth;
    ref.current.classList.add('anim-shake');
  }, [n]);
  return ref;
}
