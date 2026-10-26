import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneThreshingFloor } from '../village-view';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import type { HeightFn } from './ore-site-layout';
import { applySeasonRelief } from './season-materials';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import {
  STRAW_STACK,
  floorPoint,
  floorSiteLook,
  floorStakingLine,
  threshingFloorGeometry,
  threshingFloorsKey,
} from './threshing-floor-layout';

// Humna ve scéně kromě obtisku mlatu (village-renderer.ts): kolíky a provázek vytyčení, hromady
// drnů a hlíny na staveništi, rozprostřené klasy a hromádka zrna (jedna síť s barvami vrcholů –
// threshing-floor-layout.ts) a stoh slámy – kupka z models/fields/haystack.glb do zlata, v instancích
// pro všechna humna. Přestaví se jen při změně, kterou je vidět (`threshingFloorsKey`).

const HAYSTACK_URL = '/models/fields/haystack.glb';
/** Sláma je světlejší a zlatější než seno (HAY_TINT ve field-renderer.ts). */
const STRAW_TINT = new Color3(0.95, 0.82, 0.5);
/** Pata stohu je o kousek zapuštěná – na svahu nevisí (m). */
const SINK_M = 0.06;

export class ThreshingFloorRenderer {
  private key = '';
  private floors: readonly SceneThreshingFloor[] = [];
  private mesh: Mesh | null = null;
  private material: StandardMaterial | null = null;
  private string: Mesh | null = null;
  private stringMaterial: Material | null = null;
  private stack: Mesh | null = null;
  private loading: Promise<void> | null = null;
  private readonly pegs: StakingPegs;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      groundHeight: HeightFn;
      decalHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      onAsyncChange(): void;
      prepareMaterial(material: Material): void;
    },
  ) {
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
  }

  /** Překreslí humna, když se změnilo, co je vidět; vrátí true při změně. */
  update(floors: readonly SceneThreshingFloor[]): boolean {
    const key = threshingFloorsKey(floors);
    if (key === this.key) return false;
    this.key = key;
    this.floors = floors;
    this.mesh?.dispose();
    this.mesh = null;
    this.string?.dispose();
    this.string = null;
    const geometry = threshingFloorGeometry(floors, this.context.decalHeight);
    if (geometry.indices.length > 0) this.mesh = this.heapMesh(geometry);
    const staking = floors
      .filter((f) => floorSiteLook(f).staking)
      .map((f) => floorStakingLine(f.position));
    if (staking.length > 0) {
      this.stringMaterial ??= createStringMaterial(this.scene);
      this.string = createStringMesh(
        this.scene,
        'village-threshing-staking',
        staking,
        this.context.groundHeight,
        this.stringMaterial,
      );
    }
    this.pegs.set(staking.length > 0 ? pegInstances(staking, this.context.groundHeight) : []);
    if (floors.some((f) => (f.straw ?? 0) > 0)) void this.load();
    this.updateStacks();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.mesh?.dispose();
    this.material?.dispose();
    this.string?.dispose();
    this.stringMaterial?.dispose();
    this.stack?.dispose();
    this.pegs.dispose();
  }

  private heapMesh(geometry: ReturnType<typeof threshingFloorGeometry>): Mesh {
    const data = new VertexData();
    data.positions = geometry.positions;
    data.indices = geometry.indices;
    const colors: number[] = [];
    for (let i = 0; i < geometry.colors.length; i += 3) {
      colors.push(geometry.colors[i]!, geometry.colors[i + 1]!, geometry.colors[i + 2]!, 1);
    }
    data.colors = colors;
    const normals: number[] = [];
    VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
    data.normals = normals;
    const mesh = new Mesh('village-threshing-heaps', this.scene);
    data.applyToMesh(mesh);
    if (!this.material) {
      const m = new StandardMaterial('village-threshing-heaps', this.scene);
      m.specularColor = Color3.Black();
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      applySeasonRelief(m);
      this.material = m;
    }
    mesh.material = this.material;
    mesh.isPickable = false;
    // nízké hromady stín nevrhají – síť se přestavuje a vrhač by zůstal v seznamu stínů
    mesh.receiveShadows = true;
    return mesh;
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const mesh = await loadMergedModel(this.scene, HAYSTACK_URL, 'threshing-straw', (m) => {
          this.context.prepareMaterial(m);
          if (m instanceof PBRMaterial) m.albedoColor = STRAW_TINT;
        });
        if (!mesh) return;
        if (this.disposed) {
          mesh.dispose();
          return;
        }
        mesh.setEnabled(false);
        mesh.receiveShadows = true;
        this.context.addShadowCaster(mesh);
        this.stack = mesh;
        this.updateStacks();
        this.context.onAsyncChange();
      } catch (error) {
        console.warn('Stoh slámy se nepodařilo načíst.', error);
      }
    })();
    return this.loading;
  }

  /** Stohy slámy hotových humen – měřítko kupky podle `straw` (nižší a užší, když ubývá). */
  private updateStacks(): void {
    if (!this.stack) return;
    const instances: ModelInstance[] = [];
    for (const f of this.floors) {
      const straw = f.built ? (f.straw ?? 0) : 0;
      if (straw <= 0) continue;
      const at = floorPoint(f.position, STRAW_STACK.lx, STRAW_STACK.lz);
      instances.push({
        x: at.x,
        y: this.context.groundHeight(at.x, at.z) - SINK_M,
        z: at.z,
        rotationY: f.position.rotation,
        scale: STRAW_STACK.scale * (0.55 + 0.45 * straw),
        scaleY: STRAW_STACK.scale * (0.3 + 0.7 * straw),
      });
    }
    if (instances.length === 0) {
      this.stack.setEnabled(false);
      return;
    }
    this.stack.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
    this.stack.setEnabled(true);
  }
}
