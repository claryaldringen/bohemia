import { dateOfDayIndex } from '../calendar';
import { surplusCows } from './husbandry';
import { neighbourStock } from './neighbours';
import { NEIGHBOR_DIRECTIONS, SEED_BUYING } from './rules';
import { reservedSeedKg, seedAheadKg, seedKeepKg, sowableSeedKg } from './seed';
import { addGood, buyPrice, goodWorth, sellPrice, storeStock } from './trade';
import type { ChronicleEvent, NeighbourStock, VillageState } from './types';

// Osivo pro ves bez zásob (fields.md – Osivo ze zásob, Osivo pro ves bez zásob; Martin 27. 10.
// 2026: „ok, jak navrhuješ“; pravidla návrh Clauda). Ves, které na setí nutných dílů v plánu
// chybí osivo (zásoby pod přežívací zásobou – po požáru, krutém roce, dceřiná ves), ho sama koupí
// u sousedů (princip „vesničané sami používají, co jim ulehčí práci“ – hráč nic nezadává):
// v den SEED_BUYING.days (1. 9. před setím ozimu, 1. 3. před setím jaře) jen tolik obilí, kolik
// na osivo chybí, kolik ho sousedé letos ještě mají (`neighbourStock` – po zlém roce méně) a kolik
// ves zaplatí bez ohrožení: napřed hřivnami, pak kravami nad ty, které drží na mléko a voly
// (`surplusCows` – jako porážka; Martin 2. 11. 2026, dřív krávy nad dvě), nejvýš
// SEED_BUYING.maxCows za nákup v ceně, za kterou by je soused vzal (`sellPrice` × `goodWorth` – po zlém roce méně); jídlem ani voly
// neplatí. Přeplatek za poslední kus dá soused v obilí do zásob (kolik ho ještě má). Koupené
// osivo ves nesní (`VillageState.reservedSeedKg`). Nekoupí-li dost, zapíše do kroniky, kolik
// osiva chybí. Kroky mutují stav – volat na klonu; deterministicky, na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

function isOn(day: number, target: { month: number; day: number }): boolean {
  const date = dateOfDayIndex(day);
  return date.month === target.month && date.day === target.day;
}

/**
 * Kolik osiva nutným dílům plánu chybí (kg obilí, stav nemění): osivo nutných dílů, které čeká na
 * setí (`seedAheadKg` bez prací nad potřebu; chybějící luštěniny za obilí), bez osiva, které smí
 * do země (`sowableSeedKg` – i osivo, které ves má jen na setí) a bez zrna a luštěnin ve
 * nevymlácených snopech (`VillageState.sheaves`).
 */
export function seedShortKg(state: VillageState, day: number): number {
  if (!state.season) return 0;
  const ahead = seedAheadKg(state, true, day);
  // nevymlácené snopy dají osivo výmlatem stejně jako v `seedPrepShares` – ves je nekupuje
  const sheaves = state.sheaves;
  const legumesShort = Math.max(
    0,
    ahead.legumes - Math.max(0, state.legumesKg ?? 0) - Math.max(0, sheaves?.legumesKg ?? 0),
  );
  const need = ahead.grain + legumesShort;
  if (need <= EPSILON) return 0;
  const grainSowable =
    sowableSeedKg(state, 'grain', seedKeepKg(state, day)) + Math.max(0, sheaves?.grainKg ?? 0);
  return Math.max(0, need - grainSowable);
}

/** Platba za osivo: hřivny (kg) a krávy (kusy) a kolik obilí za ně soused dá. */
interface SeedPayment {
  ironBarsKg: number;
  cows: number;
  valueKg: number;
}

/**
 * Čím ves zaplatí hodnotu `dueKg` (kg obilí u souseda): hřivny, pak krávy nad ty, které drží na
 * mléko a voly (`surplusCows`), nejvýš SEED_BUYING.maxCows.
 */
function seedPayment(state: VillageState, day: number, dueKg: number): SeedPayment {
  const barValue = sellPrice('ironBars') * goodWorth(state, 'ironBars', day);
  const ironBarsKg = Math.min(
    Math.floor(state.crafts?.ironBarsKg ?? 0),
    Math.max(0, Math.ceil(dueKg / barValue - EPSILON)),
  );
  let valueKg = ironBarsKg * barValue;
  const cowValue = sellPrice('cows') * goodWorth(state, 'cows', day);
  const cows = Math.min(
    surplusCows(state, day),
    SEED_BUYING.maxCows,
    Math.max(0, Math.ceil((dueKg - valueKg) / cowValue - EPSILON)),
  );
  valueKg += cows * cowValue;
  return { ironBarsKg, cows, valueKg };
}

/**
 * Koupí u sousedů osivo, které chybí (`shortKg`; mutuje stav) – viz hlavička. Vrací kroniku:
 * `seed-bought` a `seed-short`, když osivo i po nákupu chybí.
 */
export function buySeed(state: VillageState, day: number, shortKg: number): ChronicleEvent[] {
  const sellers: NeighbourStock[] = [];
  let supplyKg = 0;
  for (const direction of NEIGHBOR_DIRECTIONS) {
    const stock = neighbourStock(state, direction, day);
    const grain = stock.supply.grain ?? 0;
    if (grain <= EPSILON) continue;
    sellers.push(stock);
    supplyKg += grain;
  }
  const grainPrice = buyPrice('grain');
  const payment = seedPayment(state, day, Math.min(shortKg, supplyKg) * grainPrice);
  const getKg = Math.min(payment.valueKg / grainPrice, supplyKg);
  // důvod chybějícího osiva: platba, když za ni ves dostane méně, než sousedé mají; jinak zásoba
  // sousedů (oprava 2. 11. 2026 – dřív `supply`, kdykoli sousedé neměli celé chybějící množství)
  const reason = getKg < supplyKg - EPSILON ? 'pay' : 'supply';
  const short = (seedKg: number): ChronicleEvent[] =>
    shortKg - seedKg < SEED_BUYING.minKg
      ? []
      : [{ day, kind: 'seed-short', shortKg: shortKg - seedKg, reason }];
  const seedKg = Math.min(getKg, shortKg);
  if (seedKg < SEED_BUYING.minKg) return short(0);
  addGood(state, 'ironBars', -payment.ironBarsKg, day);
  addGood(state, 'cows', -payment.cows, day);
  // obilí od sousedů v pořadí směrů – zbytek roku jim ubude
  let left = getKg;
  for (const stock of sellers) {
    const take = Math.min(left, stock.supply.grain ?? 0);
    if (take <= EPSILON) continue;
    storeStock(state, {
      ...stock,
      supply: { ...stock.supply, grain: (stock.supply.grain ?? 0) - take },
    });
    left -= take;
  }
  const reserved = reservedSeedKg(state);
  state.storesKg = Math.max(0, state.storesKg) + getKg;
  state.reservedSeedKg = reserved + seedKg;
  const changeKg = getKg - seedKg;
  const pay: { ironBarsKg?: number; cows?: number } = {};
  if (payment.ironBarsKg > 0) pay.ironBarsKg = payment.ironBarsKg;
  if (payment.cows > 0) pay.cows = payment.cows;
  return [
    { day, kind: 'seed-bought', seedKg, ...(changeKg > EPSILON ? { changeKg } : {}), pay },
    ...short(seedKg),
  ];
}

/**
 * Osivo příštího osevu, které si ves z osiva zakladatelů nechá, i když šetří přídělem (kg obilí –
 * fields.md, Zásoby a nasycení, Start): roční osivo do potřeby z pole podle cílů osevu
 * (`FarmSeason.seedFloorKg`), nejméně osivo nutných dílů, které na setí čeká (`seedAheadKg`).
 */
export function foundersSeedKeepKg(state: VillageState): number {
  const ahead = seedAheadKg(state, true);
  const legumesShort = Math.max(0, ahead.legumes - Math.max(0, state.legumesKg ?? 0));
  return Math.max(state.season?.seedFloorKg ?? 0, ahead.grain + legumesShort);
}

/**
 * Osivo dne (mutuje stav): 1. 6. (SEED_BUYING.releaseDay) je nezaseté osivo, které ves měla jen na
 * setí, obyčejné zrno; osivo zakladatelů (`reservedSeedUntilDay` – FOUNDERS_STORES) až po své
 * lhůtě – v ní, když ves šetří přídělem (`hungry`), jen nad osivo příštího osevu
 * (`foundersSeedKeepKg`); v den nákupu (SEED_BUYING.days) ves koupí osivo, které nutným dílům chybí.
 */
export function seedBuyingDay(state: VillageState, day: number): ChronicleEvent[] {
  if (state.reservedSeedKg === undefined) {
    delete state.reservedSeedUntilDay;
  } else {
    // osivo zakladatelů slouží na víc osevů – do své lhůty se 1. 6. ani 1. 12. neuvolní
    const kept = state.reservedSeedUntilDay !== undefined && day < state.reservedSeedUntilDay;
    if ((state.starvationDays ?? 0) >= SEED_BUYING.eatFromStarvationDays) {
      // skutečný hlad (dny bez jídla): rezervu ves smí sníst (osivo se šetří, ne za cenu smrti)
      delete state.reservedSeedKg;
      delete state.reservedSeedUntilDay;
    } else if (kept) {
      // lhůta osiva zakladatelů ještě běží – když ves šetří přídělem, sní rezervu nad osivo
      // příštího osevu (návrh Clauda 2. 11. 2026 – velká zásoba má vsi pomoct, ne způsobit hlad)
      if (state.hungry) {
        const keep = foundersSeedKeepKg(state);
        if (keep <= EPSILON) {
          delete state.reservedSeedKg;
          delete state.reservedSeedUntilDay;
        } else if (state.reservedSeedKg > keep) state.reservedSeedKg = keep;
      }
    } else if (isOn(day, SEED_BUYING.releaseDay)) {
      delete state.reservedSeedKg;
      delete state.reservedSeedUntilDay;
    } else if (isOn(day, SEED_BUYING.winterReleaseDay)) {
      // po setí ozimu zůstane rezerva jen na osivo jaře
      const keep = Math.min(state.reservedSeedKg, seedAheadKg(state).grain);
      if (keep > EPSILON) state.reservedSeedKg = keep;
      else delete state.reservedSeedKg;
    }
  }
  if (!SEED_BUYING.days.some((d) => isOn(day, d))) return [];
  const shortKg = seedShortKg(state, day);
  if (shortKg < SEED_BUYING.minKg) return [];
  return buySeed(state, day, shortKg);
}
