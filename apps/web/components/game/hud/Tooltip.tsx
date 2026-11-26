import type { ReactElement, ReactNode } from 'react';

const PLACEMENT = {
  below: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  above: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  'above-left': 'right-0 bottom-full mb-1.5',
  'below-left': 'top-full right-0 mt-1.5',
  'below-right': 'top-full left-0 mt-1.5',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
} as const;

/**
 * Popisek při najetí myší nebo fokusu (jako v 0 A.D.) – krátký název, u staveb i cena.
 * Obsah je jen vizuální doplněk: tlačítka nesou název v `aria-label`. Delší věta (důvod, proč
 * stavba nejde) se zalomí i v panelu, který zalamování vypíná (`whitespace-normal`). Ukáže ho jen
 * vlastní obal (`tooltip-host`) a jen když je to nejvnitřnější obal pod myší (`:hover`) nebo
 * s fokusem (`:focus-within`) – bez dalšího takového obalu uvnitř (`:has()`, pravidla v
 * `globals.css`), takže ikona uvnitř obalu zprávy o vsi v panelu Trh ukáže jen svůj popisek.
 */
export function Tooltip({
  content,
  placement = 'below',
  block = false,
  off = false,
  denied = null,
  children,
}: {
  content: ReactNode;
  placement?: keyof typeof PLACEMENT;
  /** Obal přes celou šířku (tlačítko nabídky), jinak jen kolem obsahu. */
  block?: boolean;
  /** Popisek se neukáže – např. tlačítko s otevřenou nabídkou by jím nabídku zakrylo. */
  off?: boolean;
  /** Důvod, proč ovládací prvek nejde (chybí právo – seniorate.md); místo obsahu se ukáže červeně. */
  denied?: string | null;
  children: ReactNode;
}): ReactElement {
  return (
    <span className={`tooltip-host relative ${block ? 'flex' : 'inline-flex'}`}>
      {children}
      {!off && (
        <span
          role="tooltip"
          className={`hud-tooltip pointer-events-none absolute z-40 hidden w-max max-w-64 px-2 whitespace-normal py-1 text-xs leading-snug ${PLACEMENT[placement]}`}
        >
          {denied === null ? (
            content
          ) : (
            <span data-testid="rights-reason" className="font-semibold text-red-400">
              {denied}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
