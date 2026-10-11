import { isAction } from '../stores/settings';

/** Currently held key codes (movement is polled by the game scene). */
export const pressed = new Set<string>();

export function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (typingInField()) return;
  pressed.add(e.code);
});
window.addEventListener('keyup', (e) => pressed.delete(e.code));
window.addEventListener('blur', () => pressed.clear());

/** Screen-space movement intent from held keys: (right, down) in −1..1. */
export function moveIntent(): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const code of pressed) {
    if (isAction('left', code)) sx -= 1;
    if (isAction('right', code)) sx += 1;
    if (isAction('up', code)) sy -= 1;
    if (isAction('down', code)) sy += 1;
  }
  return [Math.max(-1, Math.min(1, sx)), Math.max(-1, Math.min(1, sy))];
}
