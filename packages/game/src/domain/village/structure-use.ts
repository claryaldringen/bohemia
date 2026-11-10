import { structureCondition } from './abandonment';
import type { BuildResult } from './build-intent';
import { cloneState } from './clone';
import { demolitionOf, isDisused } from './disused';
import { villageManorId } from './manor';
import { villagePens } from './oxen';
import { lodgingShortfall, noRoomReason, vacateDwelling } from './displaced';
import { oxenOf, penSpecies } from './pens';
import { returnConstructionWood } from './relocation';
import { cancelRepair, startRepair } from './repair';
import { villageOrchards } from './orchard';
import { clearWildTrees } from './wild-orchard';
import { villageGrainPits } from './grain-pits';
import { villageThreshingFloors } from './threshing-floors';
import { villageCemeteries } from './cemetery';
import type {
  Cemetery,
  Dwelling,
  GrainPit,
  Orchard,
  Pen,
  SacredBuilding,
  ThreshingFloor,
  UsableStructure,
  VillageState,
} from './types';

// Nepoužívaná stavba – Opustit a Vrátit (demolition.md – Opuštění; Martin 8. 11. 2026: „Hráč/správce
// může nechat stavbu opustit nebo zbourat.“). Opuštění nic nestojí a stavba hned přestane sloužit:
// obydlí se vystěhuje (lidé bydlí dočasně jinde – displaced.ts) a neosídlí se, ohrada nedrží stádo, modla a svatyně nedávají štěstí. Stavba
// stojí a chátrá jako opuštěná stavba (abandonment.md) – bez roční kontroly provozu a bez opravy,
// opravit ji může jen hráč tím, že ji vrátí. Zbourání (Ú3) staví na tomto
// modulu.

export type { UsableStructure } from './types';
export { isDisused } from './disused';

/** Která stavba se opouští nebo vrací – druh a id (obydlí včetně dílny, ohrada, modla, svatyně). */
export interface UsableRef {
  structure: UsableStructure;
  id: number;
}

export const STRUCTURE_MISSING = 'Taková stavba ve vsi není.';
export const STRUCTURE_UNFINISHED = 'Rozestavěnou stavbu jde jen zrušit.';
export const MANOR_STAYS = 'Dvorec je sídlo vojvody – opustit ani zbourat nejde.';
export const STRUCTURE_BUSY = 'Na stavbě se staví – nejdřív stavbu dokonči nebo zruš.';
export const ALREADY_DISUSED = 'Stavba už je opuštěná.';
export const DEMOLISHING = 'Stavba se bourá – nejdřív bourání zruš.';
export const NOT_DISUSED = 'Stavba se používá.';
/** Hřbitov se neopouští – jen zbourá (christianity.md; demolition.md – Hřbitov). */
export const CEMETERY_STAYS = 'Hřbitov opustit nejde – hroby zůstávají.';

export type Target =
  | { structure: 'dwelling'; item: Dwelling }
  | { structure: 'pen'; item: Pen }
  | { structure: 'idol' | 'shrine'; item: SacredBuilding }
  | { structure: 'threshing-floor'; item: ThreshingFloor }
  | { structure: 'grain-pit'; item: GrainPit }
  | { structure: 'orchard'; item: Orchard }
  | { structure: 'cemetery'; item: Cemetery };

export function targetOf(state: VillageState, ref: UsableRef): Target | null {
  if (ref.structure === 'dwelling') {
    const item = state.dwellings.find((d) => d.id === ref.id);
    return item ? { structure: 'dwelling', item } : null;
  }
  if (ref.structure === 'pen') {
    const item = villagePens(state).find((p) => p.id === ref.id);
    return item ? { structure: 'pen', item } : null;
  }
  if (ref.structure === 'threshing-floor') {
    const item = villageThreshingFloors(state).find((f) => f.id === ref.id);
    return item ? { structure: 'threshing-floor', item } : null;
  }
  if (ref.structure === 'grain-pit') {
    const item = villageGrainPits(state).find((p) => p.id === ref.id);
    return item ? { structure: 'grain-pit', item } : null;
  }
  if (ref.structure === 'orchard') {
    const item = villageOrchards(state).find((o) => o.id === ref.id);
    return item ? { structure: 'orchard', item } : null;
  }
  if (ref.structure === 'cemetery') {
    const item = villageCemeteries(state).find((c) => c.id === ref.id);
    return item ? { structure: 'cemetery', item } : null;
  }
  const item = (state.sacredBuildings ?? []).find(
    (b) => b.id === ref.id && b.kind === ref.structure,
  );
  return item ? { structure: ref.structure, item } : null;
}

/**
 * Je stavba dvorcem vsi? Dvorec je i zemnice zakladatelů, dokud se nepřestaví (trade.md – Dvorec
 * vojvody), proto podle `villageManorId`, ne jen podle typu.
 */
export function isManorTarget(state: VillageState, target: Target): boolean {
  return (
    target.structure === 'dwelling' &&
    (target.item.type === 'dvorec' || target.item.id === villageManorId(state))
  );
}

/** Důvod, proč stavbu nejde opustit (česky pro hráče); null = jde. */
export function disuseBlock(
  state: VillageState,
  ref: UsableRef,
  day: number = state.lastDay,
): string | null {
  const target = targetOf(state, ref);
  if (!target) return STRUCTURE_MISSING;
  if (isManorTarget(state, target)) return MANOR_STAYS;
  if (isDisused(target.item)) return ALREADY_DISUSED;
  if (target.structure === 'cemetery') return CEMETERY_STAYS;
  if (target.structure === 'dwelling') {
    // obyvatelé se rozejdou do volných míst v ostatních obydlích (displaced.ts)
    const missing = lodgingShortfall(state, target.item.id, day);
    return missing > 0 ? noRoomReason(missing) : null;
  }
  if (target.structure === 'pen') {
    if (target.item.builtDay === null) return STRUCTURE_UNFINISHED;
    const penId = target.item.id;
    const extending = state.constructions.some(
      (c) => c.kind === 'pen' && c.penId === penId && c.extends,
    );
    return extending ? STRUCTURE_BUSY : null;
  }
  if (target.structure === 'threshing-floor') {
    return target.item.builtDay === null ? STRUCTURE_UNFINISHED : null;
  }
  if (target.structure === 'orchard') {
    // výsadba nebo obnova sadu běží jako stavba – napřed ji dokonči nebo zruš (návrh Clauda)
    const orchardId = target.item.id;
    return state.constructions.some((c) => c.kind === 'orchard' && c.orchardId === orchardId)
      ? STRUCTURE_BUSY
      : null;
  }
  return null;
}

/**
 * Opustí stavbu (mutuje klon stavu – kontrolu `disuseBlock` dělá volající): zapíše `disusedDay`.
 * Obydlí zruší svou rozestavěnou přestavbu (dřevo na hromadu); modla, svatyně a ohrada zruší
 * opravu a začnou chátrat od svého stavu (`wear`). Zvířata z ohrady jsou bez ohrady (návrh Clauda:
 * koně `looseHorses`, voli `looseOxen` – přejdou do jiné ohrady, až bude).
 */
export function beginDisuse(next: VillageState, day: number, ref: UsableRef): void {
  const target = targetOf(next, ref);
  if (!target) return;
  target.item.disusedDay = day;
  if (target.structure === 'dwelling') {
    const dwellingId = target.item.id;
    vacateDwelling(next, day, dwellingId);
    for (const c of next.constructions.filter(
      (x) => x.kind === 'rebuild' && x.dwellingId === dwellingId,
    )) {
      returnConstructionWood(next, c);
    }
    next.constructions = next.constructions.filter(
      (x) => !(x.kind === 'rebuild' && x.dwellingId === dwellingId),
    );
    return;
  }
  if (
    target.structure === 'threshing-floor' ||
    target.structure === 'grain-pit' ||
    target.structure === 'orchard'
  ) {
    beginFarmDisuse(day, target);
    return;
  }
  // bouraný hřbitov jen přestane přijímat mrtvé (`acceptsBurials`), plot chátrá po svém
  if (target.structure === 'cemetery') return;
  cancelRepair(next, { structure: target.structure, id: target.item.id });
  const condition = structureCondition(target.item.wear, target.structure, day);
  target.item.wear = { condition, abandonedDay: day };
  if (target.structure === 'pen') releaseAnimals(next, target.item);
}

/**
 * Opuštění humna, jámy a sadu (mutuje stav; `disusedDay` už je zapsané). Humno od pokynu nemlátí
 * a po ABANDONMENT.overgrowYears letech zaroste (`idleSince`, nejpozději od pokynu); jáma se
 * vyprázdní – zrno je pak mimo jámy, zásoby se nemění (návrh Clauda); sad se přestane ošetřovat
 * a sklízet (obnova a sklizeň ho přeskočí).
 */
function beginFarmDisuse(
  day: number,
  target: Extract<Target, { structure: 'threshing-floor' | 'grain-pit' | 'orchard' }>,
): void {
  if (target.structure === 'threshing-floor') {
    target.item.idleSince ??= day;
    delete target.item.threshed;
  } else if (target.structure === 'grain-pit') {
    target.item.grainKg = 0;
    target.item.state = 'empty';
    delete target.item.filledDay;
  }
}

/** Zvířata opuštěné ohrady zůstanou ve vsi bez ohrady (mutuje stav). */
function releaseAnimals(next: VillageState, pen: Pen): void {
  const species = penSpecies(pen);
  if (species === 'horse' && pen.horses && pen.horses.length > 0) {
    next.looseHorses = [...(next.looseHorses ?? []), ...pen.horses];
    delete pen.horses;
  } else if (species === 'team') {
    const oxen = oxenOf(pen);
    if (oxen.length > 0)
      next.looseOxen = [...(next.looseOxen ?? []), ...oxen.map((o) => ({ ...o }))];
    delete pen.oxen;
    delete pen.team;
    delete pen.training;
  }
}

/** Opustí stavbu; vstupní stav nemění. */
export function abandonStructure(state: VillageState, day: number, ref: UsableRef): BuildResult {
  const reason = disuseBlock(state, ref);
  if (reason) return { ok: false, reason };
  const next = cloneState(state);
  beginDisuse(next, day, ref);
  next.chronicle.push({ day, kind: 'structure-abandoned', structure: ref.structure, id: ref.id });
  return { ok: true, state: next };
}

/**
 * Vrátí opuštěnou stavbu (dokud stojí): smaže `disusedDay`. Modla, svatyně a ohrada přestanou
 * chátrat a vesničané je opraví ze stavu, do kterého zchátraly (abandonment.md – Oprava); obydlí
 * stav nezvedá (návrh Clauda; population.md – znovuosídlené obydlí) a znovu se osídlí. Vstupní
 * stav nemění.
 */
export function restoreStructure(state: VillageState, day: number, ref: UsableRef): BuildResult {
  const target = targetOf(state, ref);
  if (!target) return { ok: false, reason: STRUCTURE_MISSING };
  if (!isDisused(target.item)) return { ok: false, reason: NOT_DISUSED };
  // stavba, kterou vesničané právě bourají, se nevrací (demolition.md – Bourání)
  if (demolitionOf(state, ref)) return { ok: false, reason: DEMOLISHING };
  const next = cloneState(state);
  const restored = targetOf(next, ref)!;
  delete restored.item.disusedDay;
  if (restored.structure === 'threshing-floor') {
    // vrácené humno se hned mlátí a tráva ustoupí (návrh Clauda – bez opravy)
    delete restored.item.idleSince;
  } else if (
    restored.structure !== 'dwelling' &&
    restored.structure !== 'grain-pit' &&
    restored.structure !== 'orchard' &&
    restored.structure !== 'cemetery'
  ) {
    const condition = structureCondition(restored.item.wear, restored.structure, day);
    if (condition >= 1) delete restored.item.wear;
    else restored.item.wear = { condition };
    startRepair(next, day, { structure: restored.structure, id: restored.item.id }, condition);
  }
  // vrácený sad je zase pravidelný – vesničané nálet vyklučí (orchard.md – Zdivočelý sad)
  if (restored.structure === 'orchard') clearWildTrees(next, restored.item);
  next.chronicle.push({ day, kind: 'structure-restored', structure: ref.structure, id: ref.id });
  return { ok: true, state: next };
}
