import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { ShowcaseModel } from './building-showcase-layout';
import { SUN_DIRECTION } from './constants';
import { plotInward, plotStakingLine } from './homestead-layout';
import {
  PIT_SHAPES,
  pitMeshData,
  pitOutline,
  spoilHeapData,
  worldToLocal,
  type PitCut,
} from './dwelling-pit';
import { instanceMatrices, type ModelInstance } from './instanced-model';
import { applyPitCut, type PitCuts } from './pit-cut';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { closedLine } from './staking-layout';
import {
  CONSTRUCTION_BASE,
  ROUND_SITE_M,
  constructionState,
  sitePropPlace,
  type ConstructionKind,
  type ConstructionState,
} from './village-construction';
import {
  DWELLING_CLEARANCE_M,
  decalGrid,
  localToWorld,
  polygonBounds,
  smoothstep,
  softCoverage,
  stripSegments,
  type Point,
} from './village-layout';
import { createDecalMaterial, createDecalMesh, createStripMesh } from './village-meshes';

/**
 * VÝVOJOVÝ NÁHLED – staveniště na stránce /dev/buildings podle průběhu stavby 0–1: díly
 * z construction.glb obydlí, řemesel a posvátných míst v instancích, jámy s hloubkou podle kopání, sejmutý drn,
 * vytyčení, ušlapaná tráva, hromada hlíny a rekvizity – stejné stavy jako ve vsi
 * (village-construction.ts, kreslení podle village-renderer.ts), jen na rovné louce.
 */

/** Pata modelů a výška obtisků nad rovinou (jako ve vsi – LIFT ve village-renderer.ts). */
const LIFT = { outline: 0.06, worn: 0.03, turf: 0.045 };
const TURF_MARGIN_M = 0.35;
const TRAMPLED_INSET_M = 0.6;
const TRAMPLED_SOFT_M = 2.2;
const SPOIL_HEAP_M = { rx: 1.7, rz: 1.2, height: 0.72 };
/** Přístřešek hrnčíře a kováře sahá o tolik dál před obydlí (m) – ušlapaná tráva i před ním. */
const PORCH_EXTRA_M = 2.6;
/** Kruhové staveniště (milíř, modla, svatyně): poloměr vytyčení a ušlapané trávy (m). */
function roundSite(kind: ConstructionKind): { outline: number; trampled: number } {
  return kind === 'milir' || kind === 'modla' || kind === 'svatyne'
    ? ROUND_SITE_M[kind]
    : ROUND_SITE_M.milir;
}

/** Klíč stavu – obtisky a jámy se přestaví, jen když se změní (po 1 %). */
function siteKey(state: ConstructionState | null): string {
  if (!state) return 'built';
  const r = (v: number): number => Math.round(v * 100);
  const spoil = state.props.find((p) => p.prop === 'spoil')?.scale ?? 0;
  return [
    r(state.pitDepth),
    r(state.roofCover),
    r(state.outline),
    r(state.turf),
    r(state.trampled),
    r(spoil),
  ].join('|');
}

interface SiteView {
  model: ShowcaseModel;
  key: string;
  meshes: Mesh[];
  cut: PitCut | null;
  /** Kolíky vytyčení (jako ve vsi – staking.ts), dokud se nezačne kopat. */
  pegs: ModelInstance[];
}

/** Směr dovnitř pozemku v osách modelu – rekvizity rohového domu se zrcadlí dovnitř. */
function inwardOf(model: ShowcaseModel): { x: number; z: number } | undefined {
  return model.plot ? plotInward(model.plot.variant) : undefined;
}

/** Čára vytyčení: kolem pozemku (po budoucím plotu), u volné stavby kolem jámy se šíjí. */
function stakingLine(model: ShowcaseModel, pit: Point[]): Point[] {
  return model.plot ? plotStakingLine(model.plot) : closedLine(pit);
}

export class ShowcaseSites {
  private readonly views: SiteView[];
  private readonly materials = new Map<string, Material>();
  private readonly stakes: StakingPegs;

  constructor(
    private readonly scene: Scene,
    models: readonly ShowcaseModel[],
    /** Díly staveniště podle jména uzlu („hrncir-kiln-base“, „site-turf“…). */
    private readonly parts: ReadonlyMap<string, Mesh>,
    private readonly pitCuts: PitCuts,
    private readonly baseY: number,
    /** Pata dílů staveniště podle druhu (posvátná místa leží na terénu). */
    private readonly partBaseY: (kind: ConstructionKind) => number = () => baseY,
  ) {
    this.views = models.map((model) => ({ model, key: '', meshes: [], cut: null, pegs: [] }));
    this.stakes = new StakingPegs(scene);
  }

  /** Staveniště při průběhu `progress` (1 = hotové stavby – jen jámy). */
  update(progress: number): void {
    const instances = new Map<string, ModelInstance[]>();
    const push = (name: string, instance: ModelInstance): void => {
      const list = instances.get(name);
      if (list) list.push(instance);
      else instances.set(name, [instance]);
    };
    for (const view of this.views) {
      const { model } = view;
      const state = progress >= 1 ? null : constructionState(model.kind, progress);
      if (state) {
        const house = {
          x: model.x,
          y: this.partBaseY(model.kind),
          z: model.z,
          rotationY: model.rotation,
          scale: 1,
        };
        for (const part of state.parts) push(`${model.kind}-${part}`, house);
        for (const { prop, scale } of state.props) {
          if (prop === 'spoil') continue; // hromadu hlíny kreslí síť staveniště
          const place = sitePropPlace(model.kind, prop, inwardOf(model));
          const [x, z] = localToWorld(model, place.x, place.z);
          push(`site-${prop}`, {
            x,
            y: -0.02,
            z,
            rotationY: model.rotation + place.rotation,
            scale,
          });
        }
      }
      const key = siteKey(state);
      if (key !== view.key) {
        view.key = key;
        for (const mesh of view.meshes) mesh.dispose();
        view.meshes = this.siteMeshes(view, state);
      }
    }
    for (const [name, mesh] of this.parts) {
      const list = instances.get(name);
      if (!list) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.thinInstanceSetBuffer('matrix', instanceMatrices(list), 16, false);
      mesh.setEnabled(true);
    }
    this.pitCuts.set(this.views.flatMap((v) => (v.cut ? [v.cut] : [])));
    this.stakes.set(this.views.flatMap((v) => v.pegs));
  }

  dispose(): void {
    for (const view of this.views) for (const mesh of view.meshes) mesh.dispose();
    this.stakes.dispose();
  }

  /** Jáma, obtisky staveniště a hromada hlíny jednoho modelu (null = hotová stavba). */
  private siteMeshes(view: SiteView, state: ConstructionState | null): Mesh[] {
    const { model } = view;
    const base = CONSTRUCTION_BASE[model.kind];
    const meshes: Mesh[] = [];
    view.cut = null;
    view.pegs = [];
    if (state && state.trampled > 0) meshes.push(this.trampled(model, state.trampled));
    if (base !== null) {
      const shape = PIT_SHAPES[base];
      const depth = state ? state.pitDepth : shape.depth;
      if (state && state.turf > 0) meshes.push(this.turf(model, state.turf));
      if (state && state.outline > 0) {
        const pit = pitOutline(shape, 0).map(([x, z]) => localToWorld(model, x, z));
        meshes.push(this.outline(model, pit));
        // kolíky a provázek – u pozemku kolem celého políčka
        const line = stakingLine(model, pit);
        view.pegs = pegInstances([line], () => 0);
        let string = this.materials.get('string');
        if (!string) {
          string = createStringMaterial(this.scene);
          this.materials.set('string', string);
        }
        meshes.push(
          createStringMesh(this.scene, `showcase-string-${model.kind}`, [line], () => 0, string),
        );
      }
      if (depth > 0) {
        view.cut = { position: model, shape };
        meshes.push(this.pit(model, depth, state ? state.roofCover : 1, state !== null));
      }
      const spoil = state?.props.find((p) => p.prop === 'spoil');
      if (spoil) meshes.push(this.spoil(model, spoil.scale));
    } else if (state && state.outline > 0) {
      const r = roundSite(model.kind).outline;
      const n = Math.max(32, Math.round(r * 6));
      const circle: Point[] = Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return [model.x + r * Math.cos(a), model.z + r * Math.sin(a)];
      });
      meshes.push(this.outline(model, circle));
    }
    return meshes;
  }

  private trampled(model: ShowcaseModel, alpha: number): Mesh {
    const base = CONSTRUCTION_BASE[model.kind];
    let area: Point[];
    if (base === null) {
      const r = roundSite(model.kind).trampled - TRAMPLED_SOFT_M / 2;
      const n = Math.max(24, Math.round(r * 4));
      area = Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return [model.x + r * Math.cos(a), model.z + r * Math.sin(a)];
      });
    } else if (model.plot) {
      const h = model.plot.size / 2 - TRAMPLED_INSET_M - TRAMPLED_SOFT_M / 2;
      const { x, z } = model.plot;
      area = [
        [x - h, z - h],
        [x + h, z - h],
        [x + h, z + h],
        [x - h, z + h],
      ];
    } else {
      const c = DWELLING_CLEARANCE_M[base];
      const porch = model.kind === 'hrncir' || model.kind === 'kovar' ? PORCH_EXTRA_M : 0;
      const inset = TRAMPLED_INSET_M + TRAMPLED_SOFT_M / 2;
      area = [
        localToWorld(model, c.minX + inset, c.minZ + inset),
        localToWorld(model, c.maxX - inset, c.minZ + inset),
        localToWorld(model, c.maxX - inset, c.maxZ - inset - 2 + porch),
        localToWorld(model, c.minX + inset, c.maxZ - inset - 2 + porch),
      ];
    }
    const b = polygonBounds(area);
    const pad = TRAMPLED_SOFT_M;
    const mesh = createDecalMesh(
      this.scene,
      `showcase-trampled-${model.kind}`,
      decalGrid(
        { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
        0.6,
        softCoverage(area, TRAMPLED_SOFT_M),
      ),
      { height: () => 0, lift: LIFT.worn, color: [1, 0.95, 0.86], alpha, uv: 20 },
    );
    mesh.material = this.decalMaterial('grass-dirt', -2);
    mesh.alphaIndex = 1;
    return mesh;
  }

  /** Sejmutý drn – od zadní stěny (−z) k šíji, jako ve vsi. */
  private turf(model: ShowcaseModel, turf: number): Mesh {
    const shape = PIT_SHAPES[CONSTRUCTION_BASE[model.kind]!];
    const outline = pitOutline(shape, TURF_MARGIN_M).map(([x, z]) => localToWorld(model, x, z));
    const b = polygonBounds(outline);
    const coverage = softCoverage(outline, 0.35);
    const start = -shape.halfZ - TURF_MARGIN_M;
    const front = start + turf * (shape.rampEndZ + TURF_MARGIN_M - start + 0.3);
    const mesh = createDecalMesh(
      this.scene,
      `showcase-turf-${model.kind}`,
      decalGrid(
        { minX: b.minX - 0.5, maxX: b.maxX + 0.5, minZ: b.minZ - 0.5, maxZ: b.maxZ + 0.5 },
        0.3,
        (x, z) =>
          coverage(x, z) * (1 - smoothstep(front - 0.4, front, worldToLocal(model, x, z)[1])),
      ),
      { height: () => 0, lift: LIFT.turf, color: [0.72, 0.58, 0.46], uv: 10 },
    );
    mesh.material = this.decalMaterial('mud', -3);
    mesh.alphaIndex = 2;
    return mesh;
  }

  private outline(model: ShowcaseModel, points: Point[]): Mesh {
    const mesh = createStripMesh(
      this.scene,
      `showcase-layout-${model.kind}`,
      stripSegments(points, true, 0.09, 0.5),
      () => 0,
      LIFT.outline,
    );
    let material = this.materials.get('layout');
    if (!material) {
      const standard = new StandardMaterial('showcase-layout', this.scene);
      standard.diffuseColor = new Color3(0.8, 0.76, 0.64);
      standard.specularColor = Color3.Black();
      standard.zOffset = -4;
      standard.backFaceCulling = false;
      material = standard;
      this.materials.set('layout', material);
    }
    mesh.material = material;
    return mesh;
  }

  private pit(model: ShowcaseModel, depth: number, roofCover: number, fresh: boolean): Mesh {
    const shape = PIT_SHAPES[CONSTRUCTION_BASE[model.kind]!];
    const data = pitMeshData(shape, model, {
      depth,
      base: this.baseY,
      rim: () => 0,
      roofCover,
      fresh,
      sun: SUN_DIRECTION,
    });
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.normals = data.normals;
    vertexData.uvs = data.uvs;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    const mesh = new Mesh(`showcase-pit-${model.kind}`, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = this.pitMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /** Hromada hlíny z jámy – roste s kopáním, ubývá na valy. */
  private spoil(model: ShowcaseModel, scale: number): Mesh {
    const place = sitePropPlace(model.kind, 'spoil', inwardOf(model));
    const [x, z] = localToWorld(model, place.x, place.z);
    const data = spoilHeapData({
      seed: model.x + model.z * 7,
      x,
      z,
      rotation: model.rotation + place.rotation,
      rx: SPOIL_HEAP_M.rx * Math.sqrt(scale),
      rz: SPOIL_HEAP_M.rz * Math.sqrt(scale),
      height: SPOIL_HEAP_M.height * scale,
      ground: () => 0,
    });
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.uvs = data.uvs;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    const normals = new Float32Array(data.positions.length);
    VertexData.ComputeNormals(data.positions, data.indices, normals);
    vertexData.normals = normals;
    const mesh = new Mesh(`showcase-spoil-${model.kind}`, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = this.pitMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /** Hlína jámy a hromady: textura bahna, barvy (ornice, podloží, stín) nesou vrcholy. */
  private pitMaterial(): Material {
    let material = this.materials.get('pit');
    if (!material) {
      const standard = new StandardMaterial('showcase-pit', this.scene);
      standard.specularColor = Color3.Black();
      standard.backFaceCulling = false;
      standard.twoSidedLighting = true;
      standard.diffuseTexture = new Texture('/textures/terrain/mud.jpg', this.scene);
      material = standard;
      this.materials.set('pit', material);
    }
    return material;
  }

  private decalMaterial(texture: 'grass-dirt' | 'mud', zOffset: number): Material {
    const key = `decal-${texture}`;
    let material = this.materials.get(key);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `showcase-${key}`, { texture, zOffset });
      applyPitCut(decal, this.pitCuts);
      material = decal;
      this.materials.set(key, material);
    }
    return material;
  }
}
