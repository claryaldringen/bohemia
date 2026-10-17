import {
  cemeteryPartsFromCells,
  checkDwellingPlacement,
  fieldPartsFromCells,
  type BuildKind,
  type DwellingType,
  type Landscape,
  type PlacementCheck,
  type PlacementVillage,
  type Position,
  type TileCell,
} from '@bohemia/game';

// Katalog staveb pro mřížku staveb (jako v 0 A.D.): název, ikona, klávesová zkratka, způsob
// umístění a kontrola, jestli stavba smí kam. Čistý modul (kontroly z herního jádra běží
// i v prohlížeči, server je ověří znovu). Nová stavba = nový záznam tady, cena v jádře
// (`BUILD_COSTS`) a server action v `VillageGame` (`SUBMIT`) – rozhraní se nemění.
//
// Zkratky jsou spodní řada levé ruky jako fronta výroby v 0 A.D. (Z X C V B N M) – WASD, Q/E
// a R patří kameře.

/**
 * Kontrola stavby po čtvercích: projde? a které čtverce jsou zakázané (červeně); u prošlé
 * stavby volitelně varování `check.warning`, které ji neblokuje, a jeho čtverce (oranžově).
 */
export interface SquaresCheck {
  check: PlacementCheck;
  blockedCells: readonly TileCell[];
  warningCells?: readonly TileCell[];
}

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
 * Stavba v mřížce staveb. `footprint` = půdorys u kurzoru (duch obydlí, otáčí se), `squares` =
 * malování po čtvercích políček jako pole.
 */
export type BuildItem =
  | (BuildItemBase & {
      placement: 'footprint';
      /** Model a půdorys ducha. */
      dwellingType: DwellingType;
      check(landscape: Landscape, village: PlacementVillage, position: Position): PlacementCheck;
    })
  | (BuildItemBase & {
      placement: 'squares';
      check(landscape: Landscape, village: PlacementVillage, cells: TileCell[]): SquaresCheck;
    });

const dwelling = (
  kind: DwellingType,
  name: string,
  hotkeyLabel: string,
): BuildItem & { placement: 'footprint' } => ({
  kind,
  name,
  icon: kind,
  hotkey: `Key${hotkeyLabel}`,
  hotkeyLabel,
  placement: 'footprint',
  dwellingType: kind,
  check: (landscape, village, position) =>
    checkDwellingPlacement(landscape, village, kind, position),
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
      return { check: result.check, blockedCells: result.blockedCells };
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
      };
    },
  },
];

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
