import type { ReactElement } from 'react';
import { formatInteger } from '@/lib/village-format';

/** Tlačítka − a + s číslem uprostřed (výběr zboží, dny na trhu, objednaná zbroj). */
export function Stepper({
  testId,
  value,
  max = Number.MAX_SAFE_INTEGER,
  min = 0,
  step = 1,
  label,
  disabled = false,
  onChange,
}: {
  testId: string;
  value: number;
  /** Nejvyšší počet; chybí = bez meze. */
  max?: number;
  min?: number;
  step?: number;
  label: string;
  /** Zašedlé – hráč k tomu nemá právo. */
  disabled?: boolean;
  onChange: (value: number) => void;
}): ReactElement {
  const btn =
    'hud-inset h-6 w-6 rounded text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        data-testid={`${testId}-minus`}
        aria-label={`${label} −`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={btn}
      >
        −
      </button>
      <span data-testid={`${testId}-count`} className="min-w-12 text-center text-sm tabular-nums">
        {formatInteger(value)}
      </span>
      <button
        type="button"
        data-testid={`${testId}-plus`}
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={btn}
      >
        +
      </button>
    </span>
  );
}
