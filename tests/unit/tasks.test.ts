import { describe, expect, it } from 'vitest';
import {
  TASK_TYPES,
  createRng,
  generatePuzzle,
  solveFromData,
  solvePuzzle,
  verifyAnswer,
} from '@corp/shared';

describe('task minigames', () => {
  for (const type of TASK_TYPES) {
    describe(type, () => {
      it('accepts the correct answer and is solvable from public data', () => {
        for (let seed = 1; seed <= 60; seed++) {
          const p = generatePuzzle(type, createRng(seed * 7919));
          expect(verifyAnswer(p, solvePuzzle(p)), `seed ${seed} key`).toBe(true);
          expect(verifyAnswer(p, solveFromData(type, p.data)), `seed ${seed} public`).toBe(true);
        }
      });
      it('rejects wrong / malformed answers', () => {
        const p = generatePuzzle(type, createRng(42));
        for (const bad of [null, undefined, 42, 'done', {}, [], { completed: true }, [[0, 0]]])
          expect(verifyAnswer(p, bad)).toBe(false);
      });
      it('randomizes starting state', () => {
        const a = JSON.stringify(generatePuzzle(type, createRng(1)).data);
        const distinct = new Set([a]);
        for (let s = 2; s < 12; s++) distinct.add(JSON.stringify(generatePuzzle(type, createRng(s)).data));
        expect(distinct.size).toBeGreaterThan(3);
      });
    });
  }
  it('specific wrong answers fail', () => {
    const w = generatePuzzle('wifi', createRng(3));
    const good = solvePuzzle(w) as number[][];
    const swapped = good.map(([l], i) => [l, good[(i + 1) % good.length][1]]);
    expect(verifyAnswer(w, swapped)).toBe(false);
    const ex = generatePuzzle('excel', createRng(3));
    const ans = solvePuzzle(ex) as Record<string, number>;
    const k = Object.keys(ans)[0];
    expect(verifyAnswer(ex, { ...ans, [k]: ans[k] + 1 })).toBe(false);
    const pr = generatePuzzle('printer', createRng(5));
    const steps = solvePuzzle(pr) as string[];
    expect(verifyAnswer(pr, steps.slice(0, -1))).toBe(false); // forgot restart
    expect(verifyAnswer(pr, ['open', 'close', 'restart'])).toBe(false); // jams left
  });
});
