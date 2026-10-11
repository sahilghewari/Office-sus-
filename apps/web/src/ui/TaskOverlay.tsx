import { useEffect, useMemo, useState } from 'react';
import { TASK_INFO, STATION_BY_ID } from '@corp/shared';
import { useGame } from '../stores/game';
import { send } from '../networking/connection';
import { closeTopOverlay } from '../hooks/useGameKeys';
import { WifiTask } from './minigames/WifiTask';
import { EmailsTask, ExpenseTask, FilesTask } from './minigames/SortTasks';
import { CoffeeTask, ExcelTask, IdScanTask, MeetingTask, PrinterTask, ServerTask } from './minigames/MachineTasks';
import { useShakeOn } from './minigames/common';

const ICON: Record<string, string> = { wifi: '📡', expense: '🧾', coffee: '☕', printer: '🖨️', meeting: '📅', files: '🗂️', emails: '📧', server: '🗄️', excel: '📗', idscan: '🪪' };

/** Dedicated minigame window. The server validates every submission. */
export function TaskOverlay() {
  const task = useGame((g) => g.task);
  const set = useGame((g) => g.set);
  const [done, setDone] = useState<string | null>(null);
  const failures = task?.result && !task.result.ok ? task.result.n : 0;
  const shakeRef = useShakeOn(failures);
  useEffect(() => {
    if (task?.result?.ok) {
      setDone(task.result.line ?? 'Done.');
      const id = setTimeout(() => {
        set({ task: null });
        setDone(null);
      }, 1700);
      return () => clearTimeout(id);
    }
  }, [task?.result, set]);
  useEffect(() => setDone(null), [task?.session]);
  const submit = useMemo(
    () => (answer: unknown) => {
      if (!task) return;
      // dev gallery verifies locally; real games always go through the server
      if (import.meta.env.DEV && task.session.startsWith('gallery-')) return (window as any).__gallerySubmit?.(answer);
      send({ t: 'taskSubmit', session: task.session, answer });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task?.session],
  );
  if (!task) return null;
  const info = TASK_INFO[task.taskType];
  const Comp = { wifi: WifiTask, expense: ExpenseTask, coffee: CoffeeTask, printer: PrinterTask, meeting: MeetingTask, files: FilesTask, emails: EmailsTask, server: ServerTask, excel: ExcelTask, idscan: IdScanTask }[task.taskType];
  return (
    <div className="absolute inset-0 z-[48] flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-[2px]" data-testid="task-overlay">
      <div ref={shakeRef} className="panel anim-pop relative w-full max-w-[760px] p-5">
        <header className="mb-4 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-corp-yellow text-2xl">{ICON[task.taskType]}</div>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold" data-testid="task-title">
              {info.title}
            </h2>
            <p className="text-sm text-mist">{info.instructions}</p>
            <p className="text-[11px] text-mist/60">📍 {STATION_BY_ID[task.station]?.name}</p>
          </div>
          <button className="h-10 w-10 rounded-full bg-white/10 text-xl hover:bg-white/20" onClick={() => closeTopOverlay()} aria-label="Close task" data-testid="close-task">
            ✕
          </button>
        </header>
        {task.result && !task.result.ok && <p className="mb-2 rounded-xl bg-corp-red/20 px-3 py-1.5 text-center text-sm text-red-200" role="alert">{task.result.line ?? 'Not quite!'} Try again.</p>}
        <div className={done ? 'pointer-events-none opacity-40 blur-[1px]' : ''}>
          <Comp data={task.data} submit={submit} failures={failures} />
        </div>
        {done && (
          <div className="anim-pop absolute inset-0 flex flex-col items-center justify-center rounded-[20px] bg-navy-900/80" data-testid="task-success">
            <div className="text-7xl">✅</div>
            <div className="font-display mt-2 text-3xl font-bold text-corp-mint">{task.taskType === 'meeting' ? 'Congratulations. This meeting could have been an email.' : 'TASK COMPLETE'}</div>
            <div className="mt-1 text-mist">{task.fake ? 'Nobody noticed you faking it. Excellent.' : done}</div>
          </div>
        )}
      </div>
    </div>
  );
}
