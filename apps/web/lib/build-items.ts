import {
  CRAFT_BASE,
  PLOT_TYPES,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPlotPlacement,
  checkSacredBuildingPlacement,
  checkThreshingFloorPlacement,
  checkWorkshopPlacement,
  dwellingLaborManDays,
  workshopLaborManDays,
  workshopTrees,
  fieldPartsFromCells,
  NO_OBSTACLE_CHANGES,
  obstaclesOf,
  orchardPartsFromCells,
  newFenceSides,
  penLaborManDays,
  penTrees,
  penSquaresFromCells,
  planDwellingWoodFrom,
  planSacredWood,
  planThreshingFloorWoodFrom,
  planWoodFrom,
  placementWalk,
  sacredLaborManDays,
  sameGrid,
  threshingFloorLaborManDays,
  type BuildKind,
  type Craft,
  type DwellingPlacementCheck,
  type DwellingPlot,
  type BuildableDwellingType,
  type DwellingType,
  type Landscape,
  type ObstacleLayer,
  type PenSpecies,
  type PenSquaresCheck,
  type PlacementCheck,
  type PlacementVillage,
  type Position,
  type SacredBuildingKind,
  type SacredPlacementCheck,
  type SquareGrid,
  type ThreshingFloorPlacementCheck,
  type TileCell,
  type Walk,
  penSpecies,
} from '@bohemia/game';
import type { PlacementCost, SquaresVariant } from './scene/village-types';

// Katalog staveb pro mřížku staveb (jako v 0 A.D.): název, ikona, klávesová zkratka, způsob
// umístění a kontrola, jestli stavba smí kam. Čistý modul (kontroly z herního jádra běží
// i v prohlížeči, server je ověří znovu). Nová stavba = nový záznam tady, cena v jádře
// (`BUILD_COSTS`) a server action v `VillageGame` (`SUBMIT`) – rozhraní se nemění.
//
// Zkratky jsou spodní řada levé ruky jako fronta výroby v 0 A.D. (Z X C V B N M) – WASD, Q/E
// a R patří kameře. Sad [B] staví se jako pole (orchard.md), modla [N] a svatyně [M] půdorysem
// u kurzoru jako obydlí (happiness.md). Řemeslné dílny (crafts.md) na volných klávesách
// prostřední řady – hrnčíř [F], kovář [G], uhlíř [H] – volně u kurzoru jako zemnice. Humno [K]
// (production-chains.md – Humno) půdorysem u kurzoru jako dílna.

/**
 * Kontrola stavby po čtvercích: projde? a které čtverce jsou zakázané (červeně); u prošlé
 * stavby cena (práce i s překážkami) a volitelně varování `check.warning`, které ji
 * neblokuje, a jeho čtverce (oranžově).
 */
export interface SquaresCheck {
  check: PlacementCheck;
  blockedCells: readonly TileCell[];
  warningCells?: readonly TileCell[];
  /** Cena prošlé stavby, jinak null. */
  cost: PlacementCost | null;
}

/** Kontrola obydlí: projde? a u prošlého umístění cena (práce a stromy ke kácení). */
export type FootprintCheck = PlacementCheck & { cost: PlacementCost | null };
/** Kontrola obydlí na pozemku – navíc poloha domu na něm (null = pozemek neprošel). */
export type PlotCheck = FootprintCheck & { position: Position | null };

interface BuildItemBase {
  kind: BuildKind;
  name: string;
  /** Soubor v `public/icons/build/` bez přípony. */
  icon: string;
  /** `KeyboardEvent.code` zkratky. */
  hotkey: string;
  hotkeyLabel: string;
}

/**
 * Stavba v mřížce staveb. `footprint` = půdorys u kurzoru (duch obydlí, otáčí se), `plot` =
 * pozemek na políčku pod kurzorem (polozemnice – varianty, kde na něm dům stojí), `squares` =
 * malování po čtvercích políček jako pole.
 */
export type BuildItem =
  | (BuildItemBase & {
      placement: 'footprint';
      /** Model a půdorys ducha. */
      dwellingType: BuildableDwellingType;
      /** `woodLogs` = klády na hromadě v kusech (`VillageView.woodLogs`) – pro cenu dřeva. */
      check(
        landscape: Landscape,
        village: PlacementVillage,
        position: Position,
        woodLogs: number,
      ): FootprintCheck;
    })
  | (BuildItemBase & {
      placement: 'plot';
      /** Model ducha domu. */
      dwellingType: BuildableDwellingType;
      check(
        landscape: Landscape,
        village: PlacementVillage,
        plot: DwellingPlot,
        woodLogs: number,
      ): PlotCheck;
    })
  | (BuildItemBase & {
      placement: 'squares';
      /**
       * Stavba jde natáčet ve vlastní mřížce (pole, sad – fields.md, Natočené stavby); hřbitov
       * a ohrada leží v mřížce krajiny.
       */
      rotatable?: boolean;
      /**
       * Druhy stavby (ohrada – druh zvířat, oxen.md): tlačítko stavby je jen rozcestník, mřížka
       * staveb po kliknutí nabídne druhy a malování začne s vybraným; `check` pak dostane id druhu
       * (`variant`).
       */
      variants?: readonly SquaresVariant[];
      check(
        landscape: Landscape,
        village: PlacementVillage,
        cells: TileCell[],
        grid?: SquareGrid,
        variant?: string,
      ): SquaresCheck;
    })
  | (BuildItemBase & {
      /** Modla nebo svatyně – čtvercový půdorys u kurzoru (otáčí se jako obydlí). */
      placement: 'sacred';
      sacredKind: SacredBuildingKind;
      check(landscape: Landscape, village: PlacementVillage, position: Position): FootprintCheck;
    })
  | (BuildItemBase & {
      /** Řemeslná dílna (crafts.md) – volně u kurzoru jako zemnice, uhlíř i s milířem. */
      placement: 'workshop';
      craft: Craft;
      /** Obydlí, na kterém dílna stojí (půdorys, jáma). */
      dwellingType: DwellingType;
      check(
        landscape: Landscape,
        village: PlacementVillage,
        position: Position,
        woodLogs: number,
      ): FootprintCheck;
    })
  | (BuildItemBase & {
      /**
       * Humno (production-chains.md – Humno) – obdélníkový půdorys u kurzoru (otáčí se jako
       * obydlí), volně jako dílna.
       */
      placement: 'threshing-floor';
      check(
        landscape: Landscape,
        village: PlacementVillage,
        position: Position,
        woodLogs: number,
      ): FootprintCheck;
    });

const dwelling = (kind: BuildableDwellingType, name: string, hotkeyLabel: string): BuildItem => {
  const base = { kind, name, icon: kind, hotkey: `Key${hotkeyLabel}`, hotkeyLabel };
  if (PLOT_TYPES[kind]) {
    return {
      ...base,
      placement: 'plot',
      dwellingType: kind,
      check: (landscape, village, plot, woodLogs) => {
        const check = checkPlotPlacement(landscape, village, kind, plot);
        return {
          ...check,
          cost:
            check.ok && check.position
              ? dwellingPlacementCost(landscape, village, kind, check.position, check, woodLogs)
              : null,
        };
      },
    };
  }
  return {
    ...base,
    placement: 'footprint',
    dwellingType: kind,
    check: (landscape, village, position, woodLogs) => {
      const check = checkDwellingPlacement(landscape, village, kind, position);
      return {
        ...check,
        cost: check.ok
          ? dwellingPlacementCost(landscape, village, kind, position, check, woodLogs)
          : null,
      };
    },
  };
};

/** Cena prošlé stavby po čtvercích – jen práce (pole, sad ani hřbitov nechtějí dřevo). */
const squaresCost = (check: PlacementCheck, laborManDays: number): PlacementCost | null =>
  check.ok ? { laborManDays, trees: 0 } : null;

/**
 * Cena obydlí u kurzoru: práce celkem jako při zahájení stavby (`dwellingLaborManDays` –
 * stavba, překážky na vyklízené ploše a kácení) a kolik stromů se skácí, když klády na hromadě
 * (i ze stromů vyklízené plochy) nestačí – nejbližší dospělé stromy jako na serveru
 * (`planDwellingWoodFrom`). Stromy, které už patří jiným stavbám, zná jen server
 * (`PlacementVillage.reservedTrees`, díly a čtverce ve stavbě) – kácení pak u kurzoru může
 * vyjít o kousek blíž (vzdálenostní přirážka), počet stromů sedí. `obstacles` = vrstva
 * překážek krajiny (jako u `checkDwellingPlacement`).
 */
export function dwellingPlacementCost(
  landscape: Landscape,
  village: PlacementVillage,
  type: DwellingType,
  position: Position,
  check: Pick<DwellingPlacementCheck, 'obstacleCost' | 'obstacleIds' | 'clearedTrees'>,
  woodLogs: number,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): PlacementCost {
  const plan = planDwellingWoodFrom(
    type,
    position,
    {
      logs: woodLogs,
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    {
      obstacles,
      clearedTrees: check.clearedTrees,
      clearedIds: check.obstacleIds,
      // kácení chůzí po pevných cestách jako na serveru (roads.md)
      walk: placementWalk(landscape, village),
    },
  );
  return {
    laborManDays: dwellingLaborManDays(type, check.obstacleCost, plan),
    trees: plan.fell.length,
  };
}

/**
 * Cena řemeslné dílny u kurzoru – jako u obydlí (`dwellingPlacementCost`), jen dřevo a práce
 * dílny (+ 30 %, crafts.md) a překážky i kolem milíře.
 */
export function workshopPlacementCost(
  landscape: Landscape,
  village: PlacementVillage,
  craft: Craft,
  position: Position,
  check: Pick<DwellingPlacementCheck, 'obstacleCost' | 'obstacleIds' | 'clearedTrees'>,
  woodLogs: number,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): PlacementCost {
  const plan = planDwellingWoodFrom(
    CRAFT_BASE[craft],
    position,
    {
      logs: woodLogs,
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    {
      obstacles,
      clearedTrees: check.clearedTrees,
      clearedIds: check.obstacleIds,
      trees: workshopTrees(craft),
      walk: placementWalk(landscape, village),
    },
  );
  return {
    laborManDays: workshopLaborManDays(craft, check.obstacleCost, plan),
    trees: plan.fell.length,
  };
}

const workshop = (
  craft: Craft,
  name: string,
  icon: string,
  hotkeyLabel: string,
): BuildItem & { placement: 'workshop' } => ({
  kind: craft,
  name,
  icon,
  hotkey: `Key${hotkeyLabel}`,
  hotkeyLabel,
  placement: 'workshop',
  craft,
  dwellingType: CRAFT_BASE[craft],
  check: (landscape, village, position, woodLogs) => {
    const obstacles = obstaclesOf(landscape);
    const check = checkWorkshopPlacement(landscape, village, craft, position, obstacles);
    return {
      ...check,
      cost: check.ok
        ? workshopPlacementCost(landscape, village, craft, position, check, woodLogs, obstacles)
        : null,
    };
  },
});

/**
 * Cena modly nebo svatyně u kurzoru: práce celkem jako při zahájení stavby (`sacredLaborManDays`
 * – stavba, překážky na půdorysu a kácení dubů) a kolik dubů se skácí – nejbližší dospělé duby
 * jako na serveru (`planSacredWood`). Duby jiných staveb zná jen server (jako u obydlí).
 */
export function sacredPlacementCost(
  village: PlacementVillage,
  kind: SacredBuildingKind,
  position: Position,
  check: Pick<SacredPlacementCheck, 'obstacleCost' | 'obstacleIds'>,
  obstacles: ObstacleLayer,
  walk?: Walk,
): PlacementCost {
  const plan = planSacredWood(
    kind,
    position,
    {
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    { obstacles, clearedIds: check.obstacleIds, ...(walk ? { walk } : {}) },
  );
  return {
    laborManDays: sacredLaborManDays(kind, check.obstacleCost, plan),
    trees: 0,
    oaks: plan.fell.length,
  };
}

const sacred = (
  kind: SacredBuildingKind,
  name: string,
  icon: string,
  hotkeyLabel: string,
): BuildItem & { placement: 'sacred' } => ({
  kind,
  name,
  icon,
  hotkey: `Key${hotkeyLabel}`,
  hotkeyLabel,
  placement: 'sacred',
  sacredKind: kind,
  check: (landscape, village, position) => {
    const obstacles = obstaclesOf(landscape);
    const check = checkSacredBuildingPlacement(landscape, village, kind, position, obstacles);
    return {
      ...check,
      cost: check.ok
        ? sacredPlacementCost(
            village,
            kind,
            position,
            check,
            obstacles,
            placementWalk(landscape, village),
          )
        : null,
    };
  },
});

/**
 * Cena humna u kurzoru: práce celkem jako při zahájení stavby (`threshingFloorLaborManDays` –
 * stavba, překážky a les pod půdorysem a kácení) a kolik stromů se skácí, když klády na hromadě
 * nestačí – nejbližší dospělé stromy jako na serveru (`planThreshingFloorWoodFrom`; stromy
 * jiných staveb zná jen server – jako u obydlí).
 */
export function threshingFloorPlacementCost(
  landscape: Landscape,
  village: PlacementVillage,
  position: Position,
  check: Pick<ThreshingFloorPlacementCheck, 'obstacleCost' | 'obstacleIds' | 'clearedTrees'>,
  woodLogs: number,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): PlacementCost {
  const plan = planThreshingFloorWoodFrom(
    position,
    {
      logs: woodLogs,
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    {
      obstacles,
      clearedTrees: check.clearedTrees,
      clearedIds: check.obstacleIds,
      walk: placementWalk(landscape, village),
    },
  );
  return {
    laborManDays: threshingFloorLaborManDays(check.obstacleCost, plan),
    trees: plan.fell.length,
  };
}

/** Humno (production-chains.md – Humno) – půdorys u kurzoru, zkratka K. */
const THRESHING_FLOOR: BuildItem & { placement: 'threshing-floor' } = {
  kind: 'threshing-floor',
  name: 'Humno',
  icon: 'humno',
  hotkey: 'KeyK',
  hotkeyLabel: 'K',
  placement: 'threshing-floor',
  check: (landscape, village, position, woodLogs) => {
    const obstacles = obstaclesOf(landscape);
    const check = checkThreshingFloorPlacement(landscape, village, position, obstacles);
    return {
      ...check,
      cost: check.ok
        ? threshingFloorPlacementCost(landscape, village, position, check, woodLogs, obstacles)
        : null,
    };
  },
};

/**
 * Druhy ohrady v pořadí rozcestníku mřížky staveb (oxen.md – Ohrady podle druhu): ovce, kozy, prasata,
 * skot, voli (ohrada volů – oxen.md, Ohrada volů; v kódu druh `team`), koně (ohrada koní – horses.md) –
 * ikony zvířat
 * (`public/icons/resources/`).
 */
export const PEN_VARIANTS: readonly (SquaresVariant & { id: PenSpecies })[] = [
  { id: 'sheep', icon: 'sheep', name: 'Ovce' },
  { id: 'goat', icon: 'goat', name: 'Kozy' },
  { id: 'pig', icon: 'pig', name: 'Prasata' },
  { id: 'cattle', icon: 'cow', name: 'Skot' },
  { id: 'team', icon: 'ox', name: 'Voli' },
  { id: 'horse', icon: 'horse', name: 'Koně' },
];

/** Název ohrady podle druhu – portrét panelu (oxen.md – Ohrady podle druhu). */
export const PEN_NAMES: Record<PenSpecies, string> = {
  sheep: 'Ohrada ovcí',
  goat: 'Ohrada koz',
  pig: 'Ohrada prasat',
  cattle: 'Ohrada skotu',
  team: 'Ohrada volů',
  horse: 'Ohrada koní',
};

/** Ikona a název zvířat ohrady podle druhu (ikony `public/icons/resources/`). */
export function penVariant(species: PenSpecies): SquaresVariant {
  return PEN_VARIANTS.find((v) => v.id === species) ?? PEN_VARIANTS[0]!;
}

/**
 * Název druhu stavby v rozcestníku mřížky staveb – u ohrady „Ohrada ovcí“ (`PEN_NAMES`), jinak
 * název stavby a druhu.
 */
export function buildVariantName(item: BuildItem, variant: SquaresVariant): string {
  if (item.kind === 'pen') return PEN_NAMES[penVariantSpecies(variant.id)];
  return `${item.name} – ${variant.name}`;
}

/** Druh ohrady z id druhu stavby (bez údaje nebo neznámý první – ovce). */
export function penVariantSpecies(variant: string | undefined): PenSpecies {
  return PEN_VARIANTS.find((v) => v.id === variant)?.id ?? PEN_VARIANTS[0]!.id;
}

export const BUILD_ITEMS: readonly BuildItem[] = [
  dwelling('zemnice', 'Zemnice', 'Z'),
  dwelling('polozemnice', 'Polozemnice', 'X'),
  {
    kind: 'field',
    name: 'Pole',
    icon: 'pole',
    hotkey: 'KeyC',
    hotkeyLabel: 'C',
    placement: 'squares',
    rotatable: true,
    check: (landscape, village, cells, grid) => {
      const result = fieldPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
        undefined,
        grid,
      );
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        cost: squaresCost(result.check, result.foundingCost),
      };
    },
  },
  {
    kind: 'cemetery',
    name: 'Hřbitov',
    icon: 'hrbitov',
    hotkey: 'KeyV',
    hotkeyLabel: 'V',
    placement: 'squares',
    rotatable: true,
    check: (landscape, village, cells, grid) => {
      const result = cemeteryPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
        undefined,
        grid,
      );
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        // čtverce polí, které hřbitov sebere, oranžově (fields.md – Pole jako krajina) – jen
        // čtverce v mřížce hřbitova
        warningCells: [
          ...result.warningCells,
          ...result.takenLand.filter((t) => sameGrid(t.grid, result.grid)).map((t) => t.cell),
        ],
        cost: squaresCost(result.check, result.foundingCost),
      };
    },
  },
  {
    kind: 'orchard',
    name: 'Sad',
    icon: 'sad',
    hotkey: 'KeyB',
    hotkeyLabel: 'B',
    placement: 'squares',
    rotatable: true,
    check: (landscape, village, cells, grid) => {
      const result = orchardPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
        undefined,
        grid,
      );
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        // čtverce polí, které sad sebere, oranžově (fields.md – Pole jako krajina) – jen čtverce
        // v mřížce sadu (zabrané kusy natočeného pole do výběru sadu nepatří)
        warningCells: result.takenLand
          .filter((t) => sameGrid(t.grid, result.grid))
          .map((t) => t.cell),
        cost: squaresCost(result.check, result.plantingCost),
      };
    },
  },
  sacred('idol', 'Modla', 'modla', 'N'),
  sacred('shrine', 'Svatyně', 'svatyne', 'M'),
  workshop('potter', 'Hrnčíř', 'hrncir', 'F'),
  workshop('smith', 'Kovář', 'kovar', 'G'),
  workshop('burner', 'Uhlíř', 'uhlir', 'H'),
  // wagons.md – tesař: vozy, dřevěné nářadí a pomoc stavbám
  workshop('carpenter', 'Tesař', 'tesar', 'T'),
  {
    // oxen.md – Ohrady podle druhu: čtverce jako hřbitov (nejvýš 4), tlačítko je rozcestník druhů
    kind: 'pen',
    name: 'Ohrada',
    icon: 'ohrada',
    hotkey: 'KeyO',
    hotkeyLabel: 'O',
    placement: 'squares',
    // natočená ohrada (fields.md – Natočené stavby): čtverce natočené mřížky
    rotatable: true,
    variants: PEN_VARIANTS,
    check: (landscape, village, cells, grid, variant) => {
      const species = penVariantSpecies(variant);
      const result = penSquaresFromCells(landscape, village, cells, species, undefined, grid);
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        // čtverce pole pod ohradou oranžově (fields.md – Pole jako krajina) – jen ve stejné mřížce
        warningCells: result.takenLand
          .filter((t) => sameGrid(t.grid, result.grid))
          .map((t) => t.cell),
        cost: result.check.ok ? penPlacementCost(village, result, species) : null,
      };
    },
  },
  THRESHING_FLOOR,
];

/**
 * Cena ohrady u kurzoru: práce jako při zahájení stavby (`penLaborManDays` – stavba po čtvercích,
 * překážky a kácení) – dřevo z klád na hromadě nezná (VillageView je ukazuje jen v kusech), proto
 * počítá, jako by se kácelo u ohrady všech 6 stromů na čtverec bez klád; stromy ke kácení ukáže 0
 * (cena dřeva je v nabídce staveb).
 */
export function penPlacementCost(
  village: PlacementVillage,
  check: Pick<PenSquaresCheck, 'squares' | 'obstacleCost' | 'extendsPen'>,
  species?: PenSpecies,
): PlacementCost {
  const n = Math.max(1, check.squares.length);
  // plot jen na nových vnějších stranách (oxen.md – Plot podle délky): rozšíření ušetří strany
  // sousedící s ohradou
  const extended = village.pens?.find((p) => p.id !== undefined && p.id === check.extendsPen);
  // rozšíření bere druh cílové ohrady (jako startPen), jinak druh z umisťování
  const penKind = extended ? penSpecies(extended) : species;
  const sides = newFenceSides(
    check.squares.map((q) => q.cell),
    extended ? [extended.cell, ...(extended.extraSquares ?? []).map((q) => q.cell)] : [],
  );
  const plan = planWoodFrom(
    penTrees(n, sides, penKind),
    {
      x: check.squares.reduce((sum, q) => sum + q.x, 0) / n,
      z: check.squares.reduce((sum, q) => sum + q.z, 0) / n,
    },
    {
      logs: 0,
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    {
      clearedIds: check.squares.flatMap((q) => q.obstacleIds),
      clearedTrees: check.squares.reduce((sum, q) => sum + q.clearedTrees, 0),
    },
  );
  return { laborManDays: penLaborManDays(check.obstacleCost, plan, n, sides, penKind), trees: 0 };
}

/** Stavba podle druhu. */
export function buildItem(kind: BuildKind): BuildItem {
  const item = BUILD_ITEMS.find((i) => i.kind === kind);
  if (!item) throw new Error(`Stavba ${kind} není v katalogu staveb.`);
  return item;
}

/** Stavba na klávesovou zkratku – bez modifikátorů, jinak null (Ctrl+Z vrací tah pole…). */
export function buildItemForKey(event: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): BuildItem | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  return BUILD_ITEMS.find((item) => item.hotkey === event.code) ?? null;
}
