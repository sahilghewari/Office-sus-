import { useState } from 'react';
import {
  ACCESSORIES,
  CHARACTER_COLORS,
  HAIRSTYLES,
  HAIR_COLORS,
  NameSchema,
  OUTFITS,
  SHIRT_COLORS,
  SKIN_TONES,
  type Appearance,
} from '@corp/shared';
import { Avatar } from '../components/Avatar';
import { useSession } from '../stores/session';
import { sfx } from '../audio/audio';
import { api } from '../networking/api';

type Tab = 'color' | 'outfit' | 'hair' | 'accessory' | 'skin';

const FUNNY_NAMES = [
  'Synergy Sam',
  'Deck Daria',
  'KPI Kevin',
  'Intern Ian',
  'Pivot Pat',
  'Agile Ali',
  'Q4 Quinn',
  'Memo Mia',
];

/** Character creator. Used as a full screen and inside the lobby. */
export function CustomizePanel({
  onDone,
  doneLabel = 'Save & Continue',
  takenColors = [],
}: {
  onDone: () => void;
  doneLabel?: string;
  takenColors?: string[];
}) {
  const session = useSession();
  const [name, setName] = useState(session.name);
  const [a, setA] = useState<Appearance>(session.appearance);
  const [tab, setTab] = useState<Tab>('color');
  const [err, setErr] = useState<string | null>(null);
  const upd = (p: Partial<Appearance>) => {
    sfx('click');
    setA((x) => ({ ...x, ...p }));
  };
  const randomize = () => {
    const r = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
    const free = CHARACTER_COLORS.filter((c) => !takenColors.includes(c.id));
    setA({
      color: r(free.length ? free : CHARACTER_COLORS).id,
      shirt: r(SHIRT_COLORS).id,
      skin: r(SKIN_TONES).id,
      hair: r(HAIRSTYLES).id,
      hairColor: r(HAIR_COLORS).id,
      outfit: r(OUTFITS).id,
      accessory: r(ACCESSORIES).id,
    });
    if (!name) setName(r(FUNNY_NAMES));
    sfx('open');
  };
  const save = () => {
    const parsed = NameSchema.safeParse(name);
    if (!parsed.success) {
      setErr('Pick a name of 2–16 letters, numbers or spaces.');
      sfx('error');
      return;
    }
    session.setProfile(parsed.data, a);
    if (session.kind === 'user') void api.saveAppearance(a).catch(() => {});
    sfx('taskDone');
    onDone();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'color', label: 'Colours' },
    { id: 'outfit', label: 'Outfit' },
    { id: 'hair', label: 'Hair' },
    { id: 'accessory', label: 'Accessory' },
    { id: 'skin', label: 'Skin' },
  ];

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 md:flex-row">
      <div className="panel flex flex-col items-center gap-4 p-6 md:w-72">
        <div className="relative flex h-60 w-full items-end justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_70%,#34419a,#141a3d)]">
          <div className="absolute bottom-6 h-6 w-36 rounded-[50%] bg-black/30 blur-sm" />
          <div className="anim-bob relative">
            <Avatar appearance={a} size={150} expression="happy" />
          </div>
        </div>
        <label className="w-full">
          <span className="mb-1 block text-xs font-bold tracking-widest text-mist/70 uppercase">
            Your name
          </span>
          <input
            className="input font-display text-lg"
            value={name}
            maxLength={16}
            placeholder="e.g. Synergy Sam"
            onChange={(e) => {
              setName(e.target.value);
              setErr(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            data-testid="name-input"
            autoFocus
          />
        </label>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex w-full gap-2">
          <button className="btn btn-ghost flex-1" onClick={randomize}>
            🎲 Random
          </button>
          <button className="btn btn-yellow flex-[2]" onClick={save} data-testid="save-profile">
            {doneLabel}
          </button>
        </div>
      </div>

      <div className="panel flex-1 p-5">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`font-display rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-corp-blue text-white shadow-lg' : 'bg-white/5 text-mist hover:bg-white/10'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'color' && (
          <div className="space-y-5">
            <Section title="Character colour (your jacket — must be unique in a lobby)">
              <div className="grid grid-cols-6 gap-2">
                {CHARACTER_COLORS.map((c) => {
                  const taken = takenColors.includes(c.id) && c.id !== session.appearance.color;
                  return (
                    <button
                      key={c.id}
                      disabled={taken}
                      title={taken ? `${c.name} (taken)` : c.name}
                      aria-label={c.name}
                      onClick={() => upd({ color: c.id })}
                      className={`relative h-12 rounded-xl border-2 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-25 ${a.color === c.id ? 'border-white ring-4 ring-corp-cyan/40' : 'border-white/10'}`}
                      style={{ background: c.hex }}
                    >
                      {taken && (
                        <span className="absolute inset-0 flex items-center justify-center text-lg">✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
            <Section title="Shirt colour">
              <div className="grid grid-cols-8 gap-2">
                {SHIRT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.id}
                    onClick={() => upd({ shirt: c.id })}
                    className={`h-10 rounded-lg border-2 ${a.shirt === c.id ? 'border-white ring-4 ring-corp-cyan/40' : 'border-white/10'}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}
        {tab === 'outfit' && (
          <Grid>
            {OUTFITS.map((o) => (
              <Option
                key={o.id}
                active={a.outfit === o.id}
                onClick={() => upd({ outfit: o.id })}
                label={o.name}
              >
                <Avatar appearance={{ ...a, outfit: o.id }} size={56} />
              </Option>
            ))}
          </Grid>
        )}
        {tab === 'hair' && (
          <div className="space-y-5">
            <Grid>
              {HAIRSTYLES.map((h) => (
                <Option
                  key={h.id}
                  active={a.hair === h.id}
                  onClick={() => upd({ hair: h.id })}
                  label={h.name}
                >
                  <Avatar appearance={{ ...a, hair: h.id }} size={56} />
                </Option>
              ))}
            </Grid>
            <Section title="Hair colour">
              <div className="flex gap-2">
                {HAIR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    aria-label={c.id}
                    onClick={() => upd({ hairColor: c.id })}
                    className={`h-10 w-10 rounded-full border-2 ${a.hairColor === c.id ? 'border-white ring-4 ring-corp-cyan/40' : 'border-white/10'}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}
        {tab === 'accessory' && (
          <Grid>
            {ACCESSORIES.map((o) => (
              <Option
                key={o.id}
                active={a.accessory === o.id}
                onClick={() => upd({ accessory: o.id })}
                label={o.name}
              >
                <Avatar appearance={{ ...a, accessory: o.id }} size={56} />
              </Option>
            ))}
          </Grid>
        )}
        {tab === 'skin' && (
          <Grid>
            {SKIN_TONES.map((s) => (
              <Option key={s.id} active={a.skin === s.id} onClick={() => upd({ skin: s.id })} label="">
                <Avatar appearance={{ ...a, skin: s.id }} size={56} />
              </Option>
            ))}
          </Grid>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold tracking-widest text-mist/70 uppercase">{title}</h3>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{children}</div>;
}
function Option({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center rounded-2xl border-2 p-2 transition hover:-translate-y-0.5 ${active ? 'border-corp-cyan bg-corp-cyan/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
    >
      {children}
      {label && <span className="mt-1 text-center text-xs font-semibold text-mist">{label}</span>}
    </button>
  );
}

export function CustomizeScreen({ onDone }: { onDone: () => void }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_top,#2b2f7a,#0b0f2b)] p-6">
      <div className="bg-grid absolute inset-0 opacity-50" />
      <div className="relative flex w-full flex-col items-center gap-4">
        <h2 className="font-display text-shadow-hard text-4xl font-bold">Dress for the job you want</h2>
        <p className="text-mist">HR has approved these outfits. Mostly.</p>
        <CustomizePanel onDone={onDone} />
      </div>
    </div>
  );
}
