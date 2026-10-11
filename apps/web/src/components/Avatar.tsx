import { useEffect, useRef } from 'react';
import type { Appearance } from '@corp/shared';
import { renderAvatar, type Expression } from '../game/characterArt';

export function Avatar({
  appearance,
  size = 72,
  expression,
  ghost,
  className = '',
  title,
}: {
  appearance: Appearance;
  size?: number;
  expression?: Expression;
  ghost?: boolean;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(appearance) + expression + ghost + size;
  useEffect(() => {
    if (ref.current) renderAvatar(ref.current, appearance, { expression, ghost });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size * 1.3 }}
      className={className}
      aria-label={title}
      role="img"
    />
  );
}
