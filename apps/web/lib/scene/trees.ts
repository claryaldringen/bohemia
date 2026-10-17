import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { applyGammaFog } from './gamma-fog';
import { TREE_MODELS, type TreePlacement } from './tree-placement';

/**
 * Tón a jas 3D stromů okraje – laděné tak, aby splynuly s impostory vnitřku lesa (vyrenderovanými
 * v Blenderu s rozptýleným světlem): tlumené směrové světlo, světlo prosvítající korunou, žádný
 * odlesk oblohy. Smrky jsou v atlasu posunuté do modrozelena (hnědé větvičky v textuře) – 3D smrky
 * stejně.
 */
const FOLIAGE_TINT = new Color3(0.86, 0.9, 0.82);
const SPRUCE_TINT = new Color3(0.8, 1.45, 1.0);
/** Jilmy a topoly mají v textuře bledé, šedavé listí – dorovnání do zeleně dubů. */
const PALE_TINT = new Color3(0.66, 0.84, 0.44);
const FOLIAGE_AMBIENT = new Color3(0.36, 0.38, 0.34);

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
        material.albedoColor = model.startsWith('spruce')
          ? SPRUCE_TINT
          : model.startsWith('elm') || model.startsWith('poplar')
            ? PALE_TINT
            : FOLIAGE_TINT;
        material.roughness = 1;
        // Bez odlesku: odraz světlé oblohy na kartách listí dělal z dálky stromy bledé a modravé.
        material.metallicF0Factor = 0;
        material.ambientColor = FOLIAGE_AMBIENT;
        // Méně směrového světla – při natočení kamery proti slunci okraj nezsvětlí oproti vnitřku.
        material.directIntensity = 0.7;
        // Nízký práh alfy: v mipmapách z dálky alfa listí klesá a koruny by prořídly – skrz ně
        // by prosvítala světlá tráva a okraj lesa by z dálky vypadal jako bledý lem.
        material.alphaCutOff = 0.15;
        // Karty větví jsou často skoro z boku – bez anizotropie se textura rozmaže do šeda.
        if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
        // Opar v gama prostoru jako u terénu a impostorů (vestavěný opar PBR zešedí zeleň).
        applyGammaFog(material);
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
