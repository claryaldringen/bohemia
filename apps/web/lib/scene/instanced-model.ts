import '@babylonjs/core/Meshes/thinInstanceMesh';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Material } from '@babylonjs/core/Materials/material';
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
  /** Naklonění: svislá osa modelu míří sem (jednotkový vektor), jinak stojí svisle. */
  up?: { x: number; y: number; z: number };
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
  const model = await loadMergedModel(scene, url, name, prepareMaterial);
  if (!model) return null;
  setStaticInstances(model, instanceMatrices(instances));
  return model;
}

/** Původní matice instancí nehybných meshů (stromy, dekorace) – pro skrývání pod vsí. */
const staticInstances = new WeakMap<Mesh, Float32Array>();

/** Nastaví meshi nehybné instance a zapamatuje si jejich matice (Babylon drží stejné pole). */
export function setStaticInstances(mesh: Mesh, matrices: Float32Array): void {
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  staticInstances.set(mesh, matrices);
}

/** Matice instancí z `setStaticInstances`, nebo undefined. */
export function staticInstanceMatrices(mesh: Mesh): Float32Array | undefined {
  return staticInstances.get(mesh);
}

/**
 * Načte GLB a spojí jeho části do jednoho meshe (bez instancí – ty nastaví volající, nebo se
 * mesh použije jako předloha). Když se scéna mezitím zruší, vrátí null.
 */
export async function loadMergedModel(
  scene: Scene,
  url: string,
  name: string,
  prepareMaterial?: (material: Material) => void,
): Promise<Mesh | null> {
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
  // Loader glTF převrací osu Z zrcadlením kořenového uzlu a ořez stěn se podle něj otočí sám;
  // spojení meshů zrcadlení zapeče do vrcholů, takže by se u neprůhledných modelů (kameny)
  // ořezávaly přední stěny a zbyla by dutá skořápka. Oboustranné listí to nepotřebuje.
  for (const material of container.materials) {
    if (material.backFaceCulling)
      material.sideOrientation = Material.CounterClockWiseSideOrientation;
  }
  model.name = name;
  model.isPickable = false;
  return model;
}

/** Matice instancí pro `thinInstanceSetBuffer('matrix', …)`. */
export function instanceMatrices(instances: readonly ModelInstance[]): Float32Array {
  const matrices = new Float32Array(instances.length * 16);
  const matrix = new Matrix();
  const tilt = new Quaternion();
  instances.forEach((instance, i) => {
    let rotation = Quaternion.RotationAxis(Vector3.Up(), instance.rotationY);
    if (instance.up) {
      const { x, y, z } = instance.up;
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), new Vector3(x, y, z), tilt);
      rotation = tilt.multiply(rotation);
    }
    Matrix.ComposeToRef(
      new Vector3(instance.scale, instance.scale, instance.scale),
      rotation,
      new Vector3(instance.x, instance.y, instance.z),
      matrix,
    );
    matrix.copyToArray(matrices, i * 16);
  });
  return matrices;
}
