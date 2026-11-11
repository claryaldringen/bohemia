// Dvorec vojvody (docs/design/trade.md – Dvorec vojvody). Jedno obydlí vsi je dvorcem – v nové
// vsi první zemnice zakladatelů (`foundVillage`), ve starší vsi nejstarší obydlí. Dvorec je
// budova (id obydlí = id domácnosti, která v ní bydlí); když dožije, obyvatelé ho přestaví na
// typ `dvorec` (simulate.ts – `decideRebuilds`). Odtud jdou vylepšení vsi (zemská stezka,
// obchod). Čisté funkce bez I/O.
import type { Dwelling, VillageState } from '../types';

/**
 * Nejstarší obydlí vsi (den dostavění, při shodě nižší id) – řemeslné dílny až nakonec (dvorec
 * je obydlí vojvodovy rodiny, ne dílna). Bez obydlí null.
 */
function oldestDwelling(state: Pick<VillageState, 'dwellings'>): Dwelling | null {
  let best: Dwelling | null = null;
  const rank = (d: Dwelling): number => (d.workshop ? 1 : 0);
  for (const d of state.dwellings) {
    if (
      best === null ||
      rank(d) < rank(best) ||
      (rank(d) === rank(best) &&
        (d.builtDay < best.builtDay || (d.builtDay === best.builtDay && d.id < best.id)))
    ) {
      best = d;
    }
  }
  return best;
}

/**
 * Domácnost zakladatelů, jejichž první zemnice se teprve staví (stavba `dwelling` s `dwellingId`)
 * – dvorcem bude ona. Jinak null.
 */
function foundersSite(state: Pick<VillageState, 'constructions'>): number | null {
  const site = state.constructions.find(
    (c) => c.kind === 'dwelling' && c.dwellingId !== null && c.relocates === undefined,
  );
  return site?.dwellingId ?? null;
}

/**
 * Id dvorce vsi (id obydlí = domácnosti): uložený `manorId`, když to obydlí stojí (nebo se staví
 * první zemnice zakladatelů s tím id); jinak nejstarší obydlí (`oldestDwelling`), bez obydlí
 * domácnost zakladatelů na staveništi. Ves bez obydlí i bez staveniště null. Deterministicky ze
 * stavu – starší ves bez `manorId` dostane vždy totéž obydlí.
 */
export function villageManorId(
  state: Pick<VillageState, 'manorId' | 'dwellings' | 'constructions'>,
): number | null {
  const stored = state.manorId;
  if (stored !== undefined) {
    if (state.dwellings.some((d) => d.id === stored)) return stored;
    if (foundersSite(state) === stored) return stored;
  }
  return oldestDwelling(state)?.id ?? foundersSite(state);
}

/** Hotové obydlí, které je dvorcem vsi; dokud zakladatelé první zemnici staví, null. */
export function villageManor(
  state: Pick<VillageState, 'manorId' | 'dwellings' | 'constructions'>,
): Dwelling | null {
  const id = villageManorId(state);
  return id === null ? null : (state.dwellings.find((d) => d.id === id) ?? null);
}

/** Je obydlí `dwellingId` dvorcem vsi? */
export function isManor(
  state: Pick<VillageState, 'manorId' | 'dwellings' | 'constructions'>,
  dwellingId: number,
): boolean {
  return villageManorId(state) === dwellingId;
}

/**
 * Starší ves bez dvorce (bez `manorId`): dvorcem se stane nejstarší obydlí (`villageManorId`).
 * Ves s platným dvorcem, nebo bez obydlí, se vrací beze změny (stejný objekt).
 */
export function withManor(state: VillageState): VillageState {
  const id = villageManorId(state);
  if (id === null || state.manorId === id) return state;
  return { ...state, manorId: id };
}

/**
 * Krok dne (mutuje stav): drží `manorId` platné – po zániku dvorce (prázdný dům se rozpadl) se
 * dvorcem stane nejstarší obydlí, starší ves dvorec dostane.
 */
export function keepManor(state: VillageState): void {
  const id = villageManorId(state);
  if (id === null) delete state.manorId;
  else state.manorId = id;
}
