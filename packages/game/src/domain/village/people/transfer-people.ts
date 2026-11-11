// Lidé, kteří přecházejí do jiné vsi se svým rodem a zdravím (dosazení vojvody, zásilky mezi vsemi
// hráčů – vassalage.md – Lidé a robota): příchozí zůstávají tytéž osoby, jen s novými místními id.
import type { Person } from '../types';

/** Dočasné obydlí příchozích, než je ves usadí. */
export const ARRIVAL_HOME = -1;

/**
 * Převede skupinu lidí do cílové vsi (mutuje jen `state.nextId`): každý dostane nové místní id
 * (v pořadí starých id), vazby uvnitř skupiny (manželé, rodiče a děti) se přepíšou na nová id,
 * vazby na lidi mimo skupinu se přeruší (jejich id patří jiné vsi). Ostatní údaje (pohlaví, den
 * narození, jméno, zdraví, praxe, dovednosti) zůstávají. Lidé mají `dwellingId = ARRIVAL_HOME`;
 * do vsi je nepřidává – to dělá volající. `idMap` vrací staré id → nové.
 */
export function rehomePeople(
  state: { nextId: number },
  people: readonly Person[],
): { arrivals: Person[]; idMap: Map<number, number> } {
  const idMap = new Map<number, number>();
  for (const p of [...people].sort((a, b) => a.id - b.id)) idMap.set(p.id, state.nextId++);
  const mapped = (id: number | undefined): number | undefined =>
    id === undefined ? undefined : idMap.get(id);
  const arrivals = people.map((p): Person => {
    const { motherId, fatherId, spouseId, ...rest } = structuredClone(p);
    const mother = mapped(motherId);
    const father = mapped(fatherId);
    const spouse = mapped(spouseId);
    return {
      ...rest,
      id: idMap.get(p.id)!,
      dwellingId: ARRIVAL_HOME,
      ...(mother === undefined ? {} : { motherId: mother }),
      ...(father === undefined ? {} : { fatherId: father }),
      ...(spouse === undefined ? {} : { spouseId: spouse }),
    };
  });
  return { arrivals, idMap };
}
