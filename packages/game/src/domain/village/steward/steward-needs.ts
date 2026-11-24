import { dateOfDayIndex } from '../../calendar';
import { huntDenied } from '../wildlife/hunt';
import { declareNpcHunt } from '../wildlife/npc-hunt';
import { STEWARD } from '../rules/rules-steward';
import { FIELD_DAMAGE } from '../rules/rules-wildlife';
import { fieldStoresOutlook } from '../core/simulate-plan';
import { stewardGrainStep, stewardMarketStep } from './steward-market';
import type { StewardContext } from './steward';
import type { VillageState } from '../types';

// Krok 2a dne správce – nouze (steward.md – Obilí a lov v nouzi; Martin 8. 11. 2026: „A“ – obojí,
// ale jen v nouzi): obilí kupuje na trhu u vsi okolí, jen když hrozí hlad (`stewardGrainStep`,
// steward-market.ts; markets.md – Rozhodnutí plánu 3, bod 8), a lov vyhlásí, jen když zvěř škodí na
// polích. Správce jedná stejnými akcemi jako hráč – výprava na trh (`departMarketInPlace`) a lov na
// zítřek (`huntDenied` + `declareNpcHunt`; hunting.md – Pravidla 8: „Správce je NPC hráč, takže na
// lov chodí on.“) – se stejnými kontrolami (lidé a vozy, hájení, honci). Rozhoduje jen ze stavu
// vsi a dne, bez náhody – výsledek nezávisí na kouscích dopočtu.

const EPSILON = 1e-9;

/** Podklady kroku 2a – den a pokrytí řemesly (výhled zásob). */
export type NeedContext = Pick<StewardContext, 'day' | 'coverage'>;

/**
 * Krok 2a (mutuje stav), podle výhledu zásob (`fieldStoresOutlook` – tentýž, ze kterého počítá režim
 * a pojistku): napřed obilí v nouzi (`stewardGrainStep` – výprava na trh pro chybějící obilí), pak
 * lov na zítřek, když zvěř škodí (`huntWanted` → `declareNpcHunt`, lov se zapíše do letošního
 * léta), nakonec roční výprava s potřebou vsi (`stewardMarketStep`).
 */
export function needSteps(state: VillageState, ctx: NeedContext): void {
  const targets = fieldStoresOutlook(state, ctx.day, ctx.coverage);
  stewardGrainStep(state, ctx, targets.shortKg);
  if (huntWanted(state, ctx.day, targets.needKg)) {
    declareNpcHunt(state, ctx.day);
    countSummerHunt(state, ctx.day);
  }
  stewardMarketStep(state, ctx);
}

/**
 * Lov správce (stav nemění; hunting.md – Pravidla 8 – stejná podmínka jako dřív u lovu navíc):
 * zvěř škodí na polích – v měsících škod (`FIELD_DAMAGE.windowMonths`) je škoda letos nebo loni
 * aspoň `STEWARD.huntDamageShare` roční potřeby obilí z pole `needKg` – a lov s honci zítra pravidla
 * lovu dovolí (`huntDenied` na den honců – hájení, lov správce na zítřek už je, zvěř v lese, honci).
 * Nejvýš `STEWARD.huntsPerSummer` lovů za léto.
 */
export function huntWanted(state: VillageState, day: number, needKg: number): boolean {
  const damage = state.wildlife?.damage;
  if (!damage) return false;
  const { month } = dateOfDayIndex(day);
  const window = FIELD_DAMAGE.windowMonths;
  if (month < window.from || month > window.to) return false;
  if (summerHuntsOf(state, day) >= STEWARD.huntsPerSummer) return false;
  const kg = Math.max(damage.totalKg, damage.lastYearKg ?? 0);
  if (kg <= EPSILON || kg < STEWARD.huntDamageShare * needKg) return false;
  return huntDenied(state, day + 1, state.wildlife?.hunt?.npc?.day === day + 1) === null;
}

/** Kolik lovů správce letos v létě vyhlásil (`steward.summerHunts`). */
function summerHuntsOf(state: VillageState, day: number): number {
  const hunts = state.steward?.summerHunts;
  return hunts?.year === dateOfDayIndex(day).year ? hunts.count : 0;
}

/** Zapíše vyhlášený lov správce do letošního léta (mutuje stav). */
function countSummerHunt(state: VillageState, day: number): void {
  if (!state.steward) return;
  const year = dateOfDayIndex(day).year;
  state.steward.summerHunts = { year, count: summerHuntsOf(state, day) + 1 };
}
