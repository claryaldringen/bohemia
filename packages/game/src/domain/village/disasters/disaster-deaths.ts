// Úmrtí při místní pohromě (disasters.md – Povodeň potoka, Smršť): obyvatelé zasažených obydlí
// umírají s pevnou šancí – sdílí povodeň a smršť.

import { createRandom, deriveSeed } from '../../landscape/random';
import { bury } from '../buildings/cemetery';
import { removePeople } from '../people/kinship';
import { ageGroup, ageYears, occupants } from '../people/people';
import type { ChronicleEvent } from '../types/types-chronicle';
import type { VillageState } from '../types';

/**
 * Každý obyvatel obydlí `dwellingIds` zemře s šancí `chance` – vlastní proud `label + day` ze seedu
 * vsi, jeden los na obyvatele v pořadí obydlí a lidí podle id. Mrtvé pohřbí hřbitov, nástupnictví
 * řeší `dynastyDay` týž den. Mutuje stav, vrátí zápisy do kroniky.
 */
export function disasterDeaths(
  state: VillageState,
  day: number,
  dwellingIds: readonly number[],
  chance: number,
  label: string,
  cause: 'flood' | 'tornado',
): ChronicleEvent[] {
  if (chance <= 0) return [];
  const random = createRandom(deriveSeed(state.seed, label + day));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of [...dwellingIds].sort((a, b) => a - b)) {
    for (const p of occupants(state, id)) {
      if (random.next() >= chance) continue;
      dead.add(p.id);
      events.push({
        day,
        kind: 'death',
        group: ageGroup(p, day),
        age: ageYears(p.bornDay, day),
        cause,
        ...(p.name === undefined ? {} : { name: p.name, personId: p.id }),
      });
      const full = bury(state, day, p);
      if (full) events.push(full);
    }
  }
  if (dead.size > 0) removePeople(state, dead);
  return events;
}
