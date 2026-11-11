import type { Construction } from '../types/types-construction';

// Nepoužívaná stavba (demolition.md – Opuštění): od dne pokynu `disusedDay` stavba stojí, ale nikdo
// ji nepoužívá. Malý modul bez závislostí, aby ho mohly číst `pens`, `oxen`, `sacred` a `households`
// bez cyklu s `structure-use.ts`.

/** Bourání stavby `ref` ve frontě (demolition.md – Bourání); není-li, undefined. */
export function demolitionOf(
  state: { readonly constructions: readonly Construction[] },
  ref: { structure: string; id: number },
): Construction | undefined {
  return state.constructions.find(
    (c) =>
      c.kind === 'demolition' &&
      c.demolition?.structure === ref.structure &&
      c.demolition.id === ref.id,
  );
}

/** Je stavba opuštěná hráčem nebo správcem (`disusedDay`)? Chybějící stavba se nepočítá. */
export function isDisused(s: { readonly disusedDay?: number } | undefined): boolean {
  return s?.disusedDay !== undefined;
}
