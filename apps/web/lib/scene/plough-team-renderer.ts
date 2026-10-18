// Spřežení volů s rádlem ve scéně (zatím jen ukázka „Orání“ na /dev/buildings): voli a lidé
// jako postavy ve vsi – GLB s kostrou z tools/blender/people_from_0ad.py (plough-team.json),
// animace zapečené do textury matic kostí (VAT) a thin instances, jeden draw call na model
// (vůl; oráč a honáček sdílí model muže). Rádlo, jho, oj a provaz (tools/blender/plough.py)
// jsou pevné díly v instancích, které se každým snímkem přestaví podle teamPose
// (plough-team.ts). Pod voly, lidmi a rádlem měkký stín (statická stínová mapa pohyblivé
// věci nezachytí – jako u lidí ve vsi).
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager';
import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { loadModelParts } from './instanced-model';
import {
  TEAM_PARTS,
  TEAM_SCALE,
  createTeamPose,
  teamPose,
  writePartMatrix,
  writeSegmentMatrix,
  type FigurePose,
  type GroundFn,
  type PloughPath,
  type TeamPose,
} from './plough-team';
import { villagerSeconds } from './villager-motion';
import { VillagerPlugin, loadBakedModel } from './villagers';

/** Snímků za sekundu zapečené animace (klíče animací 0 A.D.). */
const BAKE_FPS = 24;
/** Dál od kamery (m) se spřežení nehýbe – je pár pixelů. */
const ANIMATE_RANGE_M = 700;
/** Výška obalu spřežení nad zemí (m). */
const HEAD_ROOM_M = 2.4;
/** Čas (s), ve kterém spřežení stojí při omezeném pohybu – jho uprostřed první řady, rádlo v zemi. */
const FROZEN_T = 17;
/** Pevné díly v ard.glb (tools/blender/plough.py). */
const PARTS = ['ard', 'yoke', 'pole', 'rope'] as const;
type PartName = (typeof PARTS)[number];
/** Vzhled na instanci (villagerLook): barva srsti / oděvu a kód vlasů (0 = přirozené). */
const OX_LOOKS: readonly (readonly [number, number, number])[] = [
  [1.04, 0.98, 0.9],
  [0.74, 0.69, 0.64],
];
const PLOWMAN_LOOK = [0.86, 0.82, 0.74, 0] as const;
const BOY_LOOK = [1.08, 1.02, 0.9, 0] as const;
/** Měkký stín: délka a šířka (m při TEAM_SCALE 1) a krytí uprostřed. */
const SHADOW = { ox: [2.4, 1.0], man: [1.0, 1.0], ard: [1.5, 0.45] } as const;
const SHADOW_OPACITY = 0.5;
const SHADOW_LIFT_M = 0.04;

export interface PloughTeamsEnvironment {
  /** Adresa modelů (…/ox.glb, …/plowman.glb, …/ard.glb). */
  baseUrl: string;
  /** Výška terénu pod spřežením. */
  groundHeight: GroundFn;
  /** Úprava materiálu pevných dílů (PBR z GLB) – opar a světlo jako ostatní modely. */
  prepareMaterial?: (material: Material) => void;
  /** Modely se načetly a spřežení se objevilo – překreslit. */
  onLoaded(): void;
}

interface BakedKind {
  mesh: Mesh;
  manager: BakedVertexAnimationManager;
  clips: Map<string, { start: number; end: number }>;
  matrices: Float32Array;
  settings: Float32Array;
  looks: Float32Array;
}

/**
 * Spřežení na dráhách (`setPaths` – jedno na dráhu). `animate` je posune na okamžik `nowMs`
 * (skutečný čas, jako zvířata) – jen v záběru; `frozen` = omezený pohyb, stojí.
 */
export class PloughTeams {
  private paths: readonly PloughPath[] = [];
  private ox: BakedKind | null = null;
  private man: BakedKind | null = null;
  private readonly parts = new Map<PartName, { mesh: Mesh; matrices: Float32Array }>();
  private shadow: { mesh: Mesh; matrices: Float32Array } | null = null;
  private loading: Promise<void> | null = null;
  private readonly poses: TeamPose[] = [];
  private readonly bounds = new BoundingInfo(Vector3.Zero(), Vector3.Zero());
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: PloughTeamsEnvironment,
  ) {}

  /** Dráhy spřežení (jedno spřežení na dráhu); modely se stáhnou s prvním spřežením. */
  setPaths(paths: readonly PloughPath[]): void {
    this.paths = paths;
    while (this.poses.length < paths.length) this.poses.push(createTeamPose());
    this.poses.length = paths.length;
    if (paths.length > 0) void this.load();
    this.allocate();
  }

  /** Počet spřežení s načtenými modely (pro testy a měření). */
  get count(): number {
    return this.ox && this.man ? this.paths.length : 0;
  }

  /** Střed spřežení `index` (jho) v posledním zapsaném okamžiku – kam namířit kameru. */
  center(index = 0): { x: number; z: number } | null {
    const pose = this.poses[index];
    if (!pose || this.count === 0) return null;
    return { x: (pose.yoke.x + pose.ard.x) / 2, z: (pose.yoke.z + pose.ard.z) / 2 };
  }

  /**
   * Posune spřežení na okamžik `nowMs`; vrátí true, když se v záběru něco pohnulo. Bez kamery
   * zapíše vždy (první snímek po načtení). `frozen` = omezený pohyb: stálá póza, nohy stojí.
   */
  animate(nowMs: number, camera: Camera | null, frozen = false): boolean {
    if (this.count === 0) return false;
    if (camera) {
      if (!camera.isInFrustum(this.bounds)) return false;
      const c = this.bounds.boundingSphere.centerWorld;
      if (Vector3.Distance(camera.globalPosition, c) > ANIMATE_RANGE_M) return false;
    }
    // skutečný čas od stejného počátku jako lidé a zvířata (malá čísla – přesné siny)
    const t = frozen ? FROZEN_T : villagerSeconds(nowMs);
    this.write(t, frozen);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    for (const kind of [this.ox, this.man]) {
      if (!kind) continue;
      kind.mesh.material?.dispose();
      kind.manager.texture?.dispose();
      kind.mesh.dispose();
    }
    this.ox = null;
    this.man = null;
    for (const { mesh } of this.parts.values()) mesh.dispose(false, true);
    this.parts.clear();
    this.shadow?.mesh.material?.dispose(true, true);
    this.shadow?.mesh.dispose();
    this.shadow = null;
  }

  /** Buffery instancí podle počtu spřežení (voli 2, lidé 2, díly 1, stíny 5 na spřežení). */
  private allocate(): void {
    const n = this.paths.length;
    for (const [kind, per] of [
      [this.ox, 2],
      [this.man, 2],
    ] as const) {
      if (!kind) continue;
      kind.matrices = new Float32Array(Math.max(1, n * per) * 16);
      kind.settings = new Float32Array(Math.max(1, n * per) * 4);
      kind.looks = new Float32Array(Math.max(1, n * per) * 4);
      for (let i = 0; i < n; i++) {
        if (kind === this.ox) {
          kind.looks.set([...OX_LOOKS[0]!, 0], i * 8);
          kind.looks.set([...OX_LOOKS[1]!, 0], i * 8 + 4);
        } else {
          kind.looks.set(PLOWMAN_LOOK, i * 8);
          kind.looks.set(BOY_LOOK, i * 8 + 4);
        }
      }
      kind.mesh.thinInstanceSetBuffer('matrix', kind.matrices, 16, false);
      kind.mesh.thinInstanceSetBuffer(
        'bakedVertexAnimationSettingsInstanced',
        kind.settings,
        4,
        false,
      );
      kind.mesh.thinInstanceSetBuffer('villagerLook', kind.looks, 4, true);
      kind.mesh.thinInstanceCount = n * per;
      kind.mesh.setEnabled(n > 0);
    }
    for (const part of this.parts.values()) {
      part.matrices = new Float32Array(Math.max(1, n) * 16);
      part.mesh.thinInstanceSetBuffer('matrix', part.matrices, 16, false);
      part.mesh.thinInstanceCount = n;
      part.mesh.setEnabled(n > 0);
    }
    if (this.shadow) {
      this.shadow.matrices = new Float32Array(Math.max(1, n * 5) * 16);
      this.shadow.mesh.thinInstanceSetBuffer('matrix', this.shadow.matrices, 16, false);
      this.shadow.mesh.thinInstanceCount = n * 5;
      this.shadow.mesh.setEnabled(n > 0);
    }
  }

  /** Zapíše pózy všech spřežení v čase `t` (s) do instancí a přepočítá obal. */
  private write(t: number, frozen: boolean): void {
    const ox = this.ox!;
    const man = this.man!;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let low = Infinity;
    const extend = (x: number, y: number, z: number): void => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      low = Math.min(low, y);
    };
    this.paths.forEach((path, i) => {
      const pose = teamPose(path, t, this.poses[i]!, this.env.groundHeight);
      pose.oxen.forEach((o, j) => {
        writeFigure(ox, i * 2 + j, o, TEAM_SCALE, 'walk', j * 0.37, frozen);
        this.writeShadow(i * 5 + j, o, SHADOW.ox);
        extend(o.x, o.y, o.z);
      });
      writeFigure(man, i * 2, pose.plowman, TEAM_SCALE, 'plough', 0.2, frozen);
      writeFigure(
        man,
        i * 2 + 1,
        pose.boy,
        TEAM_SCALE * TEAM_PARTS.boy.scale,
        'lead',
        0.55,
        frozen,
      );
      this.writeShadow(i * 5 + 2, pose.plowman, SHADOW.man);
      this.writeShadow(i * 5 + 3, pose.boy, SHADOW.man, TEAM_PARTS.boy.scale);
      const ard = pose.ard;
      const ardGround = this.env.groundHeight(ard.x, ard.z);
      const len = Math.hypot(ard.fx, ard.fz) || 1;
      this.writeShadow(
        i * 5 + 4,
        { x: ard.x, y: ardGround, z: ard.z, hx: ard.fx / len, hz: ard.fz / len, pace: 0 },
        SHADOW.ard,
      );
      extend(pose.plowman.x, pose.plowman.y, pose.plowman.z);
      extend(pose.boy.x, pose.boy.y, pose.boy.z);
      const part = (name: PartName): Float32Array | null => this.parts.get(name)?.matrices ?? null;
      const ardM = part('ard');
      if (ardM) writePartMatrix(ardM, i * 16, ard, TEAM_SCALE);
      const yokeM = part('yoke');
      if (yokeM) writePartMatrix(yokeM, i * 16, pose.yoke, TEAM_SCALE);
      const poleM = part('pole');
      if (poleM) writeSegmentMatrix(poleM, i * 16, pose.pole, TEAM_PARTS.poleM, TEAM_SCALE);
      const ropeM = part('rope');
      if (ropeM) writeSegmentMatrix(ropeM, i * 16, pose.rope, 1, TEAM_SCALE);
    });
    const time = frozen ? 0 : (t % 3600) + 3600;
    for (const kind of [ox, man]) {
      kind.mesh.thinInstanceBufferUpdated('matrix');
      kind.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced');
      kind.manager.time = time;
    }
    for (const { mesh } of this.parts.values()) mesh.thinInstanceBufferUpdated('matrix');
    this.shadow?.mesh.thinInstanceBufferUpdated('matrix');
    if (minX <= maxX) {
      const pad = 3 * TEAM_SCALE;
      this.bounds.reConstruct(
        new Vector3(minX - pad, low - 1, minZ - pad),
        new Vector3(maxX + pad, low + HEAD_ROOM_M * TEAM_SCALE, maxZ + pad),
      );
    }
  }

  /** Stín pod volem / postavou / rádlem: elipsa natočená ve směru pohledu. */
  private writeShadow(
    index: number,
    at: FigurePose,
    size: readonly [number, number],
    scale = 1,
  ): void {
    if (!this.shadow) return;
    const m = this.shadow.matrices;
    const o = index * 16;
    const length = size[0] * TEAM_SCALE * scale;
    const width = size[1] * TEAM_SCALE * scale;
    // osa X napříč (vpravo), Z podél pohledu
    m[o] = at.hz * width;
    m[o + 1] = 0;
    m[o + 2] = -at.hx * width;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = 1;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = at.hx * length;
    m[o + 9] = 0;
    m[o + 10] = at.hz * length;
    m[o + 11] = 0;
    m[o + 12] = at.x;
    m[o + 13] = at.y + SHADOW_LIFT_M;
    m[o + 14] = at.z;
    m[o + 15] = 1;
  }

  private load(): Promise<void> {
    this.loading ??= (async (): Promise<void> => {
      const base = this.env.baseUrl;
      const [ox, man, parts] = await Promise.allSettled([
        loadBakedModel(this.scene, `${base}ox.glb`),
        loadBakedModel(this.scene, `${base}plowman.glb`),
        loadModelParts(this.scene, `${base}ard.glb`, 'plough-', this.env.prepareMaterial),
      ]);
      if (this.disposed || this.scene.isDisposed) return;
      if (ox.status === 'fulfilled' && ox.value) this.ox = this.createKind('ox', ox.value);
      else
        console.warn('Model vola se nepodařilo načíst.', ox.status === 'rejected' ? ox.reason : '');
      if (man.status === 'fulfilled' && man.value) {
        this.man = this.createKind('plowman', man.value);
      } else {
        console.warn(
          'Model oráče se nepodařilo načíst.',
          man.status === 'rejected' ? man.reason : '',
        );
      }
      if (parts.status === 'fulfilled' && parts.value) {
        for (const [name, mesh] of parts.value) {
          if (!(PARTS as readonly string[]).includes(name)) {
            mesh.dispose();
            continue;
          }
          mesh.alwaysSelectAsActiveMesh = true;
          this.parts.set(name as PartName, { mesh, matrices: new Float32Array(16) });
        }
      } else {
        console.warn(
          'Rádlo a jho se nepodařilo načíst.',
          parts.status === 'rejected' ? parts.reason : '',
        );
      }
      this.shadow = this.createShadow();
      this.allocate();
      if (this.count > 0) {
        this.write(villagerSeconds(Date.now()), false);
        this.env.onLoaded();
      }
    })();
    return this.loading;
  }

  private createKind(
    name: string,
    model: NonNullable<Awaited<ReturnType<typeof loadBakedModel>>>,
  ): BakedKind {
    // Jméno mimo předpony vrhačů stínů – stínová mapa je statická (spřežení má vlastní stín).
    const mesh = new Mesh(`plough-${name}`, this.scene);
    model.vertexData.applyToMesh(mesh);
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, model.matricesIndices, false, 4);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, model.matricesWeights, false, 4);
    // Kostra jen kvůli definicím shaderu (skinning) – matice kostí čte shader z VAT textury.
    const skeleton = new Skeleton(`plough-${name}-skeleton`, `plough-${name}`, this.scene);
    for (let i = 0; i < model.boneCount; i++) new Bone(`b${i}`, skeleton);
    mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 4;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    const vat = RawTexture.CreateRGBATexture(
      model.vat,
      (model.boneCount + 1) * 4,
      model.frames,
      this.scene,
      false,
      false,
      Texture.NEAREST_NEAREST,
      Constants.TEXTURETYPE_FLOAT,
    );
    vat.name = `plough-${name}-vat`;
    const manager = new BakedVertexAnimationManager(this.scene);
    manager.texture = vat;
    mesh.bakedVertexAnimationManager = manager;
    const material = new StandardMaterial(`plough-${name}-material`, this.scene);
    // bez mipmap jako u lidí a zvířat – ostrůvky atlasu na tmavém pozadí by z dálky ztmavly
    model.texture?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    material.diffuseTexture = model.texture;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    model.mask?.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    new VillagerPlugin(material, model.texture?.gammaSpace === false, model.mask);
    mesh.material = material;
    return {
      mesh,
      manager,
      clips: model.clips,
      matrices: new Float32Array(16),
      settings: new Float32Array(4),
      looks: new Float32Array(4),
    };
  }

  /** Měkký stín – čtverec s průhlednou elipsou (kruh roztažený maticí instance). */
  private createShadow(): { mesh: Mesh; matrices: Float32Array } {
    const mesh = new Mesh('plough-shadow', this.scene);
    const data = new VertexData();
    data.positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
    data.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.indices = [0, 2, 1, 0, 3, 2];
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    // po obtiscích vsi a polí (alphaIndex 1–2), jako stíny lidí
    mesh.alphaIndex = 5;
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
        const a = Math.max(0, 1 - r);
        pixels[(j * size + i) * 4 + 3] = Math.round(255 * SHADOW_OPACITY * a * a * (3 - 2 * a));
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      pixels,
      size,
      size,
      this.scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.name = 'plough-shadow';
    const material = new StandardMaterial('plough-shadow-material', this.scene);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = Color3.Black();
    material.disableLighting = true;
    material.opacityTexture = texture;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    material.zOffset = -2;
    mesh.material = material;
    return { mesh, matrices: new Float32Array(16) };
  }
}

/** Instance postavy: poloha, natočení, měřítko a klip (fáze `phase` 0–1 kvůli rozladění). */
function writeFigure(
  kind: BakedKind,
  slot: number,
  pose: FigurePose,
  scale: number,
  clipName: string,
  phase: number,
  frozen: boolean,
): void {
  const m = kind.matrices;
  const o = slot * 16;
  // osa X = vpravo (nahoru × dopředu), Y = nahoru, Z = dopředu (model míří na +Z)
  m[o] = pose.hz * scale;
  m[o + 1] = 0;
  m[o + 2] = -pose.hx * scale;
  m[o + 3] = 0;
  m[o + 4] = 0;
  m[o + 5] = scale;
  m[o + 6] = 0;
  m[o + 7] = 0;
  m[o + 8] = pose.hx * scale;
  m[o + 9] = 0;
  m[o + 10] = pose.hz * scale;
  m[o + 11] = 0;
  m[o + 12] = pose.x;
  m[o + 13] = pose.y;
  m[o + 14] = pose.z;
  m[o + 15] = 1;
  const clip = kind.clips.get(clipName) ?? kind.clips.get('walk') ?? { start: 0, end: 0 };
  const length = clip.end - clip.start + 1;
  const s = slot * 4;
  kind.settings[s] = clip.start;
  kind.settings[s + 1] = clip.end;
  kind.settings[s + 2] = phase * length;
  kind.settings[s + 3] = frozen ? 0 : BAKE_FPS * pose.pace;
}
