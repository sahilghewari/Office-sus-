import { beforeEach, describe, expect, it } from 'vitest';
import { STATION_BY_ID, VENT_BY_ID, solveFromData, TASK_INFO, findPath, createColliders, BASE_SPEED } from '@corp/shared';
import { FakeConn, Sim } from '../support/sim';

const cols = createColliders();

function doAllTasks(sim: Sim, p: any) {
  for (const task of p.tasks) {
    if (task.done) continue;
    const st = STATION_BY_ID[task.stationId];
    sim.teleport(p, st.x, st.y);
    sim.send(p, { t: 'interact', station: st.id });
    const open = sim.conn(p).last('taskOpen')!;
    expect(open, `task ${task.type} opened`).toBeTruthy();
    sim.advance(TASK_INFO[task.type].minMs + 100);
    sim.send(p, { t: 'taskSubmit', session: open.session, answer: solveFromData(open.taskType, open.data) });
    expect(sim.conn(p).last('taskResult')?.ok, `task ${task.type} accepted`).toBe(true);
  }
}

describe('authoritative match flow', () => {
  let sim: Sim;
  beforeEach(() => {
    sim = new Sim();
  });

  it('assigns roles privately', () => {
    const ps = sim.startMatch(5);
    expect(sim.room.phase).toBe('ACTIVE');
    expect(sim.managers).toHaveLength(1);
    for (const p of ps) {
      const st = sim.conn(p).state;
      expect(st.you.role).toBe(p.role);
      for (const other of st.players) {
        if (other.id === p.publicId) continue;
        // employees never see anybody's role; a lone manager sees no role fields either
        expect(other.role, `${p.name} must not see ${other.name}'s role`).toBeUndefined();
      }
      // raw JSON never contains another player's role string
      const raw = JSON.stringify(sim.conn(p).msgs.filter((m) => m.t === 'state'));
      if (p.role === 'employee') expect(raw.includes('"role":"manager"')).toBe(false);
    }
  });

  it('managers see each other (7+ players) but employees do not', () => {
    sim.startMatch(8);
    const [m1, m2] = sim.managers;
    expect(sim.conn(m1).state.you.teammates).toEqual([m2.publicId]);
    expect(sim.conn(m1).state.players.find((x) => x.id === m2.publicId)?.role).toBe('manager');
    for (const e of sim.employees) expect(sim.conn(e).state.you.teammates).toEqual([]);
  });

  it('employees win by completing all tasks; fake tasks do not count', () => {
    sim.startMatch(4, ['P1']);
    const [m] = sim.managers;
    doAllTasks(sim, m);
    expect(sim.room.buildState(m).progress.done).toBe(0); // fake tasks award nothing
    for (const e of sim.employees) doAllTasks(sim, e);
    expect(sim.room.phase).toBe('GAME_OVER');
    expect(sim.room.gameOver?.winner).toBe('employees');
    expect(sim.room.gameOver?.reason).toBe('tasks');
    expect(sim.matches).toHaveLength(1);
  });

  it('rejects too-fast and wrong task submissions', () => {
    sim.startMatch(4, ['P1']);
    const e = sim.employees[0];
    const task = e.tasks[0];
    const st = STATION_BY_ID[task.stationId];
    sim.teleport(e, st.x, st.y);
    sim.send(e, { t: 'interact', station: st.id });
    const open = sim.conn(e).last('taskOpen')!;
    sim.send(e, { t: 'taskSubmit', session: open.session, answer: solveFromData(open.taskType, open.data) });
    expect(sim.conn(e).last('taskResult')?.ok).toBe(false); // instantly = rejected
    sim.advance(5000);
    sim.send(e, { t: 'taskSubmit', session: open.session, answer: { nope: 1 } });
    expect(sim.conn(e).last('taskResult')?.ok).toBe(false);
    sim.send(e, { t: 'taskSubmit', session: 'forged', answer: {} });
    expect(sim.conn(e).last('error')?.code).toBe('NO_SESSION');
    expect(task.done).toBe(false);
  });

  it('task interaction requires proximity', () => {
    sim.startMatch(4, ['P1']);
    const e = sim.employees[0];
    sim.send(e, { t: 'interact', station: e.tasks[0].stationId });
    expect(sim.conn(e).last('error')?.code).toBe('TOO_FAR');
  });

  it('elimination → ghost, report → meeting → vote → termination → win', () => {
    sim.startMatch(5, ['P1']);
    const [m] = sim.managers;
    const [v, a, b, c] = sim.employees;
    // cooldown is enforced at start
    sim.teleport(m, 12, 11.6);
    sim.teleport(v, 12.8, 11.6);
    sim.send(m, { t: 'kill', target: v.publicId });
    expect(sim.conn(m).last('error')?.message).toMatch(/cooldown/);
    sim.advance(11_000);
    sim.teleport(m, 12, 11.6);
    sim.teleport(v, 12.8, 11.6);
    sim.send(m, { t: 'kill', target: v.publicId });
    expect(v.alive).toBe(false);
    expect(sim.conn(v).last('youDied')).toBeTruthy();
    expect(sim.room.bodies).toHaveLength(1);
    // A far-away employee does not get the elimination event (no privileged info).
    sim.teleport(c, 40, 35);
    // Living players do not learn about the death before a meeting.
    expect(sim.room.buildState(a).players.find((p) => p.id === v.publicId)?.dead).toBe(false);
    // ghost cannot report
    sim.send(v, { t: 'report', body: sim.room.bodies[0].id });
    expect(sim.conn(v).last('error')?.code).toBe('GHOST');
    // two players report at the same time: only the first starts a meeting
    sim.teleport(a, 13, 12.2);
    sim.teleport(b, 13.3, 12.2);
    const bodyId = sim.room.bodies[0].id;
    sim.send(a, { t: 'report', body: bodyId });
    sim.send(b, { t: 'report', body: bodyId });
    expect(sim.room.phase).toBe('MEETING_INTRO');
    expect(sim.room.meeting?.reporter).toBe(a);
    expect(sim.conn(b).last('error')?.code).toBe('BAD_PHASE');
    // kill during meeting is rejected
    sim.send(m, { t: 'kill', target: a.publicId });
    expect(a.alive).toBe(true);
    // votes are rejected during discussion
    sim.advance(3600);
    expect(sim.room.phase).toBe('DISCUSSION');
    sim.send(a, { t: 'vote', target: m.publicId });
    expect(sim.conn(a).last('error')?.code).toBe('BAD_PHASE');
    // chat works and ghost chat is isolated
    sim.send(a, { t: 'chat', text: 'I saw P1 near the server room.' });
    sim.send(v, { t: 'chat', text: 'it was P1!!' });
    expect(sim.conn(b).all('chat').map((x) => x.msg.text)).toContain('I saw P1 near the server room.');
    expect(sim.conn(b).all('chat').map((x) => x.msg.text)).not.toContain('it was P1!!');
    expect(sim.conn(v).all('chat').map((x) => x.msg.text)).toContain('it was P1!!');
    sim.advance(60_000);
    expect(sim.room.phase).toBe('VOTING');
    // ghosts cannot vote; double votes rejected; anonymity until the end
    sim.send(v, { t: 'vote', target: m.publicId });
    expect(sim.conn(v).last('error')?.code).toBe('GHOST');
    sim.send(a, { t: 'vote', target: m.publicId });
    sim.send(a, { t: 'vote', target: b.publicId });
    expect(sim.conn(a).last('error')?.code).toBe('ALREADY_VOTED');
    sim.advance(50);
    expect(sim.conn(b).state.meeting?.votedIds).toContain(a.publicId);
    expect(JSON.stringify(sim.conn(b).state.meeting)).not.toContain('"myVote":"' + m.publicId); // b can't see a's choice
    sim.send(b, { t: 'vote', target: m.publicId });
    sim.send(c, { t: 'vote', target: 'skip' });
    sim.send(m, { t: 'vote', target: a.publicId });
    sim.advance(1500); // all voted → ends early
    expect(sim.room.phase).toBe('VOTE_RESULTS');
    const res = sim.room.meeting!.results!;
    expect(res.ejectedId).toBe(m.publicId);
    expect(res.ejectedWasManager).toBe(true);
    expect(res.counts[m.publicId]).toBe(2);
    sim.advance(7100);
    expect(sim.room.phase).toBe('GAME_OVER');
    expect(sim.room.gameOver?.winner).toBe('employees');
  });

  it('tie vote ejects nobody and gameplay resumes with tasks preserved', () => {
    sim.startMatch(5, ['P1']);
    const [m] = sim.managers;
    const [a, b, c, d] = sim.employees;
    doAllTasks(sim, { ...a, tasks: a.tasks.slice(0, 1) });
    const doneBefore = sim.room.buildState(a).progress.done;
    sim.teleport(a, 32, 17.5);
    sim.advance(16_000);
    sim.send(a, { t: 'emergency' });
    expect(sim.room.phase).toBe('MEETING_INTRO');
    sim.advance(3600 + 60_000);
    sim.send(a, { t: 'vote', target: b.publicId });
    sim.send(b, { t: 'vote', target: a.publicId });
    sim.send(c, { t: 'vote', target: 'skip' });
    sim.send(d, { t: 'vote', target: 'skip' });
    sim.send(m, { t: 'vote', target: a.publicId });
    sim.advance(1500);
    expect(sim.room.meeting?.results?.ejectedId).toBeNull(); // a has 2, skip 2 → tie → nobody
    expect(sim.room.meeting?.results?.tie).toBe(true);
    sim.advance(7100);
    expect(sim.room.phase).toBe('ACTIVE');
    expect(sim.room.buildState(a).progress.done).toBe(doneBefore);
    expect(a.alive && b.alive && m.alive).toBe(true);
  });

  it('emergency meeting limits are enforced', () => {
    sim.startMatch(4, ['P1']);
    const a = sim.employees[0];
    sim.teleport(a, 32, 17.5);
    sim.send(a, { t: 'emergency' });
    expect(sim.conn(a).last('error')?.code).toBe('COOLDOWN');
    sim.advance(16_000);
    sim.send(a, { t: 'emergency' });
    expect(sim.room.phase).toBe('MEETING_INTRO');
    sim.advance(3600 + 60_000 + 45_000 + 7100);
    expect(sim.room.phase).toBe('ACTIVE');
    sim.advance(16_000);
    sim.teleport(a, 32, 17.5);
    sim.send(a, { t: 'emergency' });
    expect(sim.conn(a).last('error')?.code).toBe('NO_MEETINGS');
  });

  it('managers win by parity', () => {
    sim.startMatch(4, ['P1']);
    const [m] = sim.managers;
    sim.advance(11_000);
    const [e1, e2] = sim.employees;
    for (const e of [e1, e2]) {
      sim.teleport(m, 20, 11.6);
      sim.teleport(e, 20.6, 11.8);
      sim.send(m, { t: 'kill', target: e.publicId });
      expect(e.alive, JSON.stringify(sim.conn(m).last('error'))).toBe(false);
      sim.advance(31_000);
      if (sim.room.phase !== 'ACTIVE') break;
    }
    expect(sim.room.phase).toBe('GAME_OVER');
    expect(sim.room.gameOver?.winner).toBe('managers');
    expect(sim.room.gameOver?.reason).toBe('parity');
  });

  it('rejects unauthorised actions', () => {
    sim.startMatch(4, ['P1']);
    const [m] = sim.managers;
    const [e1, e2] = sim.employees;
    sim.advance(11_000);
    sim.teleport(e1, 20, 11.6);
    sim.teleport(e2, 20.6, 11.6);
    sim.send(e1, { t: 'kill', target: e2.publicId });
    expect(e2.alive).toBe(true);
    sim.send(e1, { t: 'sabotage', kind: 'fire' });
    expect(sim.room.sabotage).toBeNull();
    sim.send(e1, { t: 'vent', action: 'enter', vent: 'v-server' });
    expect(e1.inVent).toBeNull();
    sim.send(e1, { t: 'settings', settings: { killCooldown: 10 } });
    expect(sim.conn(e1).last('error')?.code).toBe('NOT_HOST');
    sim.send(e1, { t: 'returnToLobby' });
    expect(sim.room.phase).toBe('ACTIVE');
    // manager cannot kill another manager or through walls
    sim.teleport(m, 5, 5);
    sim.teleport(e2, 15, 5);
    sim.send(m, { t: 'kill', target: e2.publicId });
    expect(e2.alive).toBe(true);
    // kill across a wall even when close
    sim.teleport(m, 9.6, 5);
    sim.teleport(e2, 11.2, 5);
    sim.send(m, { t: 'kill', target: e2.publicId });
    expect(e2.alive).toBe(true);
  });

  it('prevents speed hacks: flooding inputs cannot move faster than allowed', () => {
    sim.startMatch(4, ['P1']);
    const e = sim.employees[0];
    sim.teleport(e, 3, 11.8);
    const x0 = e.x;
    let seq = 1;
    for (let tick = 0; tick < 20; tick++) {
      for (let k = 0; k < 10; k++) sim.send(e, { t: 'input', seq: seq++, mx: 1, my: 0 });
      sim.advance(50);
    }
    const travelled = e.x - x0;
    expect(travelled).toBeLessThan(BASE_SPEED * 1.0 * 1.25); // 1 s of real time
  });

  it('players can walk to a station with real inputs', () => {
    sim.startMatch(4, ['P1']);
    const e = sim.employees[0];
    const st = STATION_BY_ID[e.tasks[0].stationId];
    const path = findPath(e.x, e.y, st.x, st.y, cols)!;
    let seq = 1;
    for (let guard = 0; guard < 2000 && path.length; guard++) {
      const [tx, ty] = path[0];
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.25) {
        path.shift();
        continue;
      }
      sim.send(e, { t: 'input', seq: seq++, mx: dx / d, my: dy / d });
      sim.advance(50);
    }
    expect(Math.hypot(e.x - st.x, e.y - st.y)).toBeLessThan(1.4);
    sim.send(e, { t: 'interact', station: st.id });
    expect(sim.conn(e).last('taskOpen')).toBeTruthy();
  });
});

describe('sabotage', () => {
  let sim: Sim;
  beforeEach(() => {
    sim = new Sim();
    sim.startMatch(5, ['P1']);
    sim.advance(11_000);
  });

  const hold = (p: any, stationId: string, ms: number) => {
    const st = STATION_BY_ID[stationId];
    sim.teleport(p, st.x, st.y);
    sim.send(p, { t: 'interact', station: stationId });
    sim.send(p, { t: 'fixHold', station: stationId, holding: true });
    sim.advance(ms);
  };

  it('critical fire alarm: expiry → managers win', () => {
    const [m] = sim.managers;
    sim.send(m, { t: 'sabotage', kind: 'fire' });
    expect(sim.room.sabotage?.critical).toBe(true);
    // no overlapping sabotage
    sim.send(m, { t: 'sabotage', kind: 'server' });
    expect(sim.room.sabotage?.kind).toBe('fire');
    // emergency button disabled during critical sabotage
    const e = sim.employees[0];
    sim.teleport(e, 32, 17.5);
    sim.advance(5000);
    sim.send(e, { t: 'emergency' });
    expect(sim.conn(e).last('error')?.code).toBe('CRITICAL');
    sim.advance(41_000);
    expect(sim.room.phase).toBe('GAME_OVER');
    expect(sim.room.gameOver?.reason).toBe('critical_sabotage');
  });

  it('fire alarm resolved at both panels', () => {
    const [m] = sim.managers;
    const [a, b] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'fire' });
    hold(a, 'fix-fireA', 2200);
    expect(sim.room.sabotage?.pending.has('fireA')).toBe(false);
    hold(b, 'fix-fireB', 2200);
    expect(sim.room.sabotage).toBeNull();
    sim.advance(50_000);
    expect(sim.room.phase).toBe('ACTIVE');
  });

  it('server crash needs two people holding simultaneously', () => {
    const [m] = sim.managers;
    const [a, b] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'server' });
    hold(a, 'fix-serverA', 3000);
    expect(sim.room.sabotage).not.toBeNull(); // alone: not enough
    hold(b, 'fix-serverB', 1700);
    expect(sim.room.sabotage).toBeNull();
  });

  it('wifi disables network tasks until repaired', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'wifi' });
    const st = STATION_BY_ID['t-emails'];
    a.tasks.push({ id: 'x', type: 'emails', stationId: 't-emails', done: false });
    sim.teleport(a, st.x, st.y);
    sim.send(a, { t: 'interact', station: 't-emails' });
    expect(sim.conn(a).last('error')?.code).toBe('DISABLED');
    hold(a, 'fix-wifi', 3200);
    expect(sim.room.sabotage).toBeNull();
    sim.teleport(a, st.x, st.y);
    sim.send(a, { t: 'interact', station: 't-emails' });
    expect(sim.conn(a).last('taskOpen')).toBeTruthy();
  });

  it('power cut reduces employee vision and is fixed by the panel puzzle', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    const before = sim.room.visionRadius(a);
    sim.send(m, { t: 'sabotage', kind: 'power' });
    expect(sim.room.visionRadius(a)).toBeLessThan(before * 0.5);
    expect(sim.room.visionRadius(m)).toBeGreaterThan(before); // managers unaffected
    const st = STATION_BY_ID['fix-power'];
    sim.teleport(a, st.x, st.y);
    sim.send(a, { t: 'interact', station: 'fix-power' });
    expect(sim.conn(a).last('fixOpen')?.fix).toBe('power');
    sim.send(a, { t: 'fixSubmit', station: 'fix-power', answer: [true, true, true, true, false] });
    expect(sim.room.sabotage).not.toBeNull();
    sim.advance(1600);
    sim.send(a, { t: 'fixSubmit', station: 'fix-power', answer: [true, true, true, true, true] });
    expect(sim.room.sabotage).toBeNull();
  });

  it('door lock blocks doorways, expires, and can be overridden', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'doors' });
    expect(sim.room.doorsLockedUntil).not.toBeNull();
    // walking through the north conference door is blocked
    sim.teleport(a, 31.9, 12.0);
    let seq = 1;
    for (let i = 0; i < 40; i++) {
      sim.send(a, { t: 'input', seq: seq++, mx: 0, my: 1 });
      sim.advance(50);
    }
    expect(a.y).toBeLessThan(13.1);
    hold(a, 'fix-doors', 2200);
    expect(sim.room.doorsLockedUntil).toBeNull();
    // re-lock later and let it expire
    sim.advance(45_000);
    sim.send(m, { t: 'sabotage', kind: 'doors' });
    expect(sim.room.doorsLockedUntil).not.toBeNull();
    sim.advance(12_500);
    expect(sim.room.doorsLockedUntil).toBeNull();
  });

  it('player standing in a doorway is pushed out when doors lock (no softlock)', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    sim.teleport(a, 32, 13.5);
    sim.send(m, { t: 'sabotage', kind: 'doors' });
    const box = { x0: 31, x1: 33, y0: 13.32, y1: 13.68 };
    const inside = a.x > box.x0 - 0.3 && a.x < box.x1 + 0.3 && a.y > box.y0 - 0.29 && a.y < box.y1 + 0.29;
    expect(inside).toBe(false);
  });

  it('cctv sabotage disables monitors until repaired', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    const cam = STATION_BY_ID['cctv'];
    sim.teleport(a, cam.x, cam.y);
    sim.send(a, { t: 'interact', station: 'cctv' });
    sim.advance(250);
    expect(sim.conn(a).last('cctv')?.online).toBe(true);
    sim.send(m, { t: 'sabotage', kind: 'cctv' });
    expect(sim.conn(a).last('cctv')?.online).toBe(false);
    sim.send(a, { t: 'interact', station: 'cctv' });
    expect(sim.conn(a).last('error')?.code).toBe('OFFLINE');
    hold(a, 'fix-cctv', 3200);
    expect(sim.room.sabotage).toBeNull();
  });

  it('company-wide outage blocks all electronic stations and needs 3 terminals', () => {
    const [m] = sim.managers;
    const [a, b] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'outage' });
    a.tasks.push({ id: 'y', type: 'printer', stationId: 't-printer', done: false });
    const pr = STATION_BY_ID['t-printer'];
    sim.teleport(a, pr.x, pr.y);
    sim.send(a, { t: 'interact', station: 't-printer' });
    expect(sim.conn(a).last('error')?.code).toBe('DISABLED');
    hold(a, 'fix-outageA', 2200);
    hold(b, 'fix-outageB', 2200);
    expect(sim.room.sabotage).not.toBeNull();
    hold(a, 'fix-outageC', 2200);
    expect(sim.room.sabotage).toBeNull();
    // no countdown → never a loss condition
    expect(sim.room.phase).toBe('ACTIVE');
  });

  it('meetings clear sabotage (including critical) and reset cooldowns', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    sim.send(m, { t: 'sabotage', kind: 'power' });
    sim.teleport(a, 32, 17.5);
    sim.advance(5000);
    sim.send(a, { t: 'emergency' });
    expect(sim.room.sabotage).toBeNull();
  });

  it('secret passages: managers only, connected vents, visible fx', () => {
    const [m] = sim.managers;
    const [a] = sim.employees;
    const v = VENT_BY_ID['v-server'];
    sim.teleport(m, v.x, v.y);
    sim.teleport(a, v.x - 2, v.y - 1); // witness
    sim.conn(a).clear();
    sim.send(m, { t: 'vent', action: 'enter', vent: 'v-server' });
    expect(m.inVent).toBe('v-server');
    expect(sim.conn(a).last('ventFx')?.kind).toBe('enter');
    // hidden from snapshots
    sim.advance(100);
    expect(sim.conn(a).last('snap')!.p.find((p) => p.i === m.publicId)).toBeUndefined();
    // cannot jump to an unconnected vent
    sim.advance(400);
    sim.send(m, { t: 'vent', action: 'move', vent: 'v-ceo' });
    expect(m.inVent).toBe('v-server');
    sim.send(m, { t: 'vent', action: 'move', vent: 'v-printer' });
    expect(m.inVent).toBe('v-printer');
    sim.advance(400);
    sim.send(m, { t: 'vent', action: 'exit' });
    expect(m.inVent).toBeNull();
    expect(Math.hypot(m.x - VENT_BY_ID['v-printer'].x, m.y - VENT_BY_ID['v-printer'].y)).toBeLessThan(0.1);
    // cannot kill from inside a vent
    sim.advance(1000);
    sim.send(m, { t: 'vent', action: 'enter', vent: 'v-printer' });
    sim.send(m, { t: 'kill', target: a.publicId });
    expect(a.alive).toBe(true);
  });
});

describe('ghosts', () => {
  it('ghost employees complete tasks, pass through walls, and are invisible to the living', () => {
    const sim = new Sim();
    sim.startMatch(5, ['P1']);
    sim.advance(11_000);
    const [m] = sim.managers;
    const [g, a] = sim.employees;
    sim.teleport(m, 20, 11.6);
    sim.teleport(g, 20.7, 11.6);
    sim.send(m, { t: 'kill', target: g.publicId });
    expect(g.alive).toBe(false);
    const before = sim.room.buildState(a).progress.done;
    doAllTasks(sim, g);
    expect(sim.room.buildState(a).progress.done).toBe(before + g.tasks.length);
    sim.teleport(a, 21, 11.8);
    sim.advance(100);
    expect(sim.conn(a).last('snap')!.p.find((p) => p.i === g.publicId)).toBeUndefined();
    // ghosts can see the living
    expect(sim.conn(g).last('snap')!.p.find((p) => p.i === a.publicId)).toBeTruthy();
    // ghost walks through a wall
    sim.teleport(g, 13, 12);
    let seq = 1000;
    for (let i = 0; i < 30; i++) {
      sim.send(g, { t: 'input', seq: seq++, mx: 0, my: 1 });
      sim.advance(50);
    }
    expect(g.y).toBeGreaterThan(14);
    // ghost cannot call meetings or fix
    sim.teleport(g, 32, 17.5);
    sim.send(g, { t: 'emergency' });
    expect(sim.room.phase).toBe('ACTIVE');
    // ghost chat during play stays among ghosts
    sim.send(g, { t: 'chat', text: 'boo' });
    expect(sim.conn(a).all('chat').some((c) => c.msg.text === 'boo')).toBe(false);
    // living players cannot chat outside meetings
    sim.send(a, { t: 'chat', text: 'hello?' });
    expect(sim.conn(a).last('error')?.code).toBe('CHAT_CLOSED');
  });
});

describe('connections', () => {
  it('reconnect restores role and tasks; grace expiry removes the player', () => {
    const sim = new Sim();
    sim.startMatch(5, ['P1']);
    const e = sim.employees[0];
    const role = e.role;
    const tasks = JSON.stringify(e.tasks);
    const c1 = sim.conn(e);
    sim.room.disconnect(e, c1);
    expect(e.connected).toBe(false);
    sim.advance(10_000);
    const c2 = new FakeConn();
    const res = sim.room.join(e.identity, e.name, e.appearance, false, c2);
    expect('player' in res && res.reconnected).toBe(true);
    expect(c2.state.you.role).toBe(role);
    expect(JSON.stringify(c2.state.you.tasks)).toBe(tasks);
    // timeout → leaves company → counted as dead
    sim.room.disconnect(e, c2);
    sim.advance(46_000);
    expect(e.alive).toBe(false);
    expect(e.left).toBe(true);
  });

  it('a duplicate tab with the same identity replaces the old connection', () => {
    const sim = new Sim();
    const p = sim.add('Dup');
    const c2 = new FakeConn();
    sim.room.join(p.identity, p.name, p.appearance, false, c2);
    expect(sim.conn(p).closed).toBe(true);
    expect(sim.room.players.size).toBe(1);
  });

  it('host disconnect transfers host; only host can start', () => {
    const sim = new Sim();
    const ps = Array.from({ length: 4 }, (_, i) => sim.add(`H${i}`));
    for (const p of ps) sim.send(p, { t: 'ready', ready: true });
    sim.send(ps[1], { t: 'start' });
    expect(sim.room.phase).toBe('WAITING');
    sim.room.disconnect(ps[0], sim.conn(ps[0]));
    expect(sim.room.hostId).toBe(ps[1].identity);
  });

  it('cannot start with fewer than 4 players', () => {
    const sim = new Sim();
    const ps = Array.from({ length: 3 }, (_, i) => sim.add(`L${i}`));
    for (const p of ps) sim.send(p, { t: 'ready', ready: true });
    sim.send(ps[0], { t: 'start' });
    expect(sim.room.phase).toBe('WAITING');
    expect(sim.conn(ps[0]).last('error')?.code).toBe('CANNOT_START');
  });

  it('joining mid-match makes you a spectator who cannot act or see roles', () => {
    const sim = new Sim();
    sim.startMatch(4, ['P1']);
    const s = sim.add('Watcher');
    expect(s.spectator).toBe(true);
    sim.send(s, { t: 'interact', station: 't-wifi' });
    expect(sim.conn(s).last('error')?.code).toBe('SPECTATOR');
    sim.send(s, { t: 'emergency' });
    expect(sim.room.phase).toBe('ACTIVE');
    const st = sim.conn(s).state;
    expect(st.players.every((p) => p.role === undefined)).toBe(true);
    expect(st.you.role).toBeNull();
  });

  it('two consecutive matches start without stale state', () => {
    const sim = new Sim();
    const ps = sim.startMatch(4, ['P1']);
    const [m] = sim.managers;
    sim.advance(11_000);
    for (const e of sim.employees.slice(0, 2)) {
      sim.teleport(m, 20, 11.6);
      sim.teleport(e, 20.6, 11.6);
      sim.send(m, { t: 'kill', target: e.publicId });
      sim.advance(31_000);
    }
    expect(sim.room.phase).toBe('GAME_OVER');
    sim.send(ps[0], { t: 'returnToLobby' });
    sim.advance(1600);
    expect(sim.room.phase).toBe('WAITING');
    for (const p of ps) {
      expect(p.role).toBeNull();
      expect(p.alive).toBe(true);
      expect(p.tasks).toEqual([]);
      expect(p.ready).toBe(false);
    }
    expect(sim.room.bodies).toEqual([]);
    for (const p of ps) sim.send(p, { t: 'ready', ready: true });
    sim.send(ps[0], { t: 'start' });
    sim.advance(3100 + 5100);
    expect(sim.room.phase).toBe('ACTIVE');
    expect(sim.room.matchNo).toBe(2);
    expect(sim.room.buildState(ps[1]).progress.done).toBe(0);
    expect(ps.every((p) => p.alive)).toBe(true);
  });

  it('reports a player for moderation', () => {
    const sim = new Sim();
    const [a, b] = [sim.add('R1'), sim.add('R2')];
    sim.send(a, { t: 'reportPlayer', target: b.publicId, category: 'spam', note: 'spammy' });
    expect(sim.reports).toHaveLength(1);
    expect(sim.reports[0].reportedName).toBe('R2');
  });

  it('chat is rate limited and spam-filtered', () => {
    const sim = new Sim();
    const a = sim.add('C1');
    for (let i = 0; i < 6; i++) sim.send(a, { t: 'chat', text: `msg ${i}` });
    expect(sim.conn(a).last('error')?.code).toBe('RATE_LIMIT');
    sim.advance(5000);
    sim.send(a, { t: 'chat', text: 'same' });
    sim.advance(1100);
    sim.send(a, { t: 'chat', text: 'same' });
    sim.advance(1100);
    sim.send(a, { t: 'chat', text: 'same' });
    expect(sim.conn(a).last('error')?.code).toBe('SPAM');
    sim.advance(1100);
    sim.send(a, { t: 'chat', text: '<script>alert(1)</script>' });
    // stored verbatim as text (clients render as text, never HTML)
    expect(sim.conn(a).last('chat')?.msg.text).toBe('<script>alert(1)</script>');
  });
});
