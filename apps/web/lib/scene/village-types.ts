// Rozhraní scény vsi pro React (docs/superpowers/plans/2026-10-17-village-slice.md). Bez
// Babylonu – importovat ho smí i komponenty. Doménové typy (DwellingType, Position, PartStage,
// PlacementCheck) jsou z herního jádra, ves pro scénu (SceneVillage) z lib/village-view.ts –
// tady jen jejich části a typy umisťování.
//
// Position.rotation = natočení kolem svislé osy v radiánech jako `mesh.rotation.y` v Babylonu:
// 0 = vchod míří do +Z, π/2 do +X (vchod míří do směru (sin r, cos r) v osách x, z).
import type { DwellingType, PlacementCheck, Position } from '@bohemia/game';
import type { SceneVillage } from '../village-view';

/**
 * Obydlí ve scéně; `built: false` = staveniště, jeho vzhled ukazuje `progress` (0–1).
 * `inhabited` – jen z obývaného obydlí občas stoupá dým; bez údaje se bere jako obývané.
 */
export type SceneDwelling = SceneVillage['dwellings'][number];

/** Pole ve scéně – obrys [x, z] (m) tak, jak ho hráč nakreslil, a díly po políčkách. */
export type SceneField = SceneVillage['fields'][number];

/** Díl pole – střed políčka (m), strana políčka a stadium; díl = průnik obrysu s políčkem. */
export type SceneFieldPart = SceneField['parts'][number];

/** Co hráč právě umisťuje a jak scéna ověří, jestli to jde. */
export type PlacementMode =
  | { kind: 'dwelling'; type: DwellingType; check(position: Position): PlacementCheck }
  | {
      kind: 'field';
      preview(outline: [number, number][]): { check: PlacementCheck; label: string };
    };

/** Potvrzené umístění – scéna ho ohlásí jen tehdy, když kontrola prošla. */
export type PlacementResult =
  | { kind: 'dwelling'; type: DwellingType; position: Position }
  | { kind: 'field'; outline: [number, number][] };

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
  onConfirm(result: PlacementResult): void;
  onCancel(): void;
  /** Volitelné – změna kontroly / popisku během umisťování (null = kurzor mimo krajinu). */
  onPreview?(preview: PlacementPreview | null): void;
}
