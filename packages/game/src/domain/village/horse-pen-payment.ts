import { paymentPool } from './craft-buying';
import { horsePenValueKg } from './horse-stock';
import { addHorses, horseValueKg, horsesForSale, horsesToSell, removeHorses } from './horse-trade';
import { cattleForSale } from './cattle-trade';
import { HORSE_GOODS } from './neighbours';
import { addGood, sellPrice, sellValue } from './trade';
import type { CraftCoverage, HorseGood, HorsePenPayment, TradedHorse, VillageState } from './types';

// Platba za koně nové ohrady koní (horses.md – Koně se stavbou ohrady; Martin 26. 10. 2026: „Cena
// ohrady – mělo by jít platit nejenom obilím, ale hřivnami i jinými zvířaty. Mělo by se to
// nakombinovat tak, aby to pro vesnici bylo dostupné a aby kvůli tomu obchodu nehrozil hlad“).
// Hodnota koní (`horsePenValueKg`) se poskládá z toho, co ves sama prodá, v ceně, za kterou by
// zboží vzal soused (`sellPrice`): napřed hřivny, pak přebytek zvířat (krávy nad chovný pár, koně
// bez jezdce nad chovné – `cattleForSale`, `horsesForSale`; voli se nikdy neprodávají, ať
// spřežení ani výcvik nepřijdou o voly), nakonec obilí a luštěniny jen z přebytku nad pojistkou
// zásob (`paymentPool` – jako nákup u sousedů). Čistá funkce stavu a dne, deterministická.

/** Důvod, proč ohradu koní nejde zahájit – přebytek ves na koně nestačí. */
export const HORSE_PEN_NO_SURPLUS = 'Na koně nestačí přebytek hřiven, zvířat ani obilí.';

const EPSILON = 1e-9;

/** Zvířata v pořadí, jak je ves dává: krávy, pak koně od nejlevnějších druhů. */
const ANIMALS: readonly ('cows' | HorseGood)[] = ['cows', ...HORSE_GOODS];

/** Cena prodaného kusu `index` druhu `good` (kg obilí) – koně podle výcviku v pořadí prodeje. */
function unitValues(state: VillageState, good: 'cows' | HorseGood, day: number): number[] {
  if (good === 'cows') {
    return Array.from({ length: cattleForSale(state, 'cows', day) }, () => sellPrice('cows'));
  }
  const horses = horsesToSell(state, good, horsesForSale(state, good, day), day);
  return horses.map((h) =>
    good === 'ridingHorses' ? sellValue(horseValueKg(h)) : sellPrice(good),
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
  const takeAnimals = (whole: boolean): void => {
    for (const good of ANIMALS) {
      const values = units.get(good)!;
      let n = taken[good] ?? 0;
      while (n < values.length && left > EPSILON && (!whole || values[n]! <= left + EPSILON)) {
        left -= values[n]!;
        n++;
      }
      taken[good] = n;
    }
  };
  takeAnimals(true);
  // 3. obilí a luštěniny z přebytku nad pojistkou; nestačí-li, napřed ještě celý kus zvířete
  const poolValue = (pool: ReturnType<typeof paymentPool>): number => {
    const grain = Math.min(pool.grainKg, pool.energyKg);
    const legumes = Math.min(pool.legumesKg, Math.max(0, pool.energyKg - grain));
    return grain * sellPrice('grain') + legumes * sellPrice('legumes');
  };
  if (left > poolValue(paymentPool(state, day, coverage)) + EPSILON) takeAnimals(false);
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

/** Vrátí zaplacené při zrušení stavby (mutuje stav) – přesně to, co se zaplatilo. */
export function refundHorsePen(state: VillageState, payment: HorsePenPayment, day: number): void {
  addGood(state, 'ironBars', payment.ironBarsKg, day);
  addGood(state, 'cows', payment.cows, day);
  addGood(state, 'grain', payment.grainKg, day);
  addGood(state, 'legumes', payment.legumesKg, day);
  addHorses(state, payment.horses, day);
}
