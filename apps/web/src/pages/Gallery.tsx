import { useMemo, useState } from 'react';
import { TASK_INFO, TASK_TYPES, createRng, generatePuzzle, verifyAnswer, type TaskType } from '@corp/shared';
import { useGame } from '../stores/game';
import { TaskOverlay } from '../ui/TaskOverlay';

/**
 * DEV-ONLY minigame gallery (`/?gallery`). Generates puzzles locally with the
 * same shared generator the server uses and verifies answers with the same
 * verifier, so every minigame UI can be QA'd without walking to its station.
 * Not included in production builds' navigation.
 */
export function Gallery() {
  const [seed, setSeed] = useState(1);
  const [log, setLog] = useState<string[]>([]);
  const set = useGame((s) => s.set);
  const puzzles = useMemo(
    () => Object.fromEntries(TASK_TYPES.map((t, i) => [t, generatePuzzle(t, createRng(seed * 100 + i))])),
    [seed],
  );
  const open = (t: TaskType) => {
    set({
      task: {
        session: `gallery-${t}-${seed}`,
        taskType: t,
        station: '',
        data: puzzles[t].data,
        fake: false,
        result: null,
      },
    });
  };
  // Intercept submissions locally (no server in the gallery).
  (window as any).__gallerySubmit = (answer: unknown) => {
    const task = useGame.getState().task;
    if (!task) return;
    const ok = verifyAnswer(puzzles[task.taskType], answer);
    setLog((l) => [`${task.taskType}: ${ok ? 'ACCEPTED' : 'rejected'}`, ...l].slice(0, 12));
    set({
      task: {
        ...task,
        result: {
          ok,
          line: ok ? 'Verified by the shared verifier.' : 'Rejected by the verifier.',
          n: (task.result?.n ?? 0) + 1,
        },
      },
    });
  };
  return (
    <div className="relative h-full overflow-auto bg-navy-950 p-8">
      <h1 className="font-display text-3xl font-bold">Minigame gallery (dev)</h1>
      <p className="text-mist">
        Seed {seed}. Each button opens the real minigame UI with a freshly generated puzzle.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {TASK_TYPES.map((t) => (
          <button key={t} className="btn" onClick={() => open(t)} data-testid={`gallery-${t}`}>
            {TASK_INFO[t].title}
          </button>
        ))}
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          New seed
        </button>
      </div>
      <ul className="mt-4 font-mono text-sm" data-testid="gallery-log">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <TaskOverlay />
    </div>
  );
}
