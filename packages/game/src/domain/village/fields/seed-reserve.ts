import { dateOfDayIndex } from '../../calendar';
import { SEED_RESERVE } from '../rules';
import {
  seedKeepKg,
  sowableSeedKg,
  sowingWindowCrop,
  windowSeedNeedKg,
  type SowingCrop,
} from './seed';
import type { ChronicleEvent, VillageState } from '../types';

// Rezerva osiva (fields.md – Osivo ze zásob, Osivo pro ves bez zásob; Martin 27. 10. 2026: „ok, jak
// navrhuješ“; pravidla návrh Clauda): osivo jen na setí (`VillageState.reservedSeedKg` – osadníků
// dceřiné vsi a zakladatelů) ves nesní; co do 1. 6. nezaseje, je obyčejné zrno, osivo zakladatelů
// slouží do své lhůty, ve skutečném hladu ho ves sní. Nákup osiva u smyšlených sousedů zrušen
// (markets.md – Pravidla 1; Martin 22. 11. 2026: „Ves by měla být schopná přežít a rozvíjet se dle
// současných pravidel i bez obchodu“): ves, které na setí dílů na řadě chybí osivo, to v den
// SEED_RESERVE.days (1. 9. před setím ozimu, 1. 3. před setím jaře) zapíše do kroniky – díly bez
// osiva nezaseje; s okolím pro ně týž den vesničané jedou na trh (`villagerTripsDay` –
// trade/villager-trips.ts, markets.md – Pravidla 9). Kroky mutují stav – volat na klonu;
// deterministicky, na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

function isOn(day: number, target: { month: number; day: number }): boolean {
  const date = dateOfDayIndex(day);
  return date.month === target.month && date.day === target.day;
}

/**
 * Kolik osiva chybí (kg obilí, stav nemění – fields.md, Osivo bez cíle osevu): osivo na všechny
 * díly na řadě v okně setí, které dnes běží (`windowSeedNeedKg` – luštěniny ves na poli nepěstuje,
 * fields.md – Luštěniny, zrušeno), bez osiva, které smí do země (`sowableSeedKg` – i osivo, které
 * ves má jen na setí), a bez zrna ve nevymlácených snopech (`VillageState.sheaves`). Mimo okno 0.
 */
export function seedShortKg(state: VillageState, day: number): number {
  const crop = sowingWindowCrop(state, day);
  if (crop === null) return 0;
  const need = windowSeedNeedKg(state, crop);
  if (need <= EPSILON) return 0;
  // nevymlácené snopy dají osivo výmlatem stejně jako v `seedPrepShares` – nechybí
  const grainSowable =
    sowableSeedKg(state, 'grain', seedKeepKg(state, day)) +
    Math.max(0, state.sheaves?.grainKg ?? 0);
  return Math.max(0, need - grainSowable);
}

/** Obilí příštího okna setí – ozim od května do října, jinak jař. */
function nextSowingCrop(day: number): SowingCrop {
  const month = dateOfDayIndex(day).month;
  return month >= 5 && month <= 10 ? 'winter' : 'spring';
}

/**
 * Osivo příštího osevu, které si ves z osiva zakladatelů nechá, i když šetří přídělem (kg obilí –
 * fields.md, Zásoby a nasycení, Start): osivo na díly na řadě v příštím okně setí
 * (`windowSeedNeedKg`).
 */
export function foundersSeedKeepKg(state: VillageState, day: number): number {
  return windowSeedNeedKg(state, nextSowingCrop(day));
}

/**
 * Rezerva osiva dne (mutuje stav): 1. 6. (SEED_RESERVE.releaseDay) je nezaseté osivo, které ves
 * měla jen na setí, obyčejné zrno; osivo zakladatelů (`reservedSeedUntilDay` – FOUNDERS_STORES) až
 * po své lhůtě – v ní, když ves šetří přídělem (`hungry`), jen nad osivo příštího osevu
 * (`foundersSeedKeepKg`). V den SEED_RESERVE.days, kdy dílům na řadě chybí aspoň
 * SEED_RESERVE.minKg osiva, vrátí kroniku `seed-short` (bez `reason` – ves nic nekupuje).
 */
export function seedReserveDay(state: VillageState, day: number): ChronicleEvent[] {
  if (state.reservedSeedKg === undefined) {
    delete state.reservedSeedUntilDay;
  } else {
    // osivo zakladatelů slouží na víc osevů – do své lhůty se 1. 6. ani 1. 12. neuvolní
    const kept = state.reservedSeedUntilDay !== undefined && day < state.reservedSeedUntilDay;
    if ((state.starvationDays ?? 0) >= SEED_RESERVE.eatFromStarvationDays) {
      // skutečný hlad (dny bez jídla): rezervu ves smí sníst (osivo se šetří, ne za cenu smrti)
      delete state.reservedSeedKg;
      delete state.reservedSeedUntilDay;
    } else if (kept) {
      // lhůta osiva zakladatelů ještě běží – když ves šetří přídělem, sní rezervu nad osivo
      // příštího osevu (návrh Clauda 2. 11. 2026 – velká zásoba má vsi pomoct, ne způsobit hlad)
      if (state.hungry) {
        const keep = foundersSeedKeepKg(state, day);
        if (keep <= EPSILON) {
          delete state.reservedSeedKg;
          delete state.reservedSeedUntilDay;
        } else if (state.reservedSeedKg > keep) state.reservedSeedKg = keep;
      }
    } else if (isOn(day, SEED_RESERVE.releaseDay)) {
      delete state.reservedSeedKg;
      delete state.reservedSeedUntilDay;
    } else if (isOn(day, SEED_RESERVE.winterReleaseDay)) {
      // po setí ozimu zůstane rezerva jen na osivo jaře
      const keep = Math.min(state.reservedSeedKg, windowSeedNeedKg(state, 'spring'));
      if (keep > EPSILON) state.reservedSeedKg = keep;
      else delete state.reservedSeedKg;
    }
  }
  if (!SEED_RESERVE.days.some((d) => isOn(day, d))) return [];
  const shortKg = seedShortKg(state, day);
  if (shortKg < SEED_RESERVE.minKg) return [];
  return [{ day, kind: 'seed-short', shortKg }];
}
