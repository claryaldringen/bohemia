import { SURFACE_CODES, tileCenterWorld } from '../landscape';
import type { BuildIntent } from './build-intent';
import { BUILD_COSTS } from './costs';
import { villageCemeteries } from './cemetery';
import { fieldCapacity } from './field-capacity';
import { yearlyFoodNeed } from './field-food';
import { villageFoodCosts } from './husbandry';
import { oxYearCost } from './draft';
import { villageHappiness } from './happiness';
import { orchardAreaM2, villageOrchards, monthInWindow, roadAppleYieldKg } from './orchard';
import { fieldWorkPerHa } from './productivity';
import { ploughWorkPerHa } from './plough';
import { oxPens, PEN_BY_SPECIES } from './oxen';
import { herdRoom, herdsOverRoom, penCapacity } from './pens';
import { placementVillageOf } from './placement-village';
import { checkSacredBuildingPlacement } from './placement-sacred';
import { villageCarts } from './carts';
import { roadApplesOption, villageRoadApples } from './road-apples';
import { roadUpgradeCost } from './road-upgrades';
import { roadLengthM } from './paths/roads-geometry';
import {
  ADULT_DEATHS_PER_YEAR,
  CEMETERY,
  childDeathsPerYear,
  ELDER_DEATHS_PER_YEAR,
  SACRED_BUILDINGS,
} from './rules-people';
import { usedPlaces } from './burials';
import { ageGroup } from './people';
import { APPLE_FOOD_VALUE, ORCHARD, ORCHARD_PLANTING_WINDOWS, THRESHING } from './rules-fields';
import { DIET } from './diet';
import { OXEN } from './rules-livestock';
import { ROAD_WALK } from './rules-roads';
import { STEWARD } from './rules-steward';
import { hasShrine } from './sacred';
import { planCentre, takenTiles, walkDaysPerYear, cellHa } from './steward-land';
import {
  inStewardWindows,
  laborBudget,
  startStewardBuild,
  tileCell,
  trySlots,
  type StewardContext,
} from './steward';
import { threshingStatus, builtThreshingFloorCount } from './threshing';
import { villageThreshingFloors } from './threshing-floors';
import { villageTrails, DIRECTIONS } from './trail';
import { DIRECTION_VECTORS } from './trail-axis';
import type { HerdSpecies, PenSpecies, Road, VillageState } from './types';

// Kroky 5 až 10 dne správce (steward.md – Rozhodovací pořadí v den správce, Ostatní stavby):
// hřbitov, humno, ohrady, sad a jabloně u cest, posvátná místa, cesty. Každý krok začne nejvýš
// jednu stavbu, jen v režimech `STEWARD.stepModes`, jen v rozpočtu práce sdíleném s poli
// a obydlími (`laborBudget`) a výhradně přes `startStewardBuild` / `trySlots` (cena předem
// a kontrola místa jako u hráče). Sloty (hřbitov, sad, ohrada, humno) bere z plánu sídla – ve
// stejném tvaru, v jakém je plán ověřil (`checkPlanSlot`): střed políčka, jeden čtverec bez mřížky.

const DAYS_PER_YEAR = 365;
const HERD_PENS: readonly (readonly [HerdSpecies, PenSpecies])[] = [
  ['cow', 'cattle'],
  ['pig', 'pig'],
  ['sheep', 'sheep'],
  ['goat', 'goat'],
];

/** Kroky 5 až 10 dne správce (mutuje stav). */
export function extraSteps(state: VillageState, ctx: StewardContext): void {
  if (allowed(ctx, 'cemetery')) cemeteryStep(state, ctx);
  if (allowed(ctx, 'threshing')) threshingStep(state, ctx);
  if (allowed(ctx, 'pen')) penStep(state, ctx);
  if (allowed(ctx, 'orchard')) orchardStep(state, ctx);
  if (allowed(ctx, 'roadApples')) roadApplesStep(state, ctx);
  if (allowed(ctx, 'sacred')) sacredStep(state, ctx);
  if (allowed(ctx, 'road')) roadStep(state, ctx);
}

function allowed(ctx: StewardContext, step: string): boolean {
  return STEWARD.stepModes[step]?.includes(ctx.mode) === true;
}

/** Práce stavby se vejde do rozpočtu práce (steward.md – Rozpočet práce). */
function fits(state: VillageState, manDays: number): boolean {
  return laborBudget(state).left >= manDays;
}

function slotIntent(ctx: StewardContext, tile: number): { x: number; y: number } {
  return tileCell(ctx.landscape, tile);
}

// --- 5. hřbitov ------------------------------------------------------------------------

/** Kolik lidí za rok průměrně zemře (cemetery.md; úmrtnost ze skupin `rules-people`). */
function deathsPerYear(state: VillageState, day: number): number {
  let sum = 0;
  for (const p of state.people) {
    const g = ageGroup(p, day);
    sum +=
      g === 'child'
        ? childDeathsPerYear()
        : g === 'adult'
          ? ADULT_DEATHS_PER_YEAR
          : ELDER_DEATHS_PER_YEAR;
  }
  return sum;
}

/**
 * Krok 5 – hřbitov: ves po dostavění první zemnice nemá žádný → čtverec hned (i v Nouzi, stojí
 * 10 člověkodní); jinak volná místa i rozestavěných čtverců pod očekávanými hroby na
 * `STEWARD.graveYears` → rozšíření o čtverec (slot plánu sousedící se semenem).
 */
export function cemeteryStep(state: VillageState, ctx: StewardContext): void {
  if (state.dwellings.length === 0) return;
  const cemeteries = villageCemeteries(state);
  if (cemeteries.length === 0 && state.constructions.some((c) => c.kind === 'cemetery')) return;
  if (ctx.mode === 'emergency' && cemeteries.length > 0) return;
  if (state.constructions.some((c) => c.kind === 'cemetery')) return;
  if (cemeteries.length > 0) {
    const places = cemeteries.reduce(
      (sum, c) => sum + c.squares.length * CEMETERY.gravesPerSquare - usedPlaces(c),
      0,
    );
    if (places >= deathsPerYear(state, ctx.day) * STEWARD.graveYears) return;
    if (!fits(state, BUILD_COSTS.cemetery.laborManDays)) return;
  }
  trySlots(state, ctx, 'cemetery', (tile): BuildIntent => ({
    kind: 'cemetery',
    cells: [slotIntent(ctx, tile)],
  }));
}

// --- 6. humno --------------------------------------------------------------------------

/**
 * Krok 6 – humno: ves bez humna mlátí nouzově (o `THRESHING.emergencyWork` víc práce výmlatu
 * a o `emergencyLoss` méně zrna); humno se postaví, když tato roční ztráta (polní práce osevu
 * × podíl) za `STEWARD.paybackYears` převýší jeho práci. Další humno, když výmlat nestíhá
 * (`threshingStatus.floorShort`). Do 31. 7.
 */
export function threshingStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.threshingWindows)) return;
  if (state.constructions.some((c) => c.kind === 'threshing-floor')) return;
  const cost = BUILD_COSTS['threshing-floor'].laborManDays;
  if (!fits(state, cost)) return;
  const floors = villageThreshingFloors(state).length;
  if (floors === 0) {
    const capacity = fieldCapacity(state, ctx.day, ctx.coverage.pottery);
    if (!capacity || capacity.sownHa <= 0) return;
    const work = capacity.sownHa * fieldWorkPerHa('thresh', ctx.coverage.tools);
    const all = capacity.sownHa * sownWork(ctx);
    const yearly = work * THRESHING.emergencyWork + all * THRESHING.emergencyLoss;
    if (yearly * STEWARD.paybackYears < cost) return;
  } else if (builtThreshingFloorCount(state) === 0 || !threshingStatus(state, ctx.day).floorShort) {
    return;
  }
  trySlots(state, ctx, 'threshing-floor', (tile): BuildIntent => {
    const cell = tileCell(ctx.landscape, tile);
    const c = tileCenterWorld(ctx.landscape, cell.x, cell.y);
    return { kind: 'threshing-floor', position: { x: c.x, z: c.z, rotation: 0 } };
  });
}

/** Člověkodny polní práce na osetý hektar (kopání, setí, pletí, sklizeň, výmlat). */
function sownWork(ctx: StewardContext): number {
  return (['dig', 'sow', 'weed', 'harvest', 'thresh'] as const).reduce(
    (sum, t) => sum + fieldWorkPerHa(t, ctx.coverage.tools),
    0,
  );
}

// --- 7. ohrady -------------------------------------------------------------------------

/**
 * Krok 7 – ohrady, jedna za den správce, mimo žně: (a) plné stádo druhu (ovce, kozy, prasata,
 * skot; kusy na noc pod hranicí `STEWARD.penPlacesPerPerson` × lidé) → ohrada druhu; (b) spřežení
 * – ohrada volů, když ves má skot v ohradě a aspoň `OXEN.minCows` krávy a orba ušetří (kopání
 * motykou − orba rádlem na osetý hektar) za `paybackYears` víc než seno volů a ohrada; (c) koně
 * jen v Růstu, když vojvodova rodina cvičí a ves nemá ohradu koní.
 */
export function penStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.offHarvestWindows)) return;
  if ((state.pens ?? []).some((p) => p.builtDay === null)) return;
  if (state.constructions.some((c) => c.kind === 'pen')) return;
  const herds = state.livestock?.herds;
  const places = penCapacity(state);
  const room = herdRoom(state);
  const over = new Set(herdsOverRoom(state));
  const people = state.people.length;
  if (herds) {
    for (const [herd, pen] of HERD_PENS) {
      const full = over.has(herd) || Math.round(herds[herd]) >= Math.max(room[herd], 2);
      const wanted = people * (STEWARD.penPlacesPerPerson[herd] ?? 0);
      if (herds[herd] < 2 || !full || places[herd] >= wanted) continue;
      if (!fits(state, BUILD_COSTS.pen.laborManDays)) return;
      if (buildPen(state, ctx, pen)) return;
    }
    if (teamPenValue(state, ctx) && fits(state, BUILD_COSTS.pen.laborManDays)) {
      if (buildPen(state, ctx, 'team')) return;
    }
  }
  if (
    state.lord?.trains === true &&
    allowed(ctx, 'horses') &&
    !(state.pens ?? []).some((p) => p.species === 'horse') &&
    fits(state, PEN_BY_SPECIES.horse.laborManDays)
  ) {
    buildPen(state, ctx, 'horse');
  }
}

function buildPen(state: VillageState, ctx: StewardContext, species: PenSpecies): boolean {
  return trySlots(state, ctx, 'pen', (tile): BuildIntent => ({
    kind: 'pen',
    species,
    cells: [slotIntent(ctx, tile)],
  })).started;
}

/** Vyplatí se první ohrada volů (spřežení)? */
function teamPenValue(state: VillageState, ctx: StewardContext): boolean {
  if (oxPens(state).length > 0) return false;
  const herds = state.livestock?.herds;
  if (!herds || herds.cow < OXEN.minCows) return false;
  if (!(state.pens ?? []).some((p) => p.species === 'cattle' && p.builtDay !== null)) return false;
  const capacity = fieldCapacity(state, ctx.day, ctx.coverage.pottery);
  if (!capacity || capacity.sownHa <= 0) return false;
  const tools = ctx.coverage.tools;
  const saved = capacity.sownHa * (fieldWorkPerHa('dig', tools) - ploughWorkPerHa(tools));
  const hay = OXEN.teamSize * oxYearCost(villageFoodCosts(state, ctx.day, tools).hayPerKg);
  const pen = BUILD_COSTS.pen.laborManDays;
  return (saved - hay) * STEWARD.paybackYears > pen;
}

// --- 8. sad a jabloně u cest -----------------------------------------------------------

/** Chybí ovoce: roční plocha sadů a jabloní u cest dá méně jablek než plná potřeba stravy. */
function fruitShortfallKg(state: VillageState, ctx: StewardContext): number {
  const needKg = (yearlyFoodNeed(state, ctx.day) * DIET.fruitShare) / APPLE_FOOD_VALUE;
  const orchardKg = villageOrchards(state).reduce(
    (sum, o) => sum + (orchardAreaM2(o) / 10_000) * ORCHARD.fullYieldKgPerHa,
    0,
  );
  const later = ctx.day + ORCHARD.fullYieldYear * DAYS_PER_YEAR;
  const roadKg = villageRoadApples(state).reduce((sum, a) => sum + roadAppleYieldKg(a, later), 0);
  return needKg - orchardKg - roadKg;
}

/** Krok 8 – sad: ovoce ve stravě pod plnou potřebou → čtverec sadu v okně výsadby. */
export function orchardStep(state: VillageState, ctx: StewardContext): void {
  if (!monthInWindow(ORCHARD_PLANTING_WINDOWS, ctx.date.month)) return;
  if (state.constructions.some((c) => c.kind === 'orchard' || c.kind === 'road-apples')) return;
  if (fruitShortfallKg(state, ctx) <= 0) return;
  if (!fits(state, BUILD_COSTS.orchard.laborManDays * cellHa(ctx.landscape))) return;
  trySlots(state, ctx, 'orchard', (tile): BuildIntent => ({
    kind: 'orchard',
    cells: [slotIntent(ctx, tile)],
  }));
}

/** Pevná cesta vede kolem polí (zeleň chrání díly – disasters.md): díl do `STEWARD.roadFieldM`. */
function roadByFields(state: VillageState, ctx: StewardContext, road: Road): boolean {
  const limit = STEWARD.roadFieldM * STEWARD.roadFieldM;
  for (const part of state.parts) {
    if (!part.cell) continue;
    const c = tileCenterWorld(ctx.landscape, part.cell.x, part.cell.y);
    if (road.points.some((p) => (p.x - c.x) * (p.x - c.x) + (p.z - c.z) * (p.z - c.z) <= limit))
      return true;
  }
  return false;
}

/** Jabloně podél pevné cesty kolem polí, když ovoce pořád chybí a sad nevznikl (okno výsadby). */
export function roadApplesStep(state: VillageState, ctx: StewardContext): void {
  if (!monthInWindow(ORCHARD_PLANTING_WINDOWS, ctx.date.month)) return;
  if (state.constructions.some((c) => c.kind === 'orchard' || c.kind === 'road-apples')) return;
  if (fruitShortfallKg(state, ctx) <= 0) return;
  const roads = (state.roads?.roads ?? []).filter(
    (r) => r.abandoned !== true && r.grade !== 'trodden' && roadByFields(state, ctx, r),
  );
  let tries = 0;
  for (const road of roads) {
    if (skipped(state, ctx, 'road-apples', road.id)) continue;
    if (tries++ >= STEWARD.slotTries) return;
    const option = roadApplesOption(state, road.id, ctx.day, ctx.landscape, ctx.obstacles);
    if (!option || option.blocked || option.trees === 0) {
      skip(state, ctx, 'road-apples', road.id);
      continue;
    }
    if (!fits(state, option.laborManDays)) return;
    if (startStewardBuild(state, ctx, { kind: 'road-apples', roadId: road.id }).ok) return;
    skip(state, ctx, 'road-apples', road.id);
  }
}

// --- 9. posvátná místa -----------------------------------------------------------------

/**
 * Krok 9 – posvátná místa: štěstí pod `STEWARD.happinessFloor` a dost dubů → napřed modla
 * (nejvýš dvě), pak svatyně (jedna). Místo nejbližší středu vsi, které projde kontrolou
 * umístění; mimo žně.
 */
export function sacredStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.offHarvestWindows)) return;
  if (villageHappiness(state) >= STEWARD.happinessFloor) return;
  if (state.constructions.some((c) => c.kind === 'idol' || c.kind === 'shrine')) return;
  const idols = (state.sacredBuildings ?? []).filter((b) => b.kind === 'idol').length;
  const kind =
    idols < SACRED_BUILDINGS.idol.counted ? 'idol' : hasShrine(state) ? null : ('shrine' as const);
  if (!kind || !fits(state, SACRED_BUILDINGS[kind].laborManDays)) return;
  const centre = planCentre(state);
  if (!centre) return;
  const { landscape } = ctx;
  const size = landscape.size;
  const half = (size * landscape.cellSizeM) / 2;
  const cx = Math.floor((centre.x + half) / landscape.cellSizeM);
  const cy = Math.floor((centre.z + half) / landscape.cellSizeM);
  const r = STEWARD.sacredSearchTiles;
  const taken = takenTiles(state, ctx.day, landscape);
  const tiles: { tile: number; d: number }[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(size - 1, cx + r); x++) {
      const tile = y * size + x;
      if (taken[tile] || landscape.surface[tile] !== SURFACE_CODES.meadow) continue;
      tiles.push({ tile, d: (x - cx) * (x - cx) + (y - cy) * (y - cy) });
    }
  }
  tiles.sort((a, b) => a.d - b.d || a.tile - b.tile);
  const village = placementVillageOf(state, ctx.day);
  let checks = 0;
  let starts = 0;
  for (const { tile } of tiles) {
    if (checks++ >= STEWARD.sacredChecks || starts >= STEWARD.slotTries) return;
    const cell = tileCell(landscape, tile);
    const c = tileCenterWorld(landscape, cell.x, cell.y);
    const position = { x: c.x, z: c.z, rotation: 0 };
    if (!checkSacredBuildingPlacement(landscape, village, kind, position, ctx.obstacles).ok)
      continue;
    starts++;
    if (startStewardBuild(state, ctx, { kind: 'sacred', building: kind, position }).ok) return;
  }
}

// --- 10. cesty -------------------------------------------------------------------------

function skipped(state: VillageState, ctx: StewardContext, kind: string, id: number): boolean {
  return (state.steward?.skips ?? []).some(
    (s) => s.kind === kind && s.id === id && s.untilDay > ctx.day,
  );
}

function skip(state: VillageState, ctx: StewardContext, kind: string, id: number): void {
  const steward = state.steward;
  if (!steward) return;
  const rest = (steward.skips ?? []).filter(
    (s) => s.untilDay > ctx.day && !(s.kind === kind && s.id === id),
  );
  steward.skips = [...rest, { kind, id, untilDay: ctx.day + STEWARD.retryDays }];
}

/** Provoz úseku (pochůzek za den, poslední roční průměr). */
function trafficOf(road: Road): number {
  return road.traffic[road.traffic.length - 1] ?? 0;
}

/**
 * Krok 10 – cesty, jen v Růstu a mimo setí a žně: (a) vylepšení vyšlapané cesty, když úspora
 * chůze (provoz × délka × rozdíl rychlostí vyšlapané a upravené cesty) za
 * `STEWARD.roadPaybackYears` převýší cenu; (b) vozová cesta po upravené cestě s provozem aspoň
 * `STEWARD.wagonTrips` a vozem ve vsi; (c) jedna zemská stezka k nejbližšímu kraji mapy od
 * `STEWARD.trailPeople` lidí.
 */
export function roadStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.roadWindows)) return;
  if (state.constructions.some((c) => c.kind === 'road')) return;
  const roads = (state.roads?.roads ?? []).filter((r) => r.abandoned !== true);
  if (upgradeRoad(state, ctx, roads)) return;
  if (wagonRoad(state, ctx, roads)) return;
  trailStep(state, ctx);
}

function upgradeRoad(state: VillageState, ctx: StewardContext, roads: readonly Road[]): boolean {
  const gain = 1 / ROAD_WALK.speed.trodden - 1 / ROAD_WALK.speed.improved;
  const cands = roads
    .filter((r) => r.grade === 'trodden' && !skipped(state, ctx, 'road-upgrade', r.id))
    .map((road) => {
      const trips = trafficOf(road) * DAYS_PER_YEAR;
      const saved = walkDaysPerYear(trips, roadLengthM(road)) * gain * STEWARD.roadPaybackYears;
      return { road, cost: roadUpgradeCost(road).manDays, saved };
    })
    .filter((c) => c.saved > c.cost)
    .sort((a, b) => b.saved - b.cost - (a.saved - a.cost) || a.road.id - b.road.id);
  for (const c of cands.slice(0, 2)) {
    if (!fits(state, c.cost)) return false;
    const built = startStewardBuild(state, ctx, {
      kind: 'road-upgrade',
      roadId: c.road.id,
      upgrade: 'improved',
    });
    if (built.ok) return true;
    skip(state, ctx, 'road-upgrade', c.road.id);
  }
  return false;
}

function wagonRoad(state: VillageState, ctx: StewardContext, roads: readonly Road[]): boolean {
  if (villageCarts(state).length === 0) return false;
  if (laborBudget(state).left <= 0) return false;
  const cands = roads
    .filter(
      (r) =>
        r.grade === 'improved' &&
        trafficOf(r) >= STEWARD.wagonTrips &&
        !skipped(state, ctx, 'wagon-road', r.id),
    )
    .sort((a, b) => trafficOf(b) - trafficOf(a) || a.id - b.id);
  const road = cands[0];
  if (!road) return false;
  if (startStewardBuild(state, ctx, { kind: 'wagon-road', roadId: road.id }).ok) return true;
  skip(state, ctx, 'wagon-road', road.id);
  return false;
}

function trailStep(state: VillageState, ctx: StewardContext): void {
  if (state.people.length < STEWARD.trailPeople) return;
  if (villageTrails(state).length > 0) return;
  const centre = planCentre(state);
  if (!centre || laborBudget(state).left <= 0) return;
  const half = (ctx.landscape.size * ctx.landscape.cellSizeM) / 2;
  const edge = [
    { x: 1, z: 0, d: half - centre.x },
    { x: -1, z: 0, d: half + centre.x },
    { x: 0, z: 1, d: half - centre.z },
    { x: 0, z: -1, d: half + centre.z },
  ].sort((a, b) => a.d - b.d);
  const near = edge[0]!;
  const ranked = DIRECTIONS.map((direction, i) => {
    const v = DIRECTION_VECTORS[direction];
    return { direction, i, dot: v.x * near.x + v.z * near.z };
  }).sort((a, b) => b.dot - a.dot || a.i - b.i);
  let tries = 0;
  for (const { direction, i } of ranked) {
    if (skipped(state, ctx, 'trail', i)) continue;
    if (tries++ >= 3) return;
    if (startStewardBuild(state, ctx, { kind: 'trail', direction }).ok) return;
    skip(state, ctx, 'trail', i);
  }
}
