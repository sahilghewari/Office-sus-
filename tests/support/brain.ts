import { SKIP, STATIONS, VENTS, pick, createRng } from '@corp/shared';
import { Bot, sleep } from './bot';

/**
 * Simple autonomous behaviour so a handful of bots can fill a lobby for
 * play-testing and load tests: ready up, do tasks, wander, fix sabotage,
 * vote (mostly skip), and — as a manager — occasionally sabotage/eliminate.
 */
export async function runBrain(bot: Bot, opts: { aggressive?: boolean; chatty?: boolean; seed?: number } = {}) {
  const rng = createRng(opts.seed ?? Math.floor(Math.random() * 1e9));
  let votedMeeting = '';
  while (!bot.closed) {
    const s = bot.state;
    if (!s) {
      await sleep(200);
      continue;
    }
    try {
      if (s.phase === 'WAITING') {
        const me = s.players.find((p) => p.id === bot.id);
        if (me && !me.ready && !s.you.isHost) bot.send({ t: 'ready', ready: true });
        if (rng() < 0.3) await bot.walkTo(14 + rng() * 9, 33 + rng() * 4, 4000);
        await sleep(800);
        continue;
      }
      if (s.phase === 'VOTING' && s.you.alive && !s.meeting?.myVote) {
        const key = `${s.meeting?.reporterId}-${s.phaseEndsAt}`;
        if (votedMeeting !== key) {
          votedMeeting = key;
          await sleep(500 + rng() * 2500);
          const others = s.players.filter((p) => !p.dead && p.id !== bot.id);
          const target = rng() < 0.6 || !others.length ? SKIP : pick(rng, others).id;
          bot.send({ t: 'vote', target });
        }
        await sleep(300);
        continue;
      }
      if (s.phase === 'DISCUSSION' && opts.chatty && s.you.alive && rng() < 0.012) {
        bot.send({ t: 'chat', text: pick(rng, ['I was in the cafeteria.', 'Not me, I was fixing the printer!', 'Skip?', 'That is exactly what a Toxic Manager would say.', 'Who called this meeting?']) });
      }
      if (s.phase !== 'ACTIVE') {
        await sleep(300);
        continue;
      }
      // ACTIVE
      if (s.sabotage && s.you.alive && rng() < 0.7) {
        const st = STATIONS.find((x) => x.kind === 'fix' && x.fix && s.sabotage!.pending.includes(x.fix));
        if (st) {
          if (st.fix === 'power') {
            await bot.walkTo(st.x, st.y, 15000);
            bot.send({ t: 'interact', station: st.id });
            await sleep(1700);
            bot.send({ t: 'fixSubmit', station: st.id, answer: [true, true, true, true, true] });
          } else await bot.hold(st.id, 3300);
          continue;
        }
      }
      if (s.you.role === 'manager' && s.you.alive) {
        const now = s.serverTime;
        if (opts.aggressive && s.you.sabotageReadyAt < now && !s.sabotage && rng() < 0.1) {
          bot.send({ t: 'sabotage', kind: pick(rng, ['wifi', 'power', 'cctv', 'doors', 'outage'] as const) });
        }
        if (opts.aggressive && s.you.killReadyAt < now && bot.snap) {
          const [x, y] = bot.me;
          const target = bot.snap.p.find((p) => p.a !== 2 && !s.you.teammates.includes(p.i) && Math.hypot(p.x - x, p.y - y) < 1.4);
          if (target) bot.send({ t: 'kill', target: target.i });
          else if (rng() < 0.4) {
            const near = bot.snap.p.filter((p) => p.a !== 2 && !s.you.teammates.includes(p.i));
            if (near.length) await bot.walkTo(near[0].x, near[0].y, 3000);
          }
        }
        if (rng() < 0.05) {
          const v = pick(rng, VENTS);
          await bot.walkTo(v.x, v.y, 8000);
        }
      }
      const todo = s.you.tasks.find((t) => !t.done);
      if (todo && (s.you.alive || s.you.role === 'employee')) {
        await bot.doTask(todo.stationId);
      } else {
        const st = pick(rng, STATIONS);
        await bot.walkTo(st.x, st.y, 8000);
      }
      // report bodies we stumble upon
      if (bot.snap?.b.length && s.you.alive) {
        const b = bot.snap.b[0];
        const [x, y] = bot.me;
        if (Math.hypot(b.x - x, b.y - y) < 2) bot.send({ t: 'report', body: b.id });
      }
    } catch {
      await sleep(300);
    }
  }
}
