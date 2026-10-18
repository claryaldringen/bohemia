import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { SceneVillage } from '../village-view';
import {
  CEMETERY_FENCE,
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
import { fenceStage } from './woven-fence';
import type { WovenFenceRenderer } from './woven-fence-renderer';

type SceneCemetery = NonNullable<SceneVillage['cemeteries']>[number];
type SceneDwelling = SceneVillage['dwellings'][number];

/** Mohylka: poloměr a výška (m), dělení sítě. */
const MOUND_RADIUS_M = 0.9;
const MOUND_HEIGHT_M = 0.45;
const MOUND_SEGMENTS = 12;
const MOUND_RINGS = 5;
/** Výška čáry vytyčení nad terénem (m). */
const LAYOUT_LIFT_M = 0.06;
/** Kolik metrů kolem čtverců se skryjí stromy a kameny krajiny. */
const HIDE_MARGIN_M = 1.5;
/** Okolní světlo z oblohy (scene.ambientColor je bílá) – mohylky by byly jinak příliš tmavé. */
const AMBIENT = new Color3(0.42, 0.42, 0.4);

interface CemeteryView {
  key: string;
  meshes: Mesh[];
  shape: HideShape;
  /** Vlastníci plotů tohoto pohřebiště ve sdílených pletených plotech. */
  fences: string[];
  /** Kolíky vytyčení (staking.ts) – stojí, dokud se nezačnou zatloukat kůly. */
  pegs: ModelInstance[];
  grassMounds: ModelInstance[];
  earthMounds: ModelInstance[];
}

/**
 * Pohřebiště ve scéně (cemetery.md – Co hráč vidí): nízký proutěný plot se zakulacenými rohy
 * kolem čtverců s brankou k nejbližšímu obydlí, uvnitř hliněné mohylky po hrobech (čerstvé
 * z holé hlíny, starší zarostlé travou). Založení po fázích: čára vytyčení s kolíky, zatloukání
 * kůlů, pletení plotu zdola. Plot je sdílený pletený plot (woven-fence-renderer.ts), mohylky
 * sdílené meshe v instancích.
 */
export class CemeteryRenderer {
  private readonly views = new Map<number, CemeteryView>();
  private readonly materials = new Map<string, Material>();
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
      /** Sdílené pletené ploty (plot hřbitova). */
      fences: WovenFenceRenderer;
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
      if (current) this.release(current);
      this.views.set(cemetery.id, this.build(cemetery, gate, key));
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.release(view);
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
    for (const view of this.views.values()) this.release(view);
    this.context.fences.commit();
    this.views.clear();
    this.pegs.dispose();
    this.grassMoundMesh?.dispose();
    this.earthMoundMesh?.dispose();
  }

  /** Zruší sítě pohřebiště a jeho ploty ze sdílených pletených plotů. */
  private release(view: CemeteryView): void {
    for (const mesh of view.meshes) mesh.dispose();
    for (const owner of view.fences) this.context.fences.set(owner, null);
  }

  /**
   * Hřbitov: nehotový celý ve fázích založení; hotový s plotem kolem hotových čtverců
   * a mohylkami, rozšíření ve stavbě má vlastní kus plotu ve fázích (bez branky, na starý plot
   * jen navazuje), po dokončení se plot obepne kolem všech čtverců.
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
          fence: fenceLayout(pending, null, { withGate: false, fenced: ready }),
          state: cemeteryConstruction(cemetery.progress, false),
          key: 'extension',
        });
      }
    }

    const meshes: Mesh[] = [];
    const owners: string[] = [];
    const pegs: ModelInstance[] = [];
    const height = this.context.decalHeight;
    for (const { fence, state, key: part } of fences) {
      const name = `${cemetery.id}-${part}`;
      if (state.layout) meshes.push(this.layoutMesh(name, fence));
      const owner = `cemetery-${name}`;
      owners.push(owner);
      this.context.fences.set(owner, fenceStage(fence.fence, CEMETERY_FENCE, state));
      if (state.posts <= 0 && state.layout) {
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
    return { key, meshes, shape, fences: owners, pegs, grassMounds, earthMounds };
  }

  /** Sdílené meshe kolíků a mohylek dostanou instance všech pohřebišť, ploty se přepíšou. */
  private updateInstances(): void {
    this.context.fences.commit();
    const views = [...this.views.values()];
    const grass = views.flatMap((v) => v.grassMounds);
    this.pegs.set(views.flatMap((v) => v.pegs));
    const earth = views.flatMap((v) => v.earthMounds);
    if (grass.length > 0) this.grassMoundMesh ??= this.createMoundMesh('grass');
    if (earth.length > 0) this.earthMoundMesh ??= this.createMoundMesh('earth');
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
