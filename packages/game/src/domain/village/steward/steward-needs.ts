import { dateOfDayIndex } from '../../calendar';
import { huntDenied } from '../wildlife/hunt';
import { declareNpcHunt } from '../wildlife/npc-hunt';
import { STEWARD } from '../rules/rules-steward';
import { FIELD_DAMAGE } from '../rules/rules-wildlife';
import { fieldStoresOutlook } from '../core/simulate-plan';
import type { StewardContext } from './steward';
import type { VillageState } from '../types';

// Krok 2a dne správce – nouze (steward.md – Lov v nouzi; Martin 8. 11. 2026: „A“): lov vyhlásí,
// jen když zvěř škodí na polích. Správce jedná stejnou akcí jako hráč – lov na zítřek
// (`huntDenied` + `declareNpcHunt`; hunting.md – Pravidla 8: „Správce je NPC hráč, takže na lov
// chodí on.“) – se stejnými kontrolami (hájení, honci). Obilí od sousedů už nekupuje (Martin
// 22. 11. 2026: „Ves by měla být schopná přežít a rozvíjet se dle současných pravidel i bez
// obchodu“; markets.md – Pravidla 1). Rozhoduje jen ze stavu vsi a dne, bez náhody – výsledek
// nezávisí na kouscích dopočtu.

const EPSILON = 1e-9;

/** Podklady kroku 0 – den, krajina (sjízdnost stezky pro vozy) a pokrytí řemesly. */
export type NeedContext = Pick<StewardContext, 'day' | 'landscape' | 'coverage'>;

/**
 * Krok 2a (mutuje stav): lov na zítřek, když zvěř škodí (`huntWanted` → `declareNpcHunt`, lov se
 * zapíše do letošního léta), podle roční potřeby obilí z výhledu zásob (`fieldStoresOutlook` –
 * tentýž, ze kterého počítá režim a pojistku).
 */
export function needSteps(state: VillageState, ctx: NeedContext): void {
  const targets = fieldStoresOutlook(state, ctx.day, ctx.coverage);
  if (huntWanted(state, ctx.day, targets.needKg)) {
    declareNpcHunt(state, ctx.day);
    countSummerHunt(state, ctx.day);
  }
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
