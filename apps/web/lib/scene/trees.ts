import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { TREE_MODELS, type TreePlacement } from './tree-placement';

/**
 * Zesvětlení a tón modelů: textury jehličí jsou tmavé s hnědými větvičkami a karty se navzájem
 * stíní – smrky se zesvětlí víc a posunou do modrozelena.
 */
const SPRUCE_TINT = new Color3(1.25, 1.6, 1.4);
const BROADLEAF_TINT = new Color3(1.1, 1.1, 1.1);

/**
 * Les z instancí modelů – jeden mesh na model. Modely jsou v metrech s kořenem u paty kmene.
 * Když se model nenačte, les zůstane bez stromů (zaloguje se varování), krajina se zobrazí dál.
 */
export async function addTrees(
  scene: Scene,
  placements: readonly TreePlacement[],
  options: { baseUrl: string; groundHeight: (worldX: number, worldZ: number) => number },
): Promise<void> {
  const results = await Promise.allSettled(
    TREE_MODELS.map(async (model) => {
      const trees = placements.filter((tree) => tree.model === model);
      if (trees.length === 0) return;
      const container = await LoadAssetContainerAsync(`${options.baseUrl}${model}.glb`, scene);
      if (scene.isDisposed) return;
      container.addAllToScene();
      for (const material of container.materials) {
        if (!(material instanceof PBRMaterial)) continue;
        material.albedoColor = model.startsWith('spruce') ? SPRUCE_TINT : BROADLEAF_TINT;
        material.roughness = 1;
      }

      const parts = container.meshes.filter(
        (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
      );
      const tree = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
      for (const mesh of container.meshes) if (mesh !== tree && !mesh.isDisposed()) mesh.dispose();
      if (!tree) return;
      tree.name = `trees-${model}`;
      tree.isPickable = false;

      const matrices = new Float32Array(trees.length * 16);
      const matrix = new Matrix();
      trees.forEach((t, i) => {
        Matrix.ComposeToRef(
          new Vector3(t.scale, t.scale, t.scale),
          Quaternion.RotationAxis(Vector3.Up(), t.rotationY),
          new Vector3(t.worldX, options.groundHeight(t.worldX, t.worldZ), t.worldZ),
          matrix,
        );
        matrix.copyToArray(matrices, i * 16);
      });
      tree.thinInstanceSetBuffer('matrix', matrices, 16, true);
    }),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Model stromu se nepodařilo načíst – les zůstane bez stromů.', result.reason);
    }
  }
}
