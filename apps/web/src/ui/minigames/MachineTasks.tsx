import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../../audio/audio';
import type { MinigameProps } from './common';

// ---------------------------------------------------------------- Coffee

const ING: Record<string, { icon: string; color: string; label: string }> = {
  espresso: { icon: '☕', color: '#4a2a1a', label: 'Espresso shot' },
  milk: { icon: '🥛', color: '#f3ede0', label: 'Steamed milk' },
  foam: { icon: '☁️', color: '#ffffff', label: 'Milk foam' },
  water: { icon: '💧', color: '#9fd3ff', label: 'Hot water' },
  ice: { icon: '🧊', color: '#d4f1ff', label: 'Ice' },
  sugar: { icon: '🍬', color: '#ffe4f1', label: 'Sugar' },
  syrup: { icon: '🍯', color: '#e6a700', label: 'Syrup pump' },
};

export function CoffeeTask({
  data,
  submit,
  failures,
}: MinigameProps<{
  customer: string;
  drink: string;
  mods: string[];
  recipes: { name: string; base: Record<string, number> }[];
  ingredients: string[];
}>) {
  const empty = () => Object.fromEntries(data.ingredients.map((i) => [i, 0])) as Record<string, number>;
  const [cup, setCup] = useState(empty);
  const [brewing, setBrewing] = useState(false);
  useEffect(() => {
    if (failures) {
      setCup(empty());
      setBrewing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failures]);
  const layers = data.ingredients
    .flatMap((i) => Array.from({ length: cup[i] }, () => i))
    .filter((i) => i !== 'sugar' && i !== 'syrup');
  const brew = () => {
    setBrewing(true);
    sfx('coffee');
    setTimeout(() => submit(cup), 1500);
  };
  return (
    <div className="grid grid-cols-[1fr_180px_1fr] items-start gap-4">
      <div className="space-y-3">
        <div className="rotate-[-2deg] rounded-lg bg-[#fffdf5] p-3 font-mono text-ink shadow-lg">
          <div className="text-[10px] text-slate-500">ORDER #{((data.customer.length * 37) % 900) + 100}</div>
          <div className="font-bold">For: {data.customer}</div>
          <div className="font-display text-xl font-bold text-corp-purple">{data.drink}</div>
          <ul className="mt-1 text-xs">
            {data.mods.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-[#2b2f3f] p-3 text-xs">
          <div className="font-display mb-1 font-bold text-corp-yellow">Recipe card</div>
          {data.recipes.map((r) => (
            <div key={r.name} className="flex justify-between gap-2 border-b border-white/5 py-0.5">
              <span className="font-semibold">{r.name}</span>
              <span className="text-mist">
                {Object.entries(r.base)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' + ')}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <div className="relative mt-4 h-48 w-32">
          {brewing && (
            <div
              className="absolute -top-6 left-1/2 h-10 w-3 -translate-x-1/2 rounded-full bg-[#4a2a1a]"
              style={{ animation: 'blink 0.3s infinite' }}
            />
          )}
          <div className="absolute bottom-0 flex h-40 w-32 flex-col-reverse overflow-hidden rounded-b-[2.5rem] rounded-t-lg border-4 border-white/80 bg-white/10">
            {layers.slice(0, 10).map((l, i) => (
              <div
                key={i}
                className="anim-fade w-full flex-none"
                style={{ height: 14, background: ING[l].color }}
              />
            ))}
          </div>
          <div className="absolute top-14 -right-6 h-14 w-8 rounded-r-2xl border-4 border-l-0 border-white/80" />
        </div>
        <div className="mt-2 text-xs text-mist">
          {cup.sugar > 0 && `🍬×${cup.sugar} `}
          {cup.syrup > 0 && `🍯×${cup.syrup}`}
        </div>
        <button
          className="btn btn-yellow mt-3"
          disabled={brewing || layers.length === 0}
          onClick={brew}
          data-testid="brew"
        >
          {brewing ? 'Brewing…' : '☕ Brew'}
        </button>
        <button
          className="mt-2 text-xs text-mist underline"
          onClick={() => setCup(empty())}
          disabled={brewing}
        >
          Pour it out
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {data.ingredients.map((i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5">
            <span className="text-xl">{ING[i].icon}</span>
            <span className="flex-1 text-sm">{ING[i].label}</span>
            <button
              className="h-7 w-7 rounded-lg bg-white/10"
              disabled={brewing || cup[i] === 0}
              onClick={() => setCup((c) => ({ ...c, [i]: c[i] - 1 }))}
              aria-label={`Less ${i}`}
            >
              −
            </button>
            <span className="font-mono w-4 text-center">{cup[i]}</span>
            <button
              className="h-7 w-7 rounded-lg bg-corp-blue"
              disabled={brewing || cup[i] >= 4}
              onClick={() => {
                sfx('click');
                setCup((c) => ({ ...c, [i]: c[i] + 1 }));
              }}
              aria-label={`Add ${i}`}
              data-testid={`add-${i}`}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Printer

const CART: Record<string, string> = {
  cyan: '#2ee6f0',
  magenta: '#ff3fa4',
  yellow: '#ffd23f',
  black: '#23252e',
};

export function PrinterTask({
  data,
  submit,
  failures,
}: MinigameProps<{ jams: string[]; cartridge: string | null }>) {
  const [actions, setActions] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (failures) setActions([]);
  }, [failures]);
  const open = actions.includes('open') && !actions.includes('close');
  const removed = actions.filter((a) => a.startsWith('remove:')).map((a) => a.slice(7));
  const cartDone = actions.some((a) => a.startsWith('cartridge:'));
  const closed = actions.includes('close');
  const jamsLeft = data.jams.filter((j) => !removed.includes(j));
  const status =
    closed && actions.includes('restart')
      ? 'ready'
      : jamsLeft.length || (data.cartridge && !cartDone)
        ? 'error'
        : 'ok';
  const add = (a: string) => setActions((x) => [...x, a]);
  const say = (m: string) => {
    setMsg(m);
    sfx('error');
    setTimeout(() => setMsg(null), 1400);
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-64 w-[460px] rounded-3xl bg-[linear-gradient(#e6e9f5,#c3c8d8)] shadow-inner ring-4 ring-white/20">
        {/* status panel */}
        <div className="absolute top-3 right-4 flex items-center gap-2 rounded-lg bg-[#1a1e2c] px-3 py-1.5 font-mono text-xs">
          <span
            className={`h-3 w-3 rounded-full ${status === 'ready' ? 'bg-corp-mint shadow-[0_0_10px_#3ddc97]' : status === 'ok' ? 'bg-corp-yellow' : 'bg-corp-red anim-blink'}`}
          />
          {status === 'ready'
            ? 'READY'
            : status === 'ok'
              ? 'CLOSE & RESTART'
              : jamsLeft.length
                ? 'PAPER JAM'
                : `LOW ${data.cartridge?.toUpperCase()}`}
        </div>
        <div className="absolute top-3 left-4 font-display text-lg font-bold text-ink/70">
          JamMaster 3000™
        </div>
        {/* inner tray */}
        <div
          className={`absolute inset-x-6 top-12 bottom-14 rounded-xl bg-[#3a3f55] transition ${open ? '' : 'opacity-0'}`}
        >
          <div className="grid h-full grid-cols-3 grid-rows-2 gap-2 p-3">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const id = `jam${i}`;
              const jammed = data.jams.includes(id) && !removed.includes(id);
              return (
                <button
                  key={id}
                  disabled={!open || !jammed}
                  className="relative rounded-lg bg-[#2b2f3f]"
                  onClick={() => {
                    sfx('paper');
                    add(`remove:${id}`);
                  }}
                  aria-label={jammed ? 'Remove jammed paper' : 'Empty slot'}
                  data-testid={jammed ? `jam-${id}` : undefined}
                >
                  {jammed && (
                    <span className="absolute inset-2 flex rotate-6 items-center justify-center rounded bg-white text-2xl shadow-lg transition hover:scale-110">
                      📄
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {data.cartridge && (
            <div className="absolute -bottom-12 left-2 flex items-center gap-2 text-xs text-ink">
              Slot:{' '}
              <span
                className="h-6 w-10 rounded border-2 border-dashed border-ink/50"
                style={{ background: cartDone ? CART[data.cartridge] : undefined }}
              />
            </div>
          )}
        </div>
        {/* door */}
        <div
          className={`absolute inset-x-6 top-12 bottom-14 flex items-center justify-center rounded-xl bg-[linear-gradient(#f6f7fb,#d3d8e8)] shadow-lg ring-1 ring-black/10 transition-transform duration-500 ${open ? '-translate-y-[110%] opacity-0' : ''}`}
        >
          <span className="font-mono text-sm text-ink/40">PANEL A</span>
        </div>
        <div className="absolute inset-x-20 bottom-3 h-8 rounded-lg bg-white shadow" />
      </div>
      {msg && <p className="text-sm text-red-300">{msg}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          className="btn btn-sm"
          disabled={actions.length > 0}
          onClick={() => (sfx('open'), add('open'))}
          data-testid="printer-open"
        >
          1 · Open panel
        </button>
        {data.cartridge && (
          <div className="flex items-center gap-1 rounded-xl bg-white/5 px-2 py-1">
            <span className="text-xs text-mist">2 · Cartridge:</span>
            {Object.keys(CART).map((c) => (
              <button
                key={c}
                disabled={!open || cartDone}
                className="h-7 w-7 rounded-md ring-2 ring-white/30 disabled:opacity-30"
                style={{ background: CART[c] }}
                onClick={() =>
                  c === data.cartridge
                    ? (sfx('cable'), add(`cartridge:${c}`))
                    : say(`That's ${c}. The printer wants ${data.cartridge}.`)
                }
                aria-label={`${c} cartridge`}
                data-testid={`cart-${c}`}
              />
            ))}
          </div>
        )}
        <button
          className="btn btn-sm btn-ghost"
          disabled={!open}
          onClick={() =>
            jamsLeft.length
              ? say('Still jammed!')
              : data.cartridge && !cartDone
                ? say('Replace the cartridge first.')
                : add('close')
          }
          data-testid="printer-close"
        >
          3 · Close panel
        </button>
        <button
          className="btn btn-sm btn-mint"
          disabled={!closed || actions.includes('restart')}
          onClick={() => {
            const final = [...actions, 'restart'];
            setActions(final);
            sfx('printer');
            setTimeout(() => submit(final), 900);
          }}
          data-testid="printer-restart"
        >
          4 · Restart
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Meeting

export function MeetingTask({
  data,
  submit,
  failures,
}: MinigameProps<{
  title: string;
  people: { name: string; cameraOn: boolean }[];
  agendas: string[];
  items: { id: string; text: string; due: number }[];
  transcript: string[];
}>) {
  const [step, setStep] = useState(0);
  const [present, setPresent] = useState<string[]>([]);
  const [agenda, setAgenda] = useState<string | null>(null);
  const [order, setOrder] = useState(data.items.map((i) => i.id));
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    if (failures) {
      setStep(0);
      setPresent([]);
      setAgenda(null);
      setOwner(null);
    }
  }, [failures]);
  const item = (id: string) => data.items.find((i) => i.id === id)!;
  const move = (i: number, d: number) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
    sfx('click');
  };
  const steps = ['Attendance', 'Agenda', 'Action items', 'Owner'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-display rounded-lg bg-corp-purple px-3 py-1 font-bold">📅 {data.title}</span>
        <div className="ml-auto flex gap-1">
          {steps.map((s, i) => (
            <span
              key={s}
              className={`chip ${i === step ? 'bg-corp-yellow text-ink' : i < step ? 'bg-corp-mint/30 text-corp-mint' : 'bg-white/10 text-mist'}`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-[230px] rounded-2xl bg-black/20 p-4">
        {step === 0 && (
          <>
            <p className="mb-3 text-sm text-mist">
              Mark everyone who is actually here (camera on). Cameras off = "having connection issues".
            </p>
            <div className="grid grid-cols-5 gap-2">
              {data.people.map((p) => {
                const on = present.includes(p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => setPresent((x) => (on ? x.filter((n) => n !== p.name) : [...x, p.name]))}
                    className={`flex aspect-video flex-col items-center justify-center rounded-xl text-sm ring-2 ${on ? 'ring-corp-mint' : 'ring-transparent'} ${p.cameraOn ? 'bg-[linear-gradient(135deg,#3d7bff,#8a5cf6)]' : 'bg-[#1a1e2c]'}`}
                    data-testid={`attendee-${p.name}`}
                  >
                    <span className="text-2xl">{p.cameraOn ? '🙂' : '📷'}</span>
                    <span className="font-semibold">{p.name}</span>
                    {!p.cameraOn && <span className="text-[10px] text-mist">camera off</span>}
                    {on && <span className="text-[10px] text-corp-mint">✓ present</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="mb-3 text-sm text-mist">Which agenda belongs to "{data.title}"?</p>
            <div className="grid gap-2">
              {data.agendas.map((a) => (
                <button
                  key={a}
                  onClick={() => setAgenda(a)}
                  className={`rounded-xl px-4 py-3 text-left ring-2 ${agenda === a ? 'bg-corp-blue/30 ring-corp-cyan' : 'bg-white/5 ring-transparent hover:bg-white/10'}`}
                  data-testid="agenda-option"
                >
                  {a}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p className="mb-3 text-sm text-mist">Sort the action items by due date (soonest first).</p>
            <ol className="space-y-2">
              {order.map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span className="font-mono w-5 text-mist">{i + 1}.</span>
                  <span className="flex-1">{item(id).text}</span>
                  <span className="chip bg-white/10 text-mist">due Oct {item(id).due}</span>
                  <button
                    className="h-7 w-7 rounded bg-white/10"
                    onClick={() => move(i, -1)}
                    aria-label="Move up"
                    data-testid={`up-${id}`}
                  >
                    ▲
                  </button>
                  <button
                    className="h-7 w-7 rounded bg-white/10"
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        {step === 3 && (
          <>
            <div className="mb-3 rounded-xl bg-[#1a1e2c] p-3 font-mono text-xs">
              {data.transcript.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
            <p className="mb-2 text-sm text-mist">Who owns the follow-ups?</p>
            <div className="flex flex-wrap gap-2">
              {data.people.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setOwner(p.name)}
                  className={`rounded-xl px-3 py-2 ring-2 ${owner === p.name ? 'bg-corp-mint/20 ring-corp-mint' : 'bg-white/5 ring-transparent'}`}
                  data-testid={`owner-${p.name}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between">
        <button className="btn btn-ghost btn-sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← Back
        </button>
        {step < 3 ? (
          <button
            className="btn btn-sm"
            disabled={(step === 0 && present.length === 0) || (step === 1 && !agenda)}
            onClick={() => setStep((s) => s + 1)}
            data-testid="meeting-next"
          >
            Next →
          </button>
        ) : (
          <button
            className="btn btn-yellow btn-sm"
            disabled={!owner}
            onClick={() => submit({ present, agenda, order, owner })}
            data-testid="meeting-submit"
          >
            End meeting
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Server

export function ServerTask({
  data,
  submit,
  failures,
}: MinigameProps<{ modules: { id: string; label: string }[]; note: string[] }>) {
  const [booted, setBooted] = useState<string[]>([]);
  const [panic, setPanic] = useState(false);
  useEffect(() => {
    if (failures) setBooted([]);
  }, [failures]);
  const click = (m: { id: string; label: string }) => {
    if (booted.includes(m.id) || panic) return;
    const expected = data.note[booted.length];
    if (m.label !== expected) {
      setPanic(true);
      sfx('serverFail');
      setTimeout(() => {
        setPanic(false);
        setBooted([]);
      }, 900);
      return;
    }
    const next = [...booted, m.id];
    setBooted(next);
    sfx('beep');
    if (next.length === data.modules.length) setTimeout(() => submit(next), 500);
  };
  return (
    <div className="grid grid-cols-[1fr_170px] gap-4">
      <div
        className={`rounded-2xl bg-[#151a2a] p-4 ring-2 transition ${panic ? 'ring-corp-red' : booted.length === data.modules.length ? 'ring-corp-mint' : 'ring-white/10'}`}
      >
        <div className="mb-2 flex justify-between font-mono text-xs text-mist">
          <span>RACK SRV-01</span>
          <span className={panic ? 'text-corp-red' : 'text-corp-mint'}>
            {panic
              ? 'KERNEL PANIC — REBOOTING'
              : booted.length === data.modules.length
                ? 'ONLINE'
                : `BOOT ${booted.length}/${data.modules.length}`}
          </span>
        </div>
        <div className="space-y-2">
          {data.modules.map((m) => {
            const on = booted.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => click(m)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-mono text-sm transition ${on ? 'bg-corp-mint/20' : panic ? 'bg-corp-red/30' : 'bg-[#232a40] hover:bg-[#2f3650]'}`}
                data-testid={`module-${m.label}`}
              >
                <span
                  className={`h-3 w-3 rounded-full ${on ? 'bg-corp-mint shadow-[0_0_8px_#3ddc97]' : 'bg-[#3a3f55]'}`}
                />
                <span className="flex-1 text-left font-bold">{m.label}</span>
                <span className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded ${on ? 'bg-corp-cyan' : 'bg-white/10'}`}
                      style={on ? { animation: `blink ${0.4 + i * 0.13}s infinite` } : undefined}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rotate-2 self-start rounded-md bg-[#fff59a] p-3 font-mono text-sm text-ink shadow-lg">
        <div className="mb-1 text-xs font-bold">BOOT ORDER (DO NOT LOSE)</div>
        <ol className="list-decimal pl-5">
          {data.note.map((n, i) => (
            <li key={n} className={i < booted.length ? 'line-through opacity-50' : ''}>
              {n}
            </li>
          ))}
        </ol>
        <div className="mt-2 text-[10px]">— Dave, IT (on holiday)</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Excel

export function ExcelTask({
  data,
  submit,
  failures,
}: MinigameProps<{ cols: string[]; rows: { label: string; total: number; vals: (number | null)[] }[] }>) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (failures) setVals({});
  }, [failures]);
  const blanks = useMemo(
    () =>
      data.rows.flatMap(
        (r, ri) => r.vals.map((v, ci) => (v === null ? `${ri}:${ci}` : null)).filter(Boolean) as string[],
      ),
    [data.rows],
  );
  const rowOk = (ri: number) => {
    const r = data.rows[ri];
    const sum = r.vals.reduce<number>((a, v, ci) => a + (v ?? (Number(vals[`${ri}:${ci}`]) || 0)), 0);
    return (
      sum === r.total &&
      r.vals.every((v, ci) => v !== null || (vals[`${ri}:${ci}`] !== undefined && vals[`${ri}:${ci}`] !== ''))
    );
  };
  const allFilled = blanks.every((b) => vals[b] !== undefined && vals[b] !== '');
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl bg-white text-ink shadow-xl">
        <div className="flex items-center gap-2 bg-[#1fae72] px-3 py-1.5 text-xs font-bold text-white">
          <span>📗 Q1_budget_FINAL_v3.xlsx</span>
          <span className="ml-auto font-mono font-normal">fx = SUM(B:D)</span>
        </div>
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs text-slate-500">
              <th className="border border-slate-200 px-2 py-1 text-left">Expense</th>
              {data.cols.map((c) => (
                <th key={c} className="border border-slate-200 px-2 py-1">
                  {c}
                </th>
              ))}
              <th className="border border-slate-200 px-2 py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, ri) => (
              <tr key={r.label} className={r.vals.includes(null) && rowOk(ri) ? 'bg-emerald-50' : ''}>
                <td className="border border-slate-200 px-2 py-1 font-sans font-semibold">{r.label}</td>
                {r.vals.map((v, ci) => (
                  <td key={ci} className="border border-slate-200 px-1 py-0.5 text-center">
                    {v === null ? (
                      <input
                        inputMode="numeric"
                        className="w-16 rounded bg-yellow-100 px-1 py-0.5 text-center outline-none focus:ring-2 focus:ring-corp-blue"
                        value={vals[`${ri}:${ci}`] ?? ''}
                        onChange={(e) =>
                          setVals((x) => ({
                            ...x,
                            [`${ri}:${ci}`]: e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                          }))
                        }
                        aria-label={`${r.label} ${data.cols[ci]}`}
                        data-testid={`cell-${ri}-${ci}`}
                      />
                    ) : (
                      v
                    )}
                  </td>
                ))}
                <td className="border border-slate-200 px-2 py-1 text-center font-bold">
                  {r.total} {r.vals.includes(null) && rowOk(ri) && '✓'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-mist">
        Hint: missing value = Total − the other two months. No pivot tables were harmed.
      </p>
      <button
        className="btn btn-yellow self-center"
        disabled={!allFilled}
        onClick={() => submit(Object.fromEntries(blanks.map((b) => [b, Number(vals[b])])))}
        data-testid="excel-save"
      >
        💾 Save spreadsheet
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- ID scan

export function IdScanTask({
  data,
  submit,
  failures,
}: MinigameProps<{ name: string; title: string; code: string }>) {
  const area = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 110, y: 112 });
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [hold, setHold] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (failures) {
      setCode('');
    }
  }, [failures]);
  const inZone = Math.abs(pos.x - 400) < 48 && Math.abs(pos.y - 108) < 42;
  useEffect(() => {
    if (scanned) return;
    if (!inZone || !drag) {
      setHold(0);
      return;
    }
    const id = setInterval(() => {
      setHold((h) => {
        const n = h + 0.1;
        if (n >= 1) {
          setScanned(true);
          sfx('beep');
        }
        return Math.min(1, n);
      });
    }, 150);
    return () => clearInterval(id);
  }, [inZone, drag, scanned]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={area}
        className="relative h-[220px] w-[520px] touch-none overflow-hidden rounded-2xl bg-[#1a2033] ring-1 ring-white/10"
        onPointerMove={(e) => {
          if (!drag || scanned) return;
          const r = area.current!.getBoundingClientRect();
          setPos({ x: e.clientX - r.left - drag.dx, y: e.clientY - r.top - drag.dy });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {/* scanner */}
        <div
          className={`absolute top-6 right-6 flex h-44 w-48 flex-col items-center justify-center rounded-2xl border-4 ${scanned ? 'border-corp-mint' : inZone ? 'border-corp-yellow' : 'border-white/20'} bg-[#0f1424]`}
        >
          <div className="text-xs font-bold text-mist">PLACE BADGE HERE</div>
          <div className="mt-2 h-20 w-32 rounded-lg border-2 border-dashed border-corp-cyan/50" />
          <div className="mt-2 h-2 w-32 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-corp-cyan transition-all" style={{ width: `${hold * 100}%` }} />
          </div>
          {!scanned && (
            <div
              className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 bg-corp-red/70 shadow-[0_0_10px_#ef3e4a]"
              style={{ animation: 'float-y 1.4s ease-in-out infinite' }}
            />
          )}
        </div>
        {/* badge */}
        <div
          className={`absolute h-24 w-36 cursor-grab rounded-xl bg-white p-2 text-ink shadow-2xl active:cursor-grabbing ${scanned ? 'opacity-60' : ''}`}
          style={{ left: pos.x - 72, top: pos.y - 48, transform: `rotate(${drag ? 0 : -4}deg)` }}
          onPointerDown={(e) => {
            if (scanned) return;
            const r = area.current!.getBoundingClientRect();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDrag({ dx: e.clientX - r.left - pos.x, dy: e.clientY - r.top - pos.y });
          }}
          data-testid="badge"
        >
          <div className="h-2.5 rounded bg-corp-purple" />
          <div className="mt-1 flex gap-2">
            <div className="h-12 w-10 rounded bg-slate-200 text-center text-2xl leading-[3rem]">🙂</div>
            <div className="min-w-0 text-[10px] leading-tight">
              <div className="font-bold">{data.name}</div>
              <div className="text-slate-500">{data.title}</div>
              <div className="mt-1 font-mono text-xs font-bold">ID #{data.code}</div>
            </div>
          </div>
        </div>
      </div>
      {scanned ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ code, scanned: true });
          }}
        >
          <span className="text-sm text-mist">Badge read. Enter the employee number to confirm:</span>
          <input
            className="input font-mono w-28 text-center text-lg"
            value={code}
            maxLength={4}
            inputMode="numeric"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            aria-label="Employee number"
            data-testid="badge-code"
          />
          <button
            className="btn btn-yellow btn-sm"
            type="submit"
            disabled={code.length !== 4}
            data-testid="badge-verify"
          >
            Verify
          </button>
        </form>
      ) : (
        <p className="text-sm text-mist">Drag the badge onto the scanner and hold it steady.</p>
      )}
    </div>
  );
}
