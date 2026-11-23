import { paymentPool } from '../crafts/craft-buying';
import { horsePenValueKg } from './horse-stock';
import {
  addHorses,
  horseValueKg,
  horsesForSale,
  horsesToSell,
  removeHorses,
} from '../trade/horse-trade';
import { horsePens, isFoalByAge } from './horses';
import { surplusCows } from './husbandry';
import { HORSE_GOODS } from '../trade/goods';
import { addGood, goodWorth, sellPrice as plainPrice, sellValue } from '../trade/trade';
import type {
  CraftCoverage,
  HorseGood,
  HorsePenPayment,
  TradedHorse,
  VillageState,
} from '../types';

// Platba za koně nové ohrady koní (horses.md – Koně se stavbou ohrady; Martin 26. 10. 2026: „Cena
// ohrady – mělo by jít platit nejenom obilím, ale hřivnami i jinými zvířaty. Mělo by se to
// nakombinovat tak, aby to pro vesnici bylo dostupné a aby kvůli tomu obchodu nehrozil hlad“).
// Hodnota koní (`horsePenValueKg`) se poskládá z toho, co ves sama prodá, v ceně, za kterou by
// zboží vzal soused (`sellPrice`): napřed hřivny, pak přebytek zvířat (krávy nad ty, které ves
// drží na mléko a voly – `surplusCows`, jako porážka, Martin 2. 11. 2026, dřív nad chovný pár; koně
// bez jezdce nad chovné – `horsesForSale`; voli se nikdy neprodávají, ať
// spřežení ani výcvik nepřijdou o voly), nakonec obilí a luštěniny jen z přebytku nad pojistkou
// zásob (`paymentPool` – jako nákup u sousedů). Čistá funkce stavu a dne, deterministická.

/** Důvod, proč ohradu koní nejde zahájit – přebytek ves na koně nestačí. */
export const HORSE_PEN_NO_SURPLUS = 'Na koně nestačí přebytek hřiven, zvířat ani obilí.';

const EPSILON = 1e-9;

/** Cena kusu zboží v kg obilí v den `day` – po zlém roce kraje nižší (`goodWorth`, disasters.md). */
function priceOf(state: VillageState, good: Parameters<typeof plainPrice>[0], day: number): number {
  return plainPrice(good) * goodWorth(state, good, day);
}

/** Zvířata v pořadí, jak je ves dává: krávy, pak koně od nejlevnějších druhů. */
const ANIMALS: readonly ('cows' | HorseGood)[] = ['cows', ...HORSE_GOODS];

/** Cena prodaného kusu `index` druhu `good` (kg obilí) – koně podle výcviku v pořadí prodeje. */
function unitValues(state: VillageState, good: 'cows' | HorseGood, day: number): number[] {
  const sellPrice = (g: Parameters<typeof plainPrice>[0]): number => priceOf(state, g, day);
  // koně žijí v ohradách – bez hotové ohrady koní nemá ves co prodat
  if (good !== 'cows' && !horsePens(state).some((pen) => pen.builtDay !== null)) return [];
  if (good === 'cows') {
    return Array.from({ length: surplusCows(state, day) }, () => sellPrice('cows'));
  }
  const horses = horsesToSell(state, good, horsesForSale(state, good, day), day);
  return horses.map((h) =>
    good === 'ridingHorses'
      ? sellValue(horseValueKg(h)) * goodWorth(state, good, day)
      : sellPrice(good),
  );
}

/**
 * Poskládá platbu za koně nové ohrady z přebytku vsi v den `day` (stav nemění): hřivny →
 * zvířata → obilí a luštěniny nad pojistkou. Poslední kus zvířete se vezme celý, jen když ho
 * přebytek obilí nepokryje. Vrátí null, když se hodnota poskládat nedá (stavba je zablokovaná).
 */
export function horsePenPayment(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): HorsePenPayment | null {
  const sellPrice = (g: Parameters<typeof plainPrice>[0]): number => priceOf(state, g, day);
  let left = horsePenValueKg();
  const payment: HorsePenPayment = {
    ironBarsKg: 0,
    cows: 0,
    horseCounts: {},
    horses: [],
    grainKg: 0,
    legumesKg: 0,
  };
  // 1. hřivny
  const barsPrice = sellPrice('ironBars');
  const bars = Math.min(
    Math.floor(state.crafts?.ironBarsKg ?? 0),
    Math.max(0, Math.ceil(left / barsPrice - EPSILON)),
  );
  payment.ironBarsKg = bars;
  left -= bars * barsPrice;
  // 2. zvířata – celé kusy, nejdřív ty, které se vejdou do zbytku
  const taken: Record<string, number> = {};
  const units = new Map(ANIMALS.map((g) => [g, unitValues(state, g, day)] as const));
  const takeFitting = (): void => {
    for (const good of ANIMALS) {
      const values = units.get(good)!;
      let n = taken[good] ?? 0;
      while (n < values.length && left > EPSILON && values[n]! <= left + EPSILON) {
        left -= values[n]!;
        n++;
      }
      taken[good] = n;
    }
  };
  // zbytek, který obilí nepokryje, doplatí jediný kus zvířete: nejlevnější, který ho pokryje
  // (žádný takový → největší kus a zase zbytek)
  const takeOverpay = (shortfall: number): boolean => {
    let best: { good: 'cows' | HorseGood; value: number } | null = null;
    for (const good of ANIMALS) {
      const value = units.get(good)![taken[good] ?? 0];
      if (value === undefined) continue;
      const covers = value >= shortfall - EPSILON;
      const bestCovers = best !== null && best.value >= shortfall - EPSILON;
      if (
        best === null ||
        (covers && (!bestCovers || value < best.value)) ||
        (!covers && !bestCovers && value > best.value)
      ) {
        best = { good, value };
      }
    }
    if (!best) return false;
    taken[best.good] = (taken[best.good] ?? 0) + 1;
    left -= best.value;
    return true;
  };
  takeFitting();
  // 3. obilí a luštěniny z přebytku nad pojistkou; co nepokryjí, doplatí kus zvířete navíc
  const poolValue = (pool: ReturnType<typeof paymentPool>): number => {
    const grain = Math.min(pool.grainKg, pool.energyKg);
    const legumes = Math.min(pool.legumesKg, Math.max(0, pool.energyKg - grain));
    return grain * sellPrice('grain') + legumes * sellPrice('legumes');
  };
  const surplus = poolValue(paymentPool(state, day, coverage));
  while (left > surplus + EPSILON && takeOverpay(left - surplus)) {
    // další kus jen, když předchozí zbytek nepokryl
  }
  if (left > EPSILON) {
    const pool = paymentPool(state, day, coverage);
    const grainKg = Math.min(left / sellPrice('grain'), pool.grainKg, pool.energyKg);
    payment.grainKg = grainKg;
    left -= grainKg * sellPrice('grain');
    pool.energyKg -= grainKg;
    if (left > EPSILON) {
      const legumesKg = Math.min(left / sellPrice('legumes'), pool.legumesKg, pool.energyKg);
      payment.legumesKg = legumesKg;
      left -= legumesKg * sellPrice('legumes');
    }
  }
  if (left > EPSILON) return null;
  payment.cows = taken['cows'] ?? 0;
  for (const good of HORSE_GOODS) {
    if ((taken[good] ?? 0) > 0) payment.horseCounts[good] = taken[good]!;
    payment.horses.push(...horsesToSell(state, good, taken[good] ?? 0, day).map(tradedOf));
  }
  return payment;
}

function tradedOf(horse: TradedHorse): TradedHorse {
  return { bornDay: horse.bornDay, sex: horse.sex, training: horse.training };
}

/** Zaplatí koně ohrady (mutuje stav – volat na klonu): odebere hřivny, zvířata, obilí a luštěniny. */
export function payHorsePen(state: VillageState, payment: HorsePenPayment, day: number): void {
  addGood(state, 'ironBars', -payment.ironBarsKg, day);
  addGood(state, 'cows', -payment.cows, day);
  // prodaní koně odejdou v pořadí prodeje (`horsesToSell`), jako je vybrala `horsePenPayment`
  for (const good of HORSE_GOODS) removeHorses(state, good, payment.horseCounts[good] ?? 0, day);
  addGood(state, 'grain', -payment.grainKg, day);
  addGood(state, 'legumes', -payment.legumesKg, day);
}

/** Cena koně v kg obilí, za kterou by ho soused vzal (hříbě, klisna, jezdecký kůň podle výcviku). */
function tradedValue(state: VillageState, horse: TradedHorse, day: number): number {
  if (isFoalByAge(horse, day)) return priceOf(state, 'foals', day);
  return horse.sex === 'female'
    ? priceOf(state, 'mares', day)
    : sellValue(horseValueKg(horse)) * goodWorth(state, 'ridingHorses', day);
}

/**
 * Vrátí zaplacené při zrušení stavby (mutuje stav) – přesně to, co se zaplatilo. Koně se vrátí jen
 * do hotové ohrady koní; ves, která žádnou nemá (zbourána, nebo teprve stavěná), dostane za ně
 * obilí v ceně, za kterou se prodali – nepřijdou na maso (horses.md – Koně se stavbou ohrady).
 */
export function refundHorsePen(state: VillageState, payment: HorsePenPayment, day: number): void {
  addGood(state, 'ironBars', payment.ironBarsKg, day);
  addGood(state, 'cows', payment.cows, day);
  addGood(state, 'grain', payment.grainKg, day);
  addGood(state, 'legumes', payment.legumesKg, day);
  if (horsePens(state).some((pen) => pen.builtDay !== null)) {
    addHorses(state, payment.horses, day);
    return;
  }
  const value = payment.horses.reduce((sum, horse) => sum + tradedValue(state, horse, day), 0);
  addGood(state, 'grain', value, day);
}
