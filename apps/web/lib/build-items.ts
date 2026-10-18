import {
  PLOT_TYPES,
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  checkPenPlacement,
  checkPlotPlacement,
  checkSacredBuildingPlacement,
  dwellingLaborManDays,
  fieldPartsFromCells,
  NO_OBSTACLE_CHANGES,
  obstaclesOf,
  orchardPartsFromCells,
  penLaborManDays,
  planDwellingWoodFrom,
  planSacredWood,
  planWoodFrom,
  PEN,
  sacredLaborManDays,
  type BuildKind,
  type DwellingPlacementCheck,
  type DwellingPlot,
  type DwellingType,
  type Landscape,
  type ObstacleLayer,
  type PlacementCheck,
  type PlacementVillage,
  type Position,
  type SacredBuildingKind,
  type SacredPlacementCheck,
  type TileCell,
} from '@bohemia/game';
import type { PlacementCost } from './scene/village-types';

// Katalog staveb pro mřížku staveb (jako v 0 A.D.): název, ikona, klávesová zkratka, způsob
// umístění a kontrola, jestli stavba smí kam. Čistý modul (kontroly z herního jádra běží
// i v prohlížeči, server je ověří znovu). Nová stavba = nový záznam tady, cena v jádře
// (`BUILD_COSTS`) a server action v `VillageGame` (`SUBMIT`) – rozhraní se nemění.
//
// Zkratky jsou spodní řada levé ruky jako fronta výroby v 0 A.D. (Z X C V B N M) – WASD, Q/E
// a R patří kameře. Sad [B] staví se jako pole (orchard.md), modla [N] a svatyně [M] půdorysem
// u kurzoru jako obydlí (happiness.md).

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
      dwellingType: DwellingType;
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
      dwellingType: DwellingType;
      check(
        landscape: Landscape,
        village: PlacementVillage,
        plot: DwellingPlot,
        woodLogs: number,
      ): PlotCheck;
    })
  | (BuildItemBase & {
      placement: 'squares';
      check(landscape: Landscape, village: PlacementVillage, cells: TileCell[]): SquaresCheck;
    })
  | (BuildItemBase & {
      /** Modla nebo svatyně – čtvercový půdorys u kurzoru (otáčí se jako obydlí). */
      placement: 'sacred';
      sacredKind: SacredBuildingKind;
      check(landscape: Landscape, village: PlacementVillage, position: Position): FootprintCheck;
    });

const dwelling = (kind: DwellingType, name: string, hotkeyLabel: string): BuildItem => {
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
    },
  );
  return {
    laborManDays: dwellingLaborManDays(type, check.obstacleCost, plan),
    trees: plan.fell.length,
  };
}

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
): PlacementCost {
  const plan = planSacredWood(
    kind,
    position,
    {
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    { obstacles, clearedIds: check.obstacleIds },
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
      cost: check.ok ? sacredPlacementCost(village, kind, position, check, obstacles) : null,
    };
  },
});

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
    check: (landscape, village, cells) => {
      const result = fieldPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
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
    check: (landscape, village, cells) => {
      const result = cemeteryPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
      );
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        warningCells: result.warningCells,
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
    check: (landscape, village, cells) => {
      const result = orchardPartsFromCells(
        landscape,
        village,
        cells,
        village.dwellings.map((d) => d.position),
      );
      return {
        check: result.check,
        blockedCells: result.blockedCells,
        cost: squaresCost(result.check, result.plantingCost),
      };
    },
  },
  sacred('idol', 'Modla', 'modla', 'N'),
  sacred('shrine', 'Svatyně', 'svatyne', 'M'),
  {
    // oxen.md – ohrada s přístřeškem: jeden čtverec louky, staví se jako pole po čtvercích
    kind: 'pen',
    name: 'Ohrada',
    icon: 'ohrada',
    hotkey: 'KeyO',
    hotkeyLabel: 'O',
    placement: 'squares',
    check: (landscape, village, cells) => {
      const [cell, ...rest] = cells;
      if (!cell) return { check: { ok: false, reason: null }, blockedCells: [], cost: null };
      if (rest.length > 0) {
        return {
          check: { ok: false, reason: 'Ohrada je jeden čtverec.' },
          blockedCells: rest,
          cost: null,
        };
      }
      const check = checkPenPlacement(landscape, village, cell);
      return {
        check,
        blockedCells: check.ok ? [] : [cell],
        cost: check.ok ? penPlacementCost(village, check) : null,
      };
    },
  },
];

/**
 * Cena ohrady u kurzoru: práce jako při zahájení stavby (`penLaborManDays` – stavba, překážky
 * a kácení) – dřevo z klád na hromadě nezná (VillageView je ukazuje jen v kusech), proto počítá,
 * jako by se kácelo u ohrady všech 6 stromů bez klád; stromy ke kácení ukáže 0 (cena dřeva je
 * v nabídce staveb).
 */
function penPlacementCost(
  village: PlacementVillage,
  check: {
    obstacleCost: number;
    obstacleIds: number[];
    clearedTrees: number;
    x: number;
    z: number;
  },
): PlacementCost {
  const plan = planWoodFrom(
    PEN.trees,
    { x: check.x, z: check.z },
    {
      logs: 0,
      changes: () => village.obstacleChanges ?? NO_OBSTACLE_CHANGES,
      claimed: () => new Set(village.reservedTrees ?? []),
    },
    { clearedIds: check.obstacleIds, clearedTrees: check.clearedTrees },
  );
  return { laborManDays: penLaborManDays(check.obstacleCost, plan), trees: 0 };
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
