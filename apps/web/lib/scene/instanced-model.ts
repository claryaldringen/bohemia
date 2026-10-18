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
  /** Id překážky ve vrstvě překážek – podle něj se instance skryje (vykácený strom…). */
  id?: number;
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
  setStaticInstances(model, instanceMatrices(instances), { ids: instanceIds(instances) });
  return model;
}

/** Nehybné instance meshe: matice (16 čísel na instanci) a k nim id překážek a barvy. */
export interface StaticInstances {
  matrices: Float32Array;
  /** Id překážky u každé instance – jen když ho mají všechny (stromy a kameny krajiny). */
  ids?: Uint32Array;
  /** Barva instance (4 čísla) – impostory. */
  colors?: Float32Array;
}

/** Původní instance nehybných meshů (stromy, dekorace) – pro skrývání pod vsí a kácení. */
const staticInstances = new WeakMap<Mesh, StaticInstances>();

/** Nastaví meshi nehybné instance a zapamatuje si je (Babylon drží stejná pole). */
export function setStaticInstances(
  mesh: Mesh,
  matrices: Float32Array,
  extra: { ids?: Uint32Array; colors?: Float32Array } = {},
): void {
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  if (extra.colors) mesh.thinInstanceSetBuffer('color', extra.colors, 4, true);
  staticInstances.set(mesh, { matrices, ...extra });
}

/** Instance z `setStaticInstances`, nebo undefined. */
export function staticInstancesOf(mesh: Mesh): StaticInstances | undefined {
  return staticInstances.get(mesh);
}

/** Id překážek instancí – jen když je mají všechny instance, jinak undefined. */
export function instanceIds(instances: readonly { id?: number }[]): Uint32Array | undefined {
  if (instances.length === 0 || instances.some((i) => i.id === undefined)) return undefined;
  return Uint32Array.from(instances, (i) => i.id!);
}

/**
 * Načte GLB a spojí jeho části do jednoho meshe (bez instancí – ty nastaví volající, nebo se
 * mesh použije jako předloha). Když se scéna mezitím zruší, vrátí null. Jen pro GLB s jedním
 * meshem (nebo jedním materiálem a stejným ořezem stěn) – víc meshů se spojením pokazí ořez
 * stěn, takové GLB načíst po dílech (`loadModelParts`).
 */
export async function loadMergedModel(
  scene: Scene,
  url: string,
  name: string,
  prepareMaterial?: (material: Material) => void,
): Promise<Mesh | null> {
  return (await loadMergedModelWithNodes(scene, url, name, prepareMaterial))?.model ?? null;
}

/**
 * Jako `loadMergedModel`, ale vrátí i polohy prázdných uzlů GLB (body, např. ohniště svatyně)
 * v souřadnicích modelu ve scéně – s převodem os z glTF jako vrcholy spojeného meshe.
 */
export async function loadMergedModelWithNodes(
  scene: Scene,
  url: string,
  name: string,
  prepareMaterial?: (material: Material) => void,
): Promise<{ model: Mesh; nodes: Map<string, Vector3> } | null> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) return null;
  container.addAllToScene();
  if (prepareMaterial) for (const material of container.materials) prepareMaterial(material);

  // prázdné uzly (bez geometrie) – poloha i s převodem os kořene glTF
  const nodes = new Map<string, Vector3>();
  for (const node of container.transformNodes) {
    node.computeWorldMatrix(true);
    nodes.set(node.name, node.getAbsolutePosition().clone());
  }
  const parts = container.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
  );
  const model = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  for (const mesh of container.meshes) if (mesh !== model && !mesh.isDisposed()) mesh.dispose();
  for (const node of container.transformNodes) if (!node.isDisposed()) node.dispose();
  if (!model) return null;
  // Loader glTF převrací osu Z zrcadlením kořenového uzlu a ořez stěn se podle něj otočí sám;
  // spojení meshů zrcadlení zapeče do vrcholů, takže by se u neprůhledných modelů (kameny)
  // ořezávaly přední stěny a zbyla by dutá skořápka. Oboustranné listí to nepotřebuje.
  for (const material of container.materials) {
    if (material.backFaceCulling)
      material.sideOrientation = Material.CounterClockWiseSideOrientation;
  }
  // strana meshe pro případ, že loader materiál po načtení vrátí na výchozí (viz loadModelParts);
  // modely s víc materiály mají ořez nastavený na materiálech (ty mají přednost)
  model.sideOrientation = Material.CounterClockWiseSideOrientation;
  model.name = name;
  model.isPickable = false;
  return { model, nodes };
}

/**
 * Načte GLB s pojmenovanými díly (uzly) a každý díl vrátí jako samostatný mesh se zapečeným
 * převodem os z glTF (jako `loadMergedModel`, jen bez spojení dílů) – podle jména uzlu.
 * Když se scéna mezitím zruší, vrátí null.
 */
export async function loadModelParts(
  scene: Scene,
  url: string,
  prefix: string,
  prepareMaterial?: (material: Material) => void,
): Promise<Map<string, Mesh> | null> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) return null;
  container.addAllToScene();
  if (prepareMaterial) for (const material of container.materials) prepareMaterial(material);
  const parts = new Map<string, Mesh>();
  // kopie seznamu – zapečení zdrojový mesh zruší a ten ze seznamu kontejneru zmizí
  for (const mesh of [...container.meshes]) {
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) continue;
    // primitiva uzlu se jmenují „uzel_primitive0“ – díl = jméno uzlu
    const name = mesh.name.replace(/_primitive\d+$/, '');
    const baked = Mesh.MergeMeshes([mesh], true, true);
    if (!baked) continue;
    baked.name = `${prefix}${name}`;
    baked.isPickable = false;
    parts.set(name, baked);
  }
  // zbylé uzly (kořen s převodem os) – díly mají převod zapečený
  for (const mesh of [...container.meshes]) if (!mesh.isDisposed()) mesh.dispose();
  for (const material of container.materials) {
    if (material.backFaceCulling)
      material.sideOrientation = Material.CounterClockWiseSideOrientation;
  }
  // Ořez stěn i na meshi: materiál dílů s víc meshi loader glTF po načtení textur vrátí na
  // výchozí (sideOrientation null – platí pak strana meshe) a plochy obrácené jen na jednu
  // stranu (dno příkopu a plocha svatyně) by zmizely. Strana meshe platí, když ji materiál
  // neurčuje – u dílů, kde materiál CCW drží, se nic nemění.
  for (const mesh of parts.values())
    mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
  return parts;
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
