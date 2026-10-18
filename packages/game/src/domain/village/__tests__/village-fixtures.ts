import type { VillageState } from '../types';

/**
 * Ves, ve které první zemnice už stojí – jako vsi uložené dřív, než si ji zakladatelé začali
 * stavět sami (zemnice stála od založení, 17. 10. 2026). Stavba první zemnice zmizí a obydlí
 * dostane id domácnosti zakladatelů; zbytek stavu zůstane, jak je.
 */
export function withBuiltFirstDwelling(state: VillageState): VillageState {
  const next = structuredClone(state);
  const founding = next.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null);
  if (!founding || founding.dwellingId === null) return next;
  if (founding.dwellingType === null || founding.position === null) {
    throw new Error('Stavba první zemnice nemá typ nebo polohu.');
  }
  next.constructions = next.constructions.filter((c) => c !== founding);
  next.dwellings.unshift({
    id: founding.dwellingId,
    type: founding.dwellingType,
    builtDay: next.foundedDay,
    condition: 1,
    position: { ...founding.position },
  });
  return next;
}
