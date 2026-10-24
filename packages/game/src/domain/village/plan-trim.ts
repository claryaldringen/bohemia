import { startedPartIds } from './field-progress';
import { expectedNetKg, isSowableFertility, partWalkDistance } from './fields';
import { dropFromWork, shrinkInPlan } from './land-taken';
import { expectedLegumeKg, legumeEnergy } from './legumes';
import { extraPartsOf, queueExtraParts } from './extra-sowing';
import type { Crop, CropWork, ExtraPart, FieldPart, VillageState, YearPlan } from './types';
import { planCrops } from './year-plan';

// Zkrácení rozjetého plánu podle zásob (fields.md – Kolik ves oseje, Osev podle zásob; Martin
// 19. 10. 2026: „Ano“ k návrhu „Rozjetá práce na poli půjde přerušit hned: když ves podle nového
// pravidla zjistí, že má zásob dost, přestane kopat nové díly už letos a neodloží to až na
// 1. září“). Z plánu zmizí jen díly, na kterých ještě nezačala žádná práce (vrácení přílohu, orba,
// kopání, setí…) – od konce pořadí práce, nejdál od domu první; rozpracovaný a zasetý díl zůstane.
// Ubraný díl leží ladem jako příloh (ten, který se vracel z přílohu, jak ležel předtím) a čeká
// v osevu navíc – oseje se, zbude-li po stavbách práce (fields.md – Osev navíc). Práce
// plodiny ubude o jeho podíl a čelo práce ostatních dílů zůstane, kde bylo (`shrinkInPlan` – jako
// když díl zabere stavba), takže postup po čtvercích a vzhled dílů dál sedí.

/** Tolerance porovnání energie (kg obilí). */
const EPSILON = 1e-6;

/**
 * Očekávaná energie úrody dílu plodiny (kg obilí, luštěniny svou energií, len žádnou – nejí se) –
 * jako `chooseCrops`.
 */
function partEnergy(part: FieldPart, crop: Crop, day: number): number {
  if (crop === 'flax') return 0;
  return crop === 'legume' ? legumeEnergy(expectedLegumeKg(part, day)) : expectedNetKg(part, day);
}

/** Očekávaná energie úrody plánu (kg obilí) – plodiny, které se ještě nesklidily. */
export function planEnergyKg(state: VillageState, plan: YearPlan, day: number): number {
  const partsById = new Map(state.parts.map((p) => [p.id, p]));
  let energy = 0;
  for (const { crop, work } of planCrops(plan)) {
    if (work.harvestedKg !== null) continue;
    for (const id of work.partIds) {
      const part = partsById.get(id);
      if (part) energy += partEnergy(part, crop, day);
    }
  }
  return energy;
}

/**
 * Poslední díl obilí plodiny v pořadí práce, na kterém ještě nezačala žádná práce (žádná úloha
 * nedošla na jeho začátek), nebo null. Úseky dílů se spočítají jednou za úlohu.
 */
function lastUntouched(
  work: CropWork,
  partsById: ReadonlyMap<number, FieldPart>,
  day: number,
): FieldPart | null {
  // díl je nezačatý, když žádná úloha nepřešla jeho začátek; nouzový příloh pod 70 % první
  // (fields.md – Nouzový osev: jen když díly od 70 % nestačí)
  const started = startedPartIds(work, partsById, day);
  let last: FieldPart | null = null;
  for (let i = work.partIds.length - 1; i >= 0; i--) {
    const id = work.partIds[i]!;
    const part = partsById.get(id);
    if (!part || started.has(id)) continue;
    if (!isSowableFertility(part)) return part;
    last ??= part;
  }
  return last;
}

/** Ubraný díl leží ladem – příloh, ze kterého se vracel, jak ležel; jinak příloh od plánu. */
function toFallow(part: FieldPart, plannedDay: number): void {
  const before = part.fallowBeforePlan;
  part.state = 'fallow';
  part.fallowSinceDay = before ? before.sinceDay : plannedDay;
  part.sownYears = 0;
  delete part.crop;
  if (before?.overgrowthYears !== undefined) part.overgrowthYears = before.overgrowthYears;
  delete part.fallowBeforePlan;
}

/**
 * Zkrátí letošní plán na cíl podle zásob (mutuje stav – volat na klonu): když očekávaná úroda
 * plánu převyšuje `targetKg` o víc než `marginKg`, ubírá z obilí (ozim a jař – luštěniny se sejí
 * podle bílkovin) nezačaté díly od konce pořadí práce, dokud úroda bez dalšího dílu neklesne pod
 * cíl. Z konců obou plodin jde první díl dál od domu (chůze po pěšinách). Ubrané díly jdou na
 * začátek osevu navíc (`YearPlan.extra`). Vrací id ubraných dílů.
 */
export function trimPlanToTarget(
  state: VillageState,
  day: number,
  targetKg: number,
  marginKg: number,
): number[] {
  const plan = state.plan;
  if (!plan) return [];
  let energy = planEnergyKg(state, plan, day);
  if (energy <= targetKg + marginKg + EPSILON) return [];
  const removed: number[] = [];
  const moved: ExtraPart[] = [];
  for (;;) {
    const partsById = new Map(state.parts.map((p) => [p.id, p]));
    let best: { part: FieldPart; crop: Crop; work: CropWork } | null = null;
    for (const { crop, work } of planCrops(plan)) {
      // ubírá se jen obilí – luštěniny podle bílkovin a len na oděv zůstanou
      if (crop === 'legume' || crop === 'flax' || work.harvestedKg !== null) continue;
      const part = lastUntouched(work, partsById, day);
      if (!part) continue;
      // nouzový příloh první, pak nejdál od domu; při shodě jař (kope se a seje nejpozději)
      const emergency = !isSowableFertility(part);
      if (emergency !== (best !== null && !isSowableFertility(best.part))) {
        if (emergency) best = { part, crop, work };
      } else if (
        !best ||
        partWalkDistance(part) > partWalkDistance(best.part) ||
        (partWalkDistance(part) === partWalkDistance(best.part) && crop === 'spring')
      ) {
        best = { part, crop, work };
      }
    }
    if (!best) break;
    const lost = partEnergy(best.part, best.crop, day);
    if (energy - lost < targetKg - EPSILON) break;
    shrinkInPlan(state, plan, best.part, 1, day);
    dropFromWork(best.work, new Set([best.part.id]));
    // do osevu navíc jen díl v oběhu (nouzový ani odpočívající příloh tam nesmí)
    moved.push(...extraPartsOf([best.part]));
    toFallow(best.part, plan.plannedDay);
    energy -= lost;
    removed.push(best.part.id);
  }
  // ubrané díly čekají v osevu navíc – ve výběru byly před ostatními, nejblíž domu první
  // (fields.md – Osev navíc)
  queueExtraParts(plan, moved.reverse(), true);
  return removed;
}
