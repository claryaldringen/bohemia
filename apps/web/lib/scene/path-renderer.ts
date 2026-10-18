import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  SACRED_BUILDINGS,
  computePathNetwork,
  obstaclePosition,
  pathBounds,
  pathNetworkKey,
  pathTerrainOf,
  pathWindowFor,
  withObstacles,
  type ForestField,
  type Landscape,
  type ObstacleLayer,
  type PathNetwork,
  type PathTerrain,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { loadMergedModel } from './instanced-model';
import { EARTH_LAYER, WORN_LAYER, pathRibbons } from './path-ribbon';
import { pathRouter } from './path-router';
import { PATH_TREE_MODELS, pathsideTrees, type PathTree, type PathTreeModel } from './path-trees';
import { applyPitCut, type PitCuts } from './pit-cut';
import { applySeasonGround } from './season-materials';
import { prepareTreeMaterial } from './trees';
import { decalGrid } from './village-layout';
import { createDecalMaterial, createDecalMesh, type HeightFn } from './village-meshes';
import { houseBox, plotBox, siteBox, type VillagerPaths } from './villager-plan';

// Vyšlapané pěšiny ve scéně (docs/design/paths.md): síť spočítá v prohlížeči stejná funkce
// herního jádra jako na serveru (`computePathNetwork` – vzdálenost chůze na pole), jen když se
// změní rozložení vsi nebo místa práce dne – odloženě a nikdy za snímek. Kreslí se jako obtisky
// nad poli a obtisky vsi (prošlapaná tráva a holá hlína uprostřed silných pěšin; přes osetý díl
// jen úzká stopa), staré pěšiny v polích lemují stromy (path-trees.ts). Postavy po pěšinách
// chodí a jdou po nich rychleji (`paths()` pro villager-plan.ts).

/** Po změně vsi se síť přepočítá až po takové pauze (ms) – dotazy na ves chodí za sebou. */
const RECOMPUTE_DELAY_MS = 250;
/**
 * Výška obtisků pěšin nad terénem (m) – nad obtisky polí (do 0,045) a vsi (0,03–0,045), aby
 * pěšina přes úhor a pastvinu nezmizela pod polem (Martin).
 */
const LIFT = { worn: 0.05, earth: 0.055, heatmap: 0.12 };
/** Pořadí průhledných obtisků – po polích (1–2) a vsi (1–2), před postavami (5). */
const ALPHA_INDEX = { worn: 3, earth: 3.5 };
/** Posun hloubky – vyhraje nad poli (−2 / −3) i v dálce. */
const Z_OFFSET = { worn: -3.5, earth: -4 };
/** Sníh na pěšinách – vyšlapaná pěšina pod sněhem zřetelně prosvítá (ušlapaný sníh). */
const PATH_SNOW = 0.55;
/** Přes osetý díl (pěšina ho obchází – výjimečně) jen úzká stopa: násobek šířky. */
const SOWN_WIDTH = 0.45;
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
    const landscape = this.env.landscape;
    const window = pathWindowFor(landscape, bounds);
    const layer = this.env.layer;
    const changes = village.obstacles ?? EMPTY_CHANGES;
    const obstacleKey = [
      window.i0,
      window.j0,
      window.i1,
      window.j1,
      changes.removed.length,
      changes.stumps.length,
      changes.saplings.length,
    ].join('|');
    let terrainMs = 0;
    if (this.obstacleTerrain?.key !== obstacleKey) {
      // terén z herního jádra (stejně jako na serveru) a k němu překážky krajiny
      const t0 = performance.now();
      const terrain = withObstacles(pathTerrainOf(landscape, window), layer, changes);
      this.obstacleTerrain = { key: obstacleKey, terrain };
      terrainMs = performance.now() - t0;
    }
    const terrain = this.obstacleTerrain.terrain;
    const t0 = performance.now();
    const network = computePathNetwork({
      village,
      terrain,
      tree: (id) => obstaclePosition(layer, id),
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
    const grid = pathRibbons(network.lines, layer, sownWidthOf(this.village));
    const mesh = createDecalMesh(this.scene, name, grid, {
      height: this.env.decalHeight,
      smoothHeight: this.env.groundHeight,
      lift: kind === 'worn' ? LIFT.worn : LIFT.earth,
      // prošlapaná tráva do hněda, holá udusaná hlína tmavší a teplejší (jako u vchodu obydlí)
      color: kind === 'worn' ? [0.92, 0.84, 0.7] : [0.9, 0.74, 0.58],
      uv: kind === 'worn' ? 20 : 14,
    });
    mesh.material = this.decalMaterial(kind);
    // nad obtisky polí a vsi (alphaIndex 1–2) – pěšina přes úhor zůstane vidět
    mesh.alphaIndex = ALPHA_INDEX[kind];
    return mesh;
  }

  private decalMaterial(kind: 'worn' | 'earth'): Material {
    let material = this.materials.get(kind);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `paths-${kind}`, {
        texture: kind === 'worn' ? 'grass-dirt' : 'mud',
        zOffset: Z_OFFSET[kind],
      });
      applyPitCut(decal, this.env.pitCuts);
      // tráva usychá jako terén, v zimě pěšinu zasype sníh – ušlapaná stopa prosvítá
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
}

const EMPTY_CHANGES = { removed: [], stumps: [], saplings: [] };

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

/** Šířka pěšiny v bodě: přes osetý díl (zelí, obilí) jen úzká stopa, jinde plná. */
function sownWidthOf(village: SceneVillage | null): (x: number, z: number) => number {
  const sown = (village?.fields ?? [])
    .flatMap((f) => f.parts)
    .filter((p) => p.stage === 'sown' || p.stage === 'ready' || p.stage === 'founding');
  return (x, z) =>
    sown.some((p) => Math.abs(x - p.x) < p.size / 2 && Math.abs(z - p.z) < p.size / 2)
      ? SOWN_WIDTH
      : 1;
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
 * Smí tu stát strom podél pěšiny: průchodný terén (ne voda, sráz), mimo les, díly polí, domy
 * s pozemky, staveniště, svatyně, hřbitovy, sady a háje – u pole jen podél jeho okraje.
 */
function canPlantOf(
  village: SceneVillage,
  terrain: PathTerrain,
  field: ForestField,
): (x: number, z: number) => boolean {
  // nikdy na dílu pole (osetém ani úhoru – Martin), ani na hřbitově, v sadu a v háji
  const squares = [
    ...village.fields.flatMap((f) => f.parts),
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
