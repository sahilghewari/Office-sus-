import { pick, randInt, sample, shuffle, type Rng } from './rng';

/**
 * Task minigames. The server generates every puzzle (public `data` + private `key`),
 * sends only `data` to the client, and verifies the submitted answer against `key`.
 * A client can never just claim "task completed".
 */

export type TaskType =
  | 'wifi'
  | 'expense'
  | 'coffee'
  | 'printer'
  | 'meeting'
  | 'files'
  | 'emails'
  | 'server'
  | 'excel'
  | 'idscan';

export const TASK_TYPES: TaskType[] = ['wifi', 'expense', 'coffee', 'printer', 'meeting', 'files', 'emails', 'server', 'excel', 'idscan'];

export interface TaskInfo {
  type: TaskType;
  title: string;
  instructions: string;
  /** Server rejects completions faster than this (anti-instant-complete). */
  minMs: number;
}

export const TASK_INFO: Record<TaskType, TaskInfo> = {
  wifi: { type: 'wifi', title: 'Fix the Wi-Fi', instructions: 'Drag each cable to the port of the same colour.', minMs: 2500 },
  expense: { type: 'expense', title: 'Submit Expense Reports', instructions: 'File every receipt under the right expense category.', minMs: 3000 },
  coffee: { type: 'coffee', title: 'Make Coffee', instructions: 'Read the order ticket, check the recipe card and brew it exactly.', minMs: 3500 },
  printer: { type: 'printer', title: 'Fix the Printer', instructions: 'Open the panel, clear every jam, replace the cartridge if needed, close and restart.', minMs: 3000 },
  meeting: { type: 'meeting', title: 'Attend a Meeting', instructions: 'Mark attendance, pick the agenda, sort action items and assign an owner.', minMs: 3500 },
  files: { type: 'files', title: 'Organize Files', instructions: 'Drag every document into the folder that matches its file type.', minMs: 2500 },
  emails: { type: 'emails', title: 'Respond to Emails', instructions: 'Sort each email into Urgent, Reply, Archive or Spam.', minMs: 3000 },
  server: { type: 'server', title: 'Fix the Server', instructions: 'Boot the modules in the order on the sticky note. Wrong order = reboot.', minMs: 2500 },
  excel: { type: 'excel', title: 'Complete Excel Sheets', instructions: 'Fill the empty cells so every row adds up to its total.', minMs: 3000 },
  idscan: { type: 'idscan', title: 'Scan Employee ID', instructions: 'Drag your badge onto the scanner, hold it steady, then type the employee number.', minMs: 3000 },
};

export interface Puzzle {
  type: TaskType;
  data: any;
  key: any;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CABLE_COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];

const RECEIPTS: { vendor: string; item: string; cat: 'travel' | 'meals' | 'supplies' | 'software' }[] = [
  { vendor: 'SkyHop Airlines', item: 'Flight to "strategy offsite" (beach)', cat: 'travel' },
  { vendor: 'UberLux', item: 'Ride to the office, 400 m away', cat: 'travel' },
  { vendor: 'Hotel Synergy', item: '2 nights, minibar not included (allegedly)', cat: 'travel' },
  { vendor: 'TrainCo', item: 'Off-peak return ticket', cat: 'travel' },
  { vendor: 'Burrito Barn', item: 'Team lunch for "alignment"', cat: 'meals' },
  { vendor: 'Café Disrupt', item: '14 oat flat whites', cat: 'meals' },
  { vendor: 'Pizza Pivot', item: 'Late-night deploy pizza', cat: 'meals' },
  { vendor: 'Sushi Sprint', item: 'Client dinner (client never showed)', cat: 'meals' },
  { vendor: 'PaperCorp', item: '3 boxes of sticky notes', cat: 'supplies' },
  { vendor: 'DeskDepot', item: 'Ergonomic stapler', cat: 'supplies' },
  { vendor: 'InkWorld', item: 'Printer cartridge (the cyan one)', cat: 'supplies' },
  { vendor: 'Whiteboard Warehouse', item: 'Markers that actually work', cat: 'supplies' },
  { vendor: 'SlackOverflow Pro', item: 'Chat app annual seat', cat: 'software' },
  { vendor: 'CloudyDB', item: 'Database credits', cat: 'software' },
  { vendor: 'PixelForge', item: 'Design tool licence', cat: 'software' },
  { vendor: 'TaskTrackr', item: 'Project tracker nobody updates', cat: 'software' },
];
export const EXPENSE_CATEGORIES = ['travel', 'meals', 'supplies', 'software'] as const;

export const COFFEE_INGREDIENTS = ['espresso', 'milk', 'foam', 'water', 'ice', 'sugar', 'syrup'] as const;
type Ingredient = (typeof COFFEE_INGREDIENTS)[number];
const RECIPES: { name: string; base: Partial<Record<Ingredient, number>> }[] = [
  { name: 'Espresso', base: { espresso: 1 } },
  { name: 'Doppio', base: { espresso: 2 } },
  { name: 'Americano', base: { espresso: 1, water: 2 } },
  { name: 'Latte', base: { espresso: 1, milk: 2 } },
  { name: 'Cappuccino', base: { espresso: 1, milk: 1, foam: 1 } },
  { name: 'Flat White', base: { espresso: 2, milk: 1 } },
  { name: 'Iced Americano', base: { espresso: 1, water: 1, ice: 2 } },
];
const COFFEE_CUSTOMERS = ['Your Manager', 'The Intern', 'Legal', 'The CEO', 'Brenda from Accounts', 'A Visiting Investor', 'Facilities'];

const ATTENDEES = ['Priya', 'Marcus', 'Chen', 'Olu', 'Sofia', 'Dmitri', 'Aisha', 'Tomás', 'Hana', 'Rahul'];
const MEETINGS: { title: string; agendas: [string, string, string] }[] = [
  { title: 'Q3 Synergy Sync', agendas: ['Synergy roadmap & KPIs', 'Office plant watering rota', 'Fantasy football draft'] },
  { title: 'Pre-Meeting Planning Meeting', agendas: ['Plan the meeting about the meeting', 'Approve snack budget', 'Rename the Slack channel again'] },
  { title: 'Culture Deck Review', agendas: ['Values slide font size', 'Server migration', 'Parking lot repainting'] },
  { title: 'Retro of the Retro', agendas: ['What went wrong in the last retro', 'New coffee beans', 'Holiday party venue'] },
  { title: 'All-Hands Rehearsal', agendas: ['Practise clapping on cue', 'Fix the printer', 'Expense policy updates'] },
];
const ACTION_ITEMS = [
  'Circle back on the circle-back',
  'Take this offline',
  'Align on the alignment doc',
  'Socialise the deck',
  'Double-click on the data',
  'Boil the ocean (partially)',
  'Move the needle 2 mm',
  'Put a pin in it',
];

const FILE_TYPES: { ext: string; folder: 'Documents' | 'Spreadsheets' | 'Images' | 'Slides' }[] = [
  { ext: 'docx', folder: 'Documents' },
  { ext: 'pdf', folder: 'Documents' },
  { ext: 'txt', folder: 'Documents' },
  { ext: 'xlsx', folder: 'Spreadsheets' },
  { ext: 'csv', folder: 'Spreadsheets' },
  { ext: 'png', folder: 'Images' },
  { ext: 'jpg', folder: 'Images' },
  { ext: 'gif', folder: 'Images' },
  { ext: 'pptx', folder: 'Slides' },
  { ext: 'key', folder: 'Slides' },
];
const FILE_STEMS = [
  'final_FINAL_v7',
  'q3_numbers_real',
  'org_chart_dont_share',
  'team_photo_blurry',
  'pitch_deck_series_z',
  'budget_(copy)(2)',
  'meme_for_allhands',
  'notes_from_offsite',
  'performance_review_template',
  'logo_new_new',
  'synergy_metrics',
  'expense_policy_2019',
];
export const FILE_FOLDERS = ['Documents', 'Spreadsheets', 'Images', 'Slides'] as const;

const EMAILS: { from: string; subject: string; body: string; cat: 'urgent' | 'reply' | 'archive' | 'spam' }[] = [
  { from: 'CEO', subject: 'URGENT: Server is on fire (literally)', body: 'Someone please find the extinguisher. And a new server.', cat: 'urgent' },
  { from: 'Legal', subject: 'Contract expires in 2 hours', body: 'Sign before 5pm or we lose the client.', cat: 'urgent' },
  { from: 'IT Security', subject: 'Your password was leaked', body: 'Reset it now. Yes, "password123" counts.', cat: 'urgent' },
  { from: 'Payroll', subject: 'Salary run failed!!', body: 'Nobody gets paid unless this is fixed today.', cat: 'urgent' },
  { from: 'Marcus (Design)', subject: 'Quick question about the logo', body: 'Is it the blue blue or the other blue?', cat: 'reply' },
  { from: 'Your Manager', subject: 'Can you join a call?', body: 'Just 5 minutes (it will be 90 minutes).', cat: 'reply' },
  { from: 'Recruiting', subject: 'Interview feedback needed', body: 'How did the candidate do? Be honest-ish.', cat: 'reply' },
  { from: 'Priya (Sales)', subject: 'Client wants a demo Thursday', body: 'Are you free? Please say yes.', cat: 'reply' },
  { from: 'Facilities', subject: 'Newsletter: The Plant Edition', body: 'Meet Gerald, our new ficus.', cat: 'archive' },
  { from: 'HR', subject: 'Reminder: Mandatory Fun Friday', body: 'Attendance is optional. Attendance is tracked.', cat: 'archive' },
  { from: 'Calendar', subject: 'Accepted: Sync about syncing', body: 'Your meeting has been accepted by everyone except you.', cat: 'archive' },
  { from: 'Office Bot', subject: 'Weekly digest', body: '47 messages in #random you will never read.', cat: 'archive' },
  { from: 'Prince of Synergia', subject: 'You won 1,000,000 equity points!!', body: 'Send your badge number to claim.', cat: 'spam' },
  { from: 'NotABank', subject: 'Verify your acount immediatly', body: 'Click here for free crypto and a pony.', cat: 'spam' },
  { from: 'WebinarBlaster', subject: 'Last chance: 10x your 10x', body: 'Thought-leader masterclass, only $999.', cat: 'spam' },
  { from: 'Mystery Vendor', subject: 'Re: Re: Fwd: Re: your invoice', body: 'Open attachment invoice.pdf.exe', cat: 'spam' },
];
export const EMAIL_FOLDERS = ['urgent', 'reply', 'archive', 'spam'] as const;

const SERVER_MODULES = [
  { id: 'power', label: 'POWER' },
  { id: 'cooling', label: 'COOLING' },
  { id: 'storage', label: 'STORAGE' },
  { id: 'network', label: 'NETWORK' },
  { id: 'app', label: 'APP' },
];

const EXCEL_ROWS = ['Coffee', 'Snacks', 'Consultants', 'Bean bags', 'Team "building"', 'Neon signs', 'Ping-pong balls'];

const BADGE_NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Taylor Okafor', 'Casey Nguyen', 'Riley Patel'];
const BADGE_TITLES = ['Chief Vibes Officer', 'Junior Senior Analyst', 'Head of Heads', 'Synergy Lead', 'Intern (Eternal)', 'VP of Slides'];

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generatePuzzle(type: TaskType, rng: Rng): Puzzle {
  switch (type) {
    case 'wifi': {
      const colors = sample(rng, CABLE_COLORS, 4);
      const left = shuffle(rng, colors);
      const right = shuffle(rng, colors);
      return { type, data: { left, right }, key: { left, right } };
    }
    case 'expense': {
      // guarantee at least 3 categories present
      const byCat = EXPENSE_CATEGORIES.map((c) => RECEIPTS.filter((r) => r.cat === c));
      const chosen = shuffle(rng, byCat.map((list) => pick(rng, list))).slice(0, 3);
      const rest = sample(
        rng,
        RECEIPTS.filter((r) => !chosen.includes(r)),
        2,
      );
      const all = shuffle(rng, [...chosen, ...rest]);
      const receipts = all.map((r, i) => ({
        id: `r${i}`,
        vendor: r.vendor,
        item: r.item,
        amount: (randInt(rng, 400, 48000) / 100).toFixed(2),
      }));
      const key: Record<string, string> = {};
      all.forEach((r, i) => (key[`r${i}`] = r.cat));
      return { type, data: { receipts, categories: EXPENSE_CATEGORIES }, key };
    }
    case 'coffee': {
      const recipe = pick(rng, RECIPES);
      const want: Record<string, number> = {};
      for (const ing of COFFEE_INGREDIENTS) want[ing] = recipe.base[ing] ?? 0;
      const mods: string[] = [];
      const sugar = randInt(rng, 0, 2);
      if (sugar > 0) {
        want.sugar += sugar;
        mods.push(`${sugar} sugar${sugar > 1 ? 's' : ''}`);
      } else mods.push('no sugar');
      if (rng() < 0.4) {
        want.syrup += 1;
        mods.push('1 pump syrup');
      }
      if (rng() < 0.3 && !recipe.name.startsWith('Iced')) {
        want.ice += 1;
        mods.push('on ice');
      }
      return {
        type,
        data: {
          customer: pick(rng, COFFEE_CUSTOMERS),
          drink: recipe.name,
          mods,
          recipes: RECIPES.map((r) => ({ name: r.name, base: r.base })),
          ingredients: COFFEE_INGREDIENTS,
        },
        key: want,
      };
    }
    case 'printer': {
      const n = randInt(rng, 2, 4);
      const spots = sample(rng, [0, 1, 2, 3, 4, 5], n).map((s) => `jam${s}`);
      const cartridge = rng() < 0.6 ? pick(rng, ['cyan', 'magenta', 'yellow', 'black']) : null;
      return { type, data: { jams: spots, cartridge }, key: { jams: spots, cartridge } };
    }
    case 'meeting': {
      const m = pick(rng, MEETINGS);
      const people = sample(rng, ATTENDEES, 5).map((name) => ({ name, cameraOn: rng() < 0.55 }));
      if (!people.some((p) => p.cameraOn)) people[0].cameraOn = true;
      const items = sample(rng, ACTION_ITEMS, 3).map((text, i) => ({ id: `a${i}`, text, due: randInt(rng, 1, 28) }));
      // distinct due dates
      const used = new Set<number>();
      for (const it of items) {
        while (used.has(it.due)) it.due = (it.due % 28) + 1;
        used.add(it.due);
      }
      const volunteer = pick(rng, people.filter((p) => p.cameraOn)).name;
      const transcript = [
        `${pick(rng, people).name}: Can everyone see my screen?`,
        `${volunteer}: Sure, I'll own the follow-ups. Again.`,
        `${pick(rng, people).name}: Let's take that offline.`,
      ];
      const agendas = shuffle(rng, m.agendas);
      return {
        type,
        data: { title: m.title, people, agendas, items: shuffle(rng, items), transcript },
        key: {
          present: people.filter((p) => p.cameraOn).map((p) => p.name).sort(),
          agenda: m.agendas[0],
          order: items.slice().sort((a, b) => a.due - b.due).map((i) => i.id),
          owner: volunteer,
        },
      };
    }
    case 'files': {
      const types = shuffle(rng, FILE_TYPES);
      const stems = sample(rng, FILE_STEMS, 6);
      const files = stems.map((stem, i) => ({ id: `f${i}`, name: `${stem}.${types[i % types.length].ext}` }));
      const key: Record<string, string> = {};
      files.forEach((fl, i) => (key[fl.id] = types[i % types.length].folder));
      return { type, data: { files, folders: FILE_FOLDERS }, key };
    }
    case 'emails': {
      const byCat = EMAIL_FOLDERS.map((c) => EMAILS.filter((e) => e.cat === c));
      const chosen = byCat.map((list) => pick(rng, list));
      const extra = pick(
        rng,
        EMAILS.filter((e) => !chosen.includes(e)),
      );
      const list = shuffle(rng, [...chosen, extra]);
      const emails = list.map((e, i) => ({ id: `e${i}`, from: e.from, subject: e.subject, body: e.body }));
      const key: Record<string, string> = {};
      list.forEach((e, i) => (key[`e${i}`] = e.cat));
      return { type, data: { emails, folders: EMAIL_FOLDERS }, key };
    }
    case 'server': {
      const order = shuffle(
        rng,
        SERVER_MODULES.map((m) => m.id),
      );
      const layout = shuffle(rng, SERVER_MODULES);
      return { type, data: { modules: layout, note: order.map((id) => SERVER_MODULES.find((m) => m.id === id)!.label) }, key: { order } };
    }
    case 'excel': {
      const rows = sample(rng, EXCEL_ROWS, 4).map((label) => {
        const vals = [randInt(rng, 1, 60), randInt(rng, 1, 60), randInt(rng, 1, 60)];
        return { label, vals, total: vals[0] + vals[1] + vals[2] };
      });
      // blank 3 cells (never two in the same row)
      const rowIdx = sample(rng, [0, 1, 2, 3], 3);
      const blanks = rowIdx.map((r) => ({ r, c: randInt(rng, 0, 2) }));
      const key: Record<string, number> = {};
      const grid = rows.map((row, r) => ({
        label: row.label,
        total: row.total,
        vals: row.vals.map((v, c) => {
          const b = blanks.find((bb) => bb.r === r && bb.c === c);
          if (b) {
            key[`${r}:${c}`] = v;
            return null;
          }
          return v;
        }),
      }));
      return { type, data: { cols: ['Jan', 'Feb', 'Mar'], rows: grid }, key };
    }
    case 'idscan': {
      const code = String(randInt(rng, 1000, 9999));
      return {
        type,
        data: { name: pick(rng, BADGE_NAMES), title: pick(rng, BADGE_TITLES), code },
        key: { code },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Verification (never trust the client)
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function matchMap(answer: unknown, key: Record<string, unknown>): boolean {
  if (!isObj(answer)) return false;
  const keys = Object.keys(key);
  if (Object.keys(answer).length !== keys.length) return false;
  return keys.every((k) => answer[k] === key[k]);
}

export function verifyAnswer(p: Puzzle, answer: unknown): boolean {
  try {
    switch (p.type) {
      case 'wifi': {
        // answer: array of [leftIndex, rightIndex]
        if (!Array.isArray(answer) || answer.length !== p.key.left.length) return false;
        const usedL = new Set<number>();
        const usedR = new Set<number>();
        for (const pair of answer) {
          if (!Array.isArray(pair) || pair.length !== 2) return false;
          const [l, r] = pair;
          if (!Number.isInteger(l) || !Number.isInteger(r)) return false;
          if (usedL.has(l) || usedR.has(r)) return false;
          usedL.add(l);
          usedR.add(r);
          if (p.key.left[l] === undefined || p.key.left[l] !== p.key.right[r]) return false;
        }
        return true;
      }
      case 'expense':
      case 'files':
      case 'emails':
        return matchMap(answer, p.key);
      case 'coffee': {
        if (!isObj(answer)) return false;
        return COFFEE_INGREDIENTS.every((ing) => (Number(answer[ing]) || 0) === p.key[ing]) &&
          Object.keys(answer).every((k) => (COFFEE_INGREDIENTS as readonly string[]).includes(k));
      }
      case 'printer': {
        // answer: ordered action list
        if (!Array.isArray(answer) || answer.length > 20 || !answer.every((a) => typeof a === 'string')) return false;
        const acts = answer as string[];
        if (acts[0] !== 'open') return false;
        if (acts[acts.length - 1] !== 'restart' || acts[acts.length - 2] !== 'close') return false;
        const middle = acts.slice(1, -2);
        const removed = middle.filter((a) => a.startsWith('remove:')).map((a) => a.slice(7));
        if (removed.length !== p.key.jams.length || new Set(removed).size !== removed.length) return false;
        if (!p.key.jams.every((j: string) => removed.includes(j))) return false;
        const carts = middle.filter((a) => a.startsWith('cartridge:')).map((a) => a.slice(10));
        if (p.key.cartridge) {
          if (carts.length !== 1 || carts[0] !== p.key.cartridge) return false;
        } else if (carts.length) return false;
        return middle.every((a) => a.startsWith('remove:') || a.startsWith('cartridge:'));
      }
      case 'meeting': {
        if (!isObj(answer)) return false;
        const present = Array.isArray(answer.present) ? [...(answer.present as string[])].sort() : null;
        if (!present || present.join('|') !== p.key.present.join('|')) return false;
        if (answer.agenda !== p.key.agenda) return false;
        if (!Array.isArray(answer.order) || answer.order.join('|') !== p.key.order.join('|')) return false;
        return answer.owner === p.key.owner;
      }
      case 'server':
        return Array.isArray(answer) && answer.join('|') === p.key.order.join('|');
      case 'excel': {
        if (!isObj(answer)) return false;
        const keys = Object.keys(p.key);
        if (Object.keys(answer).length !== keys.length) return false;
        return keys.every((k) => Number(answer[k]) === p.key[k]);
      }
      case 'idscan':
        return isObj(answer) && answer.code === p.key.code && answer.scanned === true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Produces a correct answer from the private key. Used ONLY by tests and bots. */
export function solvePuzzle(p: Puzzle): unknown {
  switch (p.type) {
    case 'wifi':
      return p.key.left.map((c: string, i: number) => [i, p.key.right.indexOf(c)]);
    case 'expense':
    case 'files':
    case 'emails':
      return { ...p.key };
    case 'coffee':
      return { ...p.key };
    case 'printer':
      return ['open', ...p.key.jams.map((j: string) => `remove:${j}`), ...(p.key.cartridge ? [`cartridge:${p.key.cartridge}`] : []), 'close', 'restart'];
    case 'meeting':
      return { present: p.key.present, agenda: p.key.agenda, order: p.key.order, owner: p.key.owner };
    case 'server':
      return p.key.order;
    case 'excel':
      return { ...p.key };
    case 'idscan':
      return { code: p.key.code, scanned: true };
  }
}

// ---------------------------------------------------------------------------
// Electricity panel (sabotage repair puzzle)
// ---------------------------------------------------------------------------

export function generatePowerPuzzle(rng: Rng): Puzzle {
  const switches = Array.from({ length: 5 }, () => rng() < 0.5);
  if (switches.every(Boolean)) switches[randInt(rng, 0, 4)] = false;
  return { type: 'server' as TaskType, data: { switches }, key: { target: [true, true, true, true, true] } };
}
export function verifyPower(answer: unknown): boolean {
  return Array.isArray(answer) && answer.length === 5 && answer.every((v) => v === true);
}

// ---------------------------------------------------------------------------
// Solving from PUBLIC data only (what a human sees). Used by bots, load tests
// and automated playtests to prove every puzzle is solvable from the UI.
// ---------------------------------------------------------------------------

export function solveFromData(type: TaskType, data: any): unknown {
  switch (type) {
    case 'wifi':
      return data.left.map((c: string, i: number) => [i, data.right.indexOf(c)]);
    case 'expense': {
      const out: Record<string, string> = {};
      for (const r of data.receipts) out[r.id] = RECEIPTS.find((x) => x.vendor === r.vendor)!.cat;
      return out;
    }
    case 'coffee': {
      const recipe = data.recipes.find((r: any) => r.name === data.drink);
      const out: Record<string, number> = {};
      for (const ing of data.ingredients) out[ing] = recipe.base[ing] ?? 0;
      for (const m of data.mods as string[]) {
        const sugar = m.match(/^(\d) sugar/);
        if (sugar) out.sugar += Number(sugar[1]);
        if (m.includes('syrup')) out.syrup += 1;
        if (m === 'on ice') out.ice += 1;
      }
      return out;
    }
    case 'printer':
      return ['open', ...data.jams.map((j: string) => `remove:${j}`), ...(data.cartridge ? [`cartridge:${data.cartridge}`] : []), 'close', 'restart'];
    case 'meeting': {
      const m = MEETINGS.find((x) => x.title === data.title)!;
      const volunteer = (data.transcript as string[]).find((l) => l.includes("I'll own"))!.split(':')[0];
      return {
        present: data.people.filter((p: any) => p.cameraOn).map((p: any) => p.name),
        agenda: m.agendas[0],
        order: [...data.items].sort((a: any, b: any) => a.due - b.due).map((i: any) => i.id),
        owner: volunteer,
      };
    }
    case 'files': {
      const out: Record<string, string> = {};
      for (const f of data.files) out[f.id] = FILE_TYPES.find((t) => f.name.endsWith('.' + t.ext))!.folder;
      return out;
    }
    case 'emails': {
      const out: Record<string, string> = {};
      for (const e of data.emails) out[e.id] = EMAILS.find((x) => x.subject === e.subject)!.cat;
      return out;
    }
    case 'server':
      return (data.note as string[]).map((label) => data.modules.find((m: any) => m.label === label).id);
    case 'excel': {
      const out: Record<string, number> = {};
      data.rows.forEach((row: any, r: number) => {
        const known = row.vals.reduce((a: number, v: number | null) => a + (v ?? 0), 0);
        row.vals.forEach((v: number | null, c: number) => {
          if (v === null) out[`${r}:${c}`] = row.total - known;
        });
      });
      return out;
    }
    case 'idscan':
      return { code: data.code, scanned: true };
  }
}

/** The correct agenda for a meeting title (agenda options are shuffled in the UI). */
export function meetingAgendaFor(title: string): string | undefined {
  return MEETINGS.find((m) => m.title === title)?.agendas[0];
}
