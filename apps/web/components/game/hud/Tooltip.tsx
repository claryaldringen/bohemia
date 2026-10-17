import type { ReactElement, ReactNode } from 'react';

const PLACEMENT = {
  below: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  above: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  'above-left': 'right-0 bottom-full mb-1.5',
  'below-left': 'top-full right-0 mt-1.5',
} as const;

/**
 * Popisek při najetí myší nebo fokusu (jako v 0 A.D.) – krátký název, u staveb i cena.
 * Obsah je jen vizuální doplněk: tlačítka nesou název v `aria-label`.
 */
export function Tooltip({
  content,
  placement = 'below',
  children,
}: {
  content: ReactNode;
  placement?: keyof typeof PLACEMENT;
  children: ReactNode;
}): ReactElement {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`hud-tooltip pointer-events-none absolute z-40 hidden w-max max-w-64 px-2 py-1 text-xs leading-snug group-focus-within/tooltip:block group-hover/tooltip:block ${PLACEMENT[placement]}`}
      >
        {content}
      </span>
    </span>
  );
}
