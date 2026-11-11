// Rozhraní scény vsi pro React (docs/superpowers/plans/2026-10-17-village-slice.md). Bez
// Babylonu – importovat ho smí i komponenty. Doménové typy (DwellingType, Position, PartStage,
// PlacementCheck) jsou z herního jádra, ves pro scénu (SceneVillage) z lib/village-view.ts –
// tady jen jejich části a typy umisťování.
//
// Position.rotation = natočení kolem svislé osy v radiánech jako `mesh.rotation.y` v Babylonu:
// 0 = vchod míří do +Z, π/2 do +X (vchod míří do směru (sin r, cos r) v osách x, z).
import type {
  ChurchDims,
  ChurchType,
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
  /** Opevnění: klády celé stavby (fortifications.md – Cena a stavba). */
  logs?: number;
  /** Opevnění: kámen celé stavby v m³ (fortifications.md – Hradby a obrana, Cena). */
  stoneM3?: number;
  /** Opevnění: kolik lidí se vejde do útočiště (fortifications.md – Útočiště). */
  refuge?: number;
  /** Kostel: pálené vápno (t) a písek (m³) celé stavby (churches.md – Velikost a cena). */
  limeT?: number;
  sandM3?: number;
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
  /**
   * Náhled obrysu (opevnění – fortifications.md, Rozhraní): uzavřené čáry vnějšího okraje a pásu
   * a krátké úsečky bran, které scéna kreslí čarou nad čtverci.
   */
  outline?: readonly (readonly (readonly [number, number])[])[];
  gates?: readonly (readonly (readonly [number, number])[])[];
  /** Místo problému (zatarasená branka, stavba, voda) – scéna kreslí červenou čarou. */
  problem?: readonly (readonly (readonly [number, number])[])[];
}

/**
 * Náhled obvodu opevnění z bodů (fortifications.md – Obvod, Rozhraní): kontrola, cena a čáry –
 * obrys pásu, brány na cestách a místo problému (červeně).
 */
export type FortPointsPreview = Omit<SquaresPreview, 'blockedCells' | 'warningCells'>;

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
      /**
       * Obvod opevnění z bodů (fortifications.md – Obvod): hra obvod navrhne u prvního bodu
       * kurzoru (`propose`), hráč body táhne, klik na obvod přidá bod, Ctrl + klik ubere.
       */
      kind: 'fort-points';
      /** Druh opevnění z rozcestníku (plot, palisáda, val). */
      variant: SquaresVariant;
      /** Šířka pásu druhu (m) – klik do ní od vnějšího okraje přidá bod. */
      bandM: number;
      propose(at: readonly [number, number]): readonly (readonly [number, number])[];
      preview(points: readonly (readonly [number, number])[]): FortPointsPreview;
      /**
       * Trasa úseku jinudy (demolition.md – Rozhodnutí): body jsou otevřená trasa, první a poslední
       * leží pevně v okrajích bran – nejdou táhnout ani ubrat, bod přibude jen mezi ně.
       */
      fixedEnds?: true;
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
    }
  | {
      /** Lom (fortifications.md – Kámen) – značka u kurzoru, jen na skalním výchozu. */
      kind: 'quarry';
      check(position: Position): PlacementCheck & { cost?: PlacementCost | null };
    }
  | {
      /**
       * Kostel (churches.md – Stavba): průhledný model a obrys hřbitůvku u kurzoru, kněžištěm na
       * východ; tah od vstupu ke kněžišti určí délku lodi (rotunda průměr) a osu po 15°. Šířka
       * a výška tlačítky +/− v panelu u potvrzení (`ChurchPlacer.setDims`).
       */
      kind: 'church';
      type: ChurchType;
      /** Rozměry, se kterými umisťování začne (`defaultChurchDims`). */
      dims: ChurchDims;
      check(dims: ChurchDims, position: Position): PlacementCheck & { cost?: PlacementCost | null };
    };

/**
 * Potvrzené umístění – scéna ho ohlásí jen tehdy, když kontrola prošla. Obydlí na pozemku nese
 * i pozemek (`plot`) – `position` je pak poloha domu na něm.
 */
export type PlacementResult =
  | { kind: 'dwelling'; type: DwellingType; position: Position; plot?: DwellingPlot }
  | { kind: 'squares'; cells: TileCell[]; grid?: SquareGrid; variant?: string }
  | { kind: 'sacred'; type: SacredBuildingKind; position: Position }
  | { kind: 'fort-points'; points: [number, number][]; variant: string }
  | { kind: 'workshop'; craft: Craft; position: Position }
  | { kind: 'threshing-floor'; position: Position }
  | { kind: 'quarry'; position: Position }
  | { kind: 'church'; type: ChurchType; dims: ChurchDims; position: Position };

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
  /** Rozměry u kurzoru – jen čísla (kostel „Ø 6,5 × 6 m“); bez údaje žádné. */
  measure?: string;
  /**
   * Kostel v náhledu (churches.md – Stavba): typ, rozměry a jestli už stojí na místě (po kliku
   * nebo tahu – pak jde potvrdit a měnit +/−); bez údaje se neumisťuje kostel.
   */
  church?: { type: ChurchType; dims: ChurchDims; pinned: boolean };
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
