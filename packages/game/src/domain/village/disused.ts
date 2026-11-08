// Nepoužívaná stavba (demolition.md – Opuštění): od dne pokynu `disusedDay` stavba stojí, ale nikdo
// ji nepoužívá. Malý modul bez závislostí, aby ho mohly číst `pens`, `oxen`, `sacred` a `households`
// bez cyklu s `structure-use.ts`.

/** Je stavba opuštěná hráčem nebo správcem (`disusedDay`)? Chybějící stavba se nepočítá. */
export function isDisused(s: { readonly disusedDay?: number } | undefined): boolean {
  return s?.disusedDay !== undefined;
}
