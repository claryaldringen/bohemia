import type { Landscape } from '../../landscape';
import {
  PRODUCT_CRAFT,
  nearestCraftsman,
  ownCraftsmanWorks,
  type PurchaseRoute,
} from '../crafts/craft-buying';
import { isUnshod, nextShoeingDay, shoeingDue } from './horse-shoeing-term';
import { horsePens, penHorses, ridingHorses } from './horses';
import { HORSE_SHOEING } from '../rules';
import { addGood } from '../trade/trade';
import type { ChronicleEvent, VillageState } from '../types';

export { isUnshod, nextShoeingDay };

// Kování jezdeckých koní (horses.md – Kování; Martin 26. 10. 2026: „Jezdeckého koně je potřeba
// každé dva měsíce kovat. To obstará ideálně kovář ve vsi“). Celá ves se kuje najednou, termín je
// pevný: 60 dní od posledního kování (`VillageState.shoeing`). Kuje jen vlastní kovář (pracující
// kovárna se zásobou hřiven) z práce vsi a ze zásoby kovárny; kovář z jiné vsi zrušen
// (markets.md – Pravidla 1, vrátí se se skutečnými sousedy). Co se nepodaří, ves zkusí znovu každý
// den; kůň po termínu je nepodkutý (`isUnshod`) – nejezdí a nevycvičuje se. Kroky mutují stav
// (volat na klonu), čisté funkce stavu a dne; výsledek na kouscích dopočtu nezávisí.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Plán kování dne – vlastní kovář (práce vsi dnes, hřivny ze zásoby kovárny). */
export interface ShoeingPlan {
  /** Počet jezdeckých koní. */
  horses: number;
  /** Práce vsi dnes (čd). */
  manDays: number;
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

/**
 * Plán kování dne (horses.md – Kování; mutuje jen termín): jen v den termínu a po něm. Kuje jen
 * vlastní kovář – pracující kovárna s dost hřivnami; jinak null a ves to zkusí zítra (kůň po
 * termínu je nepodkutý – `isUnshod`; kovář z jiné vsi zrušen, markets.md – Pravidla 1).
 */
export function planShoeing(state: VillageState, day: number): ShoeingPlan | null {
  ensureTerm(state, day);
  if (!shoeingDue(state, day)) return null;
  const horses = ridingHorses(state, day).length;
  const bars = horses * HORSE_SHOEING.ironBarsKg;
  if (
    ownCraftsmanWorks(state, PRODUCT_CRAFT.toolsKg) &&
    (state.crafts?.ironBarsKg ?? 0) + EPSILON >= bars
  ) {
    return { horses, manDays: horses * HORSE_SHOEING.manDays };
  }
  return null;
}

/**
 * Dokončí kování dne (mutuje stav; po rozdělení práce): vlastní kovář jen když dostal celou práci
 * (`laborGiven`), odečte hřivny ze zásoby. Termín se posune na dnešek, kronika `horses-shod`.
 * Bez plánu nebo bez práce nic – ves zkusí zítra.
 */
export function finishShoeing(
  state: VillageState,
  day: number,
  plan: ShoeingPlan | null,
  laborGiven: number,
): ChronicleEvent[] {
  if (!plan || !state.shoeing) return [];
  if (laborGiven + EPSILON < plan.manDays) return [];
  addGood(state, 'ironBars', -plan.horses * HORSE_SHOEING.ironBarsKg, day);
  state.shoeing.lastDay = day;
  return [{ day, kind: 'horses-shod', horses: plan.horses, own: true }];
}

/** Kování koní pro panel ohrady (horses.md – Kování, Co hráč vidí). */
export interface ShoeingView {
  /** Dny do příštího kování (záporné = termín prošel). */
  daysLeft: number;
  /** Termín prošel a koně nejsou podkutí – nejezdí. */
  unshod: boolean;
  /** Kdo by koně kul – vlastní kovář, nebo nikdo. */
  source: 'own' | 'none';
}

/** Kování pro panel (horses.md – Kování): termín a kdo koně kuje. Ves bez jezdeckých koní null. */
export function shoeingView(state: VillageState, day: number): ShoeingView | null {
  const horses = ridingHorses(state, day).length;
  // starší ves bez uloženého termínu: první termín by dostala od dneška (`ensureTerm`)
  const next = nextShoeingDay(state) ?? day + HORSE_SHOEING.everyDays;
  if (horses === 0) return null;
  const bars = horses * HORSE_SHOEING.ironBarsKg;
  const own =
    ownCraftsmanWorks(state, PRODUCT_CRAFT.toolsKg) &&
    (state.crafts?.ironBarsKg ?? 0) + EPSILON >= bars;
  return { daysLeft: next - day, unshod: isUnshod(state, day), source: own ? 'own' : 'none' };
}

/**
 * Kování dne pro scénu (horses.md – Kování, Ve scéně): kdo dnes koně okul; cizí kovář jen ze
 * záznamu starší kroniky.
 */
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
