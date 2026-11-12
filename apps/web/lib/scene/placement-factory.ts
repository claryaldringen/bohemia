import type { Scene } from '@babylonjs/core/scene';
import {
  GRID_TURNS,
  rotatedPlot,
  rotationTurn,
  type DwellingType,
  type Landscape,
} from '@bohemia/game';
import { ChurchPlacer } from './church-placer';
import { FieldPainter } from './field-painting';
import { FortPointsEditor } from './fort-points-editor';
import { tileAt, tileCenter } from './tile-at';
import { dwellingModel } from './village-construction';
import { PlacementController, type ActivePlacement } from './village-placement';
import type { VillageRenderer } from './village-renderer';
import type { PlacementHandlers, PlacementMode } from './village-types';

/** Co umisťování ze scény potřebuje (scéna je hotová – krajina, ves i kamera už jsou). */
export interface PlacementEnv {
  scene: Scene;
  canvas: HTMLCanvasElement;
  landscape: Landscape;
  village: VillageRenderer;
  /** Bod terénu pod pixelem plátna (scene-pointer.ts – pick po výškové síti). */
  pickGround: (x: number, y: number) => [number, number] | null;
  /** Natočení kamery – duch stavby se natáčí s ní. */
  cameraAlpha: () => number;
  /** Překreslit v příštím snímku (SceneLoop.requestRender). */
  requestRender: () => void;
}

/**
 * Umisťování podle druhu: body opevnění (FortPointsEditor), malování pole, sadu a hřbitova po
 * čtvercích (FieldPainter), jinak duch stavby pod kurzorem (PlacementController) – natočený
 * pozemek i výška paty podle druhu stavby jako na serveru.
 */
export function createPlacement(
  mode: PlacementMode,
  env: PlacementEnv,
  handlers: PlacementHandlers,
): ActivePlacement {
  const { scene, canvas, landscape, village, requestRender } = env;
  const pickGround = (x: number, y: number): [number, number] | null => env.pickGround(x, y);
  if (mode.kind === 'fort-points') {
    return new FortPointsEditor(
      {
        scene,
        canvas,
        pickGround,
        decalHeight: (x, z) => village.decalHeight(x, z),
        requestRender,
      },
      mode,
      handlers,
    );
  }
  if (mode.kind === 'church') {
    return new ChurchPlacer(
      {
        scene,
        canvas,
        pickGround,
        decalHeight: (x, z) => village.decalHeight(x, z),
        requestRender,
      },
      mode,
      handlers,
    );
  }
  if (mode.kind === 'squares') {
    return new FieldPainter(
      {
        scene,
        canvas,
        landscape,
        pickGround,
        decalHeight: (x, z) => village.decalHeight(x, z),
        requestRender,
      },
      mode,
      handlers,
    );
  }
  return new PlacementController(
    {
      scene,
      canvas,
      pickGround,
      decalHeight: (x, z) => village.decalHeight(x, z),
      cameraAlpha: env.cameraAlpha,
      cellAt: (x, z) => {
        const cell = tileAt(landscape, x, z);
        if (!cell) return null;
        const center = tileCenter(landscape, cell.x, cell.y);
        return { cell, x: center.worldX, z: center.worldZ, size: landscape.cellSizeM };
      },
      plotAt: (x, z, rotation, variant) => {
        // natočený pozemek (fields.md – Natočené stavby): po 90° políčko pod kurzorem,
        // jinak čtverec se středem pod kurzorem – v ukládané podobě jako na serveru
        let cx = x;
        let cz = z;
        if ((rotationTurn(rotation) ?? 0) % GRID_TURNS === 0) {
          const cell = tileAt(landscape, x, z);
          if (!cell) return null;
          const center = tileCenter(landscape, cell.x, cell.y);
          cx = center.worldX;
          cz = center.worldZ;
        }
        const plot = rotatedPlot(landscape, { x: cx, z: cz, rotation }, variant);
        if (!plot) return null;
        const size = landscape.cellSizeM;
        if (plot.square) return { plot, square: { ...plot.square, size } };
        const center = tileCenter(landscape, plot.cell.x, plot.cell.y);
        return { plot, square: { x: center.worldX, z: center.worldZ, size } };
      },
      // nadzemní dům a dvorec od roku 800 zatím model polozemnice a dvorce (`dwellingModel`)
      ghostModel: (type) =>
        village.ghostModel(type === 'srub' || type === 'dvorec-srub' ? dwellingModel(type) : type),
      baseHeight: (type, position) => {
        if (type === 'idol' || type === 'shrine') {
          return village.sacredBaseHeight(type, position);
        }
        // milíř uhlíře se měří u svého místa – `position` je poloha zemnice
        if (type === 'milir') return village.milirBaseHeight(position);
        const base = mode.kind === 'workshop' ? mode.type : null;
        return village.baseHeight({ type: base ?? (type as DwellingType), position });
      },
      requestRender,
    },
    mode,
    handlers,
  );
}
