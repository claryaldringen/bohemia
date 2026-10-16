import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { Material } from '@babylonjs/core/Materials/material';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

export interface ModelInstance {
  x: number;
  /** Výška paty modelu ve scéně (už s převýšením). */
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

/**
 * Načte GLB, spojí jeho části do jednoho meshe a vykreslí ho v instancích (thin instances –
 * jeden draw call na materiál). Když se scéna mezitím zruší, vrátí null. Chybu načtení
 * propustí volajícímu.
 */
export async function addInstancedModel(
  scene: Scene,
  url: string,
  name: string,
  instances: readonly ModelInstance[],
  prepareMaterial?: (material: Material) => void,
): Promise<Mesh | null> {
  if (instances.length === 0) return null;
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) return null;
  container.addAllToScene();
  if (prepareMaterial) for (const material of container.materials) prepareMaterial(material);

  const parts = container.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
  );
  const model = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  for (const mesh of container.meshes) if (mesh !== model && !mesh.isDisposed()) mesh.dispose();
  if (!model) return null;
  model.name = name;
  model.isPickable = false;

  const matrices = new Float32Array(instances.length * 16);
  const matrix = new Matrix();
  instances.forEach((instance, i) => {
    Matrix.ComposeToRef(
      new Vector3(instance.scale, instance.scale, instance.scale),
      Quaternion.RotationAxis(Vector3.Up(), instance.rotationY),
      new Vector3(instance.x, instance.y, instance.z),
      matrix,
    );
    matrix.copyToArray(matrices, i * 16);
  });
  model.thinInstanceSetBuffer('matrix', matrices, 16, true);
  return model;
}
