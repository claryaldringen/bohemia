// Plán sídla správce vsi (steward.md – Plán sídla, Výpočetní rozpočet). Ves jako celek: tři
// šablony rozvrhu (shluk, řadová ves, samoty v polnostech) se rozvrhnou hladově – domy a bloky
// polí po hospodářstvích –, vybere se ta s nejnižší cenou (člověkodny chůze a polní práce na tunu
// úrody), pak se ověří místa domů kontrolou umístění a přidají sloty ostatních staveb. Počítá se
// po etapách v po sobě jdoucích dnech správce; rozpracovaná etapa je ve stavu (`steward.plan`), takže
// dopočet po kouscích vyjde stejně. Jen deterministická matematika (ESLint pravidlo vrstvy překážek).

import { dateOfDayIndex } from '../calendar';
import { SURFACE_CODES, tileCenterWorld, type Landscape, type ObstacleLayer } from '../landscape';
import { villageCemeteries } from './cemetery';
import { craftCoverage } from './crafts';
import { netYieldPerHa, ROTATION, ROTATION_FACTOR } from './field-capacity';
import { fieldFoodShare, yearlyFoodNeed } from './field-food';
import { distanceFactor } from './fields';
import { checkDwellingPlacement, checkWorkshopPlacement } from './placement-dwellings';
import { cemeteryPartsFromCells, orchardPartsFromCells } from './placement-fields';
import { penSquaresFromCells } from './placement-pens';
import { checkThreshingFloorPlacement } from './placement-sacred';
import type { PlacementVillage } from './placement-types';
import { placementVillageOf, villageDwellingPositions } from './placement-village';
import { DWELLING_CLEARING_M } from './rules-buildings';
import { CRAFTS } from './rules-crafts';
import { FIELD_LIMITS, FOOD_NEED_KG_PER_YEAR } from './rules-fields';
import { CEMETERY_DISTANCE_M } from './rules-people';
import { STEWARD } from './rules-steward';
import {
  dwellingSiteValue,
  fieldCells,
  fieldCellValue,
  fieldTiles,
  landValues,
  takenTiles,
  planCentre,
  villageTerritory,
  walkDaysPerYear,
  type FieldCells,
  type LandValues,
} from './steward-land';
import { stewardOutlook } from './steward-outlook';
import type {
  CraftCoverage,
  PenSpecies,
  Position,
  StewardFarm,
  StewardPlan,
  StewardSlotKind,
  StewardTemplate,
  VillageState,
} from './types';

const DAYS_PER_YEAR = 365;
const TEMPLATES: readonly StewardTemplate[] = ['cluster', 'row', 'scattered'];
const DWELLING = 'zemnice';
/** Ostatní sloty v pořadí rozvrhu a ověřování (dřívější druh dostane sporné políčko). */
const EXTRA_KINDS: readonly StewardSlotKind[] = [
  'cemetery',
  'threshing-floor',
  'workshop',
  'orchard',
  'pen',
];
/** Ohrada slotu se ověří pro tento druh zvířat (druh rozhoduje jen o napojení na stojící ohradu). */
const SLOT_PEN_SPECIES: PenSpecies = 'cattle';
/** Ostatní sloty: políčko bloku polí přijde na řadu až po tolika políčkách volné země. */
const BLOCK_PENALTY = 20;
/** Ostatní sloty: 10 bodů úrodnosti váží jako políčko vzdálenosti. */
const FERTILITY_PER_TILE = 10;
/** Sad a ohrada nejvýš tolik políček od domu. */
const ORCHARD_HOUSE_TILES = 4;
const PEN_HOUSE_TILES = 7;
/** Nejmenší vzdálenost středů domů (m): rozestup + hloubka vyklízené plochy polozemnice. */
const HOUSE_CENTRE_M =
  STEWARD.houseSpacingM +
  (DWELLING_CLEARING_M.polozemnice.maxZ - DWELLING_CLEARING_M.polozemnice.minZ);

/**
 * Otisk plánu – seřazená id staveb vsi (obydlí, stavby, pole, hřbitovy, sady, ohrady, humna
 * a posvátné stavby) bez opakování.
 */
export function planStamp(state: VillageState): number[] {
  const ids = new Set<number>();
  const add = (list: readonly { id?: number }[] | undefined): void => {
    for (const item of list ?? []) if (item.id !== undefined) ids.add(item.id);
  };
  add(state.dwellings);
  add(state.constructions);
  add(state.fields);
  add(state.cemeteries);
  add(state.orchards);
  add(state.pens);
  add(state.threshingFloors);
  add(state.sacredBuildings);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Políčka bloku pole hospodářství od nejbližšího k domu (pořadí jako při rezervaci bloku – podle
 * vzdálenosti, při shodě podle y, pak x). Starý tvar plánu bez běhů dá prázdný blok.
 */
export function farmCells(farm: StewardFarm, size: number): number[] {
  const runs = (farm as Partial<StewardFarm>).runs;
  if (!Array.isArray(runs)) return [];
  const hx = farm.house % size;
  const hy = Math.floor(farm.house / size);
  const keyed: [number, number, number, number][] = [];
  for (let k = 0; k + 1 < runs.length; k += 2) {
    for (let j = 0; j < runs[k + 1]!; j++) {
      const t = runs[k]! + j;
      const ox = (t % size) - hx;
      const oy = Math.floor(t / size) - hy;
      keyed.push([ox * ox + oy * oy, oy, ox, t]);
    }
  }
  keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return keyed.map((e) => e[3]);
}

/** Běhy seřazených indexů políček `[začátek, délka, …]` – uložený tvar bloku (`StewardFarm.runs`). */
export function cellRuns(cells: readonly number[]): number[] {
  const sorted = [...cells].sort((a, b) => a - b);
  const runs: number[] = [];
  for (const t of sorted) {
    const n = runs.length;
    if (n > 0 && runs[n - 2]! + runs[n - 1]! === t) runs[n - 1]!++;
    else if (n === 0 || runs[n - 2]! + runs[n - 1]! < t) runs.push(t, 1);
  }
  return runs;
}

/** Plán je v dnešním tvaru (bloky jako běhy) – starší tvar se zahodí a přepočítá. */
function isCurrentPlan(plan: StewardPlan | undefined): plan is StewardPlan {
  if (!plan) return false;
  return (plan.farms as readonly Partial<StewardFarm>[]).every((f) => Array.isArray(f.runs));
}

/**
 * Verze pravidel rozvrhu: 2 = blok domácnosti podle toho, co oseje (steward.md – Pole blízko a podle
 * práce). Plán starší verze platí, dokud se vedle něj nespočítá nový.
 */
export const STEWARD_PLAN_VERSION = 2;

/** Plán dnešního tvaru i dnešních pravidel rozvrhu (rozpracovaný přepočet starší verze se zahodí). */
function isFreshPlan(plan: StewardPlan | undefined): plan is StewardPlan {
  return isCurrentPlan(plan) && (plan.version ?? 1) >= STEWARD_PLAN_VERSION;
}

/**
 * Má se plán sídla přepočítat celý (steward.md – Kdy se plán přepočítá)? Bez plánu (nebo se
 * starým tvarem) ano; rozpracovaný nebo rozpracovaný přepočet ne (dopočítá se po etapách); hotový
 * plán starší verze pravidel (`STEWARD_PLAN_VERSION`) ano – počítá se vedle něj; hotový,
 * když došly sloty druhu (`exhausted`, nejdřív `STEWARD.exhaustedReplanDays` po dokončení), když
 * od jeho dokončení uběhlo `STEWARD.replanYears` let, nebo když se stavby vsi mimo správcovy
 * (`built`) od otisku změnily o víc než `STEWARD.replanChanges`; hned, když je v `steward.replan`
 * příznak (stavba hráče na plánovaném místě – `playerClaimsPlan`, odchod syna).
 */
export function needsReplan(state: VillageState, day: number): boolean {
  const plan = state.steward?.plan;
  if (!isCurrentPlan(plan)) return true;
  const pending = state.steward?.nextPlan;
  if (plan.stage !== 'done' || isFreshPlan(pending)) return false;
  // plán starších pravidel, nebo rozpracovaný přepočet starších pravidel – znovu vedle platného
  if (!isFreshPlan(plan) || pending) return true;
  if (state.steward?.replan) return true;
  const done = plan.doneDay ?? plan.startDay;
  if (plan.exhausted && day - done >= STEWARD.exhaustedReplanDays) return true;
  if (dateOfDayIndex(day).year - dateOfDayIndex(done).year >= STEWARD.replanYears) return true;
  const built = new Set(state.steward?.built ?? []);
  const before = new Set(plan.stamp);
  const now = planStamp(state);
  const nowSet = new Set(now);
  let changes = 0;
  for (const id of now) if (!before.has(id) && !built.has(id)) changes++;
  for (const id of plan.stamp) if (!nowSet.has(id) && !built.has(id)) changes++;
  return changes > STEWARD.replanChanges;
}

/**
 * Stavil hráč (stavba mimo `steward.built` a mimo otisk plánu) na plánovaném místě? Obydlí, stavba
 * obydlí, humno nebo posvátná stavba na políčku slotu plánu nebo domu hospodářství (i na jeho
 * osmi sousedech – dvůr) = plán je třeba přepočítat hned, ne až po `replanChanges` změnách
 * (steward.md – Soužití s hráčem). Ostatní stavby hráče (pole, sady…) řeší počet změn.
 */
export function playerClaimsPlan(state: VillageState, landscape: Landscape): boolean {
  const plan = state.steward?.plan;
  if (!plan || plan.stage !== 'done') return false;
  // přepočet už běží a vezme stav vsi z doby svého startu; po swapu se stavba hráče chytí znovu
  if (state.steward?.nextPlan) return false;
  const built = new Set(state.steward?.built ?? []);
  const before = new Set(plan.stamp);
  const size = landscape.size;
  const half = (size * landscape.cellSizeM) / 2;
  const planned = new Set<number>();
  for (const list of Object.values(plan.slots)) for (const t of list ?? []) planned.add(t);
  for (const farm of plan.farms) if (farm.dwellingId === undefined) planned.add(farm.house);
  const hits = (x: number, z: number): boolean => {
    const tx = Math.floor((x + half) / landscape.cellSizeM);
    const ty = Math.floor((z + half) / landscape.cellSizeM);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && planned.has(ny * size + nx)) {
          return true;
        }
      }
    }
    return false;
  };
  const isNew = (id: number | undefined): boolean =>
    id !== undefined && !before.has(id) && !built.has(id);
  for (const d of state.dwellings) if (isNew(d.id) && hits(d.position.x, d.position.z)) return true;
  for (const c of state.constructions) {
    if (c.kind === 'dwelling' && c.position && isNew(c.id) && hits(c.position.x, c.position.z)) {
      return true;
    }
  }
  for (const f of state.threshingFloors ?? []) {
    if (isNew(f.id) && hits(f.position.x, f.position.z)) return true;
  }
  for (const b of state.sacredBuildings ?? []) {
    if (isNew(b.id) && hits(b.position.x, b.position.z)) return true;
  }
  return false;
}

/**
 * Jedna etapa plánu sídla v den `day` (steward.md – Výpočetní rozpočet): bez plánu šablony, pak
 * kontroly míst domů po dávkách (`checksPerStage`), pak sloty ostatních staveb s ověřením po
 * dávkách. Přepočet hotového plánu (`needsReplan`) se počítá po etapách v `steward.nextPlan`
 * a správce zatím staví podle platného `plan`; hotový přepočet ho jedním krokem nahradí. Hotový
 * plán, který přepočet nepotřebuje, a ves bez správce nebo bez středu vrací týž stav. Plán starého
 * tvaru se zahodí a počítá znovu; plán starší verze pravidel platí, než se vedle něj spočítá nový.
 * `coverage` (řemesla vsi dne) bere výhled vsi pro velikost bloku domácnosti. Vstupní stav nemění.
 */
export function planSettlement(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  coverage: CraftCoverage = craftCoverage(state, day),
): VillageState {
  const steward = state.steward;
  if (!steward || !planCentre(state)) return state;
  const current = isCurrentPlan(steward.plan) ? steward.plan : undefined;
  const advance = (plan: StewardPlan): StewardPlan =>
    plan.stage === 'checks'
      ? checksStage(state, day, landscape, obstacles, plan)
      : slotsStage(state, day, landscape, obstacles, plan);
  const pending = isFreshPlan(steward.nextPlan) ? steward.nextPlan : undefined;
  if (current?.stage === 'done' && pending) {
    const next = pending.stage === 'done' ? pending : advance(pending);
    if (next.stage !== 'done') return { ...state, steward: { ...steward, nextPlan: next } };
    const swapped = { ...steward, plan: next };
    delete swapped.nextPlan;
    delete swapped.replan;
    return { ...state, steward: swapped };
  }
  let plan: StewardPlan;
  if (!current) plan = templatesStage(state, day, landscape, obstacles, coverage);
  else if (current.stage !== 'done') plan = advance(current);
  else if (needsReplan(state, day)) {
    const started = {
      ...steward,
      nextPlan: templatesStage(state, day, landscape, obstacles, coverage),
    };
    delete started.replan;
    return { ...state, steward: started };
  } else return state;
  const out = { ...steward, plan };
  delete out.nextPlan;
  if (plan.stage === 'done') delete out.replan;
  return { ...state, steward: out };
}

// --- společné ---------------------------------------------------------------------------

/** Podklady plánu v den etapy – mapa hodnot, území a zabraná políčka. */
interface PlanLand {
  landscape: Landscape;
  values: LandValues;
  cells: FieldCells;
  size: number;
  cellM: number;
  centre: { x: number; z: number };
  centreTile: number;
  territory: Uint8Array;
  taken: Uint8Array;
  /** Políčka, kde smí být pole (území, volné, ne les – lesní rezerva, s úrodou nad prahem). */
  arable: Uint8Array;
  /** Kandidáti domů (levné podmínky mapy hodnot) a cena místa za rok. */
  sites: number[];
  siteCost: Map<number, number>;
}

function planLand(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): PlanLand {
  const size = landscape.size;
  const values = landValues(landscape);
  const cells = fieldCells(landscape, obstacles);
  const centre = planCentre(state)!;
  const territory = villageTerritory(state, landscape);
  const taken = takenTiles(state, day, landscape);
  const half = (size * landscape.cellSizeM) / 2;
  const tile = (v: number): number =>
    Math.min(size - 1, Math.max(0, Math.floor((v + half) / landscape.cellSizeM)));
  const centreTile = tile(centre.z) * size + tile(centre.x);
  const arable = new Uint8Array(size * size);
  const base: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (!territory[i] || taken[i] || landscape.surface[i] !== SURFACE_CODES.meadow) continue;
    const v = fieldCellValue(cells, i, 0);
    if (v > 0) base.push(v);
  }
  base.sort((a, b) => a - b);
  const floor = (base[Math.floor(base.length / 2)] ?? 0) * STEWARD.fieldValueFloor;
  const sites: number[] = [];
  const siteCost = new Map<number, number>();
  for (let i = 0; i < size * size; i++) {
    if (!territory[i] || taken[i]) continue;
    if (
      landscape.surface[i] === SURFACE_CODES.meadow &&
      fieldCellValue(cells, i, 0) >= floor &&
      floor > 0
    ) {
      arable[i] = 1;
    }
    const cost = dwellingSiteValue(landscape, values, i, STEWARD.householdPeople);
    if (cost !== null) {
      sites.push(i);
      siteCost.set(i, cost);
    }
  }
  return {
    landscape,
    values,
    cells,
    size,
    cellM: landscape.cellSizeM,
    centre,
    centreTile,
    territory,
    taken,
    arable,
    sites,
    siteCost,
  };
}

/** Vzdálenost středů políček (m). */
function tileDistM(land: PlanLand, a: number, b: number): number {
  const dx = (a % land.size) - (b % land.size);
  const dy = Math.floor(a / land.size) - Math.floor(b / land.size);
  return Math.sqrt(dx * dx + dy * dy) * land.cellM;
}

/** Políčka stojících obydlí vsi (rozestavěná ne – v nich se ještě nebydlí). */
export function dwellingTiles(state: VillageState, landscape: Landscape): number[] {
  return state.dwellings.map((d) => tileAt(landscape, d.position));
}

/** Políčko pod bodem světa (m). */
function tileAt(landscape: Landscape, p: { x: number; z: number }): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const tx = Math.min(
    landscape.size - 1,
    Math.max(0, Math.floor((p.x + half) / landscape.cellSizeM)),
  );
  const ty = Math.min(
    landscape.size - 1,
    Math.max(0, Math.floor((p.z + half) / landscape.cellSizeM)),
  );
  return ty * landscape.size + tx;
}

/** Posuny políček do `radius` seřazené podle vzdálenosti (pak y, x) – jednou pro poloměr. */
const offsetsCache = new Map<number, Int32Array>();
function discOffsets(radius: number): Int32Array {
  const cached = offsetsCache.get(radius);
  if (cached) return cached;
  const list: [number, number, number][] = [];
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      const d2 = ox * ox + oy * oy;
      if (d2 <= radius * radius) list.push([d2, oy, ox]);
    }
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const out = new Int32Array(list.length * 3);
  list.forEach(([d2, oy, ox], k) => {
    out[k * 3] = ox;
    out[k * 3 + 1] = oy;
    out[k * 3 + 2] = d2;
  });
  offsetsCache.set(radius, out);
  return out;
}

/**
 * Kolik lidí plán čeká a kolik políček potřebuje blok jedné domácnosti (steward.md – Pole blízko
 * a podle práce): blok je to, co domácnost oseje – `STEWARD.householdPeople` × osev na člověka
 * podle práce v oknech setí (výhled vsi, `laborHa` ÷ lidé) × `ROTATION_FACTOR` × `blockReserve`;
 * bez stropu podle jídla (Martin 6. 11. 2026) – omezuje jen práce a volná půda mapy. Bez lidí nebo
 * bez práce v oknech podle jídla při průměrné úrodnosti louky území (`netYieldPerHa`).
 */
function planSize(
  state: VillageState,
  day: number,
  land: PlanLand,
  coverage: CraftCoverage,
): { people: number; households: number; blockCells: number } {
  const people = state.people.length;
  const perPerson =
    people > 0
      ? (yearlyFoodNeed(state, day) / people) * fieldFoodShare(state)
      : FOOD_NEED_KG_PER_YEAR.adult;
  const ha = (land.cellM * land.cellM) / 10_000;
  let sum = 0;
  let count = 0;
  let capacityKg = 0;
  for (let i = 0; i < land.arable.length; i++) {
    if (!land.arable[i]) continue;
    const f = land.landscape.fertility[i]!;
    sum += f;
    count++;
    capacityKg += (netYieldPerHa(f) * ha) / ROTATION_FACTOR;
  }
  const fertility = count > 0 ? sum / count : 50;
  const capacity = Math.floor(capacityKg / perPerson);
  const wanted = Math.max(
    STEWARD.planPeopleFactor * people,
    STEWARD.minHouseholds * STEWARD.householdPeople,
  );
  const planned = Math.max(STEWARD.householdPeople, Math.min(wanted, capacity));
  const households = Math.ceil(planned / STEWARD.householdPeople);
  const foodCells = Math.ceil(
    (STEWARD.householdPeople * perPerson * ROTATION_FACTOR * STEWARD.blockReserve) /
      (Math.max(1, netYieldPerHa(fertility)) * ha),
  );
  const laborHa = people > 0 ? stewardOutlook(state, day, coverage).laborHa : 0;
  const laborCells =
    Number.isFinite(laborHa) && laborHa > 0
      ? Math.ceil(
          (STEWARD.householdPeople * (laborHa / people) * ROTATION_FACTOR * STEWARD.blockReserve) /
            ha,
        )
      : foodCells;
  // blok podle práce, ne podle jídla (Martin 6. 11. 2026): správce rozšiřuje pole, dokud mu mapa
  // dovolí; jídlo omezuje až kapacita mapy (odchod syna). Bez práce v oknech jen podle jídla.
  const blockCells = Math.max(1, laborCells);
  return { people: planned, households, blockCells };
}

// --- etapa 1: šablony -------------------------------------------------------------------

/** Hospodářství při rozvrhu: blok jako seznam políček (od nejbližšího), uloží se jako běhy. */
interface WorkFarm {
  house: number;
  dwellingId?: number;
  cells: number[];
}

interface Layout {
  houses: number[];
  farms: WorkFarm[];
  cost: number;
}

/** Uložený tvar hospodářství. */
function storedFarm(farm: WorkFarm): StewardFarm {
  return {
    house: farm.house,
    ...(farm.dwellingId !== undefined ? { dwellingId: farm.dwellingId } : {}),
    runs: cellRuns(farm.cells),
  };
}

function templatesStage(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  coverage: CraftCoverage,
): StewardPlan {
  const land = planLand(state, day, landscape, obstacles);
  const size = planSize(state, day, land, coverage);
  const existing = existingHouses(state, landscape);
  const owned = ownedFields(land, existing, fieldTiles(state, day, landscape));
  const layouts = TEMPLATES.map((t) => layoutOf(t, land, size, existing, owned));
  const best = Math.min(...layouts.map((l) => l.cost));
  // hustší šablona vyhraje, pokud řidší ušetří méně než `templateMargin` ceny
  const chosen = layouts.findIndex((l) => l.cost <= best * (1 + STEWARD.templateMargin));
  const index = chosen < 0 ? 0 : chosen;
  const layout = layouts[index]!;
  const costs: Partial<Record<StewardTemplate, number>> = {};
  TEMPLATES.forEach((t, i) => {
    const cost = layouts[i]!.cost;
    if (Number.isFinite(cost)) costs[t] = Math.round(cost * 1000) / 1000;
  });
  return {
    stage: 'checks',
    version: STEWARD_PLAN_VERSION,
    startDay: day,
    stamp: planStamp(state),
    people: size.people,
    households: size.households,
    blockCells: size.blockCells,
    template: TEMPLATES[index]!,
    costs,
    checked: 0,
    slots: { dwelling: layout.houses },
    farms: layout.farms.map(storedFarm),
  };
}

/** Obydlí a rozestavěná obydlí vsi – pevné domy plánu (políčko a id). */
function existingHouses(state: VillageState, landscape: Landscape): WorkFarm[] {
  const out: WorkFarm[] = [];
  for (const d of state.dwellings) {
    out.push({ house: tileAt(landscape, d.position), dwellingId: d.id, cells: [] });
  }
  for (const c of state.constructions) {
    if (c.kind !== 'dwelling' || !c.position) continue;
    out.push({ house: tileAt(landscape, c.position), dwellingId: c.id, cells: [] });
  }
  return out;
}

/**
 * Pole, která stojící domy už mají: políčko pole patří nejbližšímu stojícímu domu (při shodě
 * dřívějšímu). Blok stojícího domu je o ně menší a cena rozvrhu je započítá.
 */
function ownedFields(land: PlanLand, existing: readonly WorkFarm[], fields: number[]): number[][] {
  const out = existing.map(() => [] as number[]);
  if (existing.length === 0) return out;
  for (const t of fields) {
    let best = 0;
    for (let f = 1; f < existing.length; f++) {
      if (tileDistM(land, existing[f]!.house, t) < tileDistM(land, existing[best]!.house, t)) {
        best = f;
      }
    }
    out[best]!.push(t);
  }
  return out;
}

/** Rozvrh šablony `template`: nové domy (pořadí stavby), bloky polí všech domů a cena. */
function layoutOf(
  template: StewardTemplate,
  land: PlanLand,
  size: { households: number; blockCells: number },
  existing: readonly WorkFarm[],
  owned: readonly number[][],
): Layout {
  const wanted = Math.max(0, size.households - existing.length);
  const blockM = Math.sqrt(size.blockCells) * land.cellM;
  const houses: number[] = [];
  const all = existing.map((f) => f.house);
  const byCentre = (a: number, b: number): number =>
    tileDistM(land, a, land.centreTile) - tileDistM(land, b, land.centreTile) ||
    (land.siteCost.get(a) ?? 0) - (land.siteCost.get(b) ?? 0) ||
    a - b;
  const place = (order: readonly number[], spacingM: number): void => {
    for (const site of order) {
      if (houses.length >= wanted) return;
      if (all.some((h) => tileDistM(land, h, site) < Math.max(spacingM, HOUSE_CENTRE_M))) continue;
      houses.push(site);
      all.push(site);
    }
  };
  const near = [...land.sites].sort(byCentre);
  if (template === 'cluster') {
    place(near, HOUSE_CENTRE_M);
  } else if (template === 'row') {
    // řadová ves: domy u vody od středu do stran, rozestup na šířku bloku (lány za domy)
    const water = near.filter((i) => land.values.waterDistM[i]! <= STEWARD.rowWaterM);
    place(water, blockM);
    place(water, HOUSE_CENTRE_M);
    place(near, HOUSE_CENTRE_M);
  } else {
    // samoty: domy uprostřed nejbohatších bloků dobré půdy, rozestup na šířku bloku
    const richness = blockRichness(land, Math.max(1, Math.round(blockM / land.cellM / 2)));
    const rich = [...land.sites].sort((a, b) => richness[b]! - richness[a]! || byCentre(a, b));
    place(rich, blockM);
    place(near, HOUSE_CENTRE_M);
  }
  const farms: WorkFarm[] = [
    ...existing.map((f) => ({ ...f, cells: [] as number[] })),
    ...houses.map((house) => ({ house, cells: [] as number[] })),
  ];
  // stojící dům s poli potřebuje jen zbytek bloku
  const need = farms.map((_, f) => Math.max(0, size.blockCells - (owned[f]?.length ?? 0)));
  claimBlocks(land, farms, need);
  return { houses, farms, cost: layoutCost(land, farms, owned, size) };
}

/** Průměrná hodnota políček pole v okně ±`r` políček kolem každého políčka (součtová tabulka). */
function blockRichness(land: PlanLand, r: number): Float64Array {
  const s = land.size;
  const sum = new Float64Array((s + 1) * (s + 1));
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x;
      const v = land.arable[i] ? fieldCellValue(land.cells, i, 0) : 0;
      sum[(y + 1) * (s + 1) + x + 1] =
        v + sum[y * (s + 1) + x + 1]! + sum[(y + 1) * (s + 1) + x]! - sum[y * (s + 1) + x]!;
    }
  }
  const out = new Float64Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const x0 = Math.max(0, x - r);
      const y0 = Math.max(0, y - r);
      const x1 = Math.min(s, x + r + 1);
      const y1 = Math.min(s, y + r + 1);
      const total =
        sum[y1 * (s + 1) + x1]! -
        sum[y0 * (s + 1) + x1]! -
        sum[y1 * (s + 1) + x0]! +
        sum[y0 * (s + 1) + x0]!;
      out[y * s + x] = total / ((2 * r + 1) * (2 * r + 1));
    }
  }
  return out;
}

/**
 * Bloky polí: domy si po kole berou nejbližší volné políčko pole (dvůr – políčko domu a sousední –
 * zůstává volný), dokud blok hospodářství `f` nemá `need[f]` políček nebo dům nedosáhne dál než
 * `FIELD_LIMITS.maxDistanceM`.
 */
function claimBlocks(land: PlanLand, farms: WorkFarm[], need: readonly number[]): void {
  const s = land.size;
  const free = land.arable.slice();
  for (const farm of farms) {
    const hx = farm.house % s;
    const hy = Math.floor(farm.house / s);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const x = hx + ox;
        const y = hy + oy;
        if (x >= 0 && y >= 0 && x < s && y < s) free[y * s + x] = 0;
      }
    }
  }
  const offsets = discOffsets(Math.ceil(FIELD_LIMITS.maxDistanceM / land.cellM));
  const cursor = farms.map(() => 0);
  const count = offsets.length / 3;
  let active = true;
  while (active) {
    active = false;
    farms.forEach((farm, f) => {
      if (farm.cells.length >= need[f]!) return;
      const hx = farm.house % s;
      const hy = Math.floor(farm.house / s);
      let k = cursor[f]!;
      while (k < count) {
        const x = hx + offsets[k * 3]!;
        const y = hy + offsets[k * 3 + 1]!;
        k++;
        if (x < 0 || y < 0 || x >= s || y >= s) continue;
        const i = y * s + x;
        if (!free[i]) continue;
        free[i] = 0;
        farm.cells.push(i);
        active = true;
        break;
      }
      cursor[f] = k;
    });
  }
}

/**
 * Cena rozvrhu – člověkodny za rok na tunu čisté úrody: polní práce bloků a polí, která stojící
 * domy už mají, × `distanceFactor`, chůze pro vodu a dřevo (`dwellingSiteValue`) a ke dvorci
 * (`STEWARD.centreTripsPerDay`) ÷ úroda po ztrátách. Chybějící políčka bloků – i za domácnosti,
 * pro které šablona dům neumístila (plán čeká `households` hospodářství) – cenu zvýší úměrně.
 */
function layoutCost(
  land: PlanLand,
  farms: readonly WorkFarm[],
  owned: readonly number[][],
  size: { households: number; blockCells: number },
): number {
  const years = ROTATION.sown + ROTATION.fallow;
  let labor = 0;
  let kg = 0;
  let filled = 0;
  farms.forEach((farm, f) => {
    labor +=
      (land.siteCost.get(farm.house) ??
        dwellingSiteValue(land.landscape, land.values, farm.house, STEWARD.householdPeople) ??
        0) +
      walkDaysPerYear(
        STEWARD.centreTripsPerDay * DAYS_PER_YEAR,
        tileDistM(land, farm.house, land.centreTile),
      );
    const mine = owned[f] ?? [];
    for (const i of [...mine, ...farm.cells]) {
      const d = tileDistM(land, farm.house, i);
      labor += (land.cells.work[i]! * distanceFactor(d)) / years;
      kg += (land.cells.kg[i]! * land.cells.kept[i]!) / years;
    }
    filled += Math.min(size.blockCells, mine.length + farm.cells.length);
  });
  const wantedCells = Math.max(farms.length, size.households) * size.blockCells;
  if (kg <= 0 || filled === 0) return Infinity;
  return (labor / (kg / 1000)) * (wantedCells / filled);
}

// --- etapa 2: kontroly míst domů -------------------------------------------------------

function checksStage(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  plan: StewardPlan,
): StewardPlan {
  const houses = plan.slots.dwelling ?? [];
  const input = slotCheckInput(state, day, landscape, obstacles);
  const land = planLand(state, day, landscape, obstacles);
  const size = landscape.size;
  let checked = plan.checked ?? 0;
  let budget = Math.min(STEWARD.checksPerStage, STEWARD.candidateChecks - (plan.checks ?? 0));
  const out = [...houses];
  const farms: WorkFarm[] = plan.farms.map((f) => ({ ...f, cells: farmCells(f, size) }));
  const fits = (tile: number): boolean => {
    budget--;
    return slotFits(input, 'dwelling', tile);
  };
  let used = 0;
  while (checked < out.length && budget > 0) {
    const tile = out[checked]!;
    used++;
    if (fits(tile)) {
      checked++;
      continue;
    }
    // náhrada: nejbližší kandidát kolem, který drží rozestup od ostatních domů
    const others = [...farms.map((f) => f.house).filter((h) => h !== tile)];
    const near = land.sites
      .filter((s) => s !== tile && tileDistM(land, s, tile) <= 3 * land.cellM)
      .filter((s) => others.every((h) => tileDistM(land, h, s) >= HOUSE_CENTRE_M))
      .sort((a, b) => tileDistM(land, a, tile) - tileDistM(land, b, tile) || a - b);
    let replaced = false;
    for (const s of near) {
      if (budget <= 0) break;
      used++;
      if (fits(s)) {
        out[checked] = s;
        const farm = farms.find((f) => f.house === tile && f.dwellingId === undefined);
        if (farm) farm.house = s;
        // nový dvůr (políčko domu a sousední) z bloků všech hospodářství
        const sx = s % size;
        const sy = Math.floor(s / size);
        const yard = (i: number): boolean =>
          Math.abs((i % size) - sx) <= 1 && Math.abs(Math.floor(i / size) - sy) <= 1;
        for (const f of farms) f.cells = f.cells.filter((i) => !yard(i));
        replaced = true;
        break;
      }
    }
    if (replaced) {
      checked++;
    } else if (budget > 0) {
      // místo pro dům tu není – dům i jeho blok z plánu vypadnou
      out.splice(checked, 1);
      const index = farms.findIndex((f) => f.house === tile && f.dwellingId === undefined);
      if (index >= 0) farms.splice(index, 1);
    }
  }
  const checks = (plan.checks ?? 0) + used;
  const finished = checked >= out.length || checks >= STEWARD.candidateChecks;
  const kept = finished
    ? farms.filter((f) => f.dwellingId !== undefined || out.slice(0, checked).includes(f.house))
    : farms;
  return {
    ...plan,
    stage: finished ? 'slots' : 'checks',
    checked,
    checks,
    slots: { ...plan.slots, dwelling: finished ? out.slice(0, checked) : out },
    farms: kept.map(storedFarm),
  };
}

// --- ověření slotu ----------------------------------------------------------------------

/** Podklady kontrol umístění slotů v den etapy. */
interface SlotCheckInput {
  landscape: Landscape;
  obstacles: ObstacleLayer;
  village: PlacementVillage | null;
  dwellings: Position[];
}

function slotCheckInput(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): SlotCheckInput {
  const village = placementVillageOf(state, day);
  return { landscape, obstacles, village, dwellings: villageDwellingPositions(village) };
}

/** Kontrol umístění na jeden slot druhu – dílna se ověří pro každé řemeslo. */
function slotChecks(kind: StewardSlotKind): number {
  return kind === 'workshop' ? CRAFTS.length : 1;
}

/**
 * Projde slot druhu `kind` na políčku `tile` kontrolou umístění jako v `applyBuildIntent`? Tvar
 * stavby slotu: dům (zemnice), dílna (každé řemeslo) a humno uprostřed políčka bez natočení;
 * hřbitov, sad a ohrada (skot) jeden čtverec = políčko krajiny bez natočené mřížky.
 */
function slotFits(input: SlotCheckInput, kind: StewardSlotKind, tile: number): boolean {
  const { landscape, obstacles, village } = input;
  const cell = { x: tile % landscape.size, y: Math.floor(tile / landscape.size) };
  const c = tileCenterWorld(landscape, cell.x, cell.y);
  const at = (): Position => ({ x: c.x, z: c.z, rotation: 0 });
  switch (kind) {
    case 'dwelling':
      return checkDwellingPlacement(landscape, village, DWELLING, at(), obstacles).ok;
    case 'workshop':
      return CRAFTS.every(
        (craft) => checkWorkshopPlacement(landscape, village, craft, at(), obstacles).ok,
      );
    case 'threshing-floor':
      return checkThreshingFloorPlacement(landscape, village, at(), obstacles).ok;
    case 'cemetery':
      return cemeteryPartsFromCells(landscape, village, [cell], input.dwellings, obstacles).check
        .ok;
    case 'orchard':
      return orchardPartsFromCells(landscape, village, [cell], input.dwellings, obstacles).check.ok;
    case 'pen':
      return penSquaresFromCells(landscape, village, [cell], SLOT_PEN_SPECIES, obstacles).check.ok;
  }
}

/**
 * Projde slot plánu kontrolou umístění (tytéž kontroly jako `applyBuildIntent`, bez ceny předem)?
 * Tvar stavby slotu – viz `slotFits`; správce ze slotu sestaví `BuildIntent` stejného tvaru.
 */
export function checkPlanSlot(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  kind: StewardSlotKind,
  tile: number,
): boolean {
  return slotFits(slotCheckInput(state, day, landscape, obstacles), kind, tile);
}

// --- etapa 3: ostatní sloty -------------------------------------------------------------

/**
 * Sloty ostatních staveb: v prvním dni etapy rozvrh kandidátů (a ověřené semeno hřbitova), pak
 * ověřování po druzích v pevném pořadí, nejvýš `STEWARD.checksPerStage` kontrol za den. Do slotů
 * jde jen kandidát, který kontrolou prošel; druh má nejvýš `STEWARD.extraSlots` slotů. Hotovo,
 * když žádný druh nemá neověřené kandidáty – pak políčka slotů vypadnou z bloků polí.
 */
function slotsStage(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
  plan: StewardPlan,
): StewardPlan {
  const input = slotCheckInput(state, day, landscape, obstacles);
  let budget = STEWARD.checksPerStage;
  const slots: Partial<Record<StewardSlotKind, number[]>> = { ...plan.slots };
  let candidates: Partial<Record<StewardSlotKind, number[]>>;
  if (plan.candidates) {
    candidates = { ...plan.candidates };
  } else {
    const ranked = rankSlots(state, day, landscape, plan, input, budget);
    budget -= ranked.used;
    candidates = ranked.candidates;
    for (const kind of EXTRA_KINDS) slots[kind] = [];
    if (ranked.cemetery !== undefined) slots.cemetery = [ranked.cemetery];
  }
  for (const kind of EXTRA_KINDS) {
    if (budget <= 0) break;
    const list = candidates[kind] ?? [];
    const kept = [...(slots[kind] ?? [])];
    let k = 0;
    while (kept.length < STEWARD.extraSlots && k < list.length && budget > 0) {
      const tile = list[k++]!;
      budget -= slotChecks(kind);
      if (slotFits(input, kind, tile)) kept.push(tile);
    }
    slots[kind] = kept;
    candidates[kind] = kept.length >= STEWARD.extraSlots ? [] : list.slice(k);
  }
  if (EXTRA_KINDS.some((kind) => (candidates[kind] ?? []).length > 0)) {
    return { ...plan, slots, candidates };
  }
  // políčka ostatních staveb z bloků polí vypadnou
  const extras = new Set(EXTRA_KINDS.flatMap((kind) => slots[kind] ?? []));
  const size = landscape.size;
  const farms = plan.farms.map((f) =>
    storedFarm({ ...f, cells: farmCells(f, size).filter((i) => !extras.has(i)) }),
  );
  const done: StewardPlan = { ...plan, stage: 'done', doneDay: day, slots, farms };
  delete done.candidates;
  return done;
}

/**
 * Rozvrh kandidátů ostatních slotů (v políčkách; políčko bloku polí +`BLOCK_PENALTY`): nejdřív
 * `STEWARD.extraSlots` nejlepších každého druhu, pak náhradníci do `STEWARD.slotCandidates` –
 * vybraná políčka už nedostane další druh. Semeno hřbitova se ověří hned (rozšíření se řadí
 * podle něj); kontroly se odečtou z rozpočtu etapy.
 */
function rankSlots(
  state: VillageState,
  day: number,
  landscape: Landscape,
  plan: StewardPlan,
  input: SlotCheckInput,
  budget: number,
): {
  candidates: Partial<Record<StewardSlotKind, number[]>>;
  cemetery: number | undefined;
  used: number;
} {
  const size = landscape.size;
  const cellM = landscape.cellSizeM;
  const values = landValues(landscape);
  const territory = villageTerritory(state, landscape);
  const blocked = takenTiles(state, day, landscape);
  const houses = plan.farms.map((f) => f.house);
  // políčka bloků polí smí dostat i ostatní stavby (blok o ně přijde), ale až po volných
  const inBlock = new Uint8Array(size * size);
  const blocks = plan.farms.map((f) => farmCells(f, size));
  for (const [k, farm] of plan.farms.entries()) {
    for (const i of blocks[k]!) inBlock[i] = 1;
    const hx = farm.house % size;
    const hy = Math.floor(farm.house / size);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const x = hx + ox;
        const y = hy + oy;
        if (x >= 0 && y >= 0 && x < size && y < size) blocked[y * size + x] = 1;
      }
    }
  }
  const dist = (a: number, b: number): number => {
    const dx = (a % size) - (b % size);
    const dy = Math.floor(a / size) - Math.floor(b / size);
    return Math.sqrt(dx * dx + dy * dy);
  };
  const centreTile = tileAt(landscape, planCentre(state)!);
  const nearestHouse = (i: number): number =>
    houses.reduce((best, h) => Math.min(best, dist(h, i)), Infinity) * cellM;
  const free: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (territory[i] && !blocked[i] && landscape.surface[i] === SURFACE_CODES.meadow) free.push(i);
  }
  const order = (ok: (i: number) => boolean, score: (i: number) => number): number[] =>
    free
      .filter((i) => !blocked[i] && ok(i))
      .map((i) => ({ i, s: score(i) + (inBlock[i] ? BLOCK_PENALTY : 0) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map((e) => e.i);
  const rank = (
    ok: (i: number) => boolean,
    score: (i: number) => number,
    count: number,
  ): number[] => {
    const chosen = order(ok, score).slice(0, Math.max(0, count));
    for (const i of chosen) blocked[i] = 1;
    return chosen;
  };
  const fertility = (i: number): number => landscape.fertility[i]! / FERTILITY_PER_TILE;
  const site = (i: number): boolean =>
    dwellingSiteValue(landscape, values, i, STEWARD.householdPeople) !== null;
  // hřbitov: od domů (i plánovaných) ≥ 150 m a od vody ≥ 100 m (okraj čtverce), horší půda, blízko
  // středu; další sloty jsou nejbližší vhodná políčka k prvnímu (rozšíření o čtverec). Vzdálenosti
  // přesně jako hygiena hřbitova – od středu domu k okraji čtverce, k vodě mezi okraji políček.
  const water: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (landscape.surface[i] === SURFACE_CODES.water) water.push(i);
  }
  const houseM2 = CEMETERY_DISTANCE_M.dwelling.ok * CEMETERY_DISTANCE_M.dwelling.ok;
  const waterTiles = CEMETERY_DISTANCE_M.water.ok / cellM;
  const cemeteryOk = (i: number): boolean => {
    const x = i % size;
    const y = Math.floor(i / size);
    for (const h of houses) {
      const dx = Math.max(0, Math.abs((h % size) - x) * cellM - cellM / 2);
      const dz = Math.max(0, Math.abs(Math.floor(h / size) - y) * cellM - cellM / 2);
      if (dx * dx + dz * dz < houseM2) return false;
    }
    if (values.waterDistM[i]! < CEMETERY_DISTANCE_M.water.ok) return false;
    for (const w of water) {
      const dx = Math.max(0, Math.abs((w % size) - x) - 1);
      const dy = Math.max(0, Math.abs(Math.floor(w / size) - y) - 1);
      if (dx * dx + dy * dy < waterTiles * waterTiles) return false;
    }
    return true;
  };
  // stávající hřbitov (mimo natočený) se rozšiřuje jen čtvercem sousedícím stranou – semeno i další
  // sloty proto leží u jeho čtverců, ne u středu vsi; jinak by plán dával sloty jinam a plné
  // hřbitovy by správce nikdy nerozšířil (steward.md – Hřbitov)
  const anchors: number[] = [];
  for (const c of villageCemeteries(state)) {
    if (c.grid) continue;
    for (const { cell } of c.squares) anchors.push(cell.y * size + cell.x);
  }
  const nearAnchors = (i: number): number =>
    anchors.reduce((best, a) => Math.min(best, dist(a, i)), Infinity);
  let used = 0;
  let seed: number | undefined;
  const seeds =
    anchors.length > 0
      ? order(
          (i) => cemeteryOk(i) && nearAnchors(i) === 1,
          (i) => fertility(i) + dist(i, centreTile),
        )
      : order(cemeteryOk, (i) => fertility(i) + dist(i, centreTile));
  for (const i of seeds.slice(0, STEWARD.slotCandidates)) {
    if (used >= budget) break;
    used++;
    if (slotFits(input, 'cemetery', i)) {
      seed = i;
      blocked[i] = 1;
      break;
    }
  }
  const farmCentre = farmsCentroid(plan.farms, blocks, size);
  const kinds: [StewardSlotKind, (i: number) => boolean, (i: number) => number, number][] = [
    [
      'cemetery',
      cemeteryOk,
      (i) =>
        (anchors.length > 0 ? nearAnchors(i) * 100 : seed === undefined ? 0 : dist(i, seed) * 100) +
        fertility(i),
      seed === undefined ? 0 : STEWARD.extraSlots - 1,
    ],
    // humno mezi poli a dvorcem na suchu a rovině
    ['threshing-floor', site, (i) => dist(i, farmCentre) + dist(i, centreTile), STEWARD.extraSlots],
    // dílny u středu vsi na suchu a rovině
    ['workshop', site, (i) => dist(i, centreTile), STEWARD.extraSlots],
    // sad u domů na střední půdě
    [
      'orchard',
      (i) => nearestHouse(i) <= ORCHARD_HOUSE_TILES * cellM,
      (i) => Math.abs(landscape.fertility[i]! - 50) / FERTILITY_PER_TILE + nearestHouse(i) / cellM,
      STEWARD.extraSlots,
    ],
    // ohrada u domů na horší půdě
    [
      'pen',
      (i) => nearestHouse(i) <= PEN_HOUSE_TILES * cellM,
      (i) => fertility(i) + nearestHouse(i) / cellM,
      STEWARD.extraSlots,
    ],
  ];
  const candidates: Partial<Record<StewardSlotKind, number[]>> = {};
  for (const [kind, ok, score, count] of kinds) candidates[kind] = rank(ok, score, count);
  const spares = STEWARD.slotCandidates - STEWARD.extraSlots;
  for (const [kind, ok, score, count] of kinds) {
    if (kind === 'cemetery' && count === 0) continue;
    candidates[kind] = [...(candidates[kind] ?? []), ...rank(ok, score, spares)];
  }
  return { candidates, cemetery: seed, used };
}

/** Střed polí plánu (políčko). */
function farmsCentroid(
  farms: readonly StewardFarm[],
  blocks: readonly number[][],
  size: number,
): number {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const block of blocks) {
    for (const i of block) {
      sx += i % size;
      sy += Math.floor(i / size);
      n++;
    }
  }
  if (n === 0) return farms[0]?.house ?? 0;
  return Math.round(sy / n) * size + Math.round(sx / n);
}
