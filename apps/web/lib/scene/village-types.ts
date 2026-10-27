// Rozhraní scény vsi pro React (docs/superpowers/plans/2026-10-17-village-slice.md). Bez
// Babylonu – importovat ho smí i komponenty. Doménové typy (DwellingType, Position, PartStage,
// PlacementCheck) jsou z herního jádra, ves pro scénu (SceneVillage) z lib/village-view.ts –
// tady jen jejich části a typy umisťování.
//
// Position.rotation = natočení kolem svislé osy v radiánech jako `mesh.rotation.y` v Babylonu:
// 0 = vchod míří do +Z, π/2 do +X (vchod míří do směru (sin r, cos r) v osách x, z).
import type {
  Craft,
  DwellingPlot,
  DwellingType,
  PlacementCheck,
  Position,
  SacredBuildingKind,
  SquareGrid,
  TileCell,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';

/**
 * Obydlí ve scéně; `built: false` = staveniště, jeho vzhled ukazuje `progress` (0–1).
 * `inhabited` – jen z obývaného obydlí občas stoupá dým; bez údaje se bere jako obývané.
 */
export type SceneDwelling = SceneVillage['dwellings'][number];

/** Zbytek jámy po zaniklém obydlí – zarůstá podle `overgrowth` 0–1 (dwelling-decay.ts). */
export type SceneRuin = NonNullable<SceneVillage['ruins']>[number];

/** Pole ve scéně – díly po čtvercích (políčkách krajiny). */
export type SceneField = SceneVillage['fields'][number];

/** Díl pole – políčko, jeho střed (m), strana políčka a stadium; díl = celé políčko. */
export type SceneFieldPart = SceneField['parts'][number];

/**
 * Cena umístění pro rozhraní u kurzoru (ikony s čísly): práce celkem v člověkodnech – i s
 * překážkami (a u obydlí s kácením) – a u obydlí kolik stromů se pro stavbu skácí (0 = dřevo
 * je z hromady klád).
 */
export interface PlacementCost {
  laborManDays: number;
  trees: number;
  /** Modla a svatyně: kolik dospělých dubů se pro stavbu skácí (happiness.md). */
  oaks?: number;
  /** Pole: kolik čtverců lesa se vyklučí po fázích a vypálí (forest.md – Klučení lesa pro pole). */
  burn?: number;
}

/**
 * Náhled stavby malované po čtvercích (pole, sad, hřbitov): kontrola, popisek, cena
 * a zakázané čtverce.
 */
export interface SquaresPreview {
  check: PlacementCheck;
  label: string;
  /** Cena prošlého umístění (jinak null nebo chybí). */
  cost?: PlacementCost | null;
  /** Čtverce, kam pole nesmí – scéna je zbarví červeně. */
  blockedCells: readonly TileCell[];
  /** Čtverce, kterých se týká varování (`check.warning`) – scéna je zbarví oranžově. */
  warningCells?: readonly TileCell[];
}

/**
 * Druh stavby po čtvercích, který hráč vybere v rozcestníku mřížky staveb (ohrada – druh zvířat,
 * oxen.md): id, ikona
 * (`public/icons/resources/<icon>.png`) a název do popisku.
 */
export interface SquaresVariant {
  id: string;
  icon: string;
  name: string;
}

/**
 * Co hráč právě umisťuje a jak scéna ověří, jestli to jde: volné obydlí půdorysem (zemnice –
 * duch u kurzoru, klávesy [ a ] otáčejí), obydlí na pozemku (polozemnice – políčko pod kurzorem,
 * [ a ] přepínají variantu, kde na něm dům stojí), nebo stavbu po čtvercích políček (pole a další
 * stavby malované jako pole).
 */
export type PlacementMode =
  | {
      kind: 'dwelling';
      type: DwellingType;
      /** Kontrola místa, u prošlého umístění i s cenou. */
      check(position: Position): PlacementCheck & { cost?: PlacementCost | null };
    }
  | {
      kind: 'plot';
      type: DwellingType;
      /** Kontrola pozemku, u prošlého i s cenou; poloha domu na něm (null = neprošel). */
      check(plot: DwellingPlot): PlacementCheck & {
        cost?: PlacementCost | null;
        position: Position | null;
      };
    }
  | {
      kind: 'squares';
      /**
       * Kontrola čtverců v mřížce `grid` (fields.md – Natočené stavby; bez ní mřížka krajiny)
       * a druhu `variant` (jen stavba s `variants`).
       */
      preview(cells: TileCell[], grid?: SquareGrid, variant?: string): SquaresPreview;
      /**
       * Druhy stavby (ohrada: ovce, kozy, prasata, skot, spřežení – oxen.md, Ohrady podle druhu) –
       * maluje se ten z `variant`, vybraný v rozcestníku mřížky staveb. Bez údaje stavba jednoho
       * druhu.
       */
      variants?: readonly SquaresVariant[];
      /** Druh (id), se kterým malování začne (jeden z `variants`); bez údaje první. */
      variant?: string;
      /**
       * Stavbu jde natáčet (pole, sad): [ a ] před prvním čtvercem otáčejí mřížku po 15°, nad
       * stavbou stejného druhu se malování chytí její mřížky (rozšíření). Bez údaje jen mřížka
       * krajiny (hřbitov, ohrada).
       */
      rotatable?: boolean;
      /**
       * Mřížka stavby stejného druhu pod bodem světa – undefined = stavba v mřížce krajiny, null =
       * žádná stavba. Malování se jí chytí, dokud není vybraný žádný čtverec.
       */
      gridAt?(x: number, z: number, variant?: string): SquareGrid | undefined | null;
      /** Mřížka, ve které malování začne (vybraná stavba stejného druhu); bez údaje krajina. */
      grid?: SquareGrid;
    }
  | {
      /** Modla nebo svatyně (happiness.md) – čtvercový půdorys u kurzoru jako obydlí. */
      kind: 'sacred';
      type: SacredBuildingKind;
      check(position: Position): PlacementCheck & { cost?: PlacementCost | null };
    }
  | {
      /**
       * Řemeslná dílna (crafts.md) – volně u kurzoru jako zemnice ([ a ] otáčejí): duch modelu
       * dílny, u uhlíře i milíře kus od zemnice; `type` = obydlí, na kterém dílna stojí.
       */
      kind: 'workshop';
      craft: Craft;
      type: DwellingType;
      check(position: Position): PlacementCheck & { cost?: PlacementCost | null };
    }
  | {
      /**
       * Humno (production-chains.md – Humno) – obdélníkový půdorys u kurzoru jako dílna ([ a ]
       * otáčejí); duch je zatím jen obrys půdorysu.
       */
      kind: 'threshing-floor';
      check(position: Position): PlacementCheck & { cost?: PlacementCost | null };
    };

/**
 * Potvrzené umístění – scéna ho ohlásí jen tehdy, když kontrola prošla. Obydlí na pozemku nese
 * i pozemek (`plot`) – `position` je pak poloha domu na něm.
 */
export type PlacementResult =
  | { kind: 'dwelling'; type: DwellingType; position: Position; plot?: DwellingPlot }
  | { kind: 'squares'; cells: TileCell[]; grid?: SquareGrid; variant?: string }
  | { kind: 'sacred'; type: SacredBuildingKind; position: Position }
  | { kind: 'workshop'; craft: Craft; position: Position }
  | { kind: 'threshing-floor'; position: Position };

/**
 * Průběžný stav umisťování pro rozhraní: kontrola, popisek (u pole výměra a cena z `preview`,
 * u obydlí důvod nebo název) a kurzor v pixelech plátna (kam dát bublinu), nebo null mimo
 * krajinu.
 */
export interface PlacementPreview {
  check: PlacementCheck;
  label: string;
  screen: { x: number; y: number } | null;
  /** Cena prošlého umístění – rozhraní ji ukáže u kurzoru (null = žádná, nebo neprošlo). */
  cost?: PlacementCost | null;
  /** Druh stavby u kurzoru (druh ohrady z rozcestníku mřížky staveb); bez údaje žádný. */
  variant?: SquaresVariant;
}

export interface PlacementHandlers {
  /**
   * Prošlé umístění. `keepPlacing` – hráč stavěl se Shiftem (jako v 0 A.D.): umisťování běží
   * dál pro další kus, jinak skončilo.
   */
  onConfirm(result: PlacementResult, keepPlacing?: boolean): void;
  onCancel(): void;
  /** Volitelné – změna kontroly / popisku během umisťování (null = kurzor mimo krajinu). */
  onPreview?(preview: PlacementPreview | null): void;
}
