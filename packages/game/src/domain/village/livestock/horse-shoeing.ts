import type { Landscape } from '../../landscape';
import {
  PRODUCT_CRAFT,
  nearestCraftsman,
  ownCraftsmanWorks,
  paymentPool,
  type PaymentPool,
  type PurchaseRoute,
} from '../crafts/craft-buying';
import { isUnshod, nextShoeingDay, shoeingDue } from './horse-shoeing-term';
import { horsePens, penHorses, ridingHorses } from './horses';
import { villageFoodCosts } from './husbandry';
import { REFINE, SMELT } from '../crafts/iron-rates';
import { HORSE_SHOEING } from '../rules';
import { addGood, buyPrice, sellPrice } from '../trade/trade';
import type { ChronicleEvent, CraftCoverage, VillageState } from '../types';

export { isUnshod, nextShoeingDay };

// Kování jezdeckých koní (horses.md – Kování; Martin 26. 10. 2026: „Jezdeckého koně je potřeba
// každé dva měsíce kovat. To obstará ideálně kovář ve vsi, případně kovář z jiné vsi, ale bude to
// násobně dražší, protože musí přijít.“). Celá ves se kuje najednou, termín je pevný: 60 dní od
// posledního kování (`VillageState.shoeing`). Vlastní kovář (pracující kovárna se zásobou hřiven)
// kuje z práce vsi a ze zásoby kovárny; jinak přijde kovář z nejbližší sousední vsi s kovářem
// (`nearestCraftsman` – cesta jako nákup u sousedů) a ves mu zaplatí obilím a luštěninami jen
// z přebytku nad pojistkou (`paymentPool`). Co se nepodaří, ves zkusí znovu každý den; kůň po
// termínu je nepodkutý (`isUnshod`) – nejezdí a nevycvičuje se. Kroky mutují stav (volat na
// klonu), čisté funkce stavu a dne; výsledek na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Kdo dnes koně kuje – vlastní kovář (práce vsi, zásoba kovárny), nebo kovář z jiné vsi (platba). */
export interface ShoeingPlan {
  own: boolean;
  /** Počet jezdeckých koní. */
  horses: number;
  /** Práce vsi dnes (čd) – jen vlastní kovář, jinak 0. */
  manDays: number;
  /** Platba cizímu kováři (kg) – jen cizí kovář. */
  grainKg: number;
  legumesKg: number;
  /** Cesta cizího kováře (dny tam i zpět) – jen cizí kovář. */
  route: PurchaseRoute | null;
}

/** Cena kování celé vsi v člověkodnech – vlastní a cizí kovář (návrh, výpočet pro Vlkov). */
export interface ShoeingCosts {
  own: number;
  foreign: number;
}

/**
 * Převod stavu (jednou, idempotentně; mutuje): ves s jezdeckými koňmi bez termínu ho dostane od
 * dneška (starší vsi, nová ohrada), ves bez nich o termín přijde.
 */
function ensureTerm(state: VillageState, day: number): void {
  const horses = ridingHorses(state, day).length;
  if (horses > 0 && !state.shoeing) state.shoeing = { lastDay: day };
  else if (horses === 0 && state.shoeing) delete state.shoeing;
}

/** Práce na vytavení a překování kg hřiven (čd) – ocenění železa vlastního kováře. */
function barsManDaysPerKg(): number {
  return REFINE.manDaysPerKg + REFINE.bloomKgPerKg * SMELT.manDaysPerKg;
}

/**
 * Cena kování `horses` koní v člověkodnech (horses.md – Kování): vlastní kovář = jeho práce
 * a železo v ceně práce na vytavení; cizí = dny cesty tam i zpět + jeho práce + železo za cenu
 * souseda (kg obilí ÷ kg obilí na člověkoden = cena jídla v práci, `economy.ts`).
 */
export function shoeingCosts(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  horses: number,
  routeDays: number,
): ShoeingCosts {
  const iron = horses * HORSE_SHOEING.ironBarsKg;
  const work = horses * HORSE_SHOEING.manDays;
  const grainPerKg = villageFoodCosts(state, day, coverage.tools).grainPerKg;
  return {
    own: work + iron * barsManDaysPerKg(),
    foreign: routeDays + work + iron * buyPrice('ironBars') * grainPerKg,
  };
}

/** Železo cizího kováře v kg obilí (hřivny za cenu souseda) – bez ceny práce. */
function foreignIronKg(horses: number): number {
  return horses * HORSE_SHOEING.ironBarsKg * buyPrice('ironBars');
}

/** Cena kování cizím kovářem v kg obilí (cena práce vsi v jídle + železo za cenu souseda). */
function foreignValueKg(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  horses: number,
  routeDays: number,
): number {
  const grainPerKg = villageFoodCosts(state, day, coverage.tools).grainPerKg;
  const workDays = routeDays + horses * HORSE_SHOEING.manDays;
  return workDays / Math.max(EPSILON, grainPerKg) + foreignIronKg(horses);
}

/**
 * Nejvíc, kolik ves z přebytku zaplatí (kg obilí u souseda) – obilí, pak luštěniny, jako
 * `planShoeing`. Jen horní odhad pro rychlé odmítnutí: platba nad ním určitě neprojde, takže cenu
 * práce (`villageFoodCosts`, drahá) není třeba počítat – výsledek je stejný.
 */
function payableKg(pool: PaymentPool): number {
  const grainKg = Math.min(pool.grainKg, pool.energyKg);
  const legumesKg = Math.max(0, Math.min(pool.legumesKg, pool.energyKg - grainKg));
  return Math.max(0, grainKg) * sellPrice('grain') + legumesKg * sellPrice('legumes');
}

/**
 * Plán kování dne (horses.md – Kování; mutuje jen termín): jen v den termínu a po něm. Vlastní
 * kovář – pracující kovárna s dost hřivnami; jinak nejbližší soused s kovářem, když ves cenu
 * zaplatí z přebytku (obilí, pak luštěniny). Jinak null – ves to zkusí zítra.
 */
export function planShoeing(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
  landscape: Landscape | null,
): ShoeingPlan | null {
  ensureTerm(state, day);
  if (!shoeingDue(state, day)) return null;
  const horses = ridingHorses(state, day).length;
  const bars = horses * HORSE_SHOEING.ironBarsKg;
  if (
    ownCraftsmanWorks(state, PRODUCT_CRAFT.toolsKg) &&
    (state.crafts?.ironBarsKg ?? 0) + EPSILON >= bars
  ) {
    return {
      own: true,
      horses,
      manDays: horses * HORSE_SHOEING.manDays,
      grainKg: 0,
      legumesKg: 0,
      route: null,
    };
  }
  const route = nearestCraftsman(state, 'smith', landscape);
  if (!route) return null;
  const pool = paymentPool(state, day, coverage, true);
  // rychlé odmítnutí: už samo železo (cena práce je kladná) je nad tím, co ves zaplatí – s rezervou
  // na zaokrouhlení, aby rozhodnutí bylo stejné jako po celém výpočtu níž
  const payable = payableKg(pool);
  if (foreignIronKg(horses) > payable * (1 + EPSILON) + EPSILON) return null;
  const valueKg = foreignValueKg(state, day, coverage, horses, route.days);
  const grainKg = Math.min(valueKg / sellPrice('grain'), pool.grainKg, pool.energyKg);
  let left = valueKg - grainKg * sellPrice('grain');
  pool.energyKg -= grainKg;
  let legumesKg = 0;
  if (left > EPSILON) {
    legumesKg = Math.min(left / sellPrice('legumes'), pool.legumesKg, pool.energyKg);
    left -= legumesKg * sellPrice('legumes');
  }
  if (left > EPSILON) return null;
  return { own: false, horses, manDays: 0, grainKg, legumesKg, route };
}

/**
 * Dokončí kování dne (mutuje stav; po rozdělení práce): vlastní kovář jen když dostal celou práci
 * (`laborGiven`), odečte hřivny ze zásoby; cizí odebere platbu. Termín se posune na dnešek, kronika
 * `horses-shod`. Bez plánu nebo bez práce nic – ves zkusí zítra.
 */
export function finishShoeing(
  state: VillageState,
  day: number,
  plan: ShoeingPlan | null,
  laborGiven: number,
): ChronicleEvent[] {
  if (!plan || !state.shoeing) return [];
  if (plan.own) {
    if (laborGiven + EPSILON < plan.manDays) return [];
    addGood(state, 'ironBars', -plan.horses * HORSE_SHOEING.ironBarsKg, day);
  } else {
    addGood(state, 'grain', -plan.grainKg, day);
    addGood(state, 'legumes', -plan.legumesKg, day);
  }
  state.shoeing.lastDay = day;
  return [
    {
      day,
      kind: 'horses-shod',
      horses: plan.horses,
      own: plan.own,
      // odkud cizí kovář přišel – kronika jménem vsi souseda
      ...(plan.own || !plan.route ? {} : { direction: plan.route.direction }),
    },
  ];
}

/** Kování koní pro panel ohrady (horses.md – Kování, Co hráč vidí). */
export interface ShoeingView {
  /** Dny do příštího kování (záporné = termín prošel). */
  daysLeft: number;
  /** Termín prošel a koně nejsou podkutí – nejezdí. */
  unshod: boolean;
  /** Kdo by koně kul – vlastní kovář, kovář z jiné vsi, nebo nikdo. */
  source: 'own' | 'foreign' | 'none';
  /** Cena kování cizím kovářem (kg obilí), jen při `foreign`. */
  foreignKg: number;
  /** Dny cesty cizího kováře tam i zpět, jen při `foreign`. */
  foreignDays: number;
}

/**
 * Kování pro panel (horses.md – Kování): termín a kdo koně kuje; cenu cizího kováře počítá stejně
 * jako `planShoeing` (bez krajiny – cesta jako v kalibraci). Ves bez jezdeckých koní null.
 */
export function shoeingView(
  state: VillageState,
  day: number,
  coverage: CraftCoverage,
): ShoeingView | null {
  const horses = ridingHorses(state, day).length;
  // starší ves bez uloženého termínu: první termín by dostala od dneška (`ensureTerm`)
  const next = nextShoeingDay(state) ?? day + HORSE_SHOEING.everyDays;
  if (horses === 0) return null;
  const bars = horses * HORSE_SHOEING.ironBarsKg;
  const base = { daysLeft: next - day, unshod: isUnshod(state, day), foreignKg: 0, foreignDays: 0 };
  if (
    ownCraftsmanWorks(state, PRODUCT_CRAFT.toolsKg) &&
    (state.crafts?.ironBarsKg ?? 0) + EPSILON >= bars
  ) {
    return { ...base, source: 'own' };
  }
  const route = nearestCraftsman(state, 'smith', null);
  if (!route) return { ...base, source: 'none' };
  return {
    ...base,
    source: 'foreign',
    foreignKg: foreignValueKg(state, day, coverage, horses, route.days),
    foreignDays: route.days,
  };
}

/** Kování dne pro scénu (horses.md – Kování, Ve scéně): kdo dnes koně okul a odkud kovář přišel. */
export interface ShoeingDay {
  /** Vlastní kovář (z kovárny vsi), jinak kovář ze sousední vsi. */
  own: boolean;
  /** Okovaní jezdečtí koně – ohrada a kůň, v pořadí ohrad a koní. */
  horses: { penId: number; horseId: number }[];
  /** Cesta cizího kováře (směr, zemská stezka, bod na kraji mapy); vlastní null. */
  route: PurchaseRoute | null;
}

/**
 * Kování dne `day` jen ke čtení (scéna – kovář dojde k ohradě; horses.md – Kování): z kroniky
 * `horses-shod` toho dne, koně z ohrad koní, cizímu kováři směr k nejbližšímu sousedovi
 * s kovářem (`nearestCraftsman` – stejně jako `planShoeing`). Bez kování dne null.
 */
export function shoeingDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): ShoeingDay | null {
  let event: Extract<ChronicleEvent, { kind: 'horses-shod' }> | null = null;
  // kronika je od nejstarší – hledá se odzadu, jen dnešek
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const entry = state.chronicle[i]!;
    if (entry.day < day) break;
    if (entry.day === day && entry.kind === 'horses-shod') {
      event = entry;
      break;
    }
  }
  if (!event) return null;
  const riding = new Set(ridingHorses(state, day).map((h) => h.id));
  const horses = horsePens(state).flatMap((pen) =>
    penHorses(pen)
      .filter((h) => riding.has(h.id))
      .map((h) => ({ penId: pen.id, horseId: h.id })),
  );
  if (horses.length === 0) return null;
  const route = event.own ? null : nearestCraftsman(state, 'smith', landscape);
  return { own: event.own, horses, route };
}
