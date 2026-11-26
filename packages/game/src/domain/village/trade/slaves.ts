// Otroci jako zboží (markets.md – Rozhodnutí plánu 5, bod 6; Martin 26. 11. 2026: „Moc to řešíš.
// Otroci nejsou rodina, ale zboží“): kus je jeden otrok – manžel ani děti s ním neodcházejí a i malé
// dítě-otrok jde prodat samo. Kdo smí odejít, vybírá `emigrantGroups` (otroci napřed); tady je jen
// výběr prodejních otroků – jeden průchod lidmi bez simulace (pohled dvorce ho volá často).
import { isAway } from '../people/people';
import { canBeSold } from '../people/slaves';
import type { Person, VillageState } from '../types';
import { keptByLine } from './people-trade';

/**
 * Otroci, které ves smí prodat (bod 6): `canBeSold` (pohan, ne muž rodu ani šlechtic), doma (ne
 * `isAway`), ne `keptByLine` (manželka muže rodu); od nejnižšího id – kdo přišel dřív, jde dřív.
 */
export function sellableSlaves(state: VillageState, day: number): Person[] {
  const kept = keptByLine(state);
  return state.people
    .filter((p) => canBeSold(p) && !isAway(p, day) && !kept(p))
    .sort((a, b) => a.id - b.id);
}
