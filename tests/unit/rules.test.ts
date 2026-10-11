import { describe, expect, it } from 'vitest';
import {
  SKIP,
  assignRoles,
  canStartMatch,
  canTransition,
  createRng,
  defaultManagerCount,
  effectiveManagerCount,
  evaluateWin,
  sanitizeSettings,
  tallyVotes,
  DEFAULT_SETTINGS,
} from '@corp/shared';

describe('role distribution', () => {
  it('uses 1 manager for 4–6 players and 2 for 7–10', () => {
    for (const n of [4, 5, 6]) expect(defaultManagerCount(n)).toBe(1);
    for (const n of [7, 8, 9, 10]) expect(defaultManagerCount(n)).toBe(2);
  });
  it('clamps host-requested managers to balance limits', () => {
    expect(effectiveManagerCount({ ...DEFAULT_SETTINGS, managers: 3 }, 5)).toBe(1);
    expect(effectiveManagerCount({ ...DEFAULT_SETTINGS, managers: 3 }, 10)).toBe(3);
    expect(effectiveManagerCount({ ...DEFAULT_SETTINGS, managers: 0 }, 8)).toBe(2);
  });
  it('assigns exactly N managers randomly', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) {
      const roles = assignRoles(ids, 2, createRng(s));
      const m = [...roles].filter(([, r]) => r === 'manager').map(([id]) => id);
      expect(m).toHaveLength(2);
      m.forEach((x) => seen.add(x));
    }
    expect(seen.size).toBe(ids.length); // everyone can become a manager
  });
});

describe('vote tally', () => {
  const voters = new Set(['a', 'b', 'c', 'd', 'e']);
  const targets = new Set(['a', 'b', 'c', 'd', 'e']);
  it('ejects a unique plurality', () => {
    const r = tallyVotes(
      new Map([
        ['a', 'c'],
        ['b', 'c'],
        ['d', 'a'],
      ]),
      voters,
      targets,
    );
    expect(r.ejected).toBe('c');
  });
  it('tie → nobody', () => {
    const r = tallyVotes(
      new Map([
        ['a', 'c'],
        ['b', 'd'],
      ]),
      voters,
      targets,
    );
    expect(r.ejected).toBeNull();
    expect(r.tie).toBe(true);
  });
  it('leading skip → nobody', () => {
    const r = tallyVotes(
      new Map([
        ['a', SKIP],
        ['b', SKIP],
        ['c', 'd'],
      ]),
      voters,
      targets,
    );
    expect(r.ejected).toBeNull();
    expect(r.skipped).toBe(true);
  });
  it('tie with skip → nobody', () => {
    const r = tallyVotes(
      new Map([
        ['a', SKIP],
        ['c', 'd'],
      ]),
      voters,
      targets,
    );
    expect(r.ejected).toBeNull();
  });
  it('no votes → nobody', () => {
    expect(tallyVotes(new Map(), voters, targets).ejected).toBeNull();
  });
  it('ignores ineligible voters and targets', () => {
    const r = tallyVotes(
      new Map([
        ['ghost', 'a'],
        ['zed', 'a'],
        ['b', 'e'],
        ['c', 'ghost'],
      ]),
      voters,
      targets,
    );
    expect(r.counts).toEqual({ e: 1 });
    expect(r.ejected).toBe('e');
  });
});

describe('win conditions', () => {
  const base = {
    started: true,
    aliveEmployees: 4,
    aliveManagers: 1,
    tasksDone: 0,
    tasksTotal: 12,
    criticalExpired: false,
  };
  it('nothing during normal play', () => expect(evaluateWin(base)).toBeNull());
  it('never in lobby', () => expect(evaluateWin({ ...base, started: false, aliveManagers: 0 })).toBeNull());
  it('employees win on tasks', () =>
    expect(evaluateWin({ ...base, tasksDone: 12 })?.winner).toBe('employees'));
  it('employees win when managers gone', () =>
    expect(evaluateWin({ ...base, aliveManagers: 0 })?.reason).toBe('managers_voted_out'));
  it('managers win on parity', () =>
    expect(evaluateWin({ ...base, aliveEmployees: 1 })?.reason).toBe('parity'));
  it('managers win on critical sabotage', () =>
    expect(evaluateWin({ ...base, criticalExpired: true })?.reason).toBe('critical_sabotage'));
  it('simultaneous conditions resolve deterministically', () => {
    // tasks done AND parity in the same tick → parity has priority
    expect(evaluateWin({ ...base, aliveEmployees: 1, tasksDone: 12 })?.winner).toBe('managers');
    // critical expired beats everything
    expect(evaluateWin({ ...base, aliveManagers: 0, criticalExpired: true })?.winner).toBe('managers');
  });
});

describe('settings + state machine', () => {
  it('rejects invalid values', () => {
    const s = sanitizeSettings({
      killCooldown: -5,
      playerSpeed: 99,
      maxPlayers: 50,
      votingTime: NaN as any,
      killRange: 'huge' as any,
    });
    expect(s.killCooldown).toBe(10);
    expect(s.playerSpeed).toBe(1.5);
    expect(s.maxPlayers).toBe(10);
    expect(s.votingTime).toBe(DEFAULT_SETTINGS.votingTime);
    expect(s.killRange).toBe('normal');
  });
  it('max players never below current lobby size', () => {
    expect(sanitizeSettings({ maxPlayers: 4 }, DEFAULT_SETTINGS, 7).maxPlayers).toBe(7);
  });
  it('needs 4 players', () => {
    expect(canStartMatch(3, DEFAULT_SETTINGS)).toMatch(/at least 4/);
    expect(canStartMatch(4, DEFAULT_SETTINGS)).toBeNull();
  });
  it('only allows legal transitions', () => {
    expect(canTransition('WAITING', 'STARTING')).toBe(true);
    expect(canTransition('ACTIVE', 'VOTING')).toBe(false);
    expect(canTransition('VOTING', 'MEETING_INTRO')).toBe(false);
    expect(canTransition('GAME_OVER', 'ACTIVE')).toBe(false);
  });
});
