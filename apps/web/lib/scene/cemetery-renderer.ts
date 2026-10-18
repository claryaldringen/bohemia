import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneVillage } from '../village-view';
import {
  FENCE_HEIGHT_M,
  cemeteryConstruction,
  fenceLayout,
  gravePlacements,
  type CemeteryConstruction,
  type FenceLayout,
} from './cemetery-layout';
import { cellsBounds, cellsContain, type CellSquare } from './field-cells';
import { instanceMatrices, type ModelInstance } from './instanced-model';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { seededRandom, stripSegments, type HideShape, type Point } from './village-layout';
import { createStripMesh, type HeightFn } from './village-meshes';

type SceneCemetery = NonNullable<SceneVillage['cemeteries']>[number];
type SceneDwelling = SceneVillage['dwellings'][number];

/** Kůl plotu: průřez (m) a délka – část je zatlučená v zemi, nad plotem kus přečnívá. */
const POST_SIZE_M = 0.09;
const POST_LENGTH_M = FENCE_HEIGHT_M + 0.3;
const POST_SINK_M = 0.12;
/** Kůly branky jsou vyšší (uniformní měřítko kůlu). */
const GATE_POST_SCALE = 1.25;
/** Plot leží o kousek v zemi, aby na svahu nevisel; body pletení po nejvýš 0,7 m. */
const WATTLE_SINK_M = 0.06;
const WATTLE_STEP_M = 0.7;
/** Mohylka: poloměr a výška (m), dělení sítě. */
const MOUND_RADIUS_M = 0.9;
const MOUND_HEIGHT_M = 0.45;
const MOUND_SEGMENTS = 12;
const MOUND_RINGS = 5;
/** Výška čáry vytyčení nad terénem (m). */
const LAYOUT_LIFT_M = 0.06;
/** Kolik metrů kolem čtverců se skryjí stromy a kameny krajiny. */
const HIDE_MARGIN_M = 1.5;
/** Okolní světlo z oblohy (scene.ambientColor je bílá) – svislý plot by byl jinak skoro černý. */
const AMBIENT = new Color3(0.42, 0.42, 0.4);

interface CemeteryView {
  key: string;
  meshes: Mesh[];
  shape: HideShape;
  /** Instance kůlů, kolíků a mohylek tohoto pohřebiště (sdílené meshe). */
  posts: ModelInstance[];
  /** Kolíky vytyčení (staking.ts) – stojí, dokud se nezačnou zatloukat kůly. */
  pegs: ModelInstance[];
  grassMounds: ModelInstance[];
  earthMounds: ModelInstance[];
}

/**
 * Pohřebiště ve scéně (cemetery.md – Co hráč vidí): nízký proutěný plot kolem čtverců s brankou
 * k nejbližšímu obydlí, uvnitř hliněné mohylky po hrobech (čerstvé z holé hlíny, starší zarostlé
 * travou). Založení po fázích: čára vytyčení s kolíky, zatloukání kůlů, pletení plotu zdola.
 * Kůly a mohylky jsou sdílené meshe v instancích, pletení je vlastní síť každého pohřebiště.
 */
export class CemeteryRenderer {
  private readonly views = new Map<number, CemeteryView>();
  private readonly materials = new Map<string, Material>();
  private postMesh: Mesh | null = null;
  private readonly pegs: StakingPegs;
  private grassMoundMesh: Mesh | null = null;
  private earthMoundMesh: Mesh | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      /** Přesná výška vykresleného terénu (s převýšením). */
      decalHeight: HeightFn;
      /** Hladký terén (s převýšením) – paty kolíků a provázek. */
      groundHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      requestRender(): void;
    },
  ) {
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
  }

  /** Překreslí pohřebiště, která se změnila; vrátí true, když se něco změnilo. */
  update(cemeteries: readonly SceneCemetery[], dwellings: readonly SceneDwelling[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const cemetery of cemeteries) {
      seen.add(cemetery.id);
      const gate = gateTarget(cemetery.squares, dwellings);
      const key = cemeteryKey(cemetery, gate);
      const current = this.views.get(cemetery.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.views.set(cemetery.id, this.build(cemetery, gate, key));
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.views.delete(id);
      changed = true;
    }
    if (changed) this.updateInstances();
    return changed;
  }

  /** Oblasti, kde se mají skrýt stromy a kameny krajiny (čtverce pohřebišť s okrajem). */
  hideShapes(): HideShape[] {
    return [...this.views.values()].map((view) => view.shape);
  }

  dispose(): void {
    for (const view of this.views.values()) for (const mesh of view.meshes) mesh.dispose();
    this.views.clear();
    this.postMesh?.dispose();
    this.pegs.dispose();
    this.grassMoundMesh?.dispose();
    this.earthMoundMesh?.dispose();
  }

  /**
   * Hřbitov: nehotový celý ve fázích založení; hotový s plotem kolem hotových čtverců
   * a mohylkami, rozšíření ve stavbě má vlastní plot ve fázích (bez branky), po dokončení se
   * plot obepne kolem všech čtverců.
   */
  private build(cemetery: SceneCemetery, gate: Point | null, key: string): CemeteryView {
    const squares: CellSquare[] = cemetery.squares;
    const ready: CellSquare[] = cemetery.squares.filter((s) => !s.pending);
    const pending: CellSquare[] = cemetery.squares.filter((s) => s.pending);
    const toward = gate ? { x: gate[0], z: gate[1] } : null;
    const fences: { fence: FenceLayout; state: CemeteryConstruction; key: string }[] = [];
    if (!cemetery.built) {
      fences.push({
        fence: fenceLayout(squares, toward),
        state: cemeteryConstruction(cemetery.progress, false),
        key: 'all',
      });
    } else {
      if (ready.length > 0) {
        fences.push({
          fence: fenceLayout(ready, toward),
          state: cemeteryConstruction(1, true),
          key: 'ready',
        });
      }
      if (pending.length > 0) {
        fences.push({
          fence: fenceLayout(pending, null, false),
          state: cemeteryConstruction(cemetery.progress, false),
          key: 'extension',
        });
      }
    }

    const meshes: Mesh[] = [];
    const posts: ModelInstance[] = [];
    const pegs: ModelInstance[] = [];
    const height = this.context.decalHeight;
    for (const { fence, state, key: part } of fences) {
      const name = `${cemetery.id}-${part}`;
      if (state.layout) meshes.push(this.layoutMesh(name, fence));
      if (state.wattleHeight > 0) meshes.push(this.wattleMesh(name, fence, state.wattleHeight));
      if (state.posts > 0) {
        const count = Math.round(fence.posts.length * state.posts);
        for (const post of fence.posts.slice(0, count)) {
          posts.push({
            x: post.x,
            y: height(post.x, post.z) - POST_SINK_M,
            z: post.z,
            rotationY: 0,
            scale: post.gate ? GATE_POST_SCALE : 1,
          });
        }
      } else if (state.layout) {
        // od zadání po zatlučení kůlů: kolíky a napnutý provázek po obvodu (i u rozšíření)
        pegs.push(...pegInstances(fence.outline, this.context.groundHeight));
        meshes.push(
          createStringMesh(
            this.scene,
            `village-cemetery-string-${name}`,
            fence.outline,
            this.context.groundHeight,
            this.material('string', () => createStringMaterial(this.scene)),
          ),
        );
      }
    }

    const grassMounds: ModelInstance[] = [];
    const earthMounds: ModelInstance[] = [];
    if (cemetery.built) {
      for (const grave of gravePlacements(ready, cemetery.graves, cemetery.id)) {
        const r = MOUND_RADIUS_M * grave.scale;
        // pata mohylky v nejnižším bodě pod ní – na svahu nevisí
        const y = Math.min(
          height(grave.x, grave.z),
          height(grave.x + r, grave.z),
          height(grave.x - r, grave.z),
          height(grave.x, grave.z + r),
          height(grave.x, grave.z - r),
        );
        const instance = {
          x: grave.x,
          y,
          z: grave.z,
          rotationY: grave.rotationY,
          scale: grave.scale,
        };
        (grave.fresh ? earthMounds : grassMounds).push(instance);
      }
    }

    const shape: HideShape = {
      bounds: cellsBounds(squares, HIDE_MARGIN_M),
      contains: cellsContain(squares, HIDE_MARGIN_M),
    };
    return { key, meshes, shape, posts, pegs, grassMounds, earthMounds };
  }

  /** Sdílené meshe kůlů a mohylek dostanou instance všech pohřebišť. */
  private updateInstances(): void {
    const views = [...this.views.values()];
    const posts = views.flatMap((v) => v.posts);
    const grass = views.flatMap((v) => v.grassMounds);
    this.pegs.set(views.flatMap((v) => v.pegs));
    const earth = views.flatMap((v) => v.earthMounds);
    if (posts.length > 0) this.postMesh ??= this.createPostMesh();
    if (grass.length > 0) this.grassMoundMesh ??= this.createMoundMesh('grass');
    if (earth.length > 0) this.earthMoundMesh ??= this.createMoundMesh('earth');
    if (this.postMesh) setInstances(this.postMesh, posts);
    if (this.grassMoundMesh) setInstances(this.grassMoundMesh, grass);
    if (this.earthMoundMesh) setInstances(this.earthMoundMesh, earth);
  }

  /** Světlá čára vytyčení po obrysu čtverců (provázek, naražená tráva). */
  private layoutMesh(id: string, fence: FenceLayout): Mesh {
    const mesh = createStripMesh(
      this.scene,
      `village-cemetery-layout-${id}`,
      fence.outline.flatMap((line) => stripSegments(line, false, 0.09, 0.5)),
      this.context.decalHeight,
      LAYOUT_LIFT_M,
    );
    mesh.material = this.material('layout', () => {
      const m = new StandardMaterial('village-cemetery-layout', this.scene);
      m.diffuseColor = new Color3(0.8, 0.76, 0.64);
      m.specularColor = Color3.Black();
      m.zOffset = -4;
      m.backFaceCulling = false;
      return m;
    });
    return mesh;
  }

  /** Pletený plot – svislé pásy podél úseků do výšky `top`, položené na terén. */
  private wattleMesh(id: string, fence: FenceLayout, top: number): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const height = this.context.decalHeight;
    for (const [a, b] of fence.runs) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-6) continue;
      const nx = -(b[1] - a[1]) / length;
      const nz = (b[0] - a[0]) / length;
      const steps = Math.max(1, Math.ceil(length / WATTLE_STEP_M));
      const base = positions.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const ground = height(x, z);
        positions.push(x, ground - WATTLE_SINK_M, z, x, ground + top, z);
        normals.push(nx, 0, nz, nx, 0, nz);
        // textura: 1 m na šířku, výška plotu na výšku – pruty přibývají zdola
        const u = t * length;
        uvs.push(u, 0, u, (top + WATTLE_SINK_M) / (FENCE_HEIGHT_M + WATTLE_SINK_M));
      }
      for (let s = 0; s < steps; s++) {
        const i = base + s * 2;
        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    const mesh = new Mesh(`village-cemetery-fence-${id}`, this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.material('wattle', () => this.createWattleMaterial());
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  /** Kůl: hranol se špičatějším vrškem, pata v počátku. */
  private createPostMesh(): Mesh {
    const h = POST_SIZE_M / 2;
    const top = POST_LENGTH_M;
    const square = (r: number): Point[] => [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ];
    const positions: number[] = [];
    const indices: number[] = [];
    const bottom = square(h);
    const upper = square(h * 0.8);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = bottom[k]!;
      const [bx, bz] = bottom[(k + 1) % 4]!;
      const [cx, cz] = upper[(k + 1) % 4]!;
      const [dx, dz] = upper[k]!;
      const i = positions.length / 3;
      positions.push(ax, 0, az, bx, 0, bz, cx, top, cz, dx, top, dz);
      indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    }
    // seříznutý vršek
    const i = positions.length / 3;
    for (const [x, z] of upper) positions.push(x, top, z);
    positions.push(0, top + 0.05, 0);
    for (let k = 0; k < 4; k++) indices.push(i + k, i + 4, i + ((k + 1) % 4));
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    const mesh = new Mesh('village-cemetery-posts', this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.material('post', () => {
      const m = new StandardMaterial('village-cemetery-post', this.scene);
      m.diffuseColor = new Color3(0.46, 0.37, 0.27);
      m.ambientColor = AMBIENT;
      m.specularColor = Color3.Black();
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      return m;
    });
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  /** Mohylka: nízká kupka (kosinový profil), okraj o kousek v zemi. */
  private createMoundMesh(look: 'grass' | 'earth'): Mesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const random = seededRandom(look === 'grass' ? 11 : 13);
    // vrchol a prstence od středu k okraji
    positions.push(0, MOUND_HEIGHT_M, 0);
    uvs.push(0.5, 0.5);
    for (let ring = 1; ring <= MOUND_RINGS; ring++) {
      const t = ring / MOUND_RINGS;
      const r = MOUND_RADIUS_M * t;
      const y = ring === MOUND_RINGS ? -0.06 : MOUND_HEIGHT_M * Math.cos((t * Math.PI) / 2) ** 1.3;
      for (let s = 0; s < MOUND_SEGMENTS; s++) {
        const angle = (s / MOUND_SEGMENTS) * Math.PI * 2;
        // drobné nerovnosti – mohylky nejsou soustružené
        const wobble = ring === MOUND_RINGS ? 1 : 1 + (random() - 0.5) * 0.08;
        const x = Math.cos(angle) * r * wobble;
        const z = Math.sin(angle) * r * wobble;
        positions.push(x, y, z);
        uvs.push(0.5 + x / 1.6, 0.5 + z / 1.6);
      }
    }
    for (let s = 0; s < MOUND_SEGMENTS; s++) {
      indices.push(0, 1 + ((s + 1) % MOUND_SEGMENTS), 1 + s);
    }
    for (let ring = 1; ring < MOUND_RINGS; ring++) {
      const inner = 1 + (ring - 1) * MOUND_SEGMENTS;
      const outer = 1 + ring * MOUND_SEGMENTS;
      for (let s = 0; s < MOUND_SEGMENTS; s++) {
        const s1 = (s + 1) % MOUND_SEGMENTS;
        indices.push(inner + s, inner + s1, outer + s, inner + s1, outer + s1, outer + s);
      }
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    const mesh = new Mesh(`village-cemetery-mounds-${look}`, this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.material(`mound-${look}`, () => {
      const m = new StandardMaterial(`village-cemetery-mound-${look}`, this.scene);
      m.specularColor = Color3.Black();
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
      const texture = new Texture(
        `/textures/terrain/${look === 'grass' ? 'grass-dry' : 'mud'}.jpg`,
        this.scene,
      );
      texture.anisotropicFilteringLevel = 8;
      if (!texture.isReady()) texture.onLoadObservable.addOnce(() => this.context.requestRender());
      m.diffuseTexture = texture;
      // zarostlé mohylky jsou světlejší než louka (suchá tráva), čerstvé z hnědé hlíny
      m.diffuseColor = look === 'grass' ? new Color3(1.18, 1.04, 0.74) : new Color3(1, 0.84, 0.68);
      m.ambientColor = AMBIENT;
      return m;
    });
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  /** Proutí: vodorovné pruty kolem kůlů střídavě vpředu a vzadu (textura z kódu). */
  private createWattleMaterial(): Material {
    const material = new StandardMaterial('village-cemetery-wattle', this.scene);
    material.specularColor = Color3.Black();
    material.ambientColor = AMBIENT;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    const width = 64;
    const height = 64;
    const rods = 9;
    const data = new Uint8Array(width * height * 4);
    const random = seededRandom(5);
    const shade = Array.from({ length: rods }, () => 0.8 + random() * 0.35);
    for (let y = 0; y < height; y++) {
      const v = (y / height) * rods;
      const rod = Math.floor(v);
      const across = v - rod; // 0–1 přes prut
      for (let x = 0; x < width; x++) {
        // prut se vine kolem kůlů po ≈ ⅓ m – střídavě světlejší (vpředu) a tmavší (vzadu)
        const weave = 0.82 + 0.18 * Math.sin(((x / width) * 3 + (rod % 2) * 0.5) * Math.PI * 2);
        const round = Math.sin(across * Math.PI) ** 0.6;
        const light = (shade[rod] ?? 1) * weave * (0.45 + 0.55 * round);
        const i = (y * width + x) * 4;
        // suché lískové a vrbové proutí – šedohnědé
        data[i] = Math.round(Math.min(255, 178 * light));
        data[i + 1] = Math.round(Math.min(255, 150 * light));
        data[i + 2] = Math.round(Math.min(255, 112 * light));
        data[i + 3] = 255;
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      data,
      width,
      height,
      this.scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = 'village-cemetery-wattle-texture';
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    material.diffuseTexture = texture;
    return material;
  }

  private material(key: string, create: () => Material): Material {
    let material = this.materials.get(key);
    if (!material) {
      material = create();
      this.materials.set(key, material);
    }
    return material;
  }
}

/**
 * Nejbližší hotové obydlí ke středu hotových čtverců hřbitova – k němu míří branka (obydlí
 * čekající na server ani staveniště ji neposunou); bez obydlí null.
 */
function gateTarget(
  squares: readonly { x: number; z: number; pending?: boolean }[],
  dwellings: readonly SceneDwelling[],
): Point | null {
  const ready = squares.filter((s) => !s.pending);
  const base = ready.length > 0 ? ready : squares;
  if (base.length === 0) return null;
  const cx = base.reduce((s, q) => s + q.x, 0) / base.length;
  const cz = base.reduce((s, q) => s + q.z, 0) / base.length;
  let best: Point | null = null;
  let bestD = Infinity;
  for (const d of dwellings) {
    if (!d.built) continue;
    const dist = Math.hypot(d.position.x - cx, d.position.z - cz);
    if (dist < bestD) {
      bestD = dist;
      best = [d.position.x, d.position.z];
    }
  }
  return best;
}

function cemeteryKey(c: SceneCemetery, gate: Point | null): string {
  const building = !c.built || c.squares.some((s) => s.pending);
  return [
    c.squares.map((s) => `${s.cell.x},${s.cell.y}${s.pending ? 'p' : ''}`).join(';'),
    c.built,
    // průběh po 2 % – plot nepřibývá plynule, ale ani se nepřestavuje při každém dotazu
    building ? Math.round(c.progress * 50) : '',
    c.graves,
    gate ? `${Math.round(gate[0])},${Math.round(gate[1])}` : '',
  ].join('|');
}

/** Nastaví instance meshe; bez instancí ho vypne (jinak by se vykreslil samotný v počátku). */
function setInstances(mesh: Mesh, instances: readonly ModelInstance[]): void {
  if (instances.length === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
  mesh.setEnabled(true);
}
