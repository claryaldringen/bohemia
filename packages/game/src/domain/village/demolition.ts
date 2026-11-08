import { structureCondition } from './abandonment';
import type { BuildResult } from './build-intent';
import { cloneState } from './clone';
import { BUILD_COSTS } from './costs';
import { demolitionOf } from './disused';
import { vacateDwelling } from './displaced';
import { PEN } from './oxen';
import { occupants } from './people';
import { returnConstructionWood } from './relocation';
import { orchardAreaM2, orchardSquareCenter } from './orchard';
import {
  DEMOLITION,
  DWELLING_TREES,
  GRAIN_PITS,
  HUMNO,
  ORCHARD,
  SACRED_BUILDINGS,
  workshopTrees,
} from './rules';
import {
  MANOR_STAYS,
  STRUCTURE_MISSING,
  beginDisuse,
  disuseBlock,
  isManorTarget,
  targetOf,
  type Target,
  type UsableRef,
} from './structure-use';
import { addLogs } from './wood';
import { clearWildTrees } from './wild-orchard';
import type { ChronicleEvent, Construction, VillageState } from './types';

// Bourání stavby (docs/design/demolition.md – Bourání; Martin 8. 11. 2026: „Hráč/správce může nechat
// stavbu opustit nebo zbourat.“). Bourání je stavba `demolition` ze společné práce vsi jako oprava:
// stavba hned přestane sloužit (opustí se), vesničané ji rozeberou a po dokončení zmizí bez
// zříceniny; část klád skončí na hromadě u cesty nejblíž stavbě. Stav, ve kterém stavba je, když se
// dobourá, určuje klády – opuštěná stavba mezitím chátrá.

export { demolitionOf } from './disused';

export const ALREADY_DEMOLISHING = 'Stavba se už bourá.';
export { DEMOLISHING } from './structure-use';

/** Cena stavby z nabídky (člověkodny) a počet stromů, ze kterých je. */
function buildPrice(target: Target): { laborManDays: number; trees: number } {
  if (target.structure === 'dwelling') {
    const d = target.item;
    if (d.workshop) {
      return {
        laborManDays: BUILD_COSTS[d.workshop.craft].laborManDays,
        trees: workshopTrees(d.workshop.craft),
      };
    }
    return {
      laborManDays: BUILD_COSTS[d.type as 'zemnice'].laborManDays,
      trees: DWELLING_TREES[d.type],
    };
  }
  if (target.structure === 'pen') return { laborManDays: PEN.laborManDays, trees: PEN.trees };
  // humno, jáma a sad nedávají klády (Martin 8. 11. 2026: vykácený sad žádné klády – „C“)
  if (target.structure === 'threshing-floor') return { laborManDays: HUMNO.laborManDays, trees: 0 };
  if (target.structure === 'grain-pit') return { laborManDays: GRAIN_PITS.digManDays, trees: 0 };
  if (target.structure === 'orchard') {
    return {
      laborManDays: (ORCHARD.plantingPerHa * orchardAreaM2(target.item)) / 10_000,
      trees: 0,
    };
  }
  const spec = SACRED_BUILDINGS[target.structure];
  return { laborManDays: spec.laborManDays, trees: spec.oaks };
}

/** Stav stavby 0–1 v den `day` (obydlí `condition`, ostatní chátrání). */
function conditionOf(target: Target, day: number): number {
  if (target.structure === 'dwelling') return Math.max(0, Math.min(1, target.item.condition));
  if (
    target.structure === 'threshing-floor' ||
    target.structure === 'grain-pit' ||
    target.structure === 'orchard'
  ) {
    return 1;
  }
  return structureCondition(target.item.wear, target.structure, day);
}

/** Kde stavba stojí (pro hromadu klád a místo práce). */
function placeOf(target: Target): { x: number; z: number } {
  if (target.structure === 'pen' || target.structure === 'grain-pit') {
    return { x: target.item.x, z: target.item.z };
  }
  if (target.structure === 'orchard') {
    const first = target.item.squares[0];
    return first ? orchardSquareCenter(target.item, first) : { x: 0, z: 0 };
  }
  return { x: target.item.position.x, z: target.item.position.z };
}

/**
 * Cena bourání: člověkodny (`laborShare` ceny stavby z nabídky) a klády, které by dalo v den `day`
 * (`floor(logShare × stromy × stav)`); stavba, která není, null.
 */
export function demolitionCost(
  state: VillageState,
  ref: UsableRef,
  day: number,
): { laborManDays: number; logs: number } | null {
  const target = targetOf(state, ref);
  if (!target) return null;
  const price = buildPrice(target);
  return {
    laborManDays: DEMOLITION.laborShare * price.laborManDays,
    logs: Math.floor(DEMOLITION.logShare * price.trees * conditionOf(target, day)),
  };
}

/** Důvod, proč stavbu nejde zbourat (česky pro hráče); null = jde. */
export function demolitionBlock(
  state: VillageState,
  ref: UsableRef,
  day: number = state.lastDay,
): string | null {
  const target = targetOf(state, ref);
  if (!target) return STRUCTURE_MISSING;
  if (demolitionOf(state, ref)) return ALREADY_DEMOLISHING;
  if (isManorTarget(state, target)) return MANOR_STAYS;
  if (target.item.disusedDay !== undefined) return null;
  // stavba se napřed opustí (obyvatelé se rozejdou, ohrada nesmí být ve stavbě)
  return disuseBlock(state, ref, day);
}

/**
 * Založí bourání (mutuje klon, bez kontrol – použije i správce): stavba se opustí, pokud ještě není,
 * a ze společné práce vznikne stavba `demolition`.
 */
export function startDemolition(next: VillageState, day: number, ref: UsableRef): void {
  const target = targetOf(next, ref);
  if (!target || demolitionOf(next, ref)) return;
  if (target.item.disusedDay === undefined) beginDisuse(next, day, ref);
  const cost = demolitionCost(next, ref, day);
  if (!cost) return;
  const at = placeOf(target);
  next.constructions.push({
    id: next.nextId++,
    kind: 'demolition',
    startedDay: day,
    cost: cost.laborManDays,
    done: 0,
    dwellingType: null,
    position: { x: at.x, z: at.z, rotation: 0 },
    dwellingId: null,
    fieldId: null,
    demolition: { structure: ref.structure, id: ref.id },
  });
}

/** Hráč zboří stavbu: opustí ji a založí bourání; vstupní stav nemění. */
export function demolishStructure(state: VillageState, day: number, ref: UsableRef): BuildResult {
  const reason = demolitionBlock(state, ref, day);
  if (reason) return { ok: false, reason };
  const next = cloneState(state);
  startDemolition(next, day, ref);
  return { ok: true, state: next };
}

/** Kolik práce bourání dnes chybí; stavba, která už není, nic. */
export function demolitionNeed(state: VillageState, c: Construction): number {
  if (!c.demolition || !targetOf(state, c.demolition)) return 0;
  return Math.max(0, c.cost - c.done);
}

/** Je bourání hotové (všechna práce, nebo stavba už není)? */
export function isDemolitionFinished(state: VillageState, c: Construction): boolean {
  return c.done >= c.cost || !c.demolition || !targetOf(state, c.demolition);
}

/**
 * Dokončené bourání (mutuje stav): stavba zmizí bez zříceniny a klády jdou na hromadu u cesty.
 * Stavba, která mezitím zanikla (prázdné obydlí zchátralo, opuštěná ohrada spadla), nic – bez klád
 * a bez kroniky. Obydlí, ve kterém by ještě někdo bydlel, zůstane stát (nic se nestane).
 */
export function finishDemolition(
  next: VillageState,
  day: number,
  c: Construction,
): ChronicleEvent | null {
  const ref = c.demolition;
  const target = ref ? targetOf(next, ref) : null;
  if (!ref || !target) return null;
  if (target.structure === 'dwelling') {
    if (occupants(next, target.item.id).length > 0) vacateDwelling(next, day, target.item.id);
    if (occupants(next, target.item.id).length > 0) return null;
  }
  const logs = demolitionCost(next, ref, day)?.logs ?? 0;
  const at = placeOf(target);
  if (target.structure === 'dwelling') {
    next.dwellings = next.dwellings.filter((d) => d.id !== ref.id);
  } else if (target.structure === 'pen') {
    // rozestavěná rozšíření a rádlo ohrady zmizí s ní (dřevo zpět na hromadu)
    for (const x of next.constructions.filter(
      (k) => (k.kind === 'pen' || k.kind === 'ard') && k.penId === ref.id,
    )) {
      returnConstructionWood(next, x);
    }
    next.constructions = next.constructions.filter(
      (k) => !((k.kind === 'pen' || k.kind === 'ard') && k.penId === ref.id),
    );
    next.pens = (next.pens ?? []).filter((p) => p.id !== ref.id);
  } else if (target.structure === 'threshing-floor') {
    next.threshingFloors = (next.threshingFloors ?? []).filter((f) => f.id !== ref.id);
    if (next.threshingFloors.length === 0) delete next.threshingFloors;
  } else if (target.structure === 'grain-pit') {
    next.grainPits = (next.grainPits ?? []).filter((p) => p.id !== ref.id);
  } else if (target.structure === 'orchard') {
    // vykácený sad nedá klády ani z náletu (demolition.md – Rozhodnutí)
    clearWildTrees(next, target.item);
    next.orchards = (next.orchards ?? []).filter((o) => o.id !== ref.id);
    if (next.orchards.length === 0) delete next.orchards;
  } else {
    next.sacredBuildings = (next.sacredBuildings ?? []).filter((b) => b.id !== ref.id);
  }
  addLogs(next, logs, at);
  return { day, kind: 'structure-demolished', structure: ref.structure, id: ref.id, logs };
}
