// Rozhraní scény vsi pro React (docs/superpowers/plans/2026-10-17-village-slice.md). Bez
// Babylonu – importovat ho smí i komponenty. Doménové typy (DwellingType, Position, PartStage,
// PlacementCheck) jsou z herního jádra, ves pro scénu (SceneVillage) z lib/village-view.ts –
// tady jen jejich části a typy umisťování.
//
// Position.rotation = natočení kolem svislé osy v radiánech jako `mesh.rotation.y` v Babylonu:
// 0 = vchod míří do +Z, π/2 do +X (vchod míří do směru (sin r, cos r) v osách x, z).
import type { DwellingType, PlacementCheck, Position, TileCell } from '@bohemia/game';
import type { SceneVillage } from '../village-view';

/**
 * Obydlí ve scéně; `built: false` = staveniště, jeho vzhled ukazuje `progress` (0–1).
 * `inhabited` – jen z obývaného obydlí občas stoupá dým; bez údaje se bere jako obývané.
 */
export type SceneDwelling = SceneVillage['dwellings'][number];

/** Pole ve scéně – díly po čtvercích (políčkách krajiny). */
export type SceneField = SceneVillage['fields'][number];

/** Díl pole – políčko, jeho střed (m), strana políčka a stadium; díl = celé políčko. */
export type SceneFieldPart = SceneField['parts'][number];

/**
 * Náhled stavby malované po čtvercích (pole, později sad, hřbitov): kontrola, popisek
 * a zakázané čtverce.
 */
export interface SquaresPreview {
  check: PlacementCheck;
  label: string;
  /** Čtverce, kam pole nesmí – scéna je zbarví červeně. */
  blockedCells: readonly TileCell[];
  /** Čtverce, kterých se týká varování (`check.warning`) – scéna je zbarví oranžově. */
  warningCells?: readonly TileCell[];
}

/**
 * Co hráč právě umisťuje a jak scéna ověří, jestli to jde: obydlí půdorysem (duch u kurzoru),
 * nebo stavbu po čtvercích políček (pole a další stavby malované jako pole).
 */
export type PlacementMode =
  | { kind: 'dwelling'; type: DwellingType; check(position: Position): PlacementCheck }
  | { kind: 'squares'; preview(cells: TileCell[]): SquaresPreview };

/** Potvrzené umístění – scéna ho ohlásí jen tehdy, když kontrola prošla. */
export type PlacementResult =
  | { kind: 'dwelling'; type: DwellingType; position: Position }
  | { kind: 'squares'; cells: TileCell[] };

/**
 * Průběžný stav umisťování pro rozhraní: kontrola, popisek (u pole výměra a cena z `preview`,
 * u obydlí důvod nebo název) a kurzor v pixelech plátna (kam dát bublinu), nebo null mimo
 * krajinu.
 */
export interface PlacementPreview {
  check: PlacementCheck;
  label: string;
  screen: { x: number; y: number } | null;
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
