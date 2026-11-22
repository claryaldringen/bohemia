import { tileCenterWorld } from '../../landscape';
import type { BuildIntent } from '../buildings/build-intent';
import { BUILD_COSTS } from '../buildings/costs';
import { villageCemeteries } from '../buildings/cemetery';
import { fieldCapacity } from '../fields/field-capacity';
import { yearlyFoodNeed } from '../fields/field-food';
import { villageFoodCosts } from '../livestock/husbandry';
import { horsePenPayment } from '../livestock/horse-pen-payment';
import { LIVESTOCK } from '../livestock/livestock';
import { oxYearCost } from '../livestock/draft';
import { happinessLaborFactor, villageHappiness } from '../people/happiness';
import {
  orchardAreaM2,
  villageOrchards,
  monthInWindow,
  roadAppleYieldKg,
} from '../buildings/orchard';
import { fieldWorkPerHa } from '../core/productivity';
import { ploughWorkPerHa } from '../livestock/plough';
import { oxPens, PEN_BY_SPECIES } from '../livestock/oxen';
import { herdRoom, herdsOverRoom } from '../livestock/pens';
import { placementVillageOf } from '../placement/placement-village';
import { penSquaresFromCells } from '../placement/placement-pens';
import {
  segmentRampart,
  segmentWall,
  villageThreat,
  WALL_ORDER,
  wallAvailable,
  wallRank,
} from '../fortification';
import { villageFortifications } from '../fortification/state/fortifications';
import {
  fortDefenders,
  fortHorizonYears,
  fortLengthAs,
  fortPlanOf,
  fortValue,
  NO_FORT,
  samePlan,
  stewardFortificationFor,
  stewardKgPerManDay,
  stewardMoatSection,
  type FortPlan,
} from './steward-fortification';
import { isStewardBuilt } from './steward-state';
import { checkSacredBuildingPlacement } from '../placement/placement-sacred';
import { villageCarts } from '../crafts/carts';
import { roadApplesOption, villageRoadApples } from '../roads/road-apples';
import { roadUpgradeCost } from '../roads/road-upgrades';
import { roadLengthM, roadWetM } from '../paths/roads-geometry';
import { roadPieceCost } from '../paths/walking';
import {
  ADULT_DEATHS_PER_YEAR,
  CEMETERY,
  childDeathsPerYear,
  ELDER_DEATHS_PER_YEAR,
  HAPPINESS,
  HAPPINESS_BONUS,
  SACRED_BUILDINGS,
} from '../rules/rules-people';
import { usedPlaces } from '../people/burials';
import { ageGroup, laborPerDay } from '../people/people';
import {
  APPLE_FOOD_VALUE,
  ORCHARD,
  ORCHARD_PLANTING_WINDOWS,
  THRESHING,
} from '../rules/rules-fields';
import { DIET } from '../core/diet';
import { OXEN } from '../rules/rules-livestock';
import { CART_SPEED, TEAM_TRAVEL, WAGON_ROAD } from '../rules/rules-roads';
import { STEWARD } from '../rules/rules-steward';
import { christianShare } from '../people/conversion';
import { rodBaptized } from '../people/faith';
import { hasShrine, sacredBuildingHappiness, sacredHappiness } from '../people/sacred';
import { meadowTilesNearCentre, planCentre, walkDaysPerYear, cellHa } from './steward-land';
import {
  inStewardWindows,
  laborBudget,
  startStewardBuild,
  tileCell,
  trySlots,
  type StewardContext,
} from './steward';
import { threshingStatus, builtThreshingFloorCount } from '../fields/threshing';
import { villageThreshingFloors } from '../fields/threshing-floors';
import { planTrail, villageTrails, DIRECTIONS } from '../trade/trail';
import { DIRECTION_VECTORS } from '../trade/trail-axis';
import { planWagonRoad, wagonPlanInputOf } from '../roads/wagon-road';
import type {
  FortKind,
  FortSegment,
  HerdSpecies,
  PenSpecies,
  Road,
  VillageState,
  WallKind,
} from '../types';
import { premiumSacredHappiness } from '../core/premium-effects';

// Kroky 5 až 10 dne správce (steward.md – Rozhodovací pořadí v den správce, Ostatní stavby):
// hřbitov, humno, ohrady, sad a jabloně u cest, posvátná místa, cesty. Každý krok začne nejvýš
// jednu stavbu, jen v režimech `STEWARD.stepModes`, jen v rozpočtu práce sdíleném s poli
// a obydlími (`laborBudget`; kroky Růstu v Obnově jen jeho část – `fits`) a výhradně přes
// `startStewardBuild` / `trySlots` (cena předem a kontrola místa jako u hráče). Sloty (hřbitov, sad, ohrada, humno) bere z plánu sídla – ve
// stejném tvaru, v jakém je plán ověřil (`checkPlanSlot`): střed políčka, jeden čtverec bez mřížky.

const DAYS_PER_YEAR = 365;
const EDGE_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
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
  if (allowed(ctx, 'fortification')) fortificationStep(state, ctx);
  if (allowed(ctx, 'road')) roadStep(state, ctx);
}

/** Podíl rozpočtu práce, který krok v dnešním režimu smí vzít (0 – v režimu krok nestaví). */
function budgetShare(ctx: StewardContext, step: string): number {
  return STEWARD.stepModes[step]?.[ctx.mode] ?? 0;
}

function allowed(ctx: StewardContext, step: string): boolean {
  return budgetShare(ctx, step) > 0;
}

/**
 * Práce stavby kroku `step` se vejde do rozpočtu práce (steward.md – Rozpočet práce); krok
 * s podílem pod 1 (kroky Růstu v Obnově) po sobě nechá `1 − podíl` celého rozpočtu polím
 * a obydlím – nižší přednost.
 */
function fits(state: VillageState, ctx: StewardContext, step: string, manDays: number): boolean {
  const budget = laborBudget(state);
  const reserve = (1 - budgetShare(ctx, step)) * budget.freePerDay * STEWARD.laborHorizonDays;
  return budget.left - reserve >= manDays;
}

function slotIntent(ctx: StewardContext, tile: number): { x: number; y: number } {
  return tileCell(ctx.landscape, tile);
}

/** Ves je mladší než `years` let od založení (steward.md – Ostatní stavby, Mladá ves). */
function youngerThan(state: VillageState, ctx: StewardContext, years: number): boolean {
  return ctx.day - state.foundedDay < years * DAYS_PER_YEAR;
}

/**
 * Rok 0 vsi s úzkým hrdlem práce (steward.md – Ostatní stavby, Mladá ves): humno a ohrady jen
 * s kladnou hodnotou v hrdle – práce je to, co ves brzdí, a zrno ani maso ho nezvednou.
 */
function firstYearLaborBound(state: VillageState, ctx: StewardContext): boolean {
  return youngerThan(state, ctx, 1) && ctx.outlook.bottleneck === 'labor';
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
  // po křtu rodu jen u kostela – bez kostela se pohřbívá na starém hřbitově (cemetery.md – Po křtu rodu)
  if (rodBaptized(state) && !(state.churches ?? []).length) return;
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
    if (!fits(state, ctx, 'cemetery', BUILD_COSTS.cemetery.laborManDays)) return;
  }
  // rozšíření jen slotem, který sousedí stranou se stávajícím čtvercem – jinak by vznikl druhý
  // hřbitov; bez takového slotu správce počká na přepočet plánu
  const edge = cemeteries.length > 0 ? cemeteryEdgeTiles(state, ctx) : null;
  trySlots(
    state,
    ctx,
    'cemetery',
    (tile): BuildIntent => ({ kind: 'cemetery', cells: [slotIntent(ctx, tile)] }),
    edge ? (tile): boolean => edge.has(tile) : undefined,
  );
}

/**
 * Políčka krajiny, která sousedí stranou se čtvercem hřbitova v mřížce krajiny (natočený hřbitov
 * se rozšiřuje jen ve své mřížce – sloty plánu jsou políčka krajiny, takže žádné).
 */
function cemeteryEdgeTiles(state: VillageState, ctx: StewardContext): Set<number> {
  const size = ctx.landscape.size;
  const out = new Set<number>();
  for (const cemetery of villageCemeteries(state)) {
    if (cemetery.grid) continue;
    for (const { cell } of cemetery.squares) {
      for (const [dx, dy] of EDGE_STEPS) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x >= 0 && y >= 0 && x < size && y < size) out.add(y * size + x);
      }
    }
  }
  return out;
}

// --- 6. humno --------------------------------------------------------------------------

/**
 * Krok 6 – humno: ves bez humna mlátí nouzově (o `THRESHING.emergencyWork` víc práce výmlatu
 * a o `emergencyLoss` méně zrna); humno se postaví, když tato roční ztráta (polní práce osevu
 * × podíl) za `STEWARD.paybackYears` převýší jeho práci. V roce 0 vsi jen s kladnou hodnotou
 * v úzkém hrdle za první rok: při hrdle práce se počítá jen ušetřená práce výmlatu (zrno hrdlo
 * nezvedne), jinak i zrno (osivo a strava z omezené půdy). Další humno, když výmlat nestíhá
 * (`threshingStatus.floorShort`). Do 31. 7.
 */
export function threshingStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.threshingWindows)) return;
  if (state.constructions.some((c) => c.kind === 'threshing-floor')) return;
  const cost = BUILD_COSTS['threshing-floor'].laborManDays;
  if (!fits(state, ctx, 'threshing', cost)) return;
  const floors = villageThreshingFloors(state).length;
  if (floors === 0) {
    const capacity = fieldCapacity(state, ctx.day, ctx.coverage.pottery);
    if (!capacity || capacity.sownHa <= 0) return;
    const work = capacity.sownHa * fieldWorkPerHa('thresh', ctx.coverage.tools);
    const all = capacity.sownHa * sownWork(ctx);
    const labor = work * THRESHING.emergencyWork;
    const grain = all * THRESHING.emergencyLoss;
    const first = youngerThan(state, ctx, 1);
    const yearly = first && ctx.outlook.bottleneck === 'labor' ? labor : labor + grain;
    if (yearly * (first ? 1 : STEWARD.paybackYears) < cost) return;
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
 * skot; ≥ 2 kusy a ≥ místa v ohradách a u domů) → ohrada druhu, bez meze na člověka (Martin
 * 22. 11. 2026 – ves chová, co uživí; stádo pak roste do mezí pastvy, lesa, pasáků a sena); (b) spřežení
 * – ohrada volů, když ves má skot v ohradě, chovný pár krav a výrostky na pasení a orba ušetří na
 * osevu výhledu (kopání motykou − orba rádlem na osetý hektar) za `paybackYears` víc než seno volů
 * a ohrada (`teamPenValue`); (c) koně
 * v Růstu (v Obnově s nižší předností), když vojvodova rodina cvičí a ves nemá ohradu koní.
 * V roce 0 vsi s úzkým hrdlem práce (a) ani (b) ne – maso a mléko práci nezvednou
 * (`firstYearLaborBound`).
 */
export function penStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.offHarvestWindows)) return;
  if ((state.pens ?? []).some((p) => p.builtDay === null)) return;
  if (state.constructions.some((c) => c.kind === 'pen')) return;
  const herds = state.livestock?.herds;
  const room = herdRoom(state);
  const over = new Set(herdsOverRoom(state));
  if (herds && !firstYearLaborBound(state, ctx)) {
    for (const [herd, pen] of HERD_PENS) {
      const full = over.has(herd) || Math.round(herds[herd]) >= Math.max(room[herd], 2);
      if (herds[herd] < 2 || !full) continue;
      if (!fits(state, ctx, 'pen', BUILD_COSTS.pen.laborManDays)) return;
      if (buildPen(state, ctx, pen)) return;
    }
    if (teamPenValue(state, ctx) && fits(state, ctx, 'pen', BUILD_COSTS.pen.laborManDays)) {
      if (buildPen(state, ctx, 'team')) return;
    }
  }
  if (
    state.lord?.trains === true &&
    allowed(ctx, 'horses') &&
    !(state.pens ?? []).some((p) => p.species === 'horse') &&
    fits(state, ctx, 'horses', PEN_BY_SPECIES.horse.laborManDays) &&
    // platba bere jen krávy nad ty, které ves drží na mléko a voly (`surplusCows` – horses.md,
    // Koně se stavbou ohrady; Martin 2. 11. 2026) – správce jen pozná, jestli přebytek stačí
    horsePenPayment(state, ctx.day, ctx.coverage) !== null
  ) {
    buildPen(state, ctx, 'horse');
  }
}

/**
 * Ohrada druhu `species` na slotu plánu. Plán sloty ověřil pro skot (druh rozhoduje o napojení na
 * stojící ohradu téhož druhu a o ceně) – slot se napřed ověří pro stavěný druh; který se mu nehodí,
 * zůstane v plánu pro jiný druh.
 */
function buildPen(state: VillageState, ctx: StewardContext, species: PenSpecies): boolean {
  const village = placementVillageOf(state, ctx.day);
  return trySlots(
    state,
    ctx,
    'pen',
    (tile): BuildIntent => ({ kind: 'pen', species, cells: [slotIntent(ctx, tile)] }),
    (tile) =>
      penSquaresFromCells(ctx.landscape, village, [slotIntent(ctx, tile)], species, ctx.obstacles)
        .check.ok,
  ).started;
}

/**
 * Vyplatí se první ohrada volů (spřežení)? (steward.md – Ohrada volů podle stáda a osevu; návrh
 * Clauda 1. 11. 2026): ves má ohradu skotu a chovný pár krav (pase ho výrostek, bez výrostků
 * dospělý – diet.md, Pasáci, Dospělý pasák; dřív jen s výrostky) – s ohradou
 * volů pak drží krávy na voly (`breedingCows` + `oxenCows`) a telata nad chovným párem nejdou na
 * maso, takže stádo doroste k telatům do výcviku (seed krajiny 28: ohrada volů v roce 9 při 3–4
 * kravách, krávy 4 → 11, orba od roku 15). Dřív až od `OXEN.minCows` krav – stádo, kterému půlka
 * telat jde na maso, se drží pod třemi (seedy 3, 13, 17: 2,6–2,7 krávy) a ohrada přišla o 8 let
 * později nebo vůbec. Orba na osevu výhledu (`StewardOutlook` – nejmenší z osevů podle práce,
 * osiva a půdy) ušetří v oknech setí (kopání motykou − orba rádlem) za `paybackYears` víc než seno
 * volů a ohrada.
 */
function teamPenValue(state: VillageState, ctx: StewardContext): boolean {
  if (oxPens(state).length > 0) return false;
  const herds = state.livestock?.herds;
  if (!herds || Math.round(herds.cow) < LIVESTOCK.breedingMin) return false;
  if (!(state.pens ?? []).some((p) => p.species === 'cattle' && p.builtDay !== null)) return false;
  const { laborHa, seedHa, landHa } = ctx.outlook;
  const sownHa = Math.min(laborHa, seedHa, landHa);
  if (!(sownHa > 0) || !Number.isFinite(sownHa)) return false;
  const tools = ctx.coverage.tools;
  const saved = sownHa * (fieldWorkPerHa('dig', tools) - ploughWorkPerHa(tools));
  const hay = OXEN.teamSize * oxYearCost(villageFoodCosts(state, ctx.day, tools).hayPerKg);
  const pen = BUILD_COSTS.pen.laborManDays;
  return (saved - hay) * STEWARD.paybackYears > pen;
}

// --- 8. sad a jabloně u cest -----------------------------------------------------------

/** Chybí ovoce: roční plocha sadů a jabloní u cest dá méně jablek než plná potřeba stravy. */
function fruitShortfallKg(state: VillageState, ctx: StewardContext): number {
  const needKg = (yearlyFoodNeed(state, ctx.day) * DIET.fruitShare) / APPLE_FOOD_VALUE;
  const orchardKg = villageOrchards(state)
    .filter((o) => o.disusedDay === undefined)
    .reduce((sum, o) => sum + (orchardAreaM2(o) / 10_000) * ORCHARD.fullYieldKgPerHa, 0);
  const later = ctx.day + ORCHARD.fullYieldYear * DAYS_PER_YEAR;
  const roadKg = villageRoadApples(state).reduce((sum, a) => sum + roadAppleYieldKg(a, later), 0);
  return needKg - orchardKg - roadKg;
}

/**
 * Krok 8 v Obnově jen pro první zdroj ovoce (sad nebo jabloně u cest), další až v Růstu – ves bez
 * pojistky s víc sady hladověla o deset let později (měření 31. 10. 2026, seed krajiny 2).
 */
function fruitAllowed(state: VillageState, ctx: StewardContext): boolean {
  if (ctx.mode === 'growth') return true;
  return villageOrchards(state).length === 0 && villageRoadApples(state).length === 0;
}

/** Krok 8 – sad: ovoce ve stravě pod plnou potřebou → čtverec sadu v okně výsadby. */
export function orchardStep(state: VillageState, ctx: StewardContext): void {
  if (!monthInWindow(ORCHARD_PLANTING_WINDOWS, ctx.date.month)) return;
  if (!fruitAllowed(state, ctx)) return;
  if (state.constructions.some((c) => c.kind === 'orchard' || c.kind === 'road-apples')) return;
  if (fruitShortfallKg(state, ctx) <= 0) return;
  if (!fits(state, ctx, 'orchard', BUILD_COSTS.orchard.laborManDays * cellHa(ctx.landscape)))
    return;
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
  if (!fruitAllowed(state, ctx)) return;
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
    if (!fits(state, ctx, 'roadApples', option.laborManDays)) return;
    if (startStewardBuild(state, ctx, { kind: 'road-apples', roadId: road.id }).ok) return;
    skip(state, ctx, 'road-apples', road.id);
  }
}

// --- 9. posvátná místa -----------------------------------------------------------------

/**
 * Kolik člověkodní za rok přidá hotová modla nebo svatyně (steward.md – Posvátná místa podle
 * návratnosti): štěstí stavby (`sacredBuildingHappiness`) nad dnešní posvátná místa jen do stropu
 * `HAPPINESS_BONUS.sacredMax` a dnešní štěstí jen do `HAPPINESS.max`; rozdíl násobku práce
 * (`happinessLaborFactor` – pod 50 dvakrát strmější) × roční práce lidí vsi (`laborPerDay` × 365
 * – štěstí násobí veškerou práci). `obstacles` – stáří posvátných dubů (bez vrstvy nejmladší),
 * `premiumSacred` – posvátné místo prémiové krajiny (`premiumSacredHappiness`).
 */
export function sacredLaborGainPerYear(
  state: VillageState,
  day: number,
  kind: 'idol' | 'shrine',
  obstacles: StewardContext['obstacles'] | null,
  premiumSacred = 0,
): number {
  const sacred = sacredHappiness(state, day, obstacles, premiumSacred);
  const points =
    Math.min(HAPPINESS_BONUS.sacredMax, sacred + sacredBuildingHappiness(kind)) - sacred;
  if (points <= 0) return 0;
  const happiness = villageHappiness(state);
  // posvátná místa dávají štěstí jen pohanům (christianity.md – Štěstí) – zisk jen jejich podíl
  const gain =
    happinessLaborFactor(
      Math.min(HAPPINESS.max, happiness + points * (1 - christianShare(state))),
    ) - happinessLaborFactor(happiness);
  const labor = state.people.reduce((sum, p) => sum + laborPerDay(p, day), 0);
  return Math.max(0, gain) * labor * DAYS_PER_YEAR;
}

/**
 * Krok 9 – posvátná místa podle návratnosti (návrh Clauda 2. 11. 2026): napřed modla (nejvýš
 * dvě), pak svatyně (jedna), když práce, kterou štěstí stavby přidá (`sacredLaborGainPerYear`),
 * za `STEWARD.sacredPaybackYears` let režimu pokryje cenu stavby (práce i s kácením dubů –
 * `SACRED_BUILDINGS.laborManDays`; jinou surovinu stavba nebere). Místo nejbližší středu vsi,
 * které projde kontrolou umístění; mimo žně.
 */
export function sacredStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.offHarvestWindows)) return;
  if (state.constructions.some((c) => c.kind === 'idol' || c.kind === 'shrine')) return;
  const idols = (state.sacredBuildings ?? []).filter((b) => b.kind === 'idol').length;
  const kind =
    idols < SACRED_BUILDINGS.idol.counted ? 'idol' : hasShrine(state) ? null : ('shrine' as const);
  if (!kind) return;
  const cost = SACRED_BUILDINGS[kind].laborManDays;
  const years = STEWARD.sacredPaybackYears[ctx.mode];
  const premium = premiumSacredHappiness(ctx.landscape);
  if (sacredLaborGainPerYear(state, ctx.day, kind, ctx.obstacles, premium) * years < cost) return;
  if (!fits(state, ctx, 'sacred', cost)) return;
  const { landscape } = ctx;
  const tiles = meadowTilesNearCentre(state, ctx.day, landscape, STEWARD.sacredSearchTiles);
  const village = placementVillageOf(state, ctx.day);
  let checks = 0;
  let starts = 0;
  for (const tile of tiles) {
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

// --- 9a. opevnění podle hrozby -----------------------------------------------------------

/** Možnost kroku Opevnění: plán, přínos × horizont − cena, cena a záměr první etapy. */
interface FortOption {
  plan: FortPlan;
  value: number;
  cost: number;
  intent: BuildIntent;
}

/** Pořadí plánu při shodě hodnoty: nižší hradba, bez valu, bez vody napřed. */
function planOrder(plan: FortPlan): number {
  return (
    (plan.wall === null ? 0 : wallRank(plan.wall)) * 4 +
    (plan.rampart ? 2 : 0) +
    (plan.water ? 1 : 0)
  );
}

/** Hradby, které jdou v den `day` postavit (roštová od roku 790, komorová od 830). */
function wallsOn(day: number): WallKind[] {
  return WALL_ORDER.filter((w) => wallAvailable(w, day));
}

/**
 * Základ nového opevnění plánu (Hradby a obrana – Druhy): s valem val (hradba na něj v další
 * etapě), palisáda s ochozem napřed jako palisáda (ochoz jen vylepšením palisády).
 */
function newFortKind(plan: FortPlan): FortKind {
  if (plan.rampart) return 'rampart';
  return plan.wall === 'walkway' ? 'palisade' : (plan.wall ?? 'rampart');
}

/**
 * První etapa vylepšení vlastního opevnění z `from` na `plan` (vždy celý obvod): napřed hradba
 * (ochoz jen na palisádu – jinak napřed palisáda), pak val pod hradbu, nakonec vodní příkop
 * (úsek po úseku – `moat`).
 */
function upgradeIntent(
  fortificationId: number,
  from: FortPlan,
  plan: FortPlan,
  moat: { segment: number } | null,
): BuildIntent | null {
  if (plan.wall !== null && plan.wall !== from.wall) {
    const target = plan.wall === 'walkway' && from.wall !== 'palisade' ? 'palisade' : plan.wall;
    return {
      kind: 'fortification-upgrade',
      fortificationId,
      work: 'upgrade',
      target,
      segment: null,
    };
  }
  if (plan.rampart && !from.rampart) {
    return { kind: 'fortification-rampart', fortificationId, segment: null };
  }
  if (plan.water && !from.water && moat) {
    return { kind: 'fortification-moat', fortificationId, segment: moat.segment };
  }
  return null;
}

/**
 * Krok 9a – opevnění podle hrozby (fortifications.md – Hradby a obrana, Správce; Martin 3. 11.
 * 2026: „Opevnění je stavba jako každá jiná“; 8. 11. 2026: „To, že vesnice hradbu nepostaví, je
 * spíš věcí správce – prostě usoudí, že se mu nevyplatí.“): za hrozby nad 0 (`villageThreat`) a mimo
 * žně správce spočte pro každý plán – hradba (plot až komorová, podle roku), val s příkopem, vodní
 * příkop, vždy celý obvod – přínos ochrany × horizont − cena (`fortValue`) a postaví první etapu
 * nejlepšího kladného. Má-li vlastní hotové opevnění, počítá jen rozdíl vylepšení (vyšší hradba,
 * ochoz, doplnění valu, napuštění příkopu). Hráčovo opevnění nemění a vedle něj nestaví; klešťovou
 * bránu a věž staví jen hráč. V Růstu a Obnově, v Nouzi ne.
 */
export function fortificationStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.offHarvestWindows)) return;
  if (state.constructions.some((c) => c.kind === 'fortification')) return;
  const threat = villageThreat(state.threats, ctx.day);
  if (threat <= 0) return;
  const forts = villageFortifications(state);
  if (forts.some((f) => !isStewardBuilt(state, f.id))) return;
  const kg = stewardKgPerManDay(state, ctx.landscape, ctx.obstacles);
  const men = fortDefenders(state, ctx.day);
  const walls = wallsOn(ctx.day);
  const options: FortOption[] = [];
  const consider = (
    plan: FortPlan,
    from: FortPlan | null,
    lengthM: number,
    intent: BuildIntent,
  ): void => {
    const years = fortHorizonYears(plan, from, ctx.mode);
    if (years <= 0) return;
    const { gain, cost } = fortValue(state, ctx.day, plan, threat, {
      lengthM,
      kgPerManDay: kg,
      from,
      years,
      men,
    });
    options.push({ plan, value: gain * years - cost, cost, intent });
  };
  const own = forts[0];
  if (own) {
    // vlastní opevnění: jen vylepšení hotového (rozdělaná stavba se nedoplňuje)
    const unfinished = (s: FortSegment): boolean =>
      [segmentRampart(own, s), segmentWall(own, s)].some((l) => l !== null && l.builtDay === null);
    if (own.segments.some(unfinished)) return;
    const from = fortPlanOf(own);
    if (from.wall === null && !from.rampart) return;
    const length = fortLengthAs(ctx.landscape, own, own.kind);
    if (length === null) return;
    const moat = from.rampart && !from.water ? stewardMoatSection(ctx.landscape, own) : null;
    const higher = walls.filter((w) => from.wall === null || wallRank(w) > wallRank(from.wall));
    for (const wall of [from.wall, ...higher]) {
      for (const rampart of from.rampart ? [true] : [false, true]) {
        for (const water of moat ? [false, true] : [from.water]) {
          const plan: FortPlan = { wall, rampart, water: rampart && water };
          if (samePlan(plan, from)) continue;
          const intent = upgradeIntent(own.id, from, plan, moat);
          if (intent) consider(plan, from, length, intent);
        }
      }
    }
  } else {
    const areas = new Map<FortKind, ReturnType<typeof stewardFortificationFor>>();
    for (const wall of [null, ...walls]) {
      for (const rampart of [false, true]) {
        const plan: FortPlan = { ...NO_FORT, wall, rampart };
        if (samePlan(plan, NO_FORT)) continue;
        const base = newFortKind(plan);
        if (!areas.has(base)) {
          areas.set(
            base,
            stewardFortificationFor(state, ctx.landscape, ctx.obstacles, ctx.day, base),
          );
        }
        const area = areas.get(base);
        if (!area) continue;
        consider(plan, null, area.lengthM, {
          kind: 'fortification',
          points: area.points,
          fortKind: base,
        });
      }
    }
  }
  const best = options
    .filter((o) => o.value > 0)
    .sort((a, b) => b.value - a.value || planOrder(a.plan) - planOrder(b.plan));
  let starts = 0;
  for (const option of best) {
    if (starts++ >= STEWARD.slotTries) return;
    if (!fits(state, ctx, 'fortification', option.cost)) continue;
    if (startStewardBuild(state, ctx, option.intent).ok) return;
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
 * Krok 10 – cesty, v Růstu (v Obnově s nižší předností) a mimo setí a žně: (a) vylepšení
 * vyšlapané cesty, když úspora chůze a jízd vozem (`roadUpgradeSavedPerYear`) za
 * `STEWARD.roadPaybackYears` let režimu převýší cenu; (b) vozová cesta po upravené cestě s provozem
 * aspoň `STEWARD.wagonTrips` a vozem ve vsi; (c) jedna zemská stezka k nejbližšímu kraji mapy od
 * `STEWARD.trailPeople` lidí. Vždy jen s celou cenou (práce úseků) v rozpočtu práce.
 */
export function roadStep(state: VillageState, ctx: StewardContext): void {
  if (!inStewardWindows(ctx.date, STEWARD.roadWindows)) return;
  if (state.constructions.some((c) => c.kind === 'road')) return;
  const roads = (state.roads?.roads ?? []).filter((r) => r.abandoned !== true);
  if (upgradeRoad(state, ctx, roads)) return;
  if (wagonRoad(state, ctx, roads)) return;
  trailStep(state, ctx);
}

/**
 * Kolik člověkodní za rok ušetří vylepšení vyšlapané cesty (steward.md – Ostatní stavby, Cesty):
 * chůze – pochůzky za den (`trafficOf`, tam a zpět jedna) × rozdíl ceny úseku vyšlapaného
 * a upraveného (`roadPieceCost`: mokřina s hatí, brod s lávkou, stromy u cesty); jízdy vozem –
 * loňské jízdy (`Road.cartTraffic`) × rozdíl `CART_SPEED` vyšlapané (vyježděné) a upravené cesty
 * mimo mokřinu, den vozky jako u vozové cesty (`WAGON_ROAD.dayHours`, `TEAM_TRAVEL.speedMps`).
 */
export function roadUpgradeSavedPerYear(road: Road): number {
  const length = roadLengthM(road);
  const improved = { ...road, grade: 'improved' as const, unbridged: false };
  const walkM = roadPieceCost(road, 0, length) - roadPieceCost(improved, 0, length);
  const walk = walkDaysPerYear(trafficOf(road) * DAYS_PER_YEAR, Math.max(0, walkM));
  const carts = road.cartTraffic?.[road.cartTraffic.length - 1] ?? 0;
  const from = road.cart === true ? CART_SPEED.road.cart : CART_SPEED.road.trodden;
  const cartM =
    Math.max(0, length - roadWetM(road.ground)) * (1 / from - 1 / CART_SPEED.road.improved);
  const cart =
    (carts * DAYS_PER_YEAR * cartM) / (TEAM_TRAVEL.speedMps * 3600 * WAGON_ROAD.dayHours);
  return walk + cart;
}

function upgradeRoad(state: VillageState, ctx: StewardContext, roads: readonly Road[]): boolean {
  const years = STEWARD.roadPaybackYears[ctx.mode];
  if (years <= 0) return false;
  const cands = roads
    .filter((r) => r.grade === 'trodden' && !skipped(state, ctx, 'road-upgrade', r.id))
    .map((road) => {
      const saved = roadUpgradeSavedPerYear(road) * years;
      return { road, cost: roadUpgradeCost(road).manDays, saved };
    })
    .filter((c) => c.saved > c.cost)
    .sort((a, b) => b.saved - b.cost - (a.saved - a.cost) || a.road.id - b.road.id);
  for (const c of cands.slice(0, 2)) {
    if (!fits(state, ctx, 'road', c.cost)) return false;
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
  // cena předem – celá práce úseků v rozpočtu (rozestavěná cesta by brala práci polím)
  const plan = planWagonRoad(
    wagonPlanInputOf(state, ctx.day, road.id, ctx.landscape, ctx.obstacles),
  );
  if (plan.ok && !fits(state, ctx, 'road', plan.laborManDays)) return false;
  if (plan.ok && startStewardBuild(state, ctx, { kind: 'wagon-road', roadId: road.id }).ok) {
    return true;
  }
  skip(state, ctx, 'wagon-road', road.id);
  return false;
}

function trailStep(state: VillageState, ctx: StewardContext): void {
  if (state.people.length < STEWARD.trailPeople) return;
  if (villageTrails(state).length > 0) return;
  const centre = planCentre(state);
  if (!centre) return;
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
    const plan = planTrail(state, direction, ctx.day, ctx.landscape, ctx.obstacles);
    // cena předem – práce stezky v rozpočtu; nevejde se – zkusí se příští den správce
    if (plan.ok && !fits(state, ctx, 'road', plan.laborManDays)) return;
    if (plan.ok && startStewardBuild(state, ctx, { kind: 'trail', direction }).ok) return;
    skip(state, ctx, 'trail', i);
  }
}
