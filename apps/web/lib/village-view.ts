import {
  BUILD_COSTS,
  ORCHARD_WINDOWS,
  STOCK_RESOURCES,
  affordability,
  ageYears,
  dateOfDayIndex,
  effectiveFertility,
  monthInWindow,
  obstacleChangesAt,
  ORCHARD_PLANTING_WINDOWS,
  laborReport,
  obstaclesOf,
  partStage,
  reservedTrees,
  squareBearing,
  summarizeVillage,
  tileCenterWorld,
  villageStock,
  wholeLogs,
  type BuildKind,
  type ChronicleEvent,
  type ConstructionKind,
  type ConstructionSummary,
  type DwellingType,
  type FieldSurface,
  type LaborShare,
  type Landscape,
  type ObstacleChanges,
  type OrchardSquare,
  type OrchardWork,
  type PartStage,
  type PlacementVillage,
  type Position,
  type StockResource,
  type TileCell,
  type VillageLifespan,
  type VillageRecord,
  type VillageState,
  type VillageSummary,
  villageCemeteries,
  villageLifespan,
  villageOrchards,
} from '@bohemia/game';
import { formatGameDate } from './game-date';
import { fruitVisible, treeGrowth } from './orchard-look';
import { formatCells, formatHa, formatInteger } from './village-format';

// Pohled na ves pro panel a scénu (DTO server actions). Čistý modul – smí ho importovat
// i klient (typy, převod scény na data pro kontrolu umístění).

export type {
  BuildKind,
  FieldSurface,
  LaborActivity,
  LaborShare,
  LaborTarget,
  PartStage,
  StockResource,
} from '@bohemia/game';

/**
 * Stavba v nabídce staveb: cena a jestli na ni ves má (bez surovin, dřeva nebo lidí k osídlení je
 * tlačítko zašedlé).
 */
export interface BuildOption {
  /** Člověkodny ze společné práce – u pole a sadu za hektar (`perHa`), u hřbitova za čtverec. */
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
  /** Zásoby jablek (kg) – horní lišta je ukáže vedle obilí, jen když nějaká jsou. */
  applesKg: number;
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
    /** Vysazovaný sad (orchard), jinak null. */
    orchardId: number | null;
    /** Kolik stromů stavba ještě musí skácet (obydlí, přestavba – forest.md). */
    treesToFell: number;
  }[];
  /**
   * Pole pro panel výběru: výměra, průměrná úrodnost, počet dílů podle stadia a podle povrchu,
   * na kterém se díly zakládaly (louka, křoviny, les), a kolik dílů má popel z vymýceného lesa.
   */
  fields: {
    id: number;
    areaM2: number;
    fertility: number;
    stages: Partial<Record<PartStage, number>>;
    surfaces: Partial<Record<FieldSurface, number>>;
    /** Díly s bonusem úrodnosti po vymýcení lesa (fields.md – Úroda). */
    ashParts: number;
  }[];
  /** Hřbitovy v pořadí pohřbívání – kolik místa zbývá (hygienu hráč nevidí – cemetery.md). */
  cemeteries: VillageCemetery[];
  /** Jabloňové sady pro panel výběru – plocha, stáří, odhad úrody (orchard.md). */
  orchards: VillageOrchard[];
  /** Ves hladoví – zásoby nevystačí do sklizně. */
  hungry: boolean;
  /** Lidé umírají hlady – nahromaděný hlad přesáhl práh (population.md – Hlad a vymření). */
  starving: boolean;
  /** Stavby stojí – několik dní po sobě nezbyla žádná společná práce. */
  constructionsStalled: boolean;
  /** Ves vymřela – herní rok založení a vymření a kolik let žila; žijící ves null. */
  extinct: VillageLifespan | null;
  /**
   * Konec hry – hráči vymřely všechny vsi (ne jen tahle). Rozhraní ukáže obrazovku porážky
   * s tlačítkem Začít znovu.
   */
  gameOver: boolean;
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

/** Sad pro panel výběru – čísla, žádné věty. */
export interface VillageOrchard {
  id: number;
  areaM2: number;
  squares: number;
  /** Stáří v celých letech od výsadby; dokud se nic nevysadilo, null. */
  ageYears: number | null;
  /** Úroda nejbližší sklizně při plné sklizni (kg jablek). */
  expectedYieldKg: number;
  /** Průběh výsadby 0–1; vysazený sad null. */
  planting: number | null;
  /** Výsadba čeká na okno – sází se jen na jaře a na podzim (orchard.md). */
  plantingWaits: boolean;
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
    parts: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      stage: PartStage;
      /**
       * Vzhled oseté části podle růstu obilí (`CropLook` ve scéně) – zatím ho posílá jen
       * vývojový náhled staveb, server ne (oseté pole se kreslí jako vzcházející obilí).
       */
      crop?: 'growing' | 'ripe' | 'stubble';
    }[];
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
   * Jabloňové sady po čtvercích (střed políčka ve světě a strana jako u pole): průběh výsadby
   * čtverce 0–1, velikost stromů 0–1 (mladé stromky rostou – orchard-look.ts) a jestli na
   * stromech visí jablka (pozdní léto a podzim, než se sklidí). Bez údaje žádné.
   */
  orchards?: {
    id: number;
    squares: {
      cell: TileCell;
      x: number;
      z: number;
      size: number;
      planting: number;
      growth: number;
      fruit: boolean;
    }[];
  }[];
  /**
   * Stromy, keře a kameny vrstvy překážek, které ves odstranila (pole, obydlí, hřbitovy, sady) nebo
   * pokácela (pařez, později nálet) – id z vrstvy. Bez údaje žádné.
   */
  obstacles?: ObstacleChanges;
  /**
   * Stromy vyhrazené rozestavěnými stavbami (forest.md) – kontrola umístění v prohlížeči podle
   * nich počítá klády z mýcení stejně jako server. Bez údaje žádné.
   */
  reservedTrees?: number[];
  /** Klády na hromadě v kusech – scéna je složí u obydlí nejblíž lesu. Bez údaje žádné. */
  woodLogs?: number;
  /**
   * Kde ves dnes pracuje – postavy ve scéně (docs/design/villagers.md). Bez údaje (ves uložená
   * před rozdělením práce, ještě nedopočítaný den) nikdo.
   */
  labor?: SceneLabor;
}

/**
 * Rozdělení práce posledního dne pro postavy: člověkodny po činnostech a místech (na setiny),
 * lidé podle věku (pasáčci, starší u obydlí) a herní den s měsícem (v zimě je venku méně lidí).
 */
export interface SceneLabor {
  day: number;
  month: number;
  people: { children: number; adults: number; elders: number };
  shares: LaborShare[];
}

export const CHRONICLE_LENGTH = 8;

/** Názvy obydlí v 1. a 4. pádě. */
export const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
};

function deathText(group: 'child' | 'adult' | 'elder', hunger: boolean): string {
  if (group === 'child') return hunger ? 'Dítě zemřelo hlady.' : 'Zemřelo dítě.';
  if (group === 'adult') {
    return hunger ? 'Jeden z dospělých zemřel hlady.' : 'Zemřel jeden z dospělých.';
  }
  return hunger ? 'Jeden ze starších zemřel hlady.' : 'Zemřel jeden ze starších.';
}

function finishedText(kind: ConstructionKind): string {
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  if (kind === 'cemetery') return 'Hřbitov je ohrazený – dá se do něj pohřbívat.';
  if (kind === 'orchard') return 'Sad je vysazený.';
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
      return deathText(event.group, event.cause === 'hunger');
    case 'village-extinct':
      return `Zemřel poslední obyvatel – ves ${villageName} vymřela.`;
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
    case 'apple-harvest':
      return `Sklizeň jablek: ${formatInteger(event.kg)} kg.`;
    case 'orchard-gone':
      return 'Starý sad dosloužil a zarostl loukou.';
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
  if (c.kind === 'orchard') return `Sad ${formatHa(c.areaM2 ?? 0)}`;
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  summary: VillageSummary,
): SceneVillage {
  const constructions = summary.constructions;
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
  const orchards = villageOrchards(state).map((o) => ({
    id: o.id,
    squares: o.squares.map((s) => sceneOrchardSquare(landscape, s, day, state.orchardWork ?? null)),
  }));
  const reserved = [...reservedTrees(state)].sort((a, b) => a - b);
  const labor = sceneLabor(state, summary.people);
  return {
    dwellings: [...built, ...sites],
    fields,
    cemeteries,
    ...(orchards.length > 0 ? { orchards } : {}),
    obstacles: obstacleChangesAt(state, day),
    ...(reserved.length > 0 ? { reservedTrees: reserved } : {}),
    woodLogs: wholeLogs(state.woodLogs ?? 0),
    ...(labor ? { labor } : {}),
  };
}

/** Rozdělení práce posledního dne pro postavy – člověkodny na setiny, nulové podíly pryč. */
function sceneLabor(state: VillageState, people: SceneLabor['people']): SceneLabor | null {
  const labor = laborReport(state);
  if (!labor) return null;
  const shares = labor.shares.flatMap((share) => {
    const manDays = Math.round(share.manDays * 100) / 100;
    return manDays > 0 ? [{ ...share, manDays }] : [];
  });
  return { day: labor.day, month: dateOfDayIndex(labor.day).month, people, shares };
}

const DAYS_PER_TREE_YEAR = 365.25;

/**
 * Čtverec sadu pro scénu: průběh výsadby, velikost stromů podle stáří (po setinách – instance
 * se nepřestavují při každém dotazu) a jablka na stromech, když sad plodí a ještě se nesklidil.
 */
function sceneOrchardSquare(
  landscape: Landscape,
  square: OrchardSquare,
  day: number,
  work: OrchardWork | null,
): NonNullable<SceneVillage['orchards']>[number]['squares'][number] {
  const center = tileCenterWorld(landscape, square.cell.x, square.cell.y);
  const planted = square.plantedDay;
  const planting =
    planted !== null ? 1 : square.plantingCost > 0 ? square.plantingDone / square.plantingCost : 0;
  const growth =
    planted === null ? 0 : Math.round(treeGrowth((day - planted) / DAYS_PER_TREE_YEAR) * 100) / 100;
  const month = dateOfDayIndex(day).month;
  const fruit =
    planted !== null &&
    fruitVisible({
      bearing: squareBearing(square, day),
      month,
      harvestWindow: monthInWindow(ORCHARD_WINDOWS.harvest, month),
      harvested: work?.task === 'harvest' ? work.done >= work.required : true,
    });
  return {
    cell: { x: square.cell.x, y: square.cell.y },
    x: center.x,
    z: center.z,
    size: landscape.cellSizeM,
    planting,
    growth,
    fruit,
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

const BUILD_KINDS: readonly BuildKind[] = [
  'zemnice',
  'polozemnice',
  'field',
  'cemetery',
  'orchard',
];
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

/**
 * Pole pro panel výběru – výměra, úrodnost vážená plochou, díly podle stadia a povrchu
 * a díly s popelem z vymýceného lesa.
 */
function fieldViews(state: VillageState, day: number): VillageView['fields'] {
  return state.fields.map((f) => {
    const parts = state.parts.filter((p) => p.fieldId === f.id);
    const areaM2 = parts.reduce((sum, p) => sum + p.areaM2, 0);
    const fertility =
      areaM2 > 0
        ? parts.reduce((sum, p) => sum + effectiveFertility(p, day) * p.areaM2, 0) / areaM2
        : 0;
    const stages: Partial<Record<PartStage, number>> = {};
    const surfaces: Partial<Record<FieldSurface, number>> = {};
    let ashParts = 0;
    for (const p of parts) {
      const stage = partStage(p, day);
      stages[stage] = (stages[stage] ?? 0) + 1;
      surfaces[p.surface] = (surfaces[p.surface] ?? 0) + 1;
      if (p.bonusUntilDay !== null && p.bonusUntilDay >= day) ashParts++;
    }
    return { id: f.id, areaM2, fertility, stages, surfaces, ashParts };
  });
}

/**
 * Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). `gameOver` – hráči vymřely
 * všechny vsi (zjistí ho vstupní bod přes `dynastyStatus`, pohled na jednu ves to neví).
 */
export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
  gameOver = false,
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
    applesKg: summary.applesKg,
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
      orchardId: c.orchardId,
      treesToFell: c.treesToFell,
    })),
    fields: fieldViews(state, day),
    hungry: summary.hungry,
    starving: summary.starving,
    constructionsStalled: summary.constructionsStalled,
    extinct: villageLifespan(state),
    gameOver,
    cemeteries: summary.cemeteries.map((c) => {
      const progress = cemeteryProgress(c.id, c.built, summary.constructions);
      return { ...c, progress };
    }),
    orchards: summary.orchards.map((o) => {
      const planting = summary.constructions.find(
        (c) => c.kind === 'orchard' && c.orchardId === o.id,
      );
      return {
        id: o.id,
        areaM2: o.areaM2,
        squares: o.squares,
        ageYears: o.ageYears,
        expectedYieldKg: o.expectedYieldKg,
        planting: planting ? planting.progress : null,
        plantingWaits:
          planting !== undefined &&
          !monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month),
      };
    }),
    scene: sceneVillage(state, landscape, day, summary),
    chronicle: chronicle(state, name),
  };
}

/**
 * Data pro kontrolu umístění v prohlížeči (`checkDwellingPlacement`, `fieldPartsFromCells`,
 * `cemeteryPartsFromCells`, `orchardPartsFromCells`) ze scény vsi – hotová i rozestavěná obydlí
 * jako obydlí, pole podle čtverců dílů, pohřebiště a sady podle svých čtverců, odstraněné
 * a pokácené překážky a vyhrazené stromy – náhled pak spočítá totéž co server.
 */
export function placementVillageFromScene(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({ type: d.type, position: d.position })),
    constructions: [],
    parts: scene.fields.flatMap((f) => f.parts.map((p) => ({ cell: p.cell }))),
    cemeteries: (scene.cemeteries ?? []).map((c) => ({
      squares: c.squares.map((s) => ({ cell: s.cell })),
    })),
    orchards: (scene.orchards ?? []).map((o) => ({
      squares: o.squares.map((s) => ({ cell: s.cell })),
    })),
    ...(scene.obstacles ? { obstacleChanges: scene.obstacles } : {}),
    ...(scene.reservedTrees ? { reservedTrees: scene.reservedTrees } : {}),
  };
}
