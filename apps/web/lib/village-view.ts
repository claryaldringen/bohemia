import {
  ALL_RIGHTS,
  rodBaptized,
  CEMETERY_AT_CHURCH_ONLY,
  PEN_BY_SPECIES,
  HORSE_PEN_NO_SURPLUS,
  horsePenPayment,
  type TradeGood,
  type BuildCost,
  type StockResource,
  fieldCapacity,
  housingPlaces,
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
  type ObstacleLayer,
  cartWorldOf,
  isAbandoned,
  structureCondition,
  summarizeVillage,
  villageStock,
  wholeLogs,
  HAY_WINTER_MONTHS,
  foundingCostPerHa,
  manorArea,
  type BuildKind,
  type CraftCoverage,
  type Direction8,
  type Landscape,
  type PendingDeparture,
  type VillageRecord,
  type VillageState,
  type VillageSummary,
  hasShrine,
  hasOutcrop,
  QUARRY_NO_ROCKS,
  villageCemeteries,
  villageLifespan,
  villageOrchards,
  abandonedVillageAt,
  type PenSpecies,
  type HerdPlaces,
  penHerdSpecies,
  isStewardOn,
  relocationBlock,
  raidHiding,
  dwellingYearReason,
  CRAFTS,
  workshopBuildCost,
  type Craft,
} from '@bohemia/game';
import { churchBuildChoices, churchesOf } from './church-view';
import { formatGameDate } from './game-date';

import {
  DAYS_PER_YEAR,
  BuildOption,
  VillagePen,
  VillagePurchase,
  VillageView,
  VillageRightsView,
  boughtProducts,
} from './village-view-types';
import { SceneVillage } from './village-view-scene-types';
import { structureUseOf } from './village-view-structure-use';
import { cartEarthworksOf, cartFieldsOf } from './cart-routes';
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
import { fortificationViews, fortStoneSupply, fortWoodSupply } from './fort-view';
import { fieldViews, orchardSquareView, sowingSeedView } from './village-view-fields';
import { manorView } from './manor-view';
import { wildlifeView, type VillageWildlife } from './wildlife-view';
import { disasterChronicleFields, weatherView, type WeatherView } from './disasters-view';
import { personPortrait, scenePersons, type DwellingResident } from './person-view';
import { ROLE_NAMES } from './person-roles';
import { dynastyView, expeditionsAway } from './dynasty-view';
import { horsesView, type VillageHorses } from './horse-view';

import { dugSitesField } from './ore-site-view';

import { kilnsField } from './kiln-view';

import { grainPitsField } from './grain-pit-view';
import { junctionsField } from './junction-view';

import { sceneTrailContinuations, sceneTrailEdgePieces, sceneTrails } from './trail-view';

import { sceneExpeditions } from './caravan-view';

import type { VillageListItem } from './village-list';
import type { LineEndView } from './line-end-view';

import {
  journeyView,
  leaveOptions,
  pendingDepartureView,
  villageAbandonment,
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
      ...(event.kind === 'horse-retired'
        ? { horses: event.horses, retired: event.reason }
        : event.kind === 'horse-starved'
          ? { horses: event.horses }
          : event.kind === 'foal-born'
            ? { horses: event.foals }
            : {}),
      ...(event.kind === 'crafts-bought'
        ? {
            direction: event.direction,
            products: boughtProducts(event.get),
            ...(event.cart ? { cart: event.cart } : {}),
          }
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
      // kdo koně okul (horses.md – Kování) – kronika; upozornění se nedává (Martin 27. 10. 2026)
      ...(event.kind === 'horses-shod' ? { horses: event.horses, own: event.own } : {}),
      // pohromy – stupeň vody, síla smrště, díly a domy pro upozornění (disasters.md)
      ...disasterChronicleFields(event),
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name, state.seed),
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

/** Je druh stavby řemeslná dílna? */
function isCraft(kind: BuildKind): kind is Craft {
  return (CRAFTS as readonly string[]).includes(kind);
}

/**
 * Nadzemní varianty řemeslné dílny (workshops.md): vypletená a roubená – cena domu toho typu
 * s přístřeškem (`workshopBuildCost`), dostupnost podle surovin předem a roku varianty
 * (`dwellingYearReason` – „Od roku 750“ / „Od roku 800“ u kurzoru). Klíč = typ obydlí.
 */
function workshopVariants(
  craft: Craft,
  stock: Record<StockResource, number>,
  day: number,
): NonNullable<BuildOption['variants']> {
  const variants: NonNullable<BuildOption['variants']> = {};
  for (const type of ['vypleteny', 'srub'] as const) {
    const cost = workshopBuildCost(craft, type);
    const { affordable, missing } = affordability(stock, cost.upfront);
    const blocked = dwellingYearReason(type, day);
    variants[type] = {
      laborManDays: cost.laborManDays,
      upfront: STOCK_RESOURCES.flatMap((resource) => {
        const amount = cost.upfront[resource] ?? 0;
        return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
      }),
      affordable: affordable && blocked === null,
      blocked,
    };
  }
  return variants;
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
  return extending ? (own.extendAffordable ?? own.affordable) : own.affordable;
}

/** Druhy obydlí rozcestníku od nejlepšího – ikonu tlačítka dává první, který ves postaví. */
const DWELLING_BEST_FIRST = ['srub', 'vypleteny', 'polozemnice', 'zemnice'] as const;

/**
 * Nabídka rozcestníku obydlí (zemnice, polozemnice, vypletený a nadzemní dům): cena a dostupnost každého druhu
 * je v `variants` (zašedlý druh nese důvod v `blocked`), tlačítko samo cenu nemá a je dostupné,
 * pokud ves postaví aspoň jeden druh. Ikona tlačítka je obydlí, které hráč nejspíš postaví –
 * nejlepší druh, na který ves má (nadzemní dům, vypletený dům, polozemnice, zemnice), jinak zemnice.
 */
export function dwellingHubOption(build: Partial<Record<string, BuildOption | null>>): BuildOption {
  const variants: NonNullable<BuildOption['variants']> = {};
  for (const type of DWELLING_BEST_FIRST) {
    const own = build[type];
    if (!own) continue;
    variants[type] = {
      laborManDays: own.laborManDays,
      upfront: own.upfront,
      affordable: own.affordable,
      blocked: own.blocked,
      payment: [],
      extendAffordable: own.affordable,
    };
  }
  const best = DWELLING_BEST_FIRST.find((type) => variants[type]?.affordable) ?? 'zemnice';
  return {
    laborManDays: 0,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked: null,
    affordable: Object.values(variants).some((v) => v.affordable),
    look: { icon: best, name: 'Obydlí' },
    variants,
  };
}

/** Druhy posvátných míst od nejlepšího – ikonu tlačítka dává první, který ves postaví. */
const SACRED_BEST_FIRST = ['church-large', 'church-small', 'shrine', 'idol'] as const;
/** Ikony modly a svatyně (kostel nese ikonu v `look` své nabídky). */
const SACRED_ICONS: Record<string, string> = { idol: 'modla', shrine: 'svatyne' };

/**
 * Nabídka rozcestníku posvátných míst (modla, svatyně, po křtu malý a velký kostel): dostupné je,
 * pokud ves začne aspoň jeden druh; cena a důvod zašednutí zůstávají u nabídky každého druhu.
 * Nezačne-li ves žádný, zašedlé tlačítko nese důvod nejlepšího nabízeného druhu – rozcestník
 * otevřít nejde, takže by důvod u druhů hráč jinak neviděl (po křtu „Bez stavbyvedoucího huti…“).
 * Ikona tlačítka je nejlepší dostupný druh (kostel, svatyně, modla), jinak nejlepší nabízený.
 */
export function sacredHubOption(build: Partial<Record<string, BuildOption | null>>): BuildOption {
  const offered = SACRED_BEST_FIRST.filter((kind) => build[kind]);
  const best = offered.find((kind) => build[kind]?.affordable) ?? offered[0] ?? 'shrine';
  const affordable = offered.some((kind) => build[kind]?.affordable);
  return {
    laborManDays: 0,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked: affordable
      ? null
      : (offered.map((kind) => build[kind]?.blocked ?? null).find((r) => r !== null) ?? null),
    affordable,
    look: {
      icon: build[best]?.look?.icon ?? SACRED_ICONS[best] ?? 'svatyne',
      name: 'Posvátná místa',
    },
  };
}

/**
 * Rozcestník obydlí při zakládání vsi: nabízí se jen zemnice (první zemnici osídlí zakladatelé),
 * tlačítko je proto rovnou zemnice a jeden klik spustí umisťování.
 */
export const FOUNDING_DWELLING_OPTION: BuildOption = {
  ...dwellingHubOption({}),
  affordable: true,
  look: { icon: 'zemnice', name: 'Zemnice' },
};

/**
 * Nabídka staveb: cena z pravidel a co z ceny předem (suroviny, dřevo, lidé k osídlení) ves nemá.
 * Dřevo = klády + dospělé stromy krajiny sídla, které jde skácet (vrstva překážek).
 */
function buildOptions(
  state: VillageState,
  landscape: Landscape,
  coverage: CraftCoverage,
  day: number,
): Record<BuildKind, BuildOption> {
  const obstacles = obstaclesOf(landscape);
  const stock = villageStock(state, obstacles);
  // lom jen u skal – mapa bez skalního výchozu ho nemá (fortifications.md – Lom jako plocha u skal)
  const noRocks = !hasOutcrop(obstacles);
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
    // vypletený dům do roku 750 a nadzemní dům do roku 800 zašedlý (log-house.md – Dům, Dům
    // s vypletenými stěnami: „Od roku 800“, „Od roku 750“)
    const blocked =
      kind === 'shrine' && hasShrine(state)
        ? SHRINE_LIMIT
        : kind === 'quarry' && noRocks
          ? QUARRY_NO_ROCKS
          : kind === 'srub' || kind === 'vypleteny'
            ? dwellingYearReason(kind, day)
            : null;
    const option: BuildOption = {
      laborManDays: cost.laborManDays,
      perHa: cost.perHa,
      perSquare: cost.perSquare ?? false,
      upfront,
      blocked,
      affordable: affordable && blocked === null,
    };
    // po křtu rodu křesťanský hřbitov jen u kostela (cemetery.md – Po křtu rodu)
    if (kind === 'cemetery' && rodBaptized(state)) {
      option.look = { icon: 'hrbitov-kriz', name: 'Hřbitov' };
      if (!(state.churches ?? []).length && !state.constructions.some((c) => c.church)) {
        option.blocked = CEMETERY_AT_CHURCH_ONLY;
        option.affordable = false;
      }
    }
    if (kind === 'pen') option.variants = { horse: horsePenOption(state, base, stock, coverage) };
    if (isCraft(kind)) option.variants = workshopVariants(kind, stock, day);
    return [kind, option];
  });
  return Object.fromEntries(entries) as Record<BuildKind, BuildOption>;
}

/** Co pohled na jednu ves sám neví – zjistí ho vstupní bod přes `dynastyStatus`. */
export interface VillageViewContext {
  /** Lov vsi už běží ve výpravě (`huntRunning`) – tlačítko lovu zašedne s `already`. */
  huntRunning?: boolean;
  /** Hráči vymřely všechny vsi (ne jen tahle), nebo vymřel rod. */
  gameOver?: boolean;
  /** Rod vymřel po meči – kronika rodu (`lineEndView` přes všechny vsi hráče). */
  lineEnded?: LineEndView | null;
  /** Všechny vsi hráče pro přepínač; bez nich jen tahle ves. */
  villages?: VillageListItem[];
  /** Vlastní vsi na sousedních mapách po směrech – tam se neodchází. */
  ownMaps?: Partial<Record<Direction8, string>>;
  /** Proč z téhle mapy na novou mapu odejít nejde (mapa bez polohy v mřížce), nebo null. */
  mapsBlocked?: string | null;
  /** Práva hráče v téhle vsi (`villageAccess`); bez nich všechna (vlastní ves, dev náhled). */
  rights?: VillageRightsView;
  /** Čekající odchod mladšího syna po pohřbu (`House.pendingDeparture`) – ukáže se v jeho vsi. */
  pendingDeparture?: PendingDeparture | null;
  /** Vojvoda vsi se smí nechat pokřtít (`VillageAccess.baptizable` – christianity.md). */
  baptizable?: boolean;
  /**
   * Osy pokračování zemských stezek sousedních vsí na mapě vsi (`mapTrailContinuations` – trade.md,
   * Pokračování na sousední mapě); ve scéně jako `SceneVillage.trailContinuations`.
   */
  trailContinuations?: readonly (readonly { x: number; z: number }[])[];
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
      soil: capacity.soil,
    }
  );
}

/** Opevnění pro panel, dřevo a kámen vsi pro cenu u kurzoru (fortifications.md – Rozhraní). */
function fortificationsOf(
  state: VillageState,
  landscape: Landscape,
  day: number,
  obstacles: ObstacleLayer,
): Pick<VillageView, 'fortifications' | 'woodSupply' | 'stoneSupply' | 'fortContested'> {
  const woodSupply = fortWoodSupply(state, obstacles);
  const fortifications = fortificationViews(state, landscape, day, woodSupply, obstacles);
  return {
    woodSupply,
    stoneSupply: fortStoneSupply(state),
    ...(fortifications.length > 0 ? { fortifications } : {}),
    // cizí vojsko dnes na mapě vsi – úsek jinudy počká (demolition.md – Rozhodnutí)
    ...(fortifications.length > 0 && raidHiding(state, day)
      ? { fortContested: true as const }
      : {}),
  };
}

export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
  context: VillageViewContext = {},
): VillageView {
  const { name } = record;
  // opuštěná ves jen jako pohled (migration.md)
  const state = abandonedVillageAt(record.state, day);
  const obstacles = obstaclesOf(landscape);
  const summary = summarizeVillage(state, day, obstacles, landscape);
  const gameOver = context.gameOver ?? false;
  const leave = leaveOptions(state, landscape, context.ownMaps ?? {}, context.mapsBlocked ?? null);
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
        relocationBlock: relocationBlock(state, h.dwellingId),
        ...structureUseOf(state, summary, { structure: 'dwelling', id: h.dwellingId }, day),
        ...(dwelling?.garden ? { garden: { legumeKg: dwelling.garden.legumeKg } } : {}),
      };
    }),
    storesKg: summary.storesKg,
    ...sowingSeedView(state),
    applesKg: summary.applesKg,
    wares: summary.wares,
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
    crafts: craftsView(state, summary),
    storesMonths: summary.storesMonths,
    ...(summary.foodLastsDays !== null ? { foodLastsDays: summary.foodLastsDays } : {}),
    satiation: summary.satiation,
    fieldCapacity: fieldCapacityView(state, day, summary.crafts.coverage.pottery),
    housingPlaces: housingPlaces(state),
    commonLaborPerDay: summary.commonLaborPerDay,
    lord: state.labor?.lord ?? null,
    dynasty: dynastyView(state, day),
    ...(expeditionsAway(state, day) ? { expeditionsAway: true as const } : {}),
    steward: { on: isStewardOn(state), built: [...(state.steward?.built ?? [])] },
    fullHousehold: summary.fullHousehold,
    build: buildOptions(state, landscape, summary.crafts.coverage, day),
    churchBuild: churchBuildChoices(state),
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
    fields: fieldViews(state, day, summary.crafts.coverage, landscape),
    hungry: summary.hungry,
    starving: summary.starving,
    hunger: summary.hunger,
    ...(state.seedRation === true ? { seedRationing: true } : {}),
    constructionsStalled: summary.constructionsStalled,
    happiness: {
      value: summary.happiness.value,
      target: summary.happiness.target,
      laborFactor: summary.happiness.laborFactor,
      // víra (christianity.md – Štěstí): jen když je co ukázat
      ...(summary.happiness.christianShare > 0
        ? { christianShare: summary.happiness.christianShare }
        : {}),
      ...(summary.happiness.desecration > 0 ? { desecration: summary.happiness.desecration } : {}),
    },
    sacred: sacredView(state, summary, obstacles, day),
    extinct: villageLifespan(state),
    abandoned: villageAbandonment(state),
    journey: journeyView(state, day),
    leave,
    pendingDeparture:
      context.pendingDeparture && context.pendingDeparture.villageId === record.id
        ? pendingDepartureView(state, context.pendingDeparture, day, leave)
        : null,
    rights: context.rights ?? { allowed: [...ALL_RIGHTS], reason: null },
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
        // zbourat (zaorat) smí jen pokřtěný rod – pohanovi se tlačítko neukáže (christianity.md)
        ...(rodBaptized(state)
          ? structureUseOf(state, summary, { structure: 'cemetery', id: c.id }, day)
          : {}),
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
        ...structureUseOf(state, summary, { structure: 'orchard', id: o.id }, day),
      };
    }),
    pens: penViews(state, day, summary),
    ...penShortOf(state),
    ...oxenViewOf(summary),
    ...horsesViewOf(state, day),
    ...threshingOf(state, day),
    ...threshingFloorsOf(state, summary.constructions, day),
    ...churchesOf(state),
    roads: roadViews(state, landscape, day, summary, context.ownMaps ?? {}),
    ...fortificationsOf(state, landscape, day, obstacles),
    scene: {
      ...sceneWithCartWorld(
        sceneVillage(state, landscape, day, summary, context.baptizable === true),
        state,
        landscape,
        day,
      ),
      trails: sceneTrails(state),
      ...((context.trailContinuations ?? []).length > 0
        ? { trailContinuations: sceneTrailContinuations(context.trailContinuations ?? []) }
        : {}),
      ...trailEdgePiecesField(state, day),
      ...manorAreaField(state, landscape),
      expeditions: sceneExpeditions(state),
    },
    chronicle: chronicle(state, name),
    purchases: purchaseViews(state),
    lastMarriageDay: lastMarriageDay(state),
    manor: manorView(state, day, context.huntRunning ?? false),
    ...wildlifeField(state, day),
    ...weatherField(state, day),
    ...dugSitesField(state, day),
    ...kilnsField(state, day),
    ...grainPitsField(state, day, summary),
    ...junctionsField(state, day, landscape),
  };
}

/** Dvorec pro kurzor „Domů“ (`manorArea`); ves bez hotového dvorce – bez pole. */
function manorAreaField(
  state: VillageState,
  landscape: Landscape,
): Pick<SceneVillage, 'manorArea'> {
  const area = manorArea(state, landscape);
  return area ? { manorArea: area } : {};
}

/** Kusy hotových stezek ke kraji pro mřížku kurzoru (`sceneTrailEdgePieces`); žádné – bez pole. */
function trailEdgePiecesField(
  state: VillageState,
  day: number,
): Pick<SceneVillage, 'trailEdgePieces'> {
  const pieces = sceneTrailEdgePieces(state, day);
  return pieces.length > 0 ? { trailEdgePieces: pieces } : {};
}

/**
 * Scéna se vstupem vozových tras (`cartWorldOf`) – jen když dnes jede vůz nebo spřežení; trasy
 * z něj spočítá prohlížeč (cart-routes.ts).
 */
function sceneWithCartWorld(
  scene: SceneVillage,
  state: VillageState,
  landscape: Landscape,
  day: number,
): SceneVillage {
  const drives =
    (scene.carts ?? []).some((c) => c.goal !== undefined) ||
    scene.ploughLegs?.outGoals !== undefined ||
    scene.ploughLegs?.homeGoals !== undefined;
  if (!drives) return scene;
  const world = cartWorldOf(state, day, landscape, obstaclesOf(landscape));
  // změny překážek pro vůz bývají tytéž jako ve scéně – pak se neposílají dvakrát
  const same =
    world.changes !== null &&
    scene.obstacles !== undefined &&
    JSON.stringify(world.changes) === JSON.stringify(scene.obstacles);
  // díly polí pro vůz jsou výběrem z dílů scény – pak se neposílají (prohlížeč je sestaví)
  const fieldsAsScene =
    JSON.stringify(cartFieldsOf(scene)) === JSON.stringify(world.village.fields);
  // valy vozových cest jsou tytéž jako zemní práce scény (bez jejich údajů pro vzhled)
  const earthworksAsScene =
    world.village.earthworks !== undefined &&
    JSON.stringify(cartEarthworksOf(scene)) === JSON.stringify(world.village.earthworks);
  return {
    ...scene,
    cartWorld: {
      ...world,
      ...(fieldsAsScene || earthworksAsScene
        ? {
            village: {
              ...world.village,
              ...(fieldsAsScene ? { fields: [] } : {}),
              ...(earthworksAsScene ? { earthworks: [] } : {}),
            },
            ...(fieldsAsScene ? { fieldsAsScene: true as const } : {}),
            ...(earthworksAsScene ? { earthworksAsScene: true as const } : {}),
          }
        : {}),
      ...(same ? { changes: 'obstacles' as const } : {}),
    },
  };
}

/** Počasí roku pro lištu (`VillageView.weather` – disasters.md); obyčejný rok bez údaje. */
function weatherField(state: VillageState, day: number): { weather?: WeatherView } {
  const weather = weatherView(state, day);
  return weather ? { weather } : {};
}

/** Divoká zvěř vsi (`VillageView.wildlife`); ves bez zvěře bez údaje. */
function wildlifeField(state: VillageState, day: number): { wildlife?: VillageWildlife } {
  const wildlife = wildlifeView(state, day);
  return wildlife ? { wildlife } : {};
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
      ...structureUseOf(state, summary, { structure: 'pen', id: pen.id }, day),
    };
  });
}
