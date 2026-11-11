import type { Craft, DwellingType, Position, SacredBuildingKind, SquareGrid } from '@bohemia/game';
import type { WebBuildKind } from '@/lib/build-items';
import type { CellSquare } from '@/lib/scene/field-cells';
import type { wholeTarget } from '@/lib/scene/village-picking';
import {
  scenePenSpecies,
  scenePenSquares,
  type ScenePlot,
  type SceneVillage,
} from '@/lib/village-view';

// Ves pro scénu a kontrolu umístění: stav ze serveru a staveniště, která čekají na odpověď
// serveru. Čisté funkce bez Reactu – používá je `VillageGame` a jeho hooky.

export const EMPTY_SCENE: SceneVillage = { dwellings: [], fields: [] };

/**
 * Obydlí, dílna, modla, svatyně nebo humno odeslané na server, na jehož odpověď se čeká – ve
 * scéně už stojí jako staveniště (záporné id). Obydlí na pozemku nese i pozemek, dílna řemeslo.
 */
export type PendingSite =
  | {
      kind: 'dwelling';
      id: number;
      type: DwellingType;
      position: Position;
      plot?: ScenePlot;
      craft?: Craft;
    }
  | { kind: 'sacred'; id: number; type: SacredBuildingKind; position: Position }
  | { kind: 'threshing-floor'; id: number; position: Position };

/** Ves pro scénu: stav ze serveru a stavby, které ještě čekají na odpověď serveru. */
export function withPending(scene: SceneVillage, pending: readonly PendingSite[]): SceneVillage {
  if (pending.length === 0) return scene;
  const dwellings = pending.flatMap((d) =>
    d.kind === 'dwelling'
      ? [
          {
            id: d.id,
            type: d.type,
            position: d.position,
            ...(d.plot ? { plot: d.plot } : {}),
            ...(d.craft ? { craft: d.craft } : {}),
            built: false,
            progress: 0,
            inhabited: false,
          },
        ]
      : [],
  );
  const sacred = pending.flatMap((d) =>
    d.kind === 'sacred'
      ? [{ id: d.id, kind: d.type, position: d.position, built: false, progress: 0 }]
      : [],
  );
  const floors = pending.flatMap((d) =>
    d.kind === 'threshing-floor'
      ? [{ id: d.id, position: d.position, built: false, progress: 0 }]
      : [],
  );
  return {
    ...scene,
    dwellings: [...scene.dwellings, ...dwellings],
    ...(floors.length > 0
      ? { threshingFloors: [...(scene.threshingFloors ?? []), ...floors] }
      : {}),
    ...(sacred.length > 0
      ? {
          sacred: {
            oaks: scene.sacred?.oaks ?? [],
            groves: scene.sacred?.groves ?? [],
            buildings: [...(scene.sacred?.buildings ?? []), ...sacred],
          },
        }
      : {}),
  };
}

/**
 * Stavby po čtvercích daného druhu ve scéně s mřížkou a čtverci – malování se chytí jejich
 * mřížky (rozšíření natočeného pole – fields.md, Natočené stavby).
 */
export function squareStructures(
  scene: SceneVillage | null,
  kind: WebBuildKind,
  variant?: string,
): { id: number; grid?: SquareGrid; squares: readonly CellSquare[] }[] {
  if (!scene) return [];
  if (kind === 'field') {
    return scene.fields.map((f) => ({
      id: f.id,
      ...(f.grid ? { grid: f.grid } : {}),
      squares: f.parts,
    }));
  }
  if (kind === 'orchard') {
    return (scene.orchards ?? []).map((o) => ({
      id: o.id,
      ...(o.grid ? { grid: o.grid } : {}),
      squares: o.squares,
    }));
  }
  if (kind === 'cemetery') {
    return (scene.cemeteries ?? []).map((c) => ({
      id: c.id,
      ...(c.grid ? { grid: c.grid } : {}),
      squares: c.squares,
    }));
  }
  if (kind === 'pen') {
    // ohrada se chytí mřížky ohrady téhož druhu – rozšíření jako u hřbitova (oxen.md – Ohrady
    // podle druhu); bez druhu (výběr stavby) všechny ohrady
    return (scene.pens ?? [])
      .filter((p) => variant === undefined || scenePenSpecies(p) === variant)
      .map((p) => ({
        id: p.id,
        ...(p.grid ? { grid: p.grid } : {}),
        squares: scenePenSquares(p),
      }));
  }
  return [];
}

/** Je ve vsi `scene` vybraná ohrada druhu `variant`? Pak stavba téhož druhu ohradu rozšiřuje. */
export function extendsSelectedPen(
  scene: SceneVillage | null,
  chosen: ReturnType<typeof wholeTarget> | null | undefined,
  variant: string | undefined,
): boolean {
  if (!chosen || chosen.kind !== 'pen' || !('id' in chosen) || variant === undefined) {
    return false;
  }
  return squareStructures(scene, 'pen', variant).some((s) => s.id === chosen.id);
}
