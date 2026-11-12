// Nastěhování rodiny do obydlí s kronikou (kinship.md – Domácnosti; lord.md – Manželky – Rozhraní).
// Samostatný modul pod `households.ts` a `log-house-settle.ts`, aby se navzájem neimportovaly.
import { isDynastyTracked, isLineMan, isSecondaryWife } from './dynasty';
import { villageManorId } from './manor';
import type { ChronicleEvent, Person, VillageState } from '../types';

/**
 * Přestěhuje lidi do obydlí a zapíše založení domácnosti (mutuje stav); odchod muže rodu
 * a vedlejší manželky z dvorce vsi s rodem i do kroniky (lord.md – Manželky – Rozhraní).
 */
export function moveIn(
  state: VillageState,
  day: number,
  people: readonly Person[],
  dwellingId: number,
): void {
  const first = people[0];
  const fromManor =
    first !== undefined &&
    isDynastyTracked(state) &&
    villageManorId(state) === first.dwellingId &&
    first.dwellingId !== dwellingId;
  for (const p of people) p.dwellingId = dwellingId;
  state.chronicle.push({ day, kind: 'household-founded', dwellingId } satisfies ChronicleEvent);
  if (!fromManor) return;
  if (isLineMan(first)) {
    const name = first.name === undefined ? {} : { name: first.name };
    state.chronicle.push({ day, kind: 'son-left-manor', ...name } satisfies ChronicleEvent);
  } else if (isSecondaryWife(state, first)) {
    state.chronicle.push({ day, kind: 'wife-left-manor' } satisfies ChronicleEvent);
  }
}
