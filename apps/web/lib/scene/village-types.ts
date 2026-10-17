// Typy vsi pro scénu a rozhraní hry (docs/superpowers/plans/2026-10-17-village-slice.md).
// Bez Babylonu – importovat je smí i React komponenty. DwellingType, Position, PartStage
// a PlacementCheck odpovídají typům herního jádra (packages/game/src/domain/village).

export type DwellingType = 'zemnice' | 'polozemnice';

/**
 * Umístění obydlí ve světě scény (m, střed krajiny v 0,0; políčka podle `tileCenter`).
 * `rotation` = natočení kolem svislé osy v radiánech jako `mesh.rotation.y` v Babylonu:
 * 0 = vchod míří do +Z, π/2 do +X (vchod míří do směru (sin r, cos r) v osách x, z).
 */
export interface Position {
  x: number;
  z: number;
  rotation: number;
}

export type PartStage =
  'founding' | 'ready' | 'sown' | 'young-fallow' | 'meadow' | 'young-growth' | 'shrub' | 'forest';

/** Výsledek kontroly umístění; `reason` česky pro hráče, když `ok` neplatí. */
export interface PlacementCheck {
  ok: boolean;
  reason: string | null;
}

export interface SceneDwelling {
  id: number;
  type: DwellingType;
  position: Position;
  /** false = staveniště; jeho vzhled ukazuje `progress` (0–1). */
  built: boolean;
  progress: number;
  /** Obývané obydlí – jen z něj občas stoupá dým. Bez údaje se bere jako obývané. */
  inhabited?: boolean;
}

export interface SceneFieldPart {
  /** Střed políčka (m) – díl je průnik obrysu pole s tímto čtvercem. */
  x: number;
  z: number;
  /** Strana políčka (m), v prototypu 15. */
  size: number;
  stage: PartStage;
}

export interface SceneField {
  id: number;
  /** Obrys pole [x, z] (m) tak, jak ho hráč nakreslil. */
  outline: [number, number][];
  parts: SceneFieldPart[];
}

export interface SceneVillage {
  dwellings: SceneDwelling[];
  fields: SceneField[];
}

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
