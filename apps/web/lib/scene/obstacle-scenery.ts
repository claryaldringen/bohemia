import {
  OBSTACLE_LOOKS,
  TREE_LOOKS,
  type DecorObstacleLook,
  type ObstacleLayer,
  type TreeLook,
} from '@bohemia/game';
import type { DecorPlacement } from './decor-placement';
import { IMPOSTOR_ATLAS } from './impostor-atlas';

// Stromy, keře a kameny ve scéně kreslí vrstva překážek z herního jádra (`obstaclesOf`) – tady
// se jen rozdělí podle toho, čím se kreslí: 3D modely stromů, impostory vnitřku lesa,
// dekorace (keře, kameny, skály, souše, padlé stromy, pařezy, vrby).

/** 3D model stromu – podoby stromů z vrstvy překážek. */
export type TreeModel = TreeLook;
export const TREE_MODELS: readonly TreeModel[] = TREE_LOOKS;

export interface TreePlacement {
  model: TreeModel;
  worldX: number;
  worldZ: number;
  rotationY: number;
  /** Násobek velikosti modelu. */
  scale: number;
  /** Id překážky ve vrstvě – podle něj se strom skryje, když ho ves vykácí. */
  id?: number;
}

export interface ImpostorPlacement {
  /** Id překážky ve vrstvě. */
  id: number;
  /** Index buňky v `IMPOSTOR_ATLAS.cells`. */
  cell: number;
  worldX: number;
  worldZ: number;
  /** Násobek velikosti stromu v atlasu. */
  scale: number;
  /** Zrcadlově převrácený obrázek – víc podob z jedné buňky. */
  mirror: boolean;
}

export interface ObstacleScenery {
  /** 3D stromy – okraj lesa, louky, břehy, borovice, mladé stromky. */
  trees: TreePlacement[];
  /** Vnitřek lesa z obrázků stromů. */
  impostors: ImpostorPlacement[];
  /** Keře, kameny, balvany, skalní výchozy, souše, padlé stromy, pařezy a vrby. */
  decor: DecorPlacement[];
}

const TREE_LOOK_SET = new Set<string>(TREE_LOOKS);

/** Buňky atlasu podle modelu stromu. */
const CELLS_BY_MODEL = (() => {
  const cells = new Map<TreeModel, number[]>();
  IMPOSTOR_ATLAS.cells.forEach((cell, i) => {
    cells.set(cell.model, [...(cells.get(cell.model) ?? []), i]);
  });
  return cells;
})();

/** Hash id překážky → číslo v [0, 1) – podoba impostoru je jen vzhled, ne herní data. */
function idHash(id: number, k: number): number {
  let h = Math.imul(id ^ Math.imul(k, 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Buňka atlasu a zrcadlení pro strom vnitřku lesa (deterministicky podle id). */
export function impostorLook(model: TreeModel, id: number): { cell: number; mirror: boolean } {
  const options = CELLS_BY_MODEL.get(model);
  if (!options) throw new Error(`Atlas impostorů nemá strom ${model}.`);
  return {
    cell: options[Math.floor(idHash(id, 1) * options.length)]!,
    mirror: idHash(id, 2) < 0.5,
  };
}

/** Vrstva překážek rozdělená podle způsobu kreslení. */
export function obstacleScenery(layer: ObstacleLayer): ObstacleScenery {
  const trees: TreePlacement[] = [];
  const impostors: ImpostorPlacement[] = [];
  const decor: DecorPlacement[] = [];
  for (let i = 0; i < layer.count; i++) {
    const look = OBSTACLE_LOOKS[layer.look[i]!]!;
    const id = layer.id[i]!;
    const worldX = layer.x[i]!;
    const worldZ = layer.z[i]!;
    const scale = layer.scale[i]!;
    if (layer.impostor[i]) {
      impostors.push({ id, worldX, worldZ, scale, ...impostorLook(look as TreeModel, id) });
    } else if (TREE_LOOK_SET.has(look)) {
      trees.push({
        id,
        model: look as TreeModel,
        worldX,
        worldZ,
        rotationY: layer.rotation[i]!,
        scale,
      });
    } else {
      decor.push({
        id,
        model: look as DecorObstacleLook,
        worldX,
        worldZ,
        rotationY: layer.rotation[i]!,
        scale,
      });
    }
  }
  return { trees, impostors, decor };
}
