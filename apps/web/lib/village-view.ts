import {
  PEN_BY_SPECIES,
  HORSE_PEN_NO_SURPLUS,
  horsePenPayment,
  type TradeGood,
  type BuildCost,
  type StockResource,
  fieldCapacity,
  BUILD_COSTS,
  isCancellable,
  paymentValueKg,
  purchaseDaysLeft,
  STOCK_RESOURCES,
  affordability,
  ageYears,
  dateOfDayIndex,
  monthInWindow,
  ORCHARD_PLANTING_WINDOWS,
  obstaclesOf,
  isAbandoned,
  structureCondition,
  summarizeVillage,
  villageStock,
  wholeLogs,
  HAY_WINTER_MONTHS,
  foundingCostPerHa,
  type BuildKind,
  type CraftCoverage,
  type Direction8,
  type Landscape,
  type VillageRecord,
  type VillageState,
  type VillageSummary,
  hasShrine,
  villageCemeteries,
  villageLifespan,
  villageOrchards,
  abandonedVillageAt,
  withNeighbours,
  type NeighbourSnapshot,
  type PenSpecies,
  type HerdPlaces,
  penHerdSpecies,
} from '@bohemia/game';
import { formatGameDate } from './game-date';

import {
  DAYS_PER_YEAR,
  BuildOption,
  VillagePen,
  VillagePurchase,
  VillageView,
  boughtProducts,
} from './village-view-types';
import { SceneVillage } from './village-view-scene-types';
import {
  CHRONICLE_LENGTH,
  chronicleText,
  constructionLabel,
  repairProgress,
} from './village-view-chronicle';
import { sceneVillage } from './village-view-scene';
import { roadViews } from './village-view-roads';
import { craftsView } from './village-view-crafts';
import {
  cemeteryProgress,
  extensionProgress,
  oxenViewOf,
  penShortOf,
  sacredView,
  threshingOf,
  threshingFloorsOf,
} from './village-view-buildings';
import { fieldViews, orchardSquareView } from './village-view-fields';
import {
  householdRelocation,
  householdRelocationBlock,
  relocationOptions,
} from './relocation-view';

import { manorView } from './manor-view';
import { personPortrait, scenePersons, type DwellingResident } from './person-view';
import { ROLE_NAMES } from './person-roles';
import { dynastyView } from './dynasty-view';
import { horsesView, type VillageHorses } from './horse-view';

import { dugSitesField } from './ore-site-view';

import { kilnsField } from './kiln-view';

import { grainPitsField } from './grain-pit-view';
import { junctionsField } from './junction-view';

import { sceneTrails } from './trail-view';

import { sceneExpeditions } from './caravan-view';

import type { VillageListItem } from './village-list';
import type { LineEndView } from './line-end-view';

import {
  journeyView,
  leaveOptions,
  villageAbandonment,
  type SceneNeighbour,
} from './departure-view';

// Pohled na ves pro panel a scénu (DTO server actions). Čistý modul – smí ho importovat
// i klient (typy, převod scény na data pro kontrolu umístění).

export type {
  BuildKind,
  Craft,
  Crop,
  HerdSpecies,
  FieldSurface,
  LaborActivity,
  LaborShare,
  LaborTarget,
  PartStage,
  SacredBuildingKind,
  StockResource,
  WorkshopActivity,
  KilnStage,
} from '@bohemia/game';

export * from './village-view-types';
export * from './village-view-scene-types';
export * from './village-view-chronicle';
export * from './village-view-scene';
export * from './village-view-roads';
export * from './village-view-crafts';
export * from './village-view-buildings';
export * from './village-view-fields';

/** Den poslední svatby mezi domy v kronice; žádná null. */
export function lastMarriageDay(state: VillageState): number | null {
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const event = state.chronicle[i];
    if (event?.kind === 'marriage') return event.day;
  }
  return null;
}

export function chronicle(state: VillageState, name: string): VillageView['chronicle'] {
  return state.chronicle
    .slice(-CHRONICLE_LENGTH)
    .reverse()
    .map((event) => ({
      day: event.day,
      kind: event.kind,
      ...('kg' in event ? { kg: event.kg } : {}),
      ...(event.kind === 'structure-fell' || event.kind === 'structure-repaired'
        ? { structure: event.structure }
        : {}),
      ...(event.kind === 'newcomer' ? { group: event.group, direction: event.direction } : {}),
      ...(event.kind === 'emergency-slaughter' ? { animals: event.animals } : {}),
      ...((event.kind === 'team-ready' ||
        event.kind === 'team-retired' ||
        event.kind === 'ox-died') &&
      event.oxen !== undefined
        ? { oxen: event.oxen }
        : {}),
      ...(event.kind === 'horse-starved' || event.kind === 'horse-retired'
        ? { horses: event.horses }
        : event.kind === 'foal-born'
          ? { horses: event.foals }
          : {}),
      ...(event.kind === 'crafts-bought'
        ? { direction: event.direction, products: boughtProducts(event.get) }
        : {}),
      ...(event.kind === 'iron-trip'
        ? {
            place: event.to,
            son: event.son,
            ...(event.direction ? { direction: event.direction } : {}),
            ...(event.porters ? { porters: event.porters } : {}),
            ...(event.byCart ? { byCart: true as const } : {}),
          }
        : {}),
      ...(event.kind === 'iron-brought' ? { son: event.son } : {}),
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name),
    }));
}

/**
 * Nabízené stavby = všechny s cenou – ručně psaný seznam už jednou zapomněl tesaře; pořadí
 * v mřížce dává katalog staveb (`build-items.ts`).
 */
const BUILD_KINDS = Object.keys(BUILD_COSTS) as BuildKind[];
/** Kolik štěstí přidá modla a svatyně (happiness.md). */
/** Svatyně je jedna na ves (happiness.md) – důvod v popisku nabídky staveb. */
export const SHRINE_LIMIT = 'Ves už svatyni má.';

/**
 * Ohrada koní (horses.md – Koně se stavbou ohrady): vyšší plot (50 člověkodní, 8 stromů) a koně
 * zaplacení předem z přebytku vsi (hřivny, zvířata, obilí – `horsePenPayment`); nestačí-li přebytek,
 * stavba je zablokovaná.
 */
function horsePenOption(
  state: VillageState,
  base: BuildCost,
  stock: Record<StockResource, number>,
  coverage: CraftCoverage,
): NonNullable<BuildOption['variants']>[string] {
  const upfront = { ...base.upfront, wood: PEN_BY_SPECIES.horse.trees };
  const { affordable, missing } = affordability(stock, upfront);
  const paid = horsePenPayment(state, state.lastDay, coverage);
  const payment: { good: TradeGood; amount: number }[] = paid
    ? [
        { good: 'ironBars' as const, amount: paid.ironBarsKg },
        { good: 'cows' as const, amount: paid.cows },
        { good: 'foals' as const, amount: paid.horseCounts.foals ?? 0 },
        { good: 'mares' as const, amount: paid.horseCounts.mares ?? 0 },
        { good: 'ridingHorses' as const, amount: paid.horseCounts.ridingHorses ?? 0 },
        { good: 'grain' as const, amount: Math.ceil(paid.grainKg) },
        { good: 'legumes' as const, amount: Math.ceil(paid.legumesKg) },
      ].filter((p) => p.amount > 0)
    : [];
  return {
    laborManDays: PEN_BY_SPECIES.horse.laborManDays,
    upfront: STOCK_RESOURCES.flatMap((resource) => {
      const amount = upfront[resource] ?? 0;
      return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
    }),
    affordable: affordable && paid !== null,
    blocked: paid === null ? HORSE_PEN_NO_SURPLUS : null,
    payment,
    extendAffordable: affordable,
  };
}

/**
 * Jde druh stavby zahájit (tlačítko mřížky, klávesa)? Ohrada koní se platí koňmi jen při založení;
 * rozšíření vybrané ohrady téhož druhu (`extending`) platbu nechce, i když přebytek na koně nestačí.
 */
export function isBuildAffordable(
  option: BuildOption | null | undefined,
  variant?: string,
  extending = false,
): boolean {
  if (!option) return true;
  const own = variant ? option.variants?.[variant] : undefined;
  if (!own) return option.affordable;
  return extending ? own.extendAffordable : own.affordable;
}

/**
 * Nabídka staveb: cena z pravidel a co z ceny předem (suroviny, dřevo, lidé k osídlení) ves nemá.
 * Dřevo = klády + dospělé stromy krajiny sídla, které jde skácet (vrstva překážek).
 */
function buildOptions(
  state: VillageState,
  landscape: Landscape,
  coverage: CraftCoverage,
): Record<BuildKind, BuildOption> {
  const stock = villageStock(state, obstaclesOf(landscape));
  const entries = BUILD_KINDS.map((kind): [BuildKind, BuildOption] => {
    const base = BUILD_COSTS[kind];
    // založení pole podle pokrytí nástroji (crafts.md – meze produktivity)
    const cost =
      kind === 'field'
        ? { ...base, laborManDays: foundingCostPerHa('meadow', coverage.tools) }
        : base;
    const { affordable, missing } = affordability(stock, cost.upfront);
    const upfront = STOCK_RESOURCES.flatMap((resource) => {
      const amount = cost.upfront[resource] ?? 0;
      return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
    });
    const blocked = kind === 'shrine' && hasShrine(state) ? SHRINE_LIMIT : null;
    const option: BuildOption = {
      laborManDays: cost.laborManDays,
      perHa: cost.perHa,
      perSquare: cost.perSquare ?? false,
      upfront,
      blocked,
      affordable: affordable && blocked === null,
    };
    if (kind === 'pen') option.variants = { horse: horsePenOption(state, base, stock, coverage) };
    return [kind, option];
  });
  return Object.fromEntries(entries) as Record<BuildKind, BuildOption>;
}

/** Co pohled na jednu ves sám neví – zjistí ho vstupní bod přes `dynastyStatus`. */
export interface VillageViewContext {
  /** Hráči vymřely všechny vsi (ne jen tahle), nebo vymřel rod. */
  gameOver?: boolean;
  /** Rod vymřel po meči – kronika rodu (`lineEndView` přes všechny vsi hráče). */
  lineEnded?: LineEndView | null;
  /** Všechny vsi hráče pro přepínač; bez nich jen tahle ves. */
  villages?: VillageListItem[];
  /**
   * Jiné vsi na téže mapě (migration.md) – přehled jejich staveb a pasek (`neighbourSnapshot`)
   * a jejich stavby pro scénu. Bez nich je ves na mapě sama.
   */
  neighbours?: NeighbourSnapshot | null;
  neighbourScenes?: SceneNeighbour[];
  /** Vlastní vsi na sousedních mapách po směrech – tam se neodchází ani neobchoduje. */
  ownMaps?: Partial<Record<Direction8, string>>;
  /** Proč z téhle mapy na novou mapu odejít nejde (mapa bez polohy v mřížce), nebo null. */
  mapsBlocked?: string | null;
}

/** Stavby vsi pro scénu – jako v pohledu na ves (stavby jiné vsi na téže mapě). */
export function sceneOfVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
): SceneVillage {
  const shown = abandonedVillageAt(state, day);
  return sceneVillage(shown, landscape, day, summarizeVillage(shown, day, obstaclesOf(landscape)));
}

/**
 * Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). `context` – konec hry a vsi
 * hráče pro přepínač (vstupní bod je zná ze všech vsí hráče).
 */
/** Pole uživí ≈ N lidí (fields.md – Co hráč vidí) – výpočet je v jádru, tady jen tvar pro panel. */
function fieldCapacityView(
  state: VillageState,
  day: number,
  potteryCoverage: number,
): VillageView['fieldCapacity'] {
  const capacity = fieldCapacity(state, day, potteryCoverage);
  return (
    capacity && {
      people: capacity.people,
      rotationHa: capacity.rotationHa,
      fertility: capacity.fertility,
    }
  );
}

export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
  context: VillageViewContext = {},
): VillageView {
  const { name } = record;
  // jiné vsi na téže mapě (paseky, cizí půda) a opuštěná ves jen jako pohled (migration.md)
  const state = abandonedVillageAt(withNeighbours(record.state, context.neighbours ?? null), day);
  const obstacles = obstaclesOf(landscape);
  const summary = summarizeVillage(state, day, obstacles);
  const gameOver = context.gameOver ?? false;
  const persons = scenePersons(state, day);
  return {
    id: record.id,
    settlementId: record.settlementId,
    name,
    villages: context.villages ?? [
      {
        id: record.id,
        settlementId: record.settlementId,
        name,
        people: state.people.length,
        extinct: state.extinctDay !== undefined,
        abandoned: state.abandonedDay !== undefined,
        travelling: state.journey !== undefined,
        hunger: summary.hunger,
      },
    ],
    dayIndex: day,
    people: summary.people,
    households: summary.households.map((h) => {
      const residents = persons
        .filter((p) => p.home === h.dwellingId)
        .map((p): DwellingResident => ({
          id: p.id,
          portrait: personPortrait(p),
          role: ROLE_NAMES[p.role],
          ...(p.name !== undefined ? { name: p.name } : {}),
          age: p.age,
        }))
        .sort((a, b) => b.age - a.age || a.id - b.id);
      const dwelling = state.dwellings.find((d) => d.id === h.dwellingId);
      return {
        ...h,
        ages: state.people
          .filter((p) => p.dwellingId === h.dwellingId)
          .map((p) => ageYears(p.bornDay, day))
          .sort((a, b) => b - a),
        residents,
        ageYears: dwelling ? Math.max(0, Math.floor((day - dwelling.builtDay) / DAYS_PER_YEAR)) : 0,
        relocation: householdRelocation(state, summary.constructions, h.dwellingId),
        relocationBlock: householdRelocationBlock(state, h.dwellingId),
      };
    }),
    storesKg: summary.storesKg,
    applesKg: summary.applesKg,
    meatKg: summary.meatKg,
    legumesKg: summary.legumesKg,
    cheeseKg: summary.cheeseKg,
    milkLPerDay: summary.livestock.milkLPerDay,
    hayKg: summary.hayKg,
    diet: {
      energy: summary.diet.energy,
      protein: summary.diet.protein,
      diversity: summary.diet.diversity,
      shares: summary.diet.shares,
    },
    livestock: summary.livestock,
    woodLogs: wholeLogs(summary.woodLogs),
    crafts: craftsView(state, summary, landscape),
    storesMonths: summary.storesMonths,
    satiation: summary.satiation,
    fieldCapacity: fieldCapacityView(state, day, summary.crafts.coverage.pottery),
    commonLaborPerDay: summary.commonLaborPerDay,
    lord: state.labor?.lord ?? null,
    dynasty: dynastyView(state, day),
    fullHousehold: summary.fullHousehold,
    build: buildOptions(state, landscape, summary.crafts.coverage),
    relocation: relocationOptions(state, landscape),
    constructions: summary.constructions.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: constructionLabel(c),
      progress: c.progress,
      dwellingType: c.dwellingType,
      craft:
        c.craft ??
        (c.kind === 'rebuild'
          ? (state.dwellings.find((d) => d.id === c.dwellingId)?.workshop?.craft ?? null)
          : null),
      dwellingId: c.kind === 'rebuild' ? c.dwellingId : null,
      relocates: state.constructions.find((x) => x.id === c.id)?.relocates ?? null,
      penId: state.constructions.find((x) => x.id === c.id)?.penId ?? null,
      cancellable: state.constructions.some((x) => x.id === c.id && isCancellable(x)),
      fieldId: c.kind === 'field' ? c.fieldId : null,
      cemeteryId: c.cemeteryId,
      orchardId: c.orchardId,
      treesToFell: c.treesToFell,
    })),
    fields: fieldViews(state, day),
    hungry: summary.hungry,
    starving: summary.starving,
    hunger: summary.hunger,
    constructionsStalled: summary.constructionsStalled,
    happiness: {
      value: summary.happiness.value,
      target: summary.happiness.target,
      laborFactor: summary.happiness.laborFactor,
    },
    sacred: sacredView(state, summary, obstacles, day),
    extinct: villageLifespan(state),
    abandoned: villageAbandonment(state),
    journey: journeyView(state, day),
    leave: leaveOptions(state, landscape, context.ownMaps ?? {}, context.mapsBlocked ?? null),
    gameOver,
    ...(gameOver && context.lineEnded ? { lineEnded: context.lineEnded } : {}),
    cemeteries: summary.cemeteries.map((c) => {
      const progress = cemeteryProgress(c.id, c.built, summary.constructions);
      const wear = villageCemeteries(state).find((x) => x.id === c.id)?.fenceWear;
      return {
        ...c,
        progress,
        fenceCondition: structureCondition(wear, 'cemetery-fence', day),
        abandoned: isAbandoned(wear),
        repair: repairProgress(summary.constructions, 'cemetery-fence', c.id),
      };
    }),
    orchards: summary.orchards.map((o) => {
      const planting = summary.constructions.find(
        (c) => c.kind === 'orchard' && c.orchardId === o.id,
      );
      const waits = !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month);
      const orchard = villageOrchards(state).find((x) => x.id === o.id);
      return {
        id: o.id,
        areaM2: o.areaM2,
        squares: o.squares,
        cells: (orchard?.squares ?? []).map((square) => orchardSquareView(square, day, waits)),
        ageYears: o.ageYears,
        expectedYieldKg: o.expectedYieldKg,
        planting: planting ? planting.progress : null,
        plantingWaits: planting !== undefined && waits,
      };
    }),
    pens: penViews(state, day, summary),
    ...penShortOf(state),
    ...oxenViewOf(summary),
    ...horsesViewOf(state, day),
    ...threshingOf(state, day),
    ...threshingFloorsOf(state, summary.constructions),
    roads: roadViews(state, landscape, day, summary),
    scene: {
      ...sceneVillage(state, landscape, day, summary),
      trails: sceneTrails(state),
      expeditions: sceneExpeditions(state),
      ...(context.neighbourScenes?.length ? { neighbours: context.neighbourScenes } : {}),
    },
    chronicle: chronicle(state, name),
    purchases: purchaseViews(state),
    lastMarriageDay: lastMarriageDay(state),
    manor: manorView(state, landscape, day, context.ownMaps ?? {}),
    ...dugSitesField(state, day),
    ...kilnsField(state, day),
    ...grainPitsField(state, day),
    ...junctionsField(state, day),
  };
}

/** Nákupy u sousedů na cestě pro panel (crafts.md – Nákup u sousedů). */
function purchaseViews(state: VillageState): VillagePurchase[] {
  return (state.purchases ?? []).map((p) => ({
    direction: p.direction,
    get: { ...p.get },
    payKg: Math.round(paymentValueKg(p.pay)),
    group: p.group,
    daysLeft: purchaseDaysLeft(p),
    progress: p.days > 0 ? Math.min(1, p.done / p.days) : 1,
  }));
}

/** Koně vsi (`VillageView.horses`); ves bez ohrady koní bez údaje. */
function horsesViewOf(state: VillageState, day: number): { horses?: VillageHorses } {
  const horses = horsesView(state, day);
  return horses ? { horses } : {};
}

/** Místa stáda druhu ohrady (`VillagePen.herdPlaces`) – u ohrady volů null. */
function herdPlacesOf(summary: VillageSummary, species: PenSpecies): HerdPlaces | null {
  const herd = penHerdSpecies(species);
  return herd ? { ...summary.herdPlaces[herd] } : null;
}

/** Ohrady pro panel výběru – stavba, voli, výcvik a zvířata v ohradě. */
function penViews(state: VillageState, day: number, summary: VillageSummary): VillagePen[] {
  const winter = HAY_WINTER_MONTHS.includes(dateOfDayIndex(day).month);
  return summary.pens.map((pen) => {
    const construction = state.constructions.find((c) => c.kind === 'pen' && c.penId === pen.id);
    const progress = pen.built
      ? 1
      : (summary.constructions.find((c) => c.id === construction?.id)?.progress ?? 0);
    const wear = (state.pens ?? []).find((p) => p.id === pen.id)?.wear;
    return {
      id: pen.id,
      species: pen.species,
      squares: 1 + (pen.extraSquares?.length ?? 0),
      places: pen.places,
      animals: pen.animals,
      herdPlaces: herdPlacesOf(summary, pen.species),
      extension: extensionProgress(state, summary, pen).extension ?? null,
      built: pen.built,
      progress,
      team: pen.team,
      training: pen.training,
      cows: winter && pen.built && pen.species === 'cattle' ? pen.animals : 0,
      oxen: (pen.oxen?.trained ?? 0) + (pen.oxen?.training ?? 0),
      condition: structureCondition(wear, 'pen', day),
      abandoned: isAbandoned(wear),
      repair: repairProgress(summary.constructions, 'pen', pen.id),
    };
  });
}
