import { horsePens, penHorses } from './horses';
import { isAway } from '../people/people';
import type { ChronicleEvent, VillageState } from '../types';

// Koně venku s výpravou (expeditions.md – Kůň; horses.md): kůň zůstává v ohradě koní (jí a má
// místo jako dřív), ale je venku, dokud ho jezdec na výpravě vede (`away.horseId`). Chov 1. 5.
// a porážka 1. 11. (horse-breeding.ts) koně venku přeskočí.

/**
 * Id koní, které jsou dnes venku: `away.horseId` lidí na výpravě (`away.kind === 'journey'`), kteří
 * jsou dnes pryč. Jezdec, který ve vsi už není (padl, zemřel), kůň v seznamu není – je zase volný
 * v ohradě. Jen čte stav.
 */
export function horsesOut(state: Pick<VillageState, 'people'>, day: number): ReadonlySet<number> {
  const out = new Set<number>();
  for (const p of state.people) {
    const away = p.away;
    if (away?.kind === 'journey' && away.horseId !== undefined && isAway(p, day)) {
      out.add(away.horseId);
    }
  }
  return out;
}

/**
 * Událost výpravy `journey-horse` (mutuje stav): u osoby `personId` s `away` druhu `journey`
 * a `refId === journeyId` nastaví `away.horseId` (jen když je v ohradě koní kůň `horseId`
 * s `riderId === personId`); s `null` ho smaže (sesedl doma – kůň je v ohradě). Jinak nic –
 * událost se smí doručit i po druhé.
 */
export function applyJourneyHorse(
  state: VillageState,
  _day: number,
  body: { journeyId: string; personId: number; horseId: number | null },
): ChronicleEvent[] {
  const p = state.people.find((x) => x.id === body.personId);
  const away = p?.away;
  if (!away || away.kind !== 'journey' || away.refId !== body.journeyId) return [];
  if (body.horseId === null) {
    delete away.horseId;
    return [];
  }
  const horse = horsePens(state)
    .flatMap((pen) => [...penHorses(pen)])
    .find((h) => h.id === body.horseId);
  if (horse?.riderId === body.personId) away.horseId = body.horseId;
  return [];
}
