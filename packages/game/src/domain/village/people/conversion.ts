// Víra vesničanů (christianity.md – Víra vesničanů): obrácení pohanů a podíly obou vír.
// Mutuje stav jako ostatní kroky dne.
import { dateOfDayIndex } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import { isChristian, rodBaptized } from './faith';
import { conversionBase } from './church-life';
import { isAdult } from './people';
import type { ChronicleEvent, VillageState } from '../types';

/** Podíl křesťanů mezi obyvateli vsi (0–1); prázdná ves 0. */
export function christianShare(state: Pick<VillageState, 'people'>): number {
  if (state.people.length === 0) return 0;
  return state.people.filter(isChristian).length / state.people.length;
}

/**
 * Roční obrácení 1. 1. (christianity.md – Obrácení): jen když rod vsi je pokřtěný; každý dospělý
 * pohan se s šancí `(base + perCoverage × pokrytí kostely) × (1 + podíl křesťanů)` (`CHURCH.conversion`) pokřtí – los
 * `deriveSeed(seed, 'convert:' + rok + ':' + id)`, nezávislý na pořadí a kouscích dopočtu.
 * Mutuje stav, vrací kroniku (`converted` jen když se někdo obrátil).
 */
export function conversionDay(state: VillageState, day: number): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  if (date.month !== 1 || date.day !== 1 || !rodBaptized(state)) return [];
  const chance = conversionBase(state) * (1 + christianShare(state));
  let count = 0;
  for (const p of state.people) {
    if (isChristian(p) || !isAdult(p, day)) continue;
    if (createRandom(deriveSeed(state.seed, 'convert:' + date.year + ':' + p.id)).next() < chance) {
      p.faith = 'christian';
      count++;
    }
  }
  return count > 0 ? [{ day, kind: 'converted', count }] : [];
}
