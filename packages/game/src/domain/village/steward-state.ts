import { cloneState } from './clone';
import { STEWARD } from './rules-steward';
import type { StewardState } from './types-steward';
import type { VillageState } from './types-state';

// Stav správce vsi (steward.md – Stav správce, Převod jednou a idempotentně).

/** Nový stav správce od dne `day`. */
export function newSteward(day: number, on: boolean): StewardState {
  return { on, sinceDay: day, built: [] };
}

/**
 * Převod: ves bez `steward` ho dostane vypnutý (i ves syna před fází 3 – hráč ji řídil sám).
 * Jednou a idempotentně – ves, která stav má, se vrací beze změny (týž objekt).
 */
export function withSteward(state: VillageState): VillageState {
  if (state.steward !== undefined) return state;
  const next = cloneState(state);
  next.steward = newSteward(next.lastDay, false);
  return next;
}

export function isStewardOn(state: VillageState): boolean {
  return state.steward?.on === true;
}

/** Zapíše značku „postavil správce“ (mutuje `state`). */
export function markStewardBuilt(state: VillageState, id: number): void {
  const steward = (state.steward ??= newSteward(state.lastDay, false));
  if (!steward.built.includes(id)) steward.built.push(id);
}

/**
 * Správce založil stavbu `constructionId` (mutuje `state`): značka stavby a u pole i jeho právě
 * zakládané díly (rozšíření hráčova pole označí jen nové díly, ne celé pole – `finishConstructions`
 * předá značku celku jen u entity, kterou stavba sama založila). Stavba, která neexistuje, nic.
 */
export function markStewardStarted(state: VillageState, constructionId: number): void {
  const c = state.constructions.find((x) => x.id === constructionId);
  if (!c) return;
  markStewardBuilt(state, c.id);
  // opevnění, které správce založil nebo vylepšuje, je jeho (hráčovo nemění – fortifications.md)
  if (c.kind === 'fortification' && c.fortificationId !== undefined) {
    markStewardBuilt(state, c.fortificationId);
  }
  if (c.kind !== 'field') return;
  for (const p of state.parts) {
    if (p.fieldId === c.fieldId && p.state === 'founding') markStewardBuilt(state, p.id);
  }
}

export function isStewardBuilt(state: VillageState, id: number): boolean {
  return state.steward?.built.includes(id) === true;
}

/** Přepne správce ke dni `day` (mutuje `state`); stejná hodnota den nemění. */
export function setStewardOn(state: VillageState, day: number, on: boolean): void {
  const created = state.steward === undefined;
  const steward = (state.steward ??= newSteward(day, on));
  if (steward.on === on) {
    if (created) assessHillfort(state, steward, day);
    return;
  }
  steward.on = on;
  steward.sinceDay = day;
  assessHillfort(state, steward, day);
}

/** Doména do vsi dováží jídlo: přišlo za posledních `STEWARD.hillfortImportDays` dní. */
export function importsDomainFood(
  state: Pick<VillageState, 'domainFoodDay'>,
  day: number,
): boolean {
  return (
    state.domainFoodDay !== undefined && day - state.domainFoodDay < STEWARD.hillfortImportDays
  );
}

/** Hradiště se posuzuje při zapnutí správce; vypnutí značku maže (hillfort.md). */
function assessHillfort(state: VillageState, steward: StewardState, day: number): void {
  if (steward.on && importsDomainFood(state, day)) steward.hillfort = true;
  else delete steward.hillfort;
}

/**
 * Úklid značky „postavil správce“ (mutuje `state`): vypustí id staveb, dílů a entit, které už ve
 * stavu neexistují a nejsou v otisku plánu (dokončená stavba, zaniklé obydlí, zrušené pole), aby `built` nerostlo bez
 * konce. Deterministické a idempotentní – pořadí zbylých id se zachová.
 */
export function pruneStewardBuilt(state: VillageState): void {
  const steward = state.steward;
  if (!steward || steward.built.length === 0) return;
  const alive = new Set<number>();
  for (const list of [
    state.constructions,
    state.dwellings,
    state.fields,
    state.parts,
    state.cemeteries ?? [],
    state.orchards ?? [],
    state.pens ?? [],
    state.threshingFloors ?? [],
    state.sacredBuildings ?? [],
    state.fortifications ?? [],
    state.roads?.roads ?? [],
  ] as readonly { id: number }[][]) {
    for (const e of list) alive.add(e.id);
  }
  // id v otisku plánu zůstanou: `needsReplan` podle nich počítá změny (zmizelé, ale vlastní nejsou změna)
  for (const plan of [steward.plan, steward.nextPlan])
    for (const id of plan?.stamp ?? []) alive.add(id);
  if (steward.built.every((id) => alive.has(id))) return;
  steward.built = steward.built.filter((id) => alive.has(id));
}
