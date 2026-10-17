import {
  BUILD_COSTS,
  STOCK_RESOURCES,
  affordability,
  ageYears,
  dateOfDayIndex,
  effectiveFertility,
  obstacleChangesAt,
  obstaclesOf,
  partStage,
  summarizeVillage,
  tileCenterWorld,
  villageStock,
  wholeLogs,
  type BuildKind,
  type ChronicleEvent,
  type ConstructionKind,
  type ConstructionSummary,
  type DwellingType,
  type Landscape,
  type ObstacleChanges,
  type PartStage,
  type PlacementVillage,
  type Position,
  type StockResource,
  type TileCell,
  type VillageRecord,
  type VillageState,
  villageCemeteries,
} from '@bohemia/game';
import { formatGameDate } from './game-date';
import { formatCells, formatHa, formatInteger } from './village-format';

// Pohled na ves pro panel a scénu (DTO server actions). Čistý modul – smí ho importovat
// i klient (typy, převod scény na data pro kontrolu umístění).

export type { BuildKind, PartStage, StockResource } from '@bohemia/game';

/**
 * Stavba v nabídce staveb: cena a jestli na ni ves má (bez surovin, dřeva nebo lidí k osídlení je
 * tlačítko zašedlé).
 */
export interface BuildOption {
  /** Člověkodny ze společné práce – u pole za hektar (`perHa`), u hřbitova za čtverec. */
  laborManDays: number;
  perHa: boolean;
  /** Cena za čtverec (pohřebiště). */
  perSquare: boolean;
  /**
   * Předem – suroviny (obilí, dřevo ve stromech) a lidé k osídlení: kolik stavba chce a kolik
   * chybí (0 = ves má).
   */
  upfront: { resource: StockResource; amount: number; missing: number }[];
  affordable: boolean;
}

export interface VillageView {
  name: string;
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    occupants: number;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
    /** Věk obyvatel v celých letech, od nejstaršího. */
    ages: number[];
    /** Stáří obydlí v celých letech. */
    ageYears: number;
  }[];
  storesKg: number;
  /** Klády na hromadě u vsi v kusech (forest.md). */
  woodLogs: number;
  storesMonths: number;
  satiation: number;
  commonLaborPerDay: number;
  /** Některá domácnost je plná a nečeká na ni žádné nové obydlí (upozornění). */
  fullHousehold: boolean;
  /** Nabídka staveb – hráč staví kdy chce, předem musí ves mít suroviny a lidi k osídlení. */
  build: Record<BuildKind, BuildOption>;
  constructions: {
    id: number;
    kind: ConstructionKind;
    label: string;
    progress: number;
    /** Typ stavěného obydlí (u přestavby nový typ), u pole null. */
    dwellingType: DwellingType | null;
    /** Přestavované obydlí (rebuild), jinak null. */
    dwellingId: number | null;
    /** Zakládané pole (field), jinak null. */
    fieldId: number | null;
    /** Zakládaný nebo rozšiřovaný hřbitov (cemetery), jinak null. */
    cemeteryId: number | null;
    /** Kolik stromů stavba ještě musí skácet (obydlí, přestavba – forest.md). */
    treesToFell: number;
  }[];
  /** Pole pro panel výběru: výměra, průměrná úrodnost a počet dílů podle stadia. */
  fields: {
    id: number;
    areaM2: number;
    fertility: number;
    stages: Partial<Record<PartStage, number>>;
  }[];
  /** Hřbitovy v pořadí pohřbívání – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
  cemeteries: VillageCemetery[];
  /** Ves hladoví – zásoby nevystačí do sklizně. */
  hungry: boolean;
  /** Stavby stojí – několik dní po sobě nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  scene: SceneVillage;
  /** Posledních CHRONICLE_LENGTH událostí, nejnovější první. */
  chronicle: { day: number; dateLabel: string; text: string }[];
}

/** Hřbitov pro panel výběru – čísla, žádné věty (rozhraní jako v 0 A.D.). */
export interface VillageCemetery {
  id: number;
  squares: number;
  /** Vytyčený a ohrazený – přijímá mrtvé. */
  built: boolean;
  /** Průběh stavby 0–1: založení, u hotového hřbitova rozšíření; bez stavby 1. */
  progress: number;
  /** Hroby hotových čtverců (rozšíření ve stavbě se nepočítá). */
  capacity: number;
  graves: number;
  freeGraves: number;
  /** Odhad, za kolik let se zaplní (podle úmrtí posledních let); bez úmrtí null. */
  yearsLeft: number | null;
}

export interface SceneVillage {
  /** Hotová obydlí (`built: true`, id obydlí) i rozestavěná (`built: false`, id stavby). */
  dwellings: {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    progress: number;
    /** Bydlí v něm někdo – jen z obydlí s obyvateli stoupá dým. Bez údaje = obývané. */
    inhabited?: boolean;
  }[];
  /**
   * Pole po čtvercích – díl = políčko krajiny `cell`, jeho střed (x, z) ve světě, strana
   * políčka `size` v m a stadium.
   */
  fields: {
    id: number;
    parts: { cell: TileCell; x: number; z: number; size: number; stage: PartStage }[];
  }[];
  /**
   * Hřbitovy po čtvercích (střed políčka ve světě a strana jako u pole) – průběh stavby
   * (založení, u hotového rozšíření; `built` hotový), počet obsazených hrobů a čtverce
   * rozšíření ve stavbě (`pending`). Bez údaje žádné.
   */
  cemeteries?: {
    id: number;
    squares: { cell: TileCell; x: number; z: number; size: number; pending?: boolean }[];
    built: boolean;
    progress: number;
    graves: number;
  }[];
  /**
   * Stromy, keře a kameny vrstvy překážek, které ves odstranila (pole, obydlí, hřbitovy) nebo
   * pokácela (pařez, později nálet) – id z vrstvy. Bez údaje žádné.
   */
  obstacles?: ObstacleChanges;
  /** Klády na hromadě v kusech – scéna je složí u obydlí nejblíž lesu. Bez údaje žádné. */
  woodLogs?: number;
}

export const CHRONICLE_LENGTH = 8;

/** Názvy obydlí v 1. a 4. pádě. */
export const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
};

function deathText(group: 'child' | 'adult' | 'elder'): string {
  if (group === 'child') return 'Zemřelo dítě.';
  if (group === 'adult') return 'Zemřel jeden z dospělých.';
  return 'Zemřel jeden ze starších.';
}

function finishedText(kind: ConstructionKind): string {
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  if (kind === 'cemetery') return 'Hřbitov je ohrazený – dá se do něj pohřbívat.';
  return 'Pole je založené – dá se osévat.';
}

/** Text události kroniky česky. */
export function chronicleText(event: ChronicleEvent, villageName: string): string {
  switch (event.kind) {
    case 'village-founded':
      return `Osadníci založili ves ${villageName}.`;
    case 'birth':
      return 'Narodilo se dítě.';
    case 'death':
      return deathText(event.group);
    case 'household-founded':
      return 'Dva mladí dospělí založili v novém obydlí vlastní domácnost.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k sousedům.';
    case 'construction-finished':
      return finishedText(event.constructionKind);
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'harvest':
      return `Sklizeň: ${formatInteger(event.kg)} kg obilí.`;
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'part-became-forest':
      return 'Opuštěný díl pole zarostl v les.';
    case 'cemetery-full':
      if (event.othersFree) return 'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.';
      // staví se jiný hřbitov nebo rozšíření – bude kam pohřbívat
      if (event.othersBuilding) return 'Hřbitov se zaplnil.';
      return 'Hřbitov se zaplnil – mrtvé není kam pohřbívat.';
  }
}

function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)}`;
  if (c.kind === 'cemetery') return `Hřbitov (${formatCells(c.squares ?? 0)})`;
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  constructions: ConstructionSummary[],
): SceneVillage {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const built = state.dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: true,
    progress: 1,
    inhabited: occupied.has(d.id),
  }));
  // staveniště ukazuje samotnou stavbu – dřevo se kácí v lese, než se začne stavět
  const sites = state.constructions.flatMap((c) => {
    if (c.kind !== 'dwelling' || c.dwellingType === null || c.position === null) return [];
    const progress = constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    return [{ id: c.id, type: c.dwellingType, position: c.position, built: false, progress }];
  });
  const fields = state.fields.map((f) => ({
    id: f.id,
    parts: state.parts.flatMap((p) =>
      p.fieldId === f.id && p.cell !== undefined
        ? [scenePart(landscape, p.cell, partStage(p, day))]
        : [],
    ),
  }));
  const cemeteries = villageCemeteries(state).map((c) => ({
    id: c.id,
    squares: c.squares.map((s) => ({
      cell: { x: s.cell.x, y: s.cell.y },
      x: s.x,
      z: s.z,
      size: c.squareSizeM,
      ...(s.constructionId === undefined ? {} : { pending: true }),
    })),
    built: c.builtDay !== null,
    progress: cemeteryProgress(c.id, c.builtDay !== null, constructions),
    graves: c.graves,
  }));
  return {
    dwellings: [...built, ...sites],
    fields,
    cemeteries,
    obstacles: obstacleChangesAt(state, day),
    woodLogs: wholeLogs(state.woodLogs ?? 0),
  };
}

/**
 * Průběh stavby hřbitova 0–1 – založení, u hotového hřbitova rozšíření (stavby jdou v pořadí
 * zahájení, první je založení); bez stavby hotový 1, nehotový 0.
 */
function cemeteryProgress(
  id: number,
  built: boolean,
  constructions: readonly ConstructionSummary[],
): number {
  const active = constructions.filter((s) => s.kind === 'cemetery' && s.cemeteryId === id);
  if (active.length === 0) return built ? 1 : 0;
  return built ? Math.min(...active.map((s) => s.progress)) : active[0]!.progress;
}

function scenePart(
  landscape: Landscape,
  cell: TileCell,
  stage: PartStage,
): SceneVillage['fields'][number]['parts'][number] {
  const center = tileCenterWorld(landscape, cell.x, cell.y);
  return {
    cell: { x: cell.x, y: cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    stage,
  };
}

function chronicle(state: VillageState, name: string): VillageView['chronicle'] {
  return state.chronicle
    .slice(-CHRONICLE_LENGTH)
    .reverse()
    .map((event) => ({
      day: event.day,
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name),
    }));
}

const BUILD_KINDS: readonly BuildKind[] = ['zemnice', 'polozemnice', 'field', 'cemetery'];
const DAYS_PER_YEAR = 365.25;

/**
 * Nabídka staveb: cena z pravidel a co z ceny předem (suroviny, dřevo, lidé k osídlení) ves nemá.
 * Dřevo = klády + dospělé stromy krajiny sídla, které jde skácet (vrstva překážek).
 */
function buildOptions(state: VillageState, landscape: Landscape): Record<BuildKind, BuildOption> {
  const stock = villageStock(state, obstaclesOf(landscape));
  const entries = BUILD_KINDS.map((kind): [BuildKind, BuildOption] => {
    const cost = BUILD_COSTS[kind];
    const { affordable, missing } = affordability(stock, cost.upfront);
    const upfront = STOCK_RESOURCES.flatMap((resource) => {
      const amount = cost.upfront[resource] ?? 0;
      return amount > 0 ? [{ resource, amount, missing: missing[resource] ?? 0 }] : [];
    });
    const option: BuildOption = {
      laborManDays: cost.laborManDays,
      perHa: cost.perHa,
      perSquare: cost.perSquare ?? false,
      upfront,
      affordable,
    };
    return [kind, option];
  });
  return Object.fromEntries(entries) as Record<BuildKind, BuildOption>;
}

/** Pole pro panel výběru – výměra, úrodnost vážená plochou a díly podle stadia. */
function fieldViews(state: VillageState, day: number): VillageView['fields'] {
  return state.fields.map((f) => {
    const parts = state.parts.filter((p) => p.fieldId === f.id);
    const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
    const fertility =
      areaM2 > 0
        ? parts.reduce((sum, p) => sum + effectiveFertility(p, day) * p.areaM2, 0) / areaM2
        : 0;
    const stages: Partial<Record<PartStage, number>> = {};
    for (const p of parts) {
      const stage = partStage(p, day);
      stages[stage] = (stages[stage] ?? 0) + 1;
    }
    return { id: f.id, areaM2, fertility, stages };
  });
}

/** Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). */
export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
): VillageView {
  const { state, name } = record;
  const summary = summarizeVillage(state, day);
  return {
    name,
    dayIndex: day,
    people: summary.people,
    households: summary.households.map((h) => {
      const dwelling = state.dwellings.find((d) => d.id === h.dwellingId);
      return {
        ...h,
        ages: state.people
          .filter((p) => p.dwellingId === h.dwellingId)
          .map((p) => ageYears(p.bornDay, day))
          .sort((a, b) => b - a),
        ageYears: dwelling ? Math.max(0, Math.floor((day - dwelling.builtDay) / DAYS_PER_YEAR)) : 0,
      };
    }),
    storesKg: summary.storesKg,
    woodLogs: wholeLogs(summary.woodLogs),
    storesMonths: summary.storesMonths,
    satiation: summary.satiation,
    commonLaborPerDay: summary.commonLaborPerDay,
    fullHousehold: summary.fullHousehold,
    build: buildOptions(state, landscape),
    constructions: summary.constructions.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: constructionLabel(c),
      progress: c.progress,
      dwellingType: c.dwellingType,
      dwellingId: c.kind === 'rebuild' ? c.dwellingId : null,
      fieldId: c.kind === 'field' ? c.fieldId : null,
      cemeteryId: c.cemeteryId,
      treesToFell: c.treesToFell,
    })),
    fields: fieldViews(state, day),
    hungry: summary.hungry,
    constructionsStalled: summary.constructionsStalled,
    cemeteries: summary.cemeteries.map((c) => {
      const progress = cemeteryProgress(c.id, c.built, summary.constructions);
      return { ...c, progress };
    }),
    scene: sceneVillage(state, landscape, day, summary.constructions),
    chronicle: chronicle(state, name),
  };
}

/**
 * Data pro kontrolu umístění v prohlížeči (`checkDwellingPlacement`, `fieldPartsFromCells`,
 * `cemeteryPartsFromCells`) ze scény vsi – hotová i rozestavěná obydlí jako obydlí, pole podle
 * čtverců dílů, pohřebiště podle svých čtverců.
 */
export function placementVillageFromScene(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({ type: d.type, position: d.position })),
    constructions: [],
    parts: scene.fields.flatMap((f) => f.parts.map((p) => ({ cell: p.cell }))),
    cemeteries: (scene.cemeteries ?? []).map((c) => ({
      squares: c.squares.map((s) => ({ cell: s.cell })),
    })),
    ...(scene.obstacles ? { obstacleChanges: scene.obstacles } : {}),
  };
}
