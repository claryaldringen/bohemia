import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PathLine } from '@bohemia/game';
import type { SceneRoad } from '../village-view';
import { applyGammaFog } from './gamma-fog';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import {
  DITCH_LAYER,
  EARTH_LAYER,
  IMPROVED_EARTH_LAYER,
  IMPROVED_WORN_LAYER,
  WORN_LAYER,
  pathRibbons,
  type RibbonLayer,
} from './path-ribbon';
import {
  bridgePieces,
  ditchLines,
  logPieces,
  roadBands,
  roadWorksKey,
  stakingLines,
  stonePieces,
  type RoadPiece,
} from './road-works-layout';
import { applySeasonSnow } from './season-materials';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { createDecalMesh, type HeightFn } from './village-meshes';

// Díly vylepšených pevných cest ve scéně (docs/design/roads.md): kameny upravené cesty, kmeny
// hatě, lávky přes brody (modely z tools/blender/roads.py v instancích) a vytyčení rozestavěného
// vylepšení. Kde co leží, počítá road-works-layout.ts z dat vsi; přestaví se jen při změně dat.

type RoadModel = 'road-log' | 'road-stone' | 'road-bridge' | 'road-bridge-posts';
const MODELS: readonly RoadModel[] = ['road-log', 'road-stone', 'road-bridge', 'road-bridge-posts'];
/** Kmeny a kameny kousek zapuštěné do bláta (m). */
const SINK_M = {
  'road-log': 0.06,
  'road-stone': 0.05,
  'road-bridge': 0.05,
  'road-bridge-posts': 0.05,
};

export interface RoadWorksEnvironment {
  /** Výška terénu pro paty dílů. */
  groundHeight: HeightFn;
  addShadowCaster(mesh: Mesh): void;
  requestRender(): void;
  refreshShadows(): void;
}

/** Díly vylepšených cest a vytyčení – `update` je přestaví, jen když se změní data cest. */
export class RoadWorks {
  private key = '';
  private readonly models = new Map<RoadModel, Promise<Mesh | null>>();
  private instances = new Map<RoadModel, ModelInstance[]>();
  private readonly pegs: StakingPegs;
  private stringMesh: Mesh | null = null;
  private stringMaterial: Material | null = null;
  private lines: ReturnType<typeof stakingLines> = [];
  private visible = true;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly env: RoadWorksEnvironment,
  ) {
    this.pegs = new StakingPegs(scene, (mesh) => env.addShadowCaster(mesh));
  }

  update(roads: readonly SceneRoad[]): void {
    const key = roadWorksKey(roads);
    if (key === this.key) return;
    this.key = key;
    const h = this.env.groundHeight;
    const at = (model: RoadModel, p: RoadPiece, y?: number): ModelInstance => ({
      x: p.x,
      y: (y ?? h(p.x, p.z)) - SINK_M[model],
      z: p.z,
      rotationY: p.rotationY,
      scale: p.scale,
    });
    const bridges = bridgePieces(roads);
    // lávka leží na vyšším z obou břehů – ne na dně potoka
    const bridgeY = (b: (typeof bridges)[number]): number =>
      Math.max(h(b.ends[0][0], b.ends[0][1]), h(b.ends[1][0], b.ends[1][1]));
    this.instances = new Map<RoadModel, ModelInstance[]>([
      ['road-stone', stonePieces(roads).map((p) => at('road-stone', p))],
      ['road-log', logPieces(roads).map((p) => at('road-log', p))],
      [
        'road-bridge',
        bridges.filter((b) => b.stage === 'deck').map((b) => at('road-bridge', b, bridgeY(b))),
      ],
      [
        'road-bridge-posts',
        bridges
          .filter((b) => b.stage === 'posts')
          .map((b) => at('road-bridge-posts', b, bridgeY(b))),
      ],
    ]);
    for (const model of MODELS) this.showModel(model);
    // vytyčení rozestavěného vylepšení – kolíky a provázek
    const lines = stakingLines(roads);
    this.lines = lines;
    this.pegs.set(this.visible ? pegInstances(lines, h) : []);
    this.stringMesh?.dispose();
    this.stringMesh = null;
    if (lines.length > 0) {
      this.stringMaterial ??= createStringMaterial(this.scene);
      this.stringMesh = createStringMesh(
        this.scene,
        'roads-staking',
        lines,
        h,
        this.stringMaterial,
      );
      this.stringMesh.setEnabled(this.visible);
    }
    this.env.requestRender();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.stringMesh?.setEnabled(visible);
    this.pegs.set(visible ? pegInstances(this.lines, this.env.groundHeight) : []);
    for (const model of MODELS) this.showModel(model);
  }

  dispose(): void {
    this.disposed = true;
    this.pegs.dispose();
    this.stringMesh?.dispose();
    this.stringMaterial?.dispose();
    for (const model of this.models.values()) void model.then((mesh) => mesh?.dispose());
    this.models.clear();
  }

  private showModel(model: RoadModel): void {
    const list = this.instances.get(model) ?? [];
    const loaded = this.models.get(model);
    if (list.length === 0 && !loaded) return;
    const mesh = loaded ?? this.load(model);
    void mesh.then((m) => {
      if (!m || this.disposed) return;
      const current = this.instances.get(model) ?? [];
      if (current.length === 0 || !this.visible) {
        m.setEnabled(false);
      } else {
        m.thinInstanceSetBuffer('matrix', instanceMatrices(current), 16, true);
        m.setEnabled(true);
      }
      this.env.refreshShadows();
    });
  }

  private load(model: RoadModel): Promise<Mesh | null> {
    const promise = loadMergedModel(
      this.scene,
      `/models/roads/${model}.glb`,
      `roads-${model}`,
      (material) => prepareRoadMaterial(material),
    ).then(
      (mesh) => {
        if (!mesh) return null;
        mesh.isPickable = false;
        mesh.setEnabled(false);
        if (model !== 'road-stone') this.env.addShadowCaster(mesh);
        return mesh;
      },
      (error: unknown) => {
        console.warn(`Díl cesty (${model}) se nepodařilo načíst.`, error);
        return null;
      },
    );
    this.models.set(model, promise);
    return promise;
  }
}

/** Jak kreslit obtisky pevných cest – výšky, materiály vrstev a jejich pořadí. */
export interface RoadRibbonOptions {
  height: HeightFn;
  smoothHeight: HeightFn;
  material(kind: 'worn' | 'earth'): Material;
  lift: { worn: number; earth: number };
  alphaIndex: { worn: number; earth: number };
}

/**
 * Obtisky pevných cest (roads.md): vyšlapaná jako plně vyšlapaná pěšina, upravená širší, strouha
 * upravené cesty – meshe `roads-*` (prázdné se nevytvoří).
 */
export function roadRibbonMeshes(
  scene: Scene,
  roads: readonly SceneRoad[],
  o: RoadRibbonOptions,
): Mesh[] {
  const bands = roadBands(roads);
  const ditches: PathLine[] = ditchLines(roads).map((points) => ({
    points,
    strength: points.map(() => 1),
    years: points.map(() => 0),
    openStart: true,
    openEnd: true,
  }));
  const ribbons: [
    string,
    readonly PathLine[],
    'worn' | 'earth',
    RibbonLayer,
    [number, number, number],
  ][] = [
    ['roads-worn', bands.trodden, 'worn', WORN_LAYER, WORN_COLOR],
    ['roads-earth', bands.trodden, 'earth', EARTH_LAYER, EARTH_COLOR],
    ['roads-improved-worn', bands.improved, 'worn', IMPROVED_WORN_LAYER, WORN_COLOR],
    ['roads-improved-earth', bands.improved, 'earth', IMPROVED_EARTH_LAYER, EARTH_COLOR],
    // strouha – tmavší vlhké bláto
    ['roads-ditch', ditches, 'earth', DITCH_LAYER, [0.58, 0.48, 0.38]],
  ];
  const meshes: Mesh[] = [];
  for (const [name, lines, kind, layer, color] of ribbons) {
    if (lines.length === 0) continue;
    const grid = pathRibbons(lines, layer);
    if (grid.indices.length === 0) continue;
    const mesh = createDecalMesh(scene, name, grid, {
      height: o.height,
      smoothHeight: o.smoothHeight,
      lift: o.lift[kind],
      color,
      uv: kind === 'worn' ? 20 : 14,
    });
    mesh.material = o.material(kind);
    mesh.alphaIndex = o.alphaIndex[kind];
    meshes.push(mesh);
  }
  return meshes;
}

/** Prošlapaná tráva do hněda, holá udusaná hlína tmavší a teplejší (jako pěšiny). */
const WORN_COLOR: [number, number, number] = [0.92, 0.84, 0.7];
const EARTH_COLOR: [number, number, number] = [0.9, 0.74, 0.58];

/** Materiál dílů cesty – dřevo a kámen tlumeně jako dekorace, v zimě sníh navrchu. */
function prepareRoadMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallicF0Factor = 0;
  material.directIntensity = 0.75;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  applySeasonSnow(material, 0.8);
}
