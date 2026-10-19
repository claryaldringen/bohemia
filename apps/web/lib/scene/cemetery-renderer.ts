import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { cemeteryEntrance, type MoundSize } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import {
  CEMETERY_FENCE,
  FRESH_GRAVES,
  MOUND_SHAPES,
  cemeteryConstruction,
  cemeteryFenceGone,
  fenceLayout,
  gravePlacements,
  moundPlacements,
  type CemeteryConstruction,
  type FenceLayout,
  type GravePlacement,
} from './cemetery-layout';
import { cellsBounds, cellsContain, type CellSquare } from './field-cells';
import { instanceMatrices, type ModelInstance } from './instanced-model';
import { applySeasonRelief } from './season-materials';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { seededRandom, stripSegments, type HideShape, type Point } from './village-layout';
import { createStripMesh, type HeightFn } from './village-meshes';
import { fenceDecayAmount } from './structure-decay';
import { decayFence, fenceStage } from './woven-fence';
import type { WovenFenceRenderer } from './woven-fence-renderer';

type SceneCemetery = NonNullable<SceneVillage['cemeteries']>[number];
type SceneDwelling = SceneVillage['dwellings'][number];

/** Mohyla: dělení sítě (tvar podle velikosti – `MOUND_SHAPES`). */
const MOUND_SEGMENTS = 12;
const MOUND_RINGS = 5;
/** Velké mohyly mají jemnější síť (kupka přes 3 m by byla hranatá). */
const GREAT_MOUND_SEGMENTS = 20;
const GREAT_MOUND_RINGS = 8;
/**
 * Dřevěný kůl na vrcholu mohyly vojvody (cemetery.md – inspirace: Pověst dávných let –
 * Vjatičové kladli ostatky na sloup u cest): výška nad vrcholem, poloměr u paty a nahoře (m).
 */
const POST = { heightM: 1.7, sinkM: 0.25, baseRadiusM: 0.1, topRadiusM: 0.075, sides: 8 } as const;
/** Výška čáry vytyčení nad terénem (m). */
const LAYOUT_LIFT_M = 0.06;
/** Kolik metrů kolem čtverců se skryjí stromy a kameny krajiny. */
const HIDE_MARGIN_M = 1.5;
/** Okolní světlo z oblohy (scene.ambientColor je bílá) – mohylky by byly jinak příliš tmavé. */
const AMBIENT = new Color3(0.42, 0.42, 0.4);
/** Opuštěný hřbitov: mohylky se srovnají – zapadnou až o tolik své výšky (násobek měřítka, m). */
const MOUND_SETTLE_M = 0.2;
/** Od jak zarostlého hřbitova je i čerstvá mohylka zarostlá trávou. */
const FRESH_OVERGROWN = 0.3;
/** Rozpad plotu se ve scéně mění po dvacetinách (klíč pohřebiště). */
const FENCE_DECAY_STEPS = 20;
/**
 * Sníh na kůlu mohyly vojvody – dřevo jen poprášené jako pletený plot (sklon nechá sníh jen na
 * hlavě kůlu); mohyly zapadají celé jako terén kolem.
 */
const POST_SNOW = 0.5;

interface CemeteryView {
  key: string;
  meshes: Mesh[];
  shape: HideShape;
  /** Vlastníci plotů tohoto pohřebiště ve sdílených pletených plotech. */
  fences: string[];
  /** Kolíky vytyčení (staking.ts) – stojí, dokud se nezačnou zatloukat kůly. */
  pegs: ModelInstance[];
  /** Mohyly po sítích (`${vzhled}-${velikost}` – zarostlé a čerstvé, podle velikosti). */
  mounds: Map<string, ModelInstance[]>;
  /** Kůly na mohylách vojvodů (největší mohyly). */
  posts: ModelInstance[];
}

type MoundLook = 'grass' | 'earth';
const MOUND_KEYS: readonly { look: MoundLook; size: MoundSize }[] = (
  ['grass', 'earth'] as const
).flatMap((look) =>
  (['small', 'normal', 'large', 'great'] as const).map((size) => ({ look, size })),
);

/**
 * Pohřebiště ve scéně (cemetery.md – Co hráč vidí): nízký proutěný plot se zakulacenými rohy
 * kolem čtverců s brankou k nejbližšímu obydlí, uvnitř hliněné mohylky po hrobech (čerstvé
 * z holé hlíny, starší zarostlé travou). Založení po fázích: čára vytyčení s kolíky, zatloukání
 * kůlů, pletení plotu zdola. Plot je sdílený pletený plot (woven-fence-renderer.ts), mohylky
 * sdílené meshe v instancích. V zimě mohyly zapadají sněhem jako terén kolem (stejný šum,
 * na strmé straně méně – `applySeasonRelief`), kůl vojvody jen nahoře.
 */
export class CemeteryRenderer {
  private readonly views = new Map<number, CemeteryView>();
  private readonly materials = new Map<string, Material>();
  private readonly pegs: StakingPegs;
  /** Sdílené sítě mohyl podle vzhledu a velikosti (vznikají až s první mohylou té velikosti). */
  private readonly moundMeshes = new Map<string, Mesh>();
  private postMesh: Mesh | null = null;

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
      // branka = vchod z jádra (paths.md – Vchody), pěšina vede k ní
      const entrance = cemeteryEntrance(cemetery, dwellings);
      const gate: Point | null = entrance ? [entrance.x, entrance.z] : null;
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
    for (const mesh of this.moundMeshes.values()) mesh.dispose();
    this.moundMeshes.clear();
    this.postMesh?.dispose();
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
    // opuštěný hřbitov (abandonment.md): plot hotových čtverců se rozpadá, mohylky zarůstají
    const decay = fenceDecay(cemetery.fence);
    const overgrown = decay;
    for (const { fence, state, key: part } of fences) {
      const name = `${cemetery.id}-${part}`;
      if (state.layout) meshes.push(this.layoutMesh(name, fence));
      const owner = `cemetery-${name}`;
      owners.push(owner);
      const stage = fenceStage(fence.fence, CEMETERY_FENCE, state);
      // spadlý plot starého hřbitova zmizí úplně – zůstanou jen mohyly (Martin, 19. 10. 2026)
      const fallen = part === 'ready' && cemeteryFenceGone(cemetery.fence);
      this.context.fences.set(
        owner,
        fallen
          ? null
          : part === 'ready' && decay > 0
            ? decayFence(stage, decay, cemetery.id)
            : stage,
      );
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

    const mounds = new Map<string, ModelInstance[]>();
    const posts: ModelInstance[] = [];
    if (cemetery.built) {
      const add = (grave: GravePlacement, size: MoundSize): void => {
        const shape = MOUND_SHAPES[size];
        const r = Math.max(shape.radius, shape.length) * grave.scale;
        // pata mohyly v nejnižším bodě pod ní – na svahu nevisí
        const y = Math.min(
          height(grave.x, grave.z),
          height(grave.x + r, grave.z),
          height(grave.x - r, grave.z),
          height(grave.x, grave.z + r),
          height(grave.x, grave.z - r),
        );
        const instance = {
          x: grave.x,
          y: y - MOUND_SETTLE_M * overgrown * grave.scale,
          z: grave.z,
          rotationY: grave.rotationY,
          scale: grave.scale,
        };
        const look: MoundLook = grave.fresh && overgrown < FRESH_OVERGROWN ? 'earth' : 'grass';
        const key = `${look}-${size}`;
        mounds.set(key, [...(mounds.get(key) ?? []), instance]);
        if (shape.post) {
          posts.push({
            ...instance,
            y: instance.y + (shape.height - POST.sinkM) * grave.scale,
            scale: 1,
          });
        }
      };
      // staré hroby po řadách jako dřív (čerstvé jen, dokud nejsou mohyly podle významu)
      const mounded = cemetery.mounds ?? [];
      const fresh = mounded.length > 0 ? 0 : FRESH_GRAVES;
      for (const grave of gravePlacements(ready, cemetery.graves, cemetery.id, fresh)) {
        add(grave, 'normal');
      }
      for (const mound of moundPlacements(ready, mounded, cemetery.id)) add(mound, mound.size);
    }

    const shape: HideShape = {
      bounds: cellsBounds(squares, HIDE_MARGIN_M),
      contains: cellsContain(squares, HIDE_MARGIN_M),
    };
    return { key, meshes, shape, fences: owners, pegs, mounds, posts };
  }

  /** Sdílené meshe kolíků, mohyl a kůlů dostanou instance všech pohřebišť, ploty se přepíšou. */
  private updateInstances(): void {
    this.context.fences.commit();
    const views = [...this.views.values()];
    this.pegs.set(views.flatMap((v) => v.pegs));
    for (const { look, size } of MOUND_KEYS) {
      const key = `${look}-${size}`;
      const instances = views.flatMap((v) => v.mounds.get(key) ?? []);
      let mesh = this.moundMeshes.get(key);
      if (!mesh && instances.length > 0) {
        mesh = this.createMoundMesh(look, size);
        this.moundMeshes.set(key, mesh);
      }
      if (mesh) setInstances(mesh, instances);
    }
    const posts = views.flatMap((v) => v.posts);
    if (posts.length > 0) this.postMesh ??= this.createPostMesh();
    if (this.postMesh) setInstances(this.postMesh, posts);
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

  /**
   * Mohyla: kupka s kosinovým profilem, okraj o kousek v zemi; podlouhlá mohyla hlavy rodiny je
   * protažená po místní ose z. Běžná mohyla je dřívější mohylka beze změny (stejné nerovnosti).
   */
  private createMoundMesh(look: MoundLook, size: MoundSize): Mesh {
    const { radius, length, height } = MOUND_SHAPES[size];
    const great = size === 'great';
    const segments = great ? GREAT_MOUND_SEGMENTS : MOUND_SEGMENTS;
    const rings = great ? GREAT_MOUND_RINGS : MOUND_RINGS;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const sizeSeed = { normal: 0, small: 101, large: 211, great: 307 }[size];
    const random = seededRandom((look === 'grass' ? 11 : 13) + sizeSeed);
    // vrchol a prstence od středu k okraji
    positions.push(0, height, 0);
    uvs.push(0.5, 0.5);
    for (let ring = 1; ring <= rings; ring++) {
      const t = ring / rings;
      const y = ring === rings ? -0.06 : height * Math.cos((t * Math.PI) / 2) ** 1.3;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        // drobné nerovnosti – mohyly nejsou soustružené
        const wobble = ring === rings ? 1 : 1 + (random() - 0.5) * 0.08;
        const x = Math.cos(angle) * radius * t * wobble;
        const z = Math.sin(angle) * length * t * wobble;
        positions.push(x, y, z);
        uvs.push(0.5 + x / 1.6, 0.5 + z / 1.6);
      }
    }
    for (let s = 0; s < segments; s++) {
      indices.push(0, 1 + ((s + 1) % segments), 1 + s);
    }
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * segments;
      const outer = 1 + ring * segments;
      for (let s = 0; s < segments; s++) {
        const s1 = (s + 1) % segments;
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
    const name = size === 'normal' ? look : `${look}-${size}`;
    const mesh = new Mesh(`village-cemetery-mounds-${name}`, this.scene);
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
      // v zimě zapadají sněhem jako terén kolem (čerstvá hlína i zarostlé stejně)
      applySeasonRelief(m);
      return m;
    });
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  /**
   * Dřevěný kůl na mohyle vojvody: osmiboký, ke špičce se zužuje, pata v mohyle (počátek
   * = pata kůlu).
   */
  private createPostMesh(): Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const { heightM, baseRadiusM, topRadiusM, sides } = POST;
    for (let k = 0; k < sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      positions.push(c * baseRadiusM, 0, s * baseRadiusM, c * topRadiusM, heightM, s * topRadiusM);
    }
    for (let k = 0; k < sides; k++) {
      const a = 2 * k;
      const b = 2 * ((k + 1) % sides);
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    // zkosená hlava kůlu
    const top = positions.length / 3;
    positions.push(0, heightM + 0.06, 0);
    for (let k = 0; k < sides; k++) {
      indices.push(top, 2 * ((k + 1) % sides) + 1, 2 * k + 1);
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    const mesh = new Mesh('village-cemetery-mound-posts', this.scene);
    data.applyToMesh(mesh);
    mesh.material = this.material('mound-post', () => {
      const m = new StandardMaterial('village-cemetery-mound-post', this.scene);
      // zšedlé dubové dřevo
      m.diffuseColor = new Color3(0.3, 0.24, 0.18);
      m.specularColor = Color3.Black();
      m.ambientColor = AMBIENT;
      applySeasonRelief(m, POST_SNOW);
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

function cemeteryKey(c: SceneCemetery, gate: Point | null): string {
  const building = !c.built || c.squares.some((s) => s.pending);
  // natočený hřbitov (fields.md – Natočené stavby) – mřížka podle prvního čtverce
  const first = c.squares[0];
  const turned =
    first?.rotation === undefined
      ? ''
      : `@${first.x.toFixed(2)},${first.z.toFixed(2)},${first.rotation.toFixed(3)}`;
  return [
    c.squares.map((s) => `${s.cell.x},${s.cell.y}${s.pending ? 'p' : ''}`).join(';') + turned,
    c.built,
    // průběh po 2 % – plot nepřibývá plynule, ale ani se nepřestavuje při každém dotazu
    building ? Math.round(c.progress * 50) : '',
    c.graves,
    // mohyly podle významu – místo, velikost a čerstvost
    (c.mounds ?? [])
      .map((m) => `${m.cell.x},${m.cell.y}:${m.column},${m.row}${m.size[0]}${m.fresh ? 'f' : ''}`)
      .join(';'),
    gate ? `${Math.round(gate[0])},${Math.round(gate[1])}` : '',
    // rozpad plotu opuštěného hřbitova po dvacetinách (abandonment.md)
    c.fence === undefined ? '' : fenceDecay(c.fence),
  ].join('|');
}

/** Rozpad plotu hřbitova po dvacetinách (0 = celý plot). */
function fenceDecay(condition: number | undefined): number {
  return Math.round(fenceDecayAmount(condition) * FENCE_DECAY_STEPS) / FENCE_DECAY_STEPS;
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
