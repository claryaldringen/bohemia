// Voli, telata ve výcviku a krávy v ohradách (docs/design/oxen.md – ve vsi i na /dev/buildings): vůl je
// model spřežení (models/plough/ox.glb – kostra, klip idle zapečený do VAT jako u lidí), kráva
// model stáda vsi (models/fauna/cow.glb – sklonění hlavy přechodem mezi pózami jako ve vsi).
// Kde stojí a co dělají, je čistá funkce času (pen-layout.ts – `penAnimalPose`); zvířata se
// hýbou jen v záběru. Pod každým měkký stín (statická stínová mapa pohyblivé věci nezachytí).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { loadGeometry, writeInstanceMatrix } from './fauna';
import { LivestockPlugin, standOnGround } from './livestock';
import { penAnimalPose, type PenAnimal } from './pen-layout';
import { TEAM_SCALE } from './plough-team';
import {
  OX_LOOKS,
  createBakedFigure,
  createBlobShadow,
  writeFigure,
  type BakedKind,
} from './plough-team-renderer';
import type { HeightFn } from './village-meshes';
import { villagerSeconds } from './villager-motion';
import { loadBakedModel } from './villagers';

/** Kráva jako ve stádu vsi (SCALE.cow v livestock-placement.ts). */
const COW_SCALE = 1.14;
/** Měkký stín: délka a šířka (m) a krytí uprostřed. */
const SHADOW = { ox: [2.4 * TEAM_SCALE, 1.0 * TEAM_SCALE], cow: [2.1 * COW_SCALE, 0.85] } as const;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.045;
/** Dál od kamery (m) se zvířata nehýbou – jsou pár pixelů. */
const ANIMATE_RANGE_M = 700;
const HEAD_ROOM_M = 2.6;

export interface PenAnimalsEnvironment {
  groundHeight: HeightFn;
  /** Modely se načetly a zvířata se objevila – překreslit. */
  onLoaded(): void;
}

interface CowKind {
  mesh: Mesh;
  matrices: Float32Array;
  states: Float32Array;
}

/** Zvířata všech ohrad (`set`); `animate` je posune na okamžik `nowMs` (jen v záběru). */
export class PenAnimals {
  private animals: readonly PenAnimal[] = [];
  private ox: BakedKind | null = null;
  private cow: CowKind | null = null;
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private loading: Promise<void> | null = null;
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private key = '';
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: PenAnimalsEnvironment,
  ) {}

  /**
   * Zvířata ohrad; modely se stáhnou s prvním zvířetem. Vrátí true, když se něco změnilo. Kreslí
   * jen voly a krávy – ovce, kozy a prasata v ohradě na noc kreslí stáda vsi (livestock.ts).
   */
  set(all: readonly PenAnimal[]): boolean {
    const animals = all.filter((a) => a.kind === 'ox' || a.kind === 'cow');
    const key = animals
      .map((a) => `${a.kind}:${a.x.toFixed(2)},${a.z.toFixed(2)}:${a.scale ?? 1}`)
      .join(';');
    if (key === this.key) return false;
    this.key = key;
    this.animals = animals;
    if (animals.length > 0) void this.load();
    this.allocate();
    this.updateBounds();
    if (this.loaded) this.write(villagerSeconds(Date.now()), false);
    return true;
  }

  /**
   * Posune zvířata na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. Bez kamery
   * zapíše vždy. `frozen` = omezený pohyb: stálá póza, klip stojí.
   */
  animate(nowMs: number, camera: Camera | null, frozen = false): boolean {
    if (!this.loaded || this.animals.length === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    this.write(frozen ? 0 : villagerSeconds(nowMs), frozen);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (this.ox) {
      this.ox.mesh.material?.dispose();
      this.ox.manager.texture?.dispose();
      this.ox.mesh.dispose();
    }
    this.cow?.mesh.material?.dispose();
    this.cow?.mesh.dispose();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.ox = null;
    this.cow = null;
    this.shadow = null;
  }

  private get loaded(): boolean {
    return this.ox !== null || this.cow !== null;
  }

  private count(kind: PenAnimal['kind']): number {
    return this.animals.filter((a) => a.kind === kind).length;
  }

  /** Buffery instancí podle počtu zvířat. */
  private allocate(): void {
    const oxen = this.count('ox');
    const cows = this.count('cow');
    if (this.ox) {
      const kind = this.ox;
      const n = Math.max(1, oxen);
      kind.matrices = new Float32Array(n * 16);
      kind.settings = new Float32Array(n * 4);
      kind.looks = new Float32Array(n * 4);
      for (let i = 0; i < oxen; i++) kind.looks.set([...OX_LOOKS[i % OX_LOOKS.length]!, 0], i * 4);
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('villagerLook', kind.looks, 4, true);
      kind.mesh.thinInstanceCount = oxen;
      kind.mesh.setEnabled(oxen > 0);
    }
    if (this.cow) {
      const n = Math.max(1, cows);
      this.cow.matrices = new Float32Array(n * 16);
      this.cow.states = new Float32Array(n * 2);
      this.cow.mesh.thinInstanceSetBuffer('matrix', this.cow.matrices, 16, false);
      this.cow.mesh.thinInstanceSetBuffer('livestockState', this.cow.states, 2, false);
      this.cow.mesh.thinInstanceCount = cows;
      this.cow.mesh.setEnabled(cows > 0);
    }
    if (this.shadow) {
      const n = this.animals.length;
      this.shadow.matrices = new Float32Array(Math.max(1, n) * 16);
      this.shadow.mesh.thinInstanceSetBuffer('matrix', this.shadow.matrices, 16, false);
      this.shadow.mesh.thinInstanceCount = n;
      this.shadow.mesh.setEnabled(n > 0);
    }
  }

  /** Zapíše pózy všech zvířat v čase `t` (s) a přepočítá obal. */
  private write(t: number, frozen: boolean): void {
    const height = this.env.groundHeight;
    let ox = 0;
    let cow = 0;
    this.animals.forEach((animal, i) => {
      const pose = penAnimalPose(animal, t);
      const y = height(pose.x, pose.z);
      const hx = Math.sin(pose.heading);
      const hz = Math.cos(pose.heading);
      if (animal.kind === 'ox') {
        if (this.ox) {
          writeFigure(
            this.ox,
            ox,
            { x: pose.x, y, z: pose.z, hx, hz, pace: 1 },
            TEAM_SCALE * (animal.scale ?? 1),
            'idle',
            (animal.seed % 7) / 7,
            frozen,
          );
        }
        ox++;
      } else {
        if (this.cow) {
          writeInstanceMatrix(
            this.cow.matrices,
            cow,
            {
              x: pose.x,
              y,
              z: pose.z,
              forwardX: hx,
              forwardY: 0,
              forwardZ: hz,
              tiltX: 0,
              tiltZ: 0,
            },
            COW_SCALE,
          );
          this.cow.states[cow * 2] = 0;
          this.cow.states[cow * 2 + 1] = pose.head;
        }
        cow++;
      }
      const base = animal.kind === 'ox' ? SHADOW.ox : SHADOW.cow;
      const scale = animal.scale ?? 1;
      this.writeShadow(i, pose.x, y, pose.z, hx, hz, [base[0] * scale, base[1] * scale]);
    });
    if (this.ox) {
      this.ox.mesh.thinInstanceBufferUpdated('matrix');
      this.ox.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      this.ox.manager.time = frozen ? 0 : (t % 3600) + 3600;
    }
    if (this.cow) {
      this.cow.mesh.thinInstanceBufferUpdated('matrix');
      this.cow.mesh.thinInstanceBufferUpdated('livestockState');
    }
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Obal všech zvířat – stojí na místě (jen se natáčejí), stačí ho spočítat při `set`. */
  private updateBounds(): void {
    if (this.animals.length === 0) return;
    const height = this.env.groundHeight;
    const xs = this.animals.map((a) => a.x);
    const zs = this.animals.map((a) => a.z);
    const low = Math.min(...this.animals.map((a) => height(a.x, a.z)));
    const pad = 3;
    this.bounds.reConstruct(
      new Vector3(Math.min(...xs) - pad, low - 1, Math.min(...zs) - pad),
      new Vector3(Math.max(...xs) + pad, low + HEAD_ROOM_M, Math.max(...zs) + pad),
    );
    // kráva se ořezává podle obalu zvířat (model je jen předloha v počátku)
    this.cow?.mesh.setBoundingInfo(new BoundingInfo(this.bounds.minimum, this.bounds.maximum));
  }

  /** Stín pod zvířetem: elipsa natočená ve směru hlavy. */
  private writeShadow(
    index: number,
    x: number,
    y: number,
    z: number,
    hx: number,
    hz: number,
    size: readonly [number, number],
  ): void {
    if (!this.shadow) return;
    const m = this.shadow.matrices;
    const o = index * 16;
    const [length, width] = size;
    m.set([hz * width, 0, -hx * width, 0, 0, 1, 0, 0, hx * length, 0, hz * length, 0], o);
    m[o + 12] = x;
    m[o + 13] = y + SHADOW_LIFT_M;
    m[o + 14] = z;
    m[o + 15] = 1;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const [ox, cow] = await Promise.allSettled([
        loadBakedModel(this.scene, '/models/plough/ox.glb'),
        loadGeometry(this.scene, '/models/fauna/cow.glb'),
      ]);
      if (this.disposed || this.scene.isDisposed) return;
      if (ox.status === 'fulfilled' && ox.value) {
        this.ox = createBakedFigure(this.scene, 'pen-ox', ox.value);
      } else {
        console.warn('Model vola se nepodařilo načíst.', ox.status === 'rejected' ? ox.reason : '');
      }
      if (cow.status === 'fulfilled' && cow.value) {
        this.cow = this.createCow(standOnGround(cow.value));
      } else {
        console.warn(
          'Model krávy se nepodařilo načíst.',
          cow.status === 'rejected' ? cow.reason : '',
        );
      }
      this.shadow = createBlobShadow(this.scene, 'pen-animal-shadow', SHADOW_OPACITY);
      this.allocate();
      this.updateBounds();
      if (this.loaded) {
        this.write(villagerSeconds(Date.now()), false);
        this.env.onLoaded();
      }
    })();
    return this.loading;
  }

  private createCow(geometry: NonNullable<Awaited<ReturnType<typeof loadGeometry>>>): CowKind {
    // Jméno mimo předpony vrhačů stínů – stínová mapa je statická (zvířata mají vlastní stín).
    const mesh = new Mesh('pen-cow', this.scene);
    geometry.vertexData.applyToMesh(mesh);
    mesh.setVerticesData('livestockKeyA', geometry.keyA, false, 3);
    mesh.setVerticesData('livestockKeyB', geometry.keyB, false, 3);
    mesh.setVerticesData(
      'livestockKeyC',
      geometry.keyC ?? new Float32Array(geometry.keyA.length),
      false,
      3,
    );
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    mesh.freezeWorldMatrix();
    const material = new StandardMaterial('pen-cow-material', this.scene);
    // bez mipmap jako u zvířat vsi – ostrůvky textury na černém pozadí by z dálky ztmavly
    geometry.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    material.diffuseTexture = geometry.texture;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    new LivestockPlugin(material);
    mesh.material = material;
    return { mesh, matrices: new Float32Array(16), states: new Float32Array(2) };
  }
}
