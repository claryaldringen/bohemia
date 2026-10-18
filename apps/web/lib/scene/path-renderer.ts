import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  OUTCROP_RADIUS_M,
  SACRED_BUILDINGS,
  obstacleIndex,
  obstacleStatus,
  obstaclesNear,
  type ForestField,
  type Landscape,
  type ObstacleKind,
  type ObstacleLayer,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { loadMergedModel } from './instanced-model';
import { logPileSite } from './log-pile-layout';
import {
  computePathNetwork,
  pathBounds,
  pathNetworkKey,
  pathRouter,
  type PathNetwork,
} from './path-network';
import { EARTH_LAYER, WORN_LAYER, pathRibbons } from './path-ribbon';
import {
  buildPathTerrain,
  pathWindowFor,
  windowContains,
  withObstacles,
  type PathTerrain,
  type PathTerrainSource,
} from './path-terrain';
import { PATH_TREE_MODELS, pathsideTrees, type PathTree, type PathTreeModel } from './path-trees';
import { applyPitCut, type PitCuts } from './pit-cut';
import type { RenderSurface } from './render-surface';
import { applySeasonGround } from './season-materials';
import { prepareTreeMaterial } from './trees';
import { decalGrid } from './village-layout';
import { createDecalMaterial, createDecalMesh, type HeightFn } from './village-meshes';
import { houseBox, plotBox, siteBox, type VillagerPaths } from './villager-plan';

// Vyšlapané pěšiny ve scéně (docs/design/paths.md): síť se spočítá v prohlížeči z vsi
// a krajiny (path-network.ts), jen když se změní rozložení vsi nebo místa práce dne – odloženě
// a nikdy za snímek. Kreslí se jako obtisky na terénu pod poli a obtisky vsi (prošlapaná tráva
// a holá hlína uprostřed silných pěšin), staré pěšiny přes pole lemují stromy (path-trees.ts).
// Postavy po pěšinách chodí (`paths()` pro villager-plan.ts).

/** Po změně vsi se síť přepočítá až po takové pauze (ms) – dotazy na ves chodí za sebou. */
const RECOMPUTE_DELAY_MS = 250;
/** Výška obtisků pěšin nad terénem (m) – pod poli a obtisky vsi (0,03). */
const LIFT = { worn: 0.018, earth: 0.022, heatmap: 0.12 };
/** Sníh na pěšinách – vyšlapaná pěšina pod sněhem trochu prosvítá. */
const PATH_SNOW = 0.9;
/** Brod přes potok: mělký (0–1) a úzký úsek (poloviční šířka v m). */
const FORD = { shallow: 0.55, halfWidthM: 2.4 };
/**
 * Překážky krajiny pro pěšiny: poloměr (m na jednotku velikosti, 0 = jen buňka kmene) a cena
 * navíc (Infinity = neprůchodné) – pěšina se kmenům a keřům vyhne, přes balvan a skálu nevede.
 */
const OBSTACLE_COST: Record<ObstacleKind, { radius: number; extra: number }> = {
  tree: { radius: 0, extra: 3 },
  youngTree: { radius: 0, extra: 1.5 },
  snag: { radius: 0, extra: 2 },
  fallenTree: { radius: 1.5, extra: 4 },
  stump: { radius: 0, extra: 0.8 },
  shrub: { radius: 0, extra: 2.5 },
  stone: { radius: 0, extra: 1 },
  boulder: { radius: 1.2, extra: Infinity },
  outcrop: { radius: OUTCROP_RADIUS_M, extra: Infinity },
};
/** Strom podél pěšiny: od lesa (m, znaménková vzdálenost), od domů a plotů, od hřbitova a sadu. */
const TREE_FOREST_M = -6;
const TREE_HOUSE_M = 3;
const TREE_SQUARE_M = 1.5;
/** Pěšina vede „přes pole“ (polní krajinou), když je od dílu pole nejvýš tak daleko (m). */
const FIELD_NEAR_M = 22;
/** Stromy podél pěšin až kus za domy (m od středu obydlí) – ves sama stromořadí nemá. */
const TREE_HOMESTEAD_M = 16;

export interface PathsEnvironment {
  landscape: Landscape;
  surface: RenderSurface;
  field: ForestField;
  layer: ObstacleLayer;
  /** Přesná výška vykresleného terénu (obtisky) a hladký terén (normály, paty stromů). */
  decalHeight: HeightFn;
  groundHeight: HeightFn;
  pitCuts: PitCuts;
  addShadowCaster(mesh: Mesh): void;
  /** Nová síť pěšin (postavy chodí po ní) – překreslit. */
  onChange(): void;
  /** Dočetla se textura nebo model – překreslit. */
  requestRender(): void;
  /** Stromy podél pěšin se změnily (načtení, vidět / skrýt) – obnovit stíny a překreslit. */
  refreshShadows(): void;
}

/** Čísla posledního výpočtu (vývojová stránka, měření). */
export interface PathStats {
  /** Celkem (síť a stromy) a z toho stromy podél pěšin (ms). */
  ms: number;
  treesMs: number;
  terrainMs: number;
  cells: number;
  trips: number;
  lines: number;
  trees: number;
}

/**
 * Pěšiny vsi: `update` naplánuje přepočet sítě (jen při změně klíče, odloženě), po výpočtu
 * přestaví obtisky a stromy a ohlásí změnu.
 */
export class VillagePaths {
  private village: SceneVillage | null = null;
  private key = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private terrain: PathTerrain | null = null;
  /** Terén okna s překážkami krajiny – přepočítá se jen s novým oknem nebo změnou překážek. */
  private obstacleTerrain: { key: string; terrain: PathTerrain } | null = null;
  private network: PathNetwork | null = null;
  private router: VillagerPaths | null = null;
  private meshes: Mesh[] = [];
  private heatmapMesh: Mesh | null = null;
  private readonly materials = new Map<string, Material>();
  private readonly treeModels = new Map<PathTreeModel, Promise<Mesh | null>>();
  private trees: PathTree[] = [];
  private visible = true;
  private heatmap = false;
  private disposed = false;
  stats: PathStats | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly env: PathsEnvironment,
  ) {}

  /** Ves se změnila – když se změnilo, na čem pěšiny závisí, přepočítají se (odloženě). */
  update(village: SceneVillage): void {
    if (this.disposed) return;
    this.village = village;
    const key = pathNetworkKey(village);
    if (key === this.key) return;
    this.key = key;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.recompute();
    }, RECOMPUTE_DELAY_MS);
  }

  /** Přepočítá hned (bez čekání) – testovací háčky a vývojová stránka. */
  flush(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.recompute();
  }

  /** Trasy po pěšinách a pochůzky domácností pro postavy; bez sítě null. */
  paths(): VillagerPaths | null {
    return this.router;
  }

  /** Vývojová volba: pěšiny (obtisky i stromy) vidět / skrýt. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const mesh of this.meshes) mesh.setEnabled(visible);
    void Promise.all(
      [...this.treeModels.values()].map((model) =>
        model.then((mesh) => mesh?.setEnabled(visible && this.hasTrees(mesh))),
      ),
    ).then(() => this.env.refreshShadows());
    this.env.requestRender();
  }

  /** Vývojová volba: teplotní mapa provozu (cest za den) přes okno pěšin. */
  setHeatmap(enabled: boolean): void {
    this.heatmap = enabled;
    this.rebuildHeatmap();
    this.env.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
    this.heatmapMesh?.dispose();
    this.heatmapMesh = null;
    for (const model of this.treeModels.values()) void model.then((mesh) => mesh?.dispose());
    this.treeModels.clear();
  }

  private recompute(): void {
    const village = this.village;
    if (!village || this.disposed) return;
    const bounds = pathBounds(village);
    if (!bounds) {
      this.show(null, { ms: 0, treesMs: 0, terrainMs: 0, cells: 0, trips: 0, lines: 0, trees: 0 });
      return;
    }
    const source = this.terrainSource();
    const window = pathWindowFor(source, bounds);
    let terrainMs = 0;
    if (!this.terrain || !windowContains(this.terrain.window, window)) {
      const t0 = performance.now();
      this.terrain = buildPathTerrain(source, window);
      terrainMs = performance.now() - t0;
    }
    const layer = this.env.layer;
    const changes = village.obstacles ?? EMPTY_CHANGES;
    const obstacleKey = [
      terrain0Key(this.terrain),
      changes.removed.length,
      changes.stumps.length,
      changes.saplings.length,
    ].join('|');
    if (this.obstacleTerrain?.key !== obstacleKey) {
      const t0 = performance.now();
      const status = obstacleStatus(village.obstacles);
      const terrain = withObstacles(this.terrain, (minX, minZ, maxX, maxZ, visit) => {
        for (const i of obstaclesNear(layer, minX, minZ, maxX, maxZ)) {
          const kind = status.kindOf(layer, i);
          if (!kind) continue;
          const { radius, extra } = OBSTACLE_COST[kind];
          visit(layer.x[i]!, layer.z[i]!, radius * layer.scale[i]!, extra);
        }
      });
      this.obstacleTerrain = { key: obstacleKey, terrain };
      terrainMs += performance.now() - t0;
    }
    const terrain = this.obstacleTerrain.terrain;
    const t0 = performance.now();
    const network = computePathNetwork({
      village,
      terrain,
      tree: (id) => {
        const i = obstacleIndex(layer, id);
        return i >= 0 ? { x: layer.x[i]!, z: layer.z[i]! } : null;
      },
      logPile: logPileSite(this.env.landscape, village, layer, village.obstacles ?? EMPTY_CHANGES),
    });
    const t1 = performance.now();
    const trees = pathsideTrees(network.lines, {
      nearField: nearFieldOf(village),
      canPlant: canPlantOf(village, terrain, this.env.field),
    });
    const t2 = performance.now();
    this.trees = trees;
    this.show(network, {
      ms: t2 - t0,
      treesMs: t2 - t1,
      terrainMs,
      cells: terrain.width * terrain.height,
      trips: network.trips,
      lines: network.lines.length,
      trees: trees.length,
    });
  }

  private show(network: PathNetwork | null, stats: PathStats): void {
    this.network = network;
    this.stats = stats;
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
    if (network && network.lines.length > 0) {
      this.meshes.push(this.ribbon('paths-worn', network, 'worn'));
      const earth = this.ribbon('paths-earth', network, 'earth');
      if (earth.getTotalIndices() > 0) this.meshes.push(earth);
      else earth.dispose();
    }
    for (const mesh of this.meshes) mesh.setEnabled(this.visible);
    this.updateTrees();
    this.rebuildHeatmap();
    if (network) {
      const route = pathRouter(network);
      const errands = network.errands;
      this.router = {
        route: (a, b) => route.route(a, b),
        errand: (dwellingId, kind) => errands.get(dwellingId)?.[kind] ?? null,
      };
    } else {
      this.router = null;
    }
    this.env.onChange();
  }

  private ribbon(name: string, network: PathNetwork, kind: 'worn' | 'earth'): Mesh {
    const layer = kind === 'worn' ? WORN_LAYER : EARTH_LAYER;
    const mesh = createDecalMesh(this.scene, name, pathRibbons(network.lines, layer), {
      height: this.env.decalHeight,
      smoothHeight: this.env.groundHeight,
      lift: kind === 'worn' ? LIFT.worn : LIFT.earth,
      // prošlapaná tráva do hněda, holá hlína teplejší (jako u vchodu obydlí)
      color: kind === 'worn' ? [0.98, 0.92, 0.8] : [1.02, 0.88, 0.72],
      uv: kind === 'worn' ? 20 : 14,
    });
    mesh.material = this.decalMaterial(kind);
    // pod obtisky polí a vsi (alphaIndex 1–2) – kreslí se první z průhledných
    mesh.alphaIndex = kind === 'worn' ? 0.2 : 0.4;
    return mesh;
  }

  private decalMaterial(kind: 'worn' | 'earth'): Material {
    let material = this.materials.get(kind);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `paths-${kind}`, {
        texture: kind === 'worn' ? 'grass-dirt' : 'mud',
        zOffset: kind === 'worn' ? -1 : -1.5,
      });
      applyPitCut(decal, this.env.pitCuts);
      // tráva usychá jako terén, v zimě pěšinu zasype sníh (trochu prosvítá)
      applySeasonGround(decal, PATH_SNOW);
      const texture = decal.diffuseTexture;
      if (texture instanceof Texture && !texture.isReady()) {
        texture.onLoadObservable.addOnce(() => this.env.requestRender());
      }
      material = decal;
      this.materials.set(kind, material);
    }
    return material;
  }

  /** Stromy podél pěšin – modely se načtou s prvním stromem daného druhu. */
  private updateTrees(): void {
    for (const model of PATH_TREE_MODELS) {
      const trees = this.trees.filter((t) => t.model === model);
      const loaded = this.treeModels.get(model);
      if (trees.length === 0 && !loaded) continue;
      const mesh = loaded ?? this.loadTree(model);
      void mesh.then((m) => {
        if (!m || this.disposed) return;
        const current = this.trees.filter((t) => t.model === model);
        if (current.length === 0) {
          m.setEnabled(false);
          this.env.refreshShadows();
          return;
        }
        const matrices = new Float32Array(current.length * 16);
        const matrix = new Matrix();
        current.forEach((t, i) => {
          Matrix.ComposeToRef(
            new Vector3(t.scale, t.scale, t.scale),
            Quaternion.RotationAxis(Vector3.Up(), t.rotationY),
            new Vector3(t.x, this.env.groundHeight(t.x, t.z) - 0.05, t.z),
            matrix,
          );
          matrix.copyToArray(matrices, i * 16);
        });
        m.thinInstanceSetBuffer('matrix', matrices, 16, true);
        m.setEnabled(this.visible);
        this.env.refreshShadows();
      });
    }
  }

  private loadTree(model: PathTreeModel): Promise<Mesh | null> {
    const promise = loadMergedModel(
      this.scene,
      `/models/trees/${model}.glb`,
      `pathside-${model}`,
      (material) => prepareTreeMaterial(model, material),
    ).then(
      (mesh) => {
        if (!mesh) return null;
        mesh.isPickable = false;
        mesh.setEnabled(false);
        this.env.addShadowCaster(mesh);
        return mesh;
      },
      (error: unknown) => {
        console.warn(`Strom podél pěšiny (${model}) se nepodařilo načíst.`, error);
        return null;
      },
    );
    this.treeModels.set(model, promise);
    return promise;
  }

  private hasTrees(mesh: Mesh | null): boolean {
    return mesh !== null && this.trees.some((t) => `pathside-${t.model}` === mesh.name);
  }

  /** Teplotní mapa provozu: modrá málo, zelená, žlutá, červená hodně (log). */
  private rebuildHeatmap(): void {
    this.heatmapMesh?.dispose();
    this.heatmapMesh = null;
    const traffic = this.network?.traffic;
    if (!this.heatmap || !traffic) return;
    const { originX, originZ, cellM, width, height, values } = traffic;
    const at = (x: number, z: number): number => {
      const i = Math.round((x - originX) / cellM);
      const j = Math.round((z - originZ) / cellM);
      return i < 0 || j < 0 || i >= width || j >= height ? 0 : values[j * width + i]!;
    };
    const grid = decalGrid(
      {
        minX: originX,
        minZ: originZ,
        maxX: originX + (width - 1) * cellM,
        maxZ: originZ + (height - 1) * cellM,
      },
      cellM,
      (x, z) => (at(x, z) > 0.05 ? 0.8 : 0),
    );
    const mesh = createDecalMesh(this.scene, 'paths-heatmap', grid, {
      height: this.env.decalHeight,
      lift: LIFT.heatmap,
      color: (x, z) => heatColor(at(x, z)),
    });
    let material = this.materials.get('heatmap');
    if (!material) {
      const standard = new StandardMaterial('paths-heatmap', this.scene);
      // bez světla: barva = emisní bílá × barva vrcholu
      standard.disableLighting = true;
      standard.diffuseColor = Color3.Black();
      standard.emissiveColor = Color3.White();
      standard.specularColor = Color3.Black();
      standard.backFaceCulling = false;
      standard.zOffset = -8;
      material = standard;
      this.materials.set('heatmap', material);
    }
    mesh.material = material;
    mesh.alphaIndex = 9;
    this.heatmapMesh = mesh;
  }

  /** Terén pěšin ze sítě vykreslení a pole lesa. */
  private terrainSource(): PathTerrainSource {
    const s = this.env.surface;
    const origin = s.position(0);
    const field = this.env.field;
    return {
      resolution: s.resolution,
      originX: origin.x,
      originZ: origin.z,
      step: s.position(1).x - origin.x,
      heights: s.heights,
      waterLevel: s.waterLevel,
      forestDistance: (x, z) => field.distanceAt(x, z),
      ford: (x, z) => {
        const near = s.stream.nearest(x, z);
        return near.shallow >= FORD.shallow && near.halfWidth <= FORD.halfWidthM;
      },
      halfExtent: (this.env.landscape.size * this.env.landscape.cellSizeM) / 2,
    };
  }
}

const EMPTY_CHANGES = { removed: [], stumps: [], saplings: [] };

/** Klíč okna terénu (nové okno = nový terén s překážkami). */
function terrain0Key(terrain: PathTerrain): string {
  const w = terrain.window;
  return `${w.i0},${w.j0},${w.i1},${w.j1}`;
}

/** Barva teplotní mapy pro provoz (cest za den). */
export function heatColor(trips: number): [number, number, number] {
  const t = Math.min(1, Math.log1p(trips) / Math.log1p(25));
  const stops: [number, number, number][] = [
    [0.1, 0.25, 1],
    [0.1, 0.85, 0.35],
    [1, 0.9, 0.1],
    [1, 0.15, 0.05],
  ];
  const f = t * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(f));
  const u = f - k;
  const a = stops[k]!;
  const b = stops[k + 1]!;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Bod leží na dílu pole nebo nejvýš FIELD_NEAR_M od něj. */
function nearFieldOf(village: SceneVillage): (x: number, z: number) => boolean {
  const parts = village.fields.flatMap((f) => f.parts);
  return (x, z) =>
    parts.some(
      (p) =>
        Math.abs(x - p.x) <= p.size / 2 + FIELD_NEAR_M &&
        Math.abs(z - p.z) <= p.size / 2 + FIELD_NEAR_M,
    );
}

/**
 * Smí tu stát strom podél pěšiny: průchodný terén (ne voda, sráz), mimo les, domy se zahrádkami,
 * staveniště, svatyně, hřbitovy a sady.
 */
function canPlantOf(
  village: SceneVillage,
  terrain: PathTerrain,
  field: ForestField,
): (x: number, z: number) => boolean {
  const squares = [
    ...(village.cemeteries ?? []).flatMap((c) => c.squares),
    ...(village.orchards ?? []).flatMap((o) => o.squares),
    ...(village.sacred?.groves ?? []).flatMap((g) => g.squares),
  ];
  const houses = village.dwellings.map((d) => ({
    position: d.position,
    box: d.plot ? plotBox(d.position, d.plot) : d.built ? houseBox(d.type) : siteBox(d.type),
  }));
  const sacred = (village.sacred?.buildings ?? []).map((b) => ({
    x: b.position.x,
    z: b.position.z,
    half: SACRED_BUILDINGS[b.kind].footprintM / 2 + TREE_HOUSE_M,
  }));
  return (x, z) => {
    const i = Math.round((x - terrain.originX) / terrain.cellM);
    const j = Math.round((z - terrain.originZ) / terrain.cellM);
    if (i < 0 || j < 0 || i >= terrain.width || j >= terrain.height) return false;
    if (terrain.cost[j * terrain.width + i] === Infinity) return false;
    if (field.distanceAt(x, z) > TREE_FOREST_M) return false;
    for (const s of squares) {
      const half = s.size / 2 + TREE_SQUARE_M;
      if (Math.abs(x - s.x) < half && Math.abs(z - s.z) < half) return false;
    }
    for (const b of sacred) {
      if (Math.abs(x - b.x) < b.half && Math.abs(z - b.z) < b.half) return false;
    }
    for (const h of houses) {
      if (Math.hypot(x - h.position.x, z - h.position.z) < TREE_HOMESTEAD_M) return false;
      const c = Math.cos(h.position.rotation);
      const s = Math.sin(h.position.rotation);
      const dx = x - h.position.x;
      const dz = z - h.position.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (
        lx > h.box.minX - TREE_HOUSE_M &&
        lx < h.box.maxX + TREE_HOUSE_M &&
        lz > h.box.minZ - TREE_HOUSE_M &&
        lz < h.box.maxZ + TREE_HOUSE_M
      ) {
        return false;
      }
    }
    return true;
  };
}
