import { useEffect, useState } from 'react';
import { sfx } from '../../audio/audio';
import { Bin, Draggable, useSorter, type MinigameProps } from './common';

// ---------------------------------------------------------------- Expenses

const CAT_ICON: Record<string, string> = { travel: '✈️', meals: '🍔', supplies: '📎', software: '💾' };

export function ExpenseTask({ data, submit, failures }: MinigameProps<{ receipts: { id: string; vendor: string; item: string; amount: string }[]; categories: string[] }>) {
  const s = useSorter<string>(data.receipts.map((r) => r.id));
  useEffect(() => {
    if (failures) s.setAssign({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failures]);
  const card = (r: (typeof data.receipts)[number], small = false) => (
    <div className={`rounded-lg bg-[#fffdf5] font-mono text-ink shadow ${small ? 'px-2 py-1 text-[10px]' : 'w-44 p-2 text-xs'}`} style={{ backgroundImage: small ? undefined : 'repeating-linear-gradient(180deg,transparent 0 13px,rgba(0,0,0,0.05) 13px 14px)' }}>
      <div className="font-bold">{r.vendor}</div>
      {!small && <div className="text-[10px] text-slate-500">{r.item}</div>}
      {!small && <div className="mt-1 text-right font-bold">${r.amount}</div>}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-28 flex-wrap justify-center gap-2 rounded-2xl bg-black/20 p-3">
        {s.unassigned.length === 0 && <p className="self-center text-sm text-mist">All receipts filed. Submit the report!</p>}
        {data.receipts
          .filter((r) => !s.assign[r.id])
          .map((r) => (
            <Draggable key={r.id} id={r.id} held={s.held === r.id} onPick={() => (sfx('paper'), s.setHeld(r.id))} testId={`receipt-${r.id}`}>
              {card(r)}
            </Draggable>
          ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {data.categories.map((c) => (
          <Bin key={c} label={c[0].toUpperCase() + c.slice(1)} icon={CAT_ICON[c]} active={!!s.held} onDrop={(id) => (id || s.held) && s.place(id || s.held!, c)} testId={`bin-${c}`}>
            {data.receipts
              .filter((r) => s.assign[r.id] === c)
              .map((r) => (
                <button key={r.id} onClick={(e) => (e.stopPropagation(), s.setAssign(({ [r.id]: _x, ...rest }) => rest))} title="Take back">
                  {card(r, true)}
                </button>
              ))}
          </Bin>
        ))}
      </div>
      <button className="btn btn-yellow self-center" disabled={!s.complete} onClick={() => submit(s.assign)} data-testid="submit-expenses">
        Submit expense report
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Files

const FOLDER_ICON: Record<string, string> = { Documents: '📁', Spreadsheets: '📗', Images: '🖼️', Slides: '📙' };
const EXT_COLOR: Record<string, string> = { docx: '#3d7bff', pdf: '#ef3e4a', txt: '#9aa3b8', xlsx: '#3ddc97', csv: '#1fae72', png: '#ff6fb5', jpg: '#ff8a3d', gif: '#8a5cf6', pptx: '#ff8a3d', key: '#ffd23f' };

export function FilesTask({ data, submit, failures }: MinigameProps<{ files: { id: string; name: string }[]; folders: string[] }>) {
  const s = useSorter<string>(data.files.map((f) => f.id));
  useEffect(() => {
    if (failures) s.setAssign({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failures]);
  useEffect(() => {
    if (s.complete) {
      const t = setTimeout(() => submit(s.assign), 350);
      return () => clearTimeout(t);
    }
  }, [s.complete, s.assign, submit]);
  const icon = (f: { name: string }) => {
    const ext = f.name.split('.').pop()!;
    return (
      <div className="flex w-24 flex-col items-center p-1 text-center">
        <div className="relative flex h-12 w-10 items-end justify-center rounded-md bg-white shadow">
          <span className="mb-1 rounded px-1 text-[9px] font-bold text-white" style={{ background: EXT_COLOR[ext] ?? '#666' }}>
            .{ext}
          </span>
        </div>
        <span className="mt-1 line-clamp-2 text-[10px] break-all text-white/90">{f.name}</span>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-32 flex-wrap justify-center gap-1 rounded-2xl bg-[linear-gradient(135deg,#3d7bff33,#8a5cf633)] p-3 ring-1 ring-white/10">
        {data.files
          .filter((f) => !s.assign[f.id])
          .map((f) => (
            <Draggable key={f.id} id={f.id} held={s.held === f.id} onPick={() => s.setHeld(f.id)} testId={`file-${f.id}`}>
              {icon(f)}
            </Draggable>
          ))}
        {s.unassigned.length === 0 && <p className="self-center text-sm text-mist">Desktop clean. A miracle.</p>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {data.folders.map((fo) => (
          <Bin key={fo} label={fo} icon={FOLDER_ICON[fo]} active={!!s.held} onDrop={(id) => (id || s.held) && (sfx('click'), s.place(id || s.held!, fo))} testId={`folder-${fo}`}>
            <span className="text-xs text-mist">{data.files.filter((f) => s.assign[f.id] === fo).length} files</span>
          </Bin>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Emails

const FOLDERS: { id: string; label: string; icon: string; color: string }[] = [
  { id: 'urgent', label: 'Urgent', icon: '🚨', color: 'btn-red' },
  { id: 'reply', label: 'Reply', icon: '↩️', color: '' },
  { id: 'archive', label: 'Archive', icon: '🗄️', color: 'btn-ghost' },
  { id: 'spam', label: 'Spam', icon: '🗑️', color: 'btn-orange' },
];

export function EmailsTask({ data, submit, failures }: MinigameProps<{ emails: { id: string; from: string; subject: string; body: string }[] }>) {
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(data.emails[0]?.id);
  useEffect(() => {
    if (failures) {
      setAssign({});
      setOpen(data.emails[0]?.id);
    }
  }, [failures, data.emails]);
  const pending = data.emails.filter((e) => !assign[e.id]);
  const current = data.emails.find((e) => e.id === open && !assign[e.id]) ?? pending[0];
  useEffect(() => {
    if (pending.length === 0) {
      const t = setTimeout(() => submit(assign), 350);
      return () => clearTimeout(t);
    }
  }, [pending.length, assign, submit]);
  return (
    <div className="grid h-[340px] grid-cols-[220px_1fr] overflow-hidden rounded-2xl bg-white text-ink">
      <ul className="overflow-y-auto border-r border-slate-200 bg-slate-50">
        {data.emails.map((e) => (
          <li key={e.id}>
            <button className={`w-full border-b border-slate-200 px-3 py-2 text-left ${current?.id === e.id ? 'bg-blue-100' : ''} ${assign[e.id] ? 'opacity-40' : ''}`} onClick={() => !assign[e.id] && setOpen(e.id)}>
              <div className="truncate text-xs font-bold">{e.from}</div>
              <div className="truncate text-xs">{e.subject}</div>
              {assign[e.id] && <div className="text-[10px] font-bold text-corp-purple uppercase">→ {assign[e.id]}</div>}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col p-4">
        {current ? (
          <>
            <div className="text-xs text-slate-500">From: {current.from}</div>
            <div className="font-display text-xl font-bold">{current.subject}</div>
            <p className="mt-3 flex-1 text-sm text-slate-700">{current.body}</p>
            <div className="grid grid-cols-4 gap-2">
              {FOLDERS.map((f) => (
                <button
                  key={f.id}
                  className={`btn btn-sm ${f.color}`}
                  onClick={() => {
                    sfx('click');
                    setAssign((a) => ({ ...a, [current.id]: f.id }));
                  }}
                  data-testid={`email-${f.id}`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="m-auto font-display text-2xl text-slate-500">Inbox zero ✨</p>
        )}
      </div>
    </div>
  );
}
