// Opevnění ve scéně (fortifications.md – Ve scéně): palisáda a brány v instancích dílů
// models/fortifications/fortifications.glb (tools/blender/fortifications.py) s ořezem po
// čtvercích (jména `fort-…` – CULLED_MESHES), polský plot jako pletený plot pozemků
// (WovenFenceRenderer), val s příkopem jako síť podél obvodu (rampart-mesh.ts) a prořez terénu
// pod příkopem (pit-cut.ts). Rozmístění počítá fortification-layout.ts; kreslí se jen při změně.
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneFortification } from '../fort-view';
import {
  crownLift,
  ditchCuts,
  fortFenceStage,
  fortGateInstances,
  palisadeLayout,
  type DitchCut,
  type FortInstance,
  type FortPart,
} from './fortification-layout';
import { loadModelParts, setStaticInstances } from './instanced-model';
import type { PitCuts } from './pit-cut';
import { rampartMeshData, trenchMeshData, type MeshArrays } from './rampart-mesh';
import { applySeasonGround } from './season-materials';
import type { HeightFn } from './village-meshes';
import type { WovenFenceRenderer } from './woven-fence-renderer';

export const FORTIFICATION_MODEL_URL = '/models/fortifications/fortifications.glb';
/** Předpona meshů dílů – ořez po čtvercích (`CULLED_MESHES` v scenery-culling.ts). */
export const FORT_MESH_PREFIX = 'fort-';

/** Co renderer opevnění potřebuje od scény vsi. */
export interface FortificationContext {
  /** Výška terénu s převýšením obtisků – paty kůlů, okraj valu. */
  decalHeight: HeightFn;
  addShadowCaster(mesh: Mesh): void;
  onAsyncChange(): void;
  /** Úprava materiálu dílů (opar, sníh) jako u obydlí. */
  prepareMaterial(material: Material): void;
  /** Sdílený pletený plot (pozemky, hřbitovy) – polský plot opevnění je tentýž. */
  fences: WovenFenceRenderer;
  pitCuts: PitCuts;
  /** Hlína stěn a dna (materiál jam obydlí – barvy nesou vrcholy). */
  earthMaterial(): Material;
}

/** Sítě jednoho opevnění: hlína a tráva valu, žlab staveniště. */
interface FortMeshes {
  key: string;
  meshes: Mesh[];
  instances: FortInstance[];
  cuts: DitchCut[];
}

const MATRIX = new Matrix();
const SCALE = new Vector3();
const POSITION = new Vector3();
const YAW = new Quaternion();
const LEAN = new Quaternion();
const ROTATION = new Quaternion();
const UP = new Vector3();

/** Matice instance dílu s patou ve výšce `y`: natočení, pak náklon a svislé měřítko. */
export function fortInstanceMatrix(inst: FortInstance, y: number, out: Matrix): Matrix {
  Quaternion.RotationAxisToRef(Vector3.UpReadOnly, inst.yaw, YAW);
  UP.set(inst.lean[0], 1, inst.lean[1]).normalize();
  Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, UP, LEAN);
  LEAN.multiplyToRef(YAW, ROTATION);
  SCALE.set(1, inst.scaleY, 1);
  POSITION.set(inst.x, y, inst.z);
  return Matrix.ComposeToRef(SCALE, ROTATION, POSITION, out);
}

export class FortificationRenderer {
  private readonly forts = new Map<number, FortMeshes>();
  private parts: Map<string, Mesh> | null = null;
  private loading: Promise<void> | null = null;
  private grass: Material | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: FortificationContext,
  ) {}

  /** Opevnění vsi; vrátí true, když se ve scéně něco změnilo. */
  update(forts: readonly SceneFortification[]): boolean {
    if (this.disposed) return false;
    let changed = false;
    const seen = new Set<number>();
    for (const fort of forts) {
      seen.add(fort.id);
      const key = JSON.stringify(fort);
      if (this.forts.get(fort.id)?.key === key) continue;
      this.drop(fort.id);
      this.forts.set(fort.id, this.build(fort, key));
      changed = true;
    }
    for (const id of [...this.forts.keys()]) {
      if (seen.has(id)) continue;
      this.drop(id);
      this.forts.delete(id);
      changed = true;
    }
    if (!changed) return false;
    this.context.fences.commit();
    const cuts = [...this.forts.values()].flatMap((f) => f.cuts);
    const focus = forts[0]?.outline[0];
    this.context.pitCuts.setDitches(cuts, focus ? { x: focus[0], z: focus[1] } : null);
    if ([...this.forts.values()].some((f) => f.instances.length > 0)) void this.load();
    this.applyInstances();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.forts.keys()]) this.drop(id);
    this.forts.clear();
    this.context.fences.commit();
    this.context.pitCuts.setDitches([]);
    for (const mesh of this.parts?.values() ?? []) mesh.dispose();
    this.grass?.dispose();
  }

  /** Rozmístění opevnění a jeho sítě (val, žlab); pletený plot jde do sdíleného rendereru. */
  private build(fort: SceneFortification, key: string): FortMeshes {
    const crown = crownLift(fort);
    const palisade = palisadeLayout(fort, crown);
    const instances = [...palisade.stakes, ...fortGateInstances(fort)];
    this.context.fences.set(fenceOwner(fort.id), fortFenceStage(fort, crown));
    const meshes: Mesh[] = [];
    const rim = this.context.decalHeight;
    if (fort.kind === 'rampart') {
      const data = rampartMeshData(fort, rim);
      const earth = this.mesh(
        `village-rampart-${fort.id}`,
        data.earth,
        this.context.earthMaterial(),
      );
      const grass = this.mesh(`village-rampart-grass-${fort.id}`, data.grass, this.grassMaterial());
      if (earth) meshes.push(earth);
      if (grass) meshes.push(grass);
    }
    if (palisade.trench.length > 0) {
      const trench = this.mesh(
        `village-fort-trench-${fort.id}`,
        trenchMeshData(palisade.trench, rim),
        this.context.earthMaterial(),
      );
      if (trench) meshes.push(trench);
    }
    return { key, meshes, instances, cuts: ditchCuts(fort) };
  }

  private drop(id: number): void {
    const known = this.forts.get(id);
    if (!known) return;
    for (const mesh of known.meshes) mesh.dispose();
    this.context.fences.set(fenceOwner(id), null);
  }

  private mesh(name: string, arrays: MeshArrays, material: Material): Mesh | null {
    if (arrays.indices.length === 0) return null;
    const data = new VertexData();
    data.positions = arrays.positions;
    data.colors = arrays.colors;
    data.uvs = arrays.uvs;
    data.indices = arrays.indices;
    let normals: number[] = [];
    VertexData.ComputeNormals(arrays.positions, arrays.indices, normals);
    // síť valu leží na zemi – normály nahoru (pořadí vrcholů záleží na směru obvodu)
    let up = 0;
    for (let i = 1; i < normals.length; i += 3) up += normals[i]!;
    if (up < 0) {
      const indices = arrays.indices.slice();
      for (let i = 0; i < indices.length; i += 3) {
        const b = indices[i + 1]!;
        indices[i + 1] = indices[i + 2]!;
        indices[i + 2] = b;
      }
      data.indices = indices;
      normals = [];
      VertexData.ComputeNormals(arrays.positions, indices, normals);
    }
    data.normals = normals;
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  /** Tráva valu – textura trávy z terénu, barvy nesou vrcholy, sníh a usychání jako terén. */
  private grassMaterial(): Material {
    if (this.grass) return this.grass;
    const material = new StandardMaterial('village-rampart-grass', this.scene);
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    const texture = new Texture('/textures/terrain/grass.jpg', this.scene);
    texture.anisotropicFilteringLevel = 8;
    if (!texture.isReady()) texture.onLoadObservable.addOnce(() => this.context.onAsyncChange());
    material.diffuseTexture = texture;
    applySeasonGround(material);
    this.grass = material;
    return material;
  }

  /** Přepíše instance dílů za všechna opevnění (nehybné instance s ořezem po čtvercích). */
  private applyInstances(): void {
    if (!this.parts) return;
    const byPart = new Map<FortPart, { matrices: number[]; colors: number[] }>();
    const height = this.context.decalHeight;
    for (const fort of this.forts.values()) {
      for (const inst of fort.instances) {
        let entry = byPart.get(inst.part);
        if (!entry) {
          entry = { matrices: [], colors: [] };
          byPart.set(inst.part, entry);
        }
        fortInstanceMatrix(inst, height(inst.x, inst.z) + inst.lift, MATRIX);
        const offset = entry.matrices.length;
        entry.matrices.length += 16;
        MATRIX.copyToArray(entry.matrices, offset);
        entry.colors.push(inst.color[0], inst.color[1], inst.color[2], 1);
      }
    }
    for (const [name, mesh] of this.parts) {
      const entry = byPart.get(name as FortPart);
      if (!entry || entry.matrices.length === 0) {
        mesh.setEnabled(false);
        continue;
      }
      setStaticInstances(mesh, Float32Array.from(entry.matrices), {
        colors: Float32Array.from(entry.colors),
      });
      mesh.setEnabled(true);
    }
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const parts = await loadModelParts(
          this.scene,
          FORTIFICATION_MODEL_URL,
          FORT_MESH_PREFIX,
          (m) => this.context.prepareMaterial(m),
        );
        if (!parts) return;
        if (this.disposed) {
          for (const mesh of parts.values()) mesh.dispose();
          return;
        }
        for (const mesh of parts.values()) {
          mesh.setEnabled(false);
          mesh.receiveShadows = true;
          this.context.addShadowCaster(mesh);
        }
        this.parts = parts;
        this.applyInstances();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Díly opevnění se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }
}

/** Vlastník pleteného plotu opevnění ve sdíleném rendereru plotů. */
function fenceOwner(id: number): string {
  return `fort-${id}`;
}
