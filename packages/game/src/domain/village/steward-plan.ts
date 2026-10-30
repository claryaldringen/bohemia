// Plán sídla správce vsi (steward.md – Plán sídla, Výpočetní rozpočet). Ves jako celek: tři
// šablony rozvrhu (shluk, řadová ves, samoty v polnostech) se rozvrhnou hladově – domy a bloky
// polí po hospodářstvích –, vybere se ta s nejnižší cenou (člověkodny chůze a polní práce na tunu
// úrody), pak se ověří místa domů kontrolou umístění a přidají sloty ostatních staveb. Počítá se
// po etapách v po sobě jdoucích dnech správce; rozpracovaná etapa je ve stavu (`steward.plan`), takže
// dopočet po kouscích vyjde stejně. Jen deterministická matematika (ESLint pravidlo vrstvy překážek).

import { dateOfDayIndex } from '../calendar';
import { SURFACE_CODES, tileCenterWorld, type Landscape, type ObstacleLayer } from '../landscape';
import { netYieldPerHa, ROTATION, ROTATION_FACTOR } from './field-capacity';
import { fieldFoodShare, yearlyFoodNeed } from './field-food';
import { distanceFactor } from './fields';
import { checkDwellingPlacement } from './placement-dwellings';
import { placementVillageOf } from './placement-village';
import { DWELLING_CLEARING_M } from './rules-buildings';
import { FIELD_LIMITS, FOOD_NEED_KG_PER_YEAR } from './rules-fields';
import { CEMETERY_DISTANCE_M } from './rules-people';
import { STEWARD } from './rules-steward';
import {
  dwellingSiteValue,
  fieldCells,
  fieldCellValue,
  landValues,
  takenTiles,
  planCentre,
  villageTerritory,
  walkDaysPerYear,
  type FieldCells,
  type LandValues,
} from './steward-land';
import type {
  StewardFarm,
  StewardPlan,
  StewardSlotKind,
  StewardTemplate,
  VillageState,
} from './types';

const DAYS_PER_YEAR = 365;
const TEMPLATES: readonly StewardTemplate[] = ['cluster', 'row', 'scattered'];
const DWELLING = 'zemnice';
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
 * Má se plán sídla přepočítat celý (steward.md – Kdy se plán přepočítá)? Bez plánu ano;
 * rozpracovaný ne (dopočítá se po etapách); hotový, když došly sloty druhu (`exhausted`), když od
 * jeho dokončení uběhlo `STEWARD.replanYears` let, nebo když se stavby vsi mimo správcovy (`built`)
 * od otisku změnily o víc než `STEWARD.replanChanges`.
 */
export function needsReplan(state: VillageState, day: number): boolean {
  const plan = state.steward?.plan;
  if (!plan) return true;
  if (plan.stage !== 'done') return false;
  if (plan.exhausted) return true;
  const done = plan.doneDay ?? plan.startDay;
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
 * Jedna etapa plánu sídla v den `day` (steward.md – Výpočetní rozpočet): bez plánu nebo když je
 * třeba přepočet (`needsReplan`) šablony, pak kontroly míst domů po dávkách (`checksPerStage`),
 * pak sloty ostatních staveb. Hotový plán, který přepočet nepotřebuje, a ves bez správce nebo bez
 * středu vrací týž stav. Vstupní stav nemění.
 */
export function planSettlement(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): VillageState {
  const steward = state.steward;
  if (!steward || !planCentre(state)) return state;
  const current = steward.plan;
  let plan: StewardPlan;
  if (!current || (current.stage === 'done' && needsReplan(state, day))) {
    plan = templatesStage(state, day, landscape, obstacles);
  } else if (current.stage === 'checks') {
    plan = checksStage(state, day, landscape, obstacles, current);
  } else if (current.stage === 'slots') {
    plan = slotsStage(state, day, landscape, current);
  } else {
    return state;
  }
  return { ...state, steward: { ...steward, plan } };
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

/** Kolik lidí plán čeká a kolik políček potřebuje blok jedné domácnosti. */
function planSize(
  state: VillageState,
  day: number,
  land: PlanLand,
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
  const blockCells = Math.ceil(
    (STEWARD.householdPeople * perPerson * ROTATION_FACTOR * STEWARD.blockReserve) /
      (Math.max(1, netYieldPerHa(fertility)) * ha),
  );
  return { people: planned, households, blockCells };
}

// --- etapa 1: šablony -------------------------------------------------------------------

interface Layout {
  houses: number[];
  farms: StewardFarm[];
  cost: number;
}

function templatesStage(
  state: VillageState,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): StewardPlan {
  const land = planLand(state, day, landscape, obstacles);
  const size = planSize(state, day, land);
  const existing = existingHouses(state, landscape);
  const layouts = TEMPLATES.map((t) => layoutOf(t, land, size, existing));
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
    startDay: day,
    stamp: planStamp(state),
    people: size.people,
    households: size.households,
    blockCells: size.blockCells,
    template: TEMPLATES[index]!,
    costs,
    checked: 0,
    slots: { dwelling: layout.houses },
    farms: layout.farms,
  };
}

/** Obydlí a rozestavěná obydlí vsi – pevné domy plánu (políčko a id). */
function existingHouses(state: VillageState, landscape: Landscape): StewardFarm[] {
  const out: StewardFarm[] = [];
  for (const d of state.dwellings) {
    out.push({ house: tileAt(landscape, d.position), dwellingId: d.id, cells: [] });
  }
  for (const c of state.constructions) {
    if (c.kind !== 'dwelling' || !c.position) continue;
    out.push({ house: tileAt(landscape, c.position), dwellingId: c.id, cells: [] });
  }
  return out;
}

/** Rozvrh šablony `template`: nové domy (pořadí stavby), bloky polí všech domů a cena. */
function layoutOf(
  template: StewardTemplate,
  land: PlanLand,
  size: { households: number; blockCells: number },
  existing: readonly StewardFarm[],
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
  const farms: StewardFarm[] = [
    ...existing.map((f) => ({ ...f, cells: [] as number[] })),
    ...houses.map((house) => ({ house, cells: [] as number[] })),
  ];
  claimBlocks(land, farms, size.blockCells);
  return { houses, farms, cost: layoutCost(land, farms, size.blockCells) };
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
 * zůstává volný), dokud blok nemá `blockCells` políček nebo dům nedosáhne dál než
 * `FIELD_LIMITS.maxDistanceM`.
 */
function claimBlocks(land: PlanLand, farms: StewardFarm[], blockCells: number): void {
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
      if (farm.cells.length >= blockCells) return;
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
 * Cena rozvrhu – člověkodny za rok na tunu čisté úrody: polní práce bloků × `distanceFactor`,
 * chůze pro vodu a dřevo (`dwellingSiteValue`) a ke dvorci (`STEWARD.centreTripsPerDay`) ÷ úroda
 * po ztrátách. Bloky, které se nenaplnily, cenu zvýší úměrně chybějícím políčkům.
 */
function layoutCost(land: PlanLand, farms: readonly StewardFarm[], blockCells: number): number {
  const years = ROTATION.sown + ROTATION.fallow;
  let labor = 0;
  let kg = 0;
  let filled = 0;
  for (const farm of farms) {
    labor +=
      (land.siteCost.get(farm.house) ??
        dwellingSiteValue(land.landscape, land.values, farm.house, STEWARD.householdPeople) ??
        0) +
      walkDaysPerYear(
        STEWARD.centreTripsPerDay * DAYS_PER_YEAR,
        tileDistM(land, farm.house, land.centreTile),
      );
    for (const i of farm.cells) {
      const d = tileDistM(land, farm.house, i);
      labor += (land.cells.work[i]! * distanceFactor(d)) / years;
      kg += (land.cells.kg[i]! * land.cells.kept[i]!) / years;
    }
    filled += Math.min(blockCells, farm.cells.length);
  }
  const wantedCells = farms.length * blockCells;
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
  const village = placementVillageOf(state, day);
  const land = planLand(state, day, landscape, obstacles);
  let checked = plan.checked ?? 0;
  let budget = Math.min(STEWARD.checksPerStage, STEWARD.candidateChecks - (plan.checks ?? 0));
  const out = [...houses];
  const farms = plan.farms.map((f) => ({ ...f, cells: [...f.cells] }));
  const fits = (tile: number): boolean => {
    budget--;
    const c = tileCenterWorld(landscape, tile % landscape.size, Math.floor(tile / landscape.size));
    const check = checkDwellingPlacement(
      landscape,
      village,
      DWELLING,
      { x: c.x, z: c.z, rotation: 0 },
      obstacles,
    );
    return check.ok;
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
        if (farm) {
          farm.house = s;
          farm.cells = farm.cells.filter((i) => i !== s);
        }
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
  return {
    ...plan,
    stage: finished ? 'slots' : 'checks',
    checked,
    checks,
    slots: { ...plan.slots, dwelling: finished ? out.slice(0, checked) : out },
    farms: finished
      ? farms.filter((f) => f.dwellingId !== undefined || out.slice(0, checked).includes(f.house))
      : farms,
  };
}

// --- etapa 3: ostatní sloty -------------------------------------------------------------

function slotsStage(
  state: VillageState,
  day: number,
  landscape: Landscape,
  plan: StewardPlan,
): StewardPlan {
  const size = landscape.size;
  const cellM = landscape.cellSizeM;
  const values = landValues(landscape);
  const territory = villageTerritory(state, landscape);
  const blocked = takenTiles(state, day, landscape);
  const houses = plan.farms.map((f) => f.house);
  // políčka bloků polí smí dostat i ostatní stavby (blok o ně přijde), ale až po volných
  const inBlock = new Uint8Array(size * size);
  for (const farm of plan.farms) {
    for (const i of farm.cells) inBlock[i] = 1;
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
  // pořadí slotů druhu podle `score` (v políčkách; políčko bloku polí +`BLOCK_PENALTY`), vybraná
  // políčka už nedostane další druh
  const rank = (
    ok: (i: number) => boolean,
    score: (i: number) => number,
    count: number = STEWARD.extraSlots,
  ): number[] => {
    const chosen = free
      .filter((i) => !blocked[i] && ok(i))
      .map((i) => ({ i, s: score(i) + (inBlock[i] ? BLOCK_PENALTY : 0) }))
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .slice(0, count)
      .map((e) => e.i);
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
  const first = rank(cemeteryOk, (i) => fertility(i) + dist(i, centreTile), 1);
  const seed = first[0];
  const cemetery =
    seed === undefined
      ? []
      : [
          seed,
          ...rank(cemeteryOk, (i) => dist(i, seed) * 100 + fertility(i), STEWARD.extraSlots - 1),
        ];
  const farmCentre = farmsCentroid(plan.farms, size);
  const slots: Partial<Record<StewardSlotKind, number[]>> = {
    ...plan.slots,
    cemetery,
    // humno mezi poli a dvorcem na suchu a rovině
    'threshing-floor': rank(site, (i) => dist(i, farmCentre) + dist(i, centreTile)),
    // dílny u středu vsi na suchu a rovině
    workshop: rank(site, (i) => dist(i, centreTile)),
    // sad u domů na střední půdě
    orchard: rank(
      (i) => nearestHouse(i) <= ORCHARD_HOUSE_TILES * cellM,
      (i) => Math.abs(landscape.fertility[i]! - 50) / FERTILITY_PER_TILE + nearestHouse(i) / cellM,
    ),
    // ohrada u domů na horší půdě
    pen: rank(
      (i) => nearestHouse(i) <= PEN_HOUSE_TILES * cellM,
      (i) => fertility(i) + nearestHouse(i) / cellM,
    ),
  };
  // políčka ostatních staveb z bloků polí vypadnou
  const extras = new Set(Object.entries(slots).flatMap(([k, v]) => (k === 'dwelling' ? [] : v)));
  const farms = plan.farms.map((f) => ({ ...f, cells: f.cells.filter((i) => !extras.has(i)) }));
  return { ...plan, stage: 'done', doneDay: day, slots, farms };
}

/** Střed polí plánu (políčko). */
function farmsCentroid(farms: readonly StewardFarm[], size: number): number {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const farm of farms) {
    for (const i of farm.cells) {
      sx += i % size;
      sy += Math.floor(i / size);
      n++;
    }
  }
  if (n === 0) return farms[0]?.house ?? 0;
  return Math.round(sy / n) * size + Math.round(sx / n);
}
