import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { TREE_SPECIES, type TreePlacement, type TreeSpecies } from './tree-placement';

/** Modely Kenney mají výšku 1,2–1,7 jednotky – ve scéně stromy ≈ 10–17 m. */
const BASE_SCALE: Record<TreeSpecies, number> = {
  'deciduous-1': 10,
  'deciduous-2': 8,
  'conifer-1': 9.5,
  'conifer-2': 9,
};
// Původní barvy sady jsou tyrkysové – středoevropský les je zelenější a tmavší.
const DECIDUOUS_LEAVES = new Color3(0.27, 0.45, 0.16);
const CONIFER_NEEDLES = new Color3(0.13, 0.29, 0.15);
const BARK = new Color3(0.36, 0.25, 0.16);

/**
 * Les z instancí modelů – jeden mesh na druh. Když se model nenačte, les zůstane bez stromů
 * (zaloguje se varování), krajina se zobrazí dál.
 */
export async function addTrees(
  scene: Scene,
  placements: readonly TreePlacement[],
  options: { baseUrl: string; groundHeight: (worldX: number, worldZ: number) => number },
): Promise<void> {
  const results = await Promise.allSettled(
    TREE_SPECIES.map(async (species) => {
      const trees = placements.filter((tree) => tree.species === species);
      if (trees.length === 0) return;
      const container = await LoadAssetContainerAsync(`${options.baseUrl}${species}.glb`, scene);
      if (scene.isDisposed) return;
      container.addAllToScene();
      for (const material of container.materials) recolor(material, species);

      const parts = container.meshes.filter(
        (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
      );
      const tree = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
      for (const mesh of container.meshes) if (mesh !== tree && !mesh.isDisposed()) mesh.dispose();
      if (!tree) return;
      tree.name = `trees-${species}`;
      tree.isPickable = false;

      const matrices = new Float32Array(trees.length * 16);
      const matrix = new Matrix();
      trees.forEach((t, i) => {
        const size = BASE_SCALE[species] * t.scale;
        Matrix.ComposeToRef(
          new Vector3(size, size, size),
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

function recolor(material: Material, species: TreeSpecies): void {
  if (!(material instanceof PBRMaterial)) return;
  if (material.name.startsWith('leafs')) {
    material.albedoColor = species.startsWith('conifer') ? CONIFER_NEEDLES : DECIDUOUS_LEAVES;
  } else if (material.name.startsWith('wood')) {
    material.albedoColor = BARK;
  }
  material.metallic = 0;
  material.roughness = 1;
}
