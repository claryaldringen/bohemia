// Kostel ve vsi (churches.md – Co kostel dává): kněz, pokrytí, hřbitůvek. Mutuje stav jako ostatní
// kroky dne; ves bez kostelů (`state.churches` chybí) nezmění nic.
import { createRandom, deriveSeed } from '../../landscape/random';
import { churchCapacity, churchyardGraves } from '../buildings/church-geometry';
import { CHURCH } from '../rules';
import type { Church, Person, VillageState } from '../types';
import { settleArrival } from './lodge';

const DAYS_PER_YEAR = 365.25;

/** Pokrytí vsi kostely s knězem (0–1); `decorated` jen z vyzdobených kostelů. */
export interface ChurchCoverage {
  readonly coverage: number;
  readonly decorated: number;
}

/**
 * Pokrytí vsi (churches.md – Co kostel dává): jen kostely s živým knězem; kapacity se sčítají,
 * dělí počtem lidí ve vsi a oříznou na 1. Bez kostelů nebo bez lidí 0.
 */
export function churchCoverage(state: Pick<VillageState, 'churches' | 'people'>): ChurchCoverage {
  const churches = state.churches;
  const people = state.people.length;
  if (churches === undefined || churches.length === 0 || people === 0) {
    return { coverage: 0, decorated: 0 };
  }
  let all = 0;
  let decorated = 0;
  for (const c of churches) {
    if (c.priestId === undefined || !state.people.some((p) => p.id === c.priestId)) continue;
    const capacity = churchCapacity(c.type, c.dims);
    all += capacity;
    if (c.decoratedDay !== undefined) decorated += capacity;
  }
  return {
    coverage: Math.min(1, all / people),
    decorated: Math.min(1, decorated / people),
  };
}

/** Štěstí křesťanů z kostelů: `happinessPerCoverage × pokrytí + decorHappinessPerCoverage × vyzdobené`. */
export function churchHappiness(state: Pick<VillageState, 'churches' | 'people'>): number {
  const { coverage, decorated } = churchCoverage(state);
  return CHURCH.happinessPerCoverage * coverage + CHURCH.decorHappinessPerCoverage * decorated;
}

/** Obrácení: roční šance dospělého pohana před násobkem podílu křesťanů. */
export function conversionBase(state: Pick<VillageState, 'churches' | 'people'>): number {
  return CHURCH.conversion.base + CHURCH.conversion.perCoverage * churchCoverage(state).coverage;
}

function replaceChurch(state: VillageState, id: number, change: Partial<Church>): void {
  state.churches = (state.churches ?? []).map((c) => (c.id === id ? { ...c, ...change } : c));
}

/**
 * Krok dne – kněží (mutuje): kostel, jehož kněz zemřel, ztratí `priestId` a nový přijde za
 * `CHURCH.newPriestAfterDays`; kostel bez kněze a bez dne příchodu ho dostane na `finishedDay +
 * priestAfterDays` (hned). V den příchodu se kněz usadí (`settleArrival`, bez obydlí čeká dál)
 * a zapíše do `Church.priestId`. Příchod nezávisí na huti – den nese kostel (návrh Clauda: huť
 * mohla odejít). Los ze seedu vsi, kostela a dne – nezávisí na kouscích dopočtu.
 */
export function priestDay(state: VillageState, day: number): void {
  const churches = state.churches;
  if (churches === undefined) return;
  for (const church of [...churches].sort((a, b) => a.id - b.id)) {
    let c = state.churches!.find((k) => k.id === church.id)!;
    if (c.priestId !== undefined && !state.people.some((p) => p.id === c.priestId)) {
      const { priestId: _gone, ...rest } = c;
      void _gone;
      c = { ...rest, priestArrivalDay: day + CHURCH.newPriestAfterDays };
      state.churches = state.churches!.map((k) => (k.id === c.id ? c : k));
    }
    if (c.priestId !== undefined) continue;
    if (c.priestArrivalDay === undefined) {
      replaceChurch(state, c.id, { priestArrivalDay: c.finishedDay + CHURCH.priestAfterDays });
      c = state.churches!.find((k) => k.id === c.id)!;
    }
    if (c.priestArrivalDay! > day) continue;
    const random = createRandom(deriveSeed(state.seed, `priest:${c.id}:${c.priestArrivalDay}`));
    if (!settleArrival(state, 'priest', day, random)) continue;
    const priest = state.people[state.people.length - 1]!;
    const { priestArrivalDay: _done, ...rest } = c;
    void _done;
    state.churches = state.churches!.map((k) =>
      k.id === c.id ? { ...rest, priestId: priest.id } : k,
    );
  }
}

/** Čtverec vzdálenosti (jen na řazení). */
function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

/**
 * Pohřeb křesťana na hřbitůvku (mutuje): nejbližší kostel s knězem a volným hrobem (podle domu
 * zemřelého; při shodě nižší id). Hroby starší než `CHURCH.graveReuseYears` se uvolní (odstraní
 * ze seznamu). Vrací `true`, když byl pohřben; jinak se nic nezapíše a platí starý hřbitov.
 */
export function buryAtChurch(state: VillageState, day: number, person: Person): boolean {
  const churches = state.churches;
  if (churches === undefined || churches.length === 0) return false;
  const home = state.dwellings.find((d) => d.id === person.dwellingId)?.position;
  const alive = (c: Church): boolean =>
    c.priestId !== undefined && state.people.some((p) => p.id === c.priestId);
  const limit = CHURCH.graveReuseYears * DAYS_PER_YEAR;
  const options = churches
    .filter(alive)
    .map((c) => {
      const graves = (c.graves ?? []).filter((g) => day - g.day <= limit);
      return { c, graves, free: churchyardGraves(c.type, c.dims) - graves.length };
    })
    .filter((o) => o.free > 0)
    .sort((a, b) => {
      const da = home === undefined ? 0 : distance(home, a.c.position);
      const db = home === undefined ? 0 : distance(home, b.c.position);
      return da === db ? a.c.id - b.c.id : da - db;
    });
  const best = options[0];
  if (best === undefined) return false;
  replaceChurch(state, best.c.id, {
    graves: [...best.graves, { personId: person.id, day }],
  });
  return true;
}
