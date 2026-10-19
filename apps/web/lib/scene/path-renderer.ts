import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  computePathNetwork,
  isWoodTreeId,
  type ObstacleChanges,
  obstaclePosition,
  pathNetworkKey,
  pathTerrainOf,
  pathWindowFor,
  roadsKey,
  villagePathBounds,
  withObstacles,
  type Landscape,
  type ObstacleLayer,
  type PathLine,
  type PathNetwork,
  type PathTerrain,
} from '@bohemia/game';
import type { SceneRoad, SceneVillage } from '../village-view';
import type { DecorModel } from './decor-placement';
import { prepareDecorMaterial } from './decorations';
import { loadMergedModel, setStaticInstances, type ModelInstance } from './instanced-model';
import { hasStake } from './orchard-layout';
import {
  TREE_STAKE,
  createTreeStakeMesh,
  prepareAppleMaterial,
  setInstances,
} from './orchard-renderer';
import {
  PATH_EARTH_LAYER,
  PATH_WORN_LAYER,
  pathRibbons,
  ribbonTrack,
  roadFade,
  type RibbonLayer,
} from './path-ribbon';
import type { Track } from './track-mask';
import { RoadWorks, roadRibbonMeshes } from './road-works';
import { roadWorksKey } from './road-works-layout';
import { pathRouter } from './path-router';
import {
  ROADSIDE_MODELS,
  isPathTreeModel,
  isRoadAppleModel,
  roadAppleInstance,
  roadApplesKey,
  roadTreesKey,
  roadsideInstance,
  roadsideModelUrl,
  type RoadsideInstance,
  type RoadsideModel,
} from './path-trees';
import { applyPitCut, type PitCuts } from './pit-cut';
import { applySeasonGround } from './season-materials';
import { prepareTreeMaterial } from './trees';
import { decalGrid } from './village-layout';
import { createDecalMaterial, createDecalMesh, type HeightFn } from './village-meshes';
import type { VillagerPaths } from './villager-plan';

// Vyšlapané pěšiny a pevné cesty ve scéně (docs/design/paths.md, roads.md). Síť pěšin dne
// spočítá v prohlížeči stejná funkce herního jádra jako na serveru (`computePathNetwork` –
// vzdálenost chůze na pole), jen když se změní rozložení vsi nebo místa práce dne – odloženě
// a nikdy za snímek. Kreslí se jako obtisky nad poli a obtisky vsi – pěšina dne nevýrazně (slabě
// prošlapaná tráva, holá hlína jen úzká a slabá u silné pěšiny; přes osetý díl jen úzká stopa –
// Martin, 19. 10. 2026: „denní pěšina ať je nevýrazná“). Pevné cesty jsou herní data
// (`SceneVillage.roads`) – kreslí se stále stejně jako plně vyšlapaný pás (upravená širší) a jsou
// vedle pěšin dne jasně výraznější; pěšina dne se v nich ztrácí;
// stromy u nich (`SceneVillage.roadTrees`, path-trees.ts) se mění jen se změnou dat. Postavy po
// pěšinách chodí a jdou po nich rychleji (`paths()` pro villager-plan.ts).

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
/**
 * Sníh na obtiscích (podíl zasypání – menší = víc prosvítá): pevná cesta pod sněhem zřetelně
 * prosvítá (ušlapaný sníh), nevýrazná pěšina dne se zasype méně, ať její stopa ve sněhu pořád
 * trochu prosvítá.
 */
const SNOW = { roads: 0.55, paths: 0.3 } as const;
/** Přes osetý díl (pěšina ho obchází – výjimečně) jen úzká stopa: násobek šířky. */
const SOWN_WIDTH = 0.45;

export interface PathsEnvironment {
  landscape: Landscape;
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
  /** Stromy u cest se změnily (načtení, vidět / skrýt) – obnovit stíny a překreslit. */
  refreshShadows(): void;
}

/** Čísla posledního výpočtu (vývojová stránka, měření). */
export interface PathStats {
  /** Výpočet sítě pěšin dne (ms) a terénu okna s překážkami (ms, jen při změně okna). */
  ms: number;
  terrainMs: number;
  cells: number;
  trips: number;
  lines: number;
  /** Pevné cesty a stromy u nich (z dat vsi). */
  roads: number;
  trees: number;
}

/**
 * Pěšiny vsi: `update` naplánuje přepočet sítě (jen při změně klíče, odloženě), po výpočtu
 * přestaví obtisky a ohlásí změnu. Pevné cesty a stromy u nich přestaví hned, jen když se změní
 * data vsi.
 */
export class VillagePaths {
  private village: SceneVillage | null = null;
  private key = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Terén okna s překážkami krajiny – přepočítá se jen s novým oknem nebo změnou překážek. */
  private obstacleTerrain: { key: string; terrain: PathTerrain } | null = null;
  private network: PathNetwork | null = null;
  /** Pás pěšin dne pro masku polí (pod pěšinou obilí neroste – track-mask.ts). */
  private track: Track | null = null;
  private router: VillagerPaths | null = null;
  private meshes: Mesh[] = [];
  /** Pevné cesty (obtisky z dat) a jejich klíč. */
  private roadMeshes: Mesh[] = [];
  private roadKey = '';
  /** Kameny, hať, lávky a vytyčení vylepšených cest (road-works.ts). */
  private readonly works: RoadWorks;
  private roads: readonly SceneRoad[] = [];
  private heatmapMesh: Mesh | null = null;
  private readonly materials = new Map<string, Material>();
  private readonly treeModels = new Map<RoadsideModel, Promise<Mesh | null>>();
  private trees: RoadsideInstance[] = [];
  private treeKey = '';
  /** Kůly u mladých jabloní podél cest (jako v sadu). */
  private stakes: ModelInstance[] = [];
  private stakeMesh: Mesh | null = null;
  private visible = true;
  private heatmap = false;
  private disposed = false;
  stats: PathStats | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly env: PathsEnvironment,
  ) {
    this.works = new RoadWorks(scene, {
      groundHeight: env.groundHeight,
      addShadowCaster: (mesh) => env.addShadowCaster(mesh),
      requestRender: () => env.requestRender(),
      refreshShadows: () => env.refreshShadows(),
    });
  }

  /**
   * Ves se změnila – pevné cesty a stromy u nich se přestaví hned (jen při změně dat), pěšiny dne
   * se přepočítají odloženě, když se změnilo, na čem závisí.
   */
  update(village: SceneVillage): void {
    if (this.disposed) return;
    this.village = village;
    this.updateRoads(village);
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
  /** Pás pěšin dne (stejné průřezy jako obtisk) – pod ním pole nekreslí obilí; bez sítě null. */
  pathTrack(): Track | null {
    return this.track;
  }

  paths(): VillagerPaths | null {
    return this.router;
  }

  /** Vývojová volba: pěšiny a pevné cesty (obtisky i stromy) vidět / skrýt. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const mesh of [...this.meshes, ...this.roadMeshes]) mesh.setEnabled(visible);
    this.works.setVisible(visible);
    if (this.stakeMesh) setInstances(this.stakeMesh, visible ? this.stakes : []);
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
    for (const mesh of [...this.meshes, ...this.roadMeshes]) mesh.dispose();
    this.meshes = [];
    this.roadMeshes = [];
    this.heatmapMesh?.dispose();
    this.heatmapMesh = null;
    this.works.dispose();
    this.stakeMesh?.dispose();
    for (const model of this.treeModels.values()) void model.then((mesh) => mesh?.dispose());
    this.treeModels.clear();
  }

  /** Pevné cesty a stromy u nich z dat vsi – přestaví se jen při změně. */
  private updateRoads(village: SceneVillage): void {
    const roads = village.roads ?? [];
    const roadKey = `${roadsKey(roads)}|${roadWorksKey(roads)}`;
    if (roadKey !== this.roadKey) {
      this.roadKey = roadKey;
      this.roads = roads;
      for (const mesh of this.roadMeshes) mesh.dispose();
      this.roadMeshes = [];
      // pevná cesta má stále plnou šířku – kreslí se jen z dat cest (ne podle polí dne);
      // upravená je jen širší (rozestavěná úprava od začátku úseku)
      this.roadMeshes = roadRibbonMeshes(this.scene, roads, {
        height: this.env.decalHeight,
        smoothHeight: this.env.groundHeight,
        material: (kind) => this.decalMaterial('roads', kind),
        lift: { worn: LIFT.worn, earth: LIFT.earth },
        alphaIndex: ALPHA_INDEX,
      });
      for (const mesh of this.roadMeshes) mesh.setEnabled(this.visible);
      this.env.requestRender();
    }
    // kameny, hať, lávky a vytyčení (i jabloní, které čekají na výsadbu) – při změně dat
    this.works.update(roads, village.roadApples ?? []);
    const treeKey = `${roadTreesKey(village.roadTrees)}|${roadApplesKey(village.roadApples)}`;
    if (treeKey !== this.treeKey) {
      this.treeKey = treeKey;
      const apples = village.roadApples ?? [];
      this.trees = [
        ...(village.roadTrees ?? []).map(roadsideInstance),
        ...apples.flatMap((a) => {
          const tree = roadAppleInstance(a);
          return tree ? [tree] : [];
        }),
      ];
      // mladá jabloň první roky u kůlu jako v sadu
      const h = this.env.groundHeight;
      this.stakes = apples
        .filter((a) => a.stage === 'tree' && hasStake(a.growth))
        .map((a) => {
          const x = a.x - TREE_STAKE.offsetM;
          return { x, y: h(x, a.z) - TREE_STAKE.sinkM, z: a.z, rotationY: 0, scale: 1 };
        });
      if (this.stakes.length > 0) {
        this.stakeMesh ??= createTreeStakeMesh(this.scene, 'pathside-stakes', (mesh) =>
          this.env.addShadowCaster(mesh),
        );
      }
      if (this.stakeMesh) setInstances(this.stakeMesh, this.visible ? this.stakes : []);
      this.updateTrees();
    }
  }

  private recompute(): void {
    const village = this.village;
    if (!village || this.disposed) return;
    // okno i s nejbližší vodou – pěšina k potoku je vidět vždy (paths.md – Pochůzky pro vodu)
    const bounds = villagePathBounds(village, this.env.landscape);
    const counts = { roads: this.roads.length, trees: this.trees.length };
    if (!bounds) {
      this.show(null, { ms: 0, terrainMs: 0, cells: 0, trips: 0, lines: 0, ...counts });
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
      // stromy lesa vsi – pěšiny je obcházejí jako stromy krajiny (fields.md – Les vsi)
      (changes.added ?? []).filter((o) => isWoodTreeId(o.id)).length,
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
    this.show(network, {
      ms: performance.now() - t0,
      terrainMs,
      cells: terrain.width * terrain.height,
      trips: network.trips,
      lines: network.lines.length,
      ...counts,
    });
  }

  private show(network: PathNetwork | null, stats: PathStats): void {
    this.network = network;
    this.stats = stats;
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes = [];
    this.track = null;
    if (network && network.lines.length > 0) {
      // pěšina dne se v pevné cestě ztrácí – cesta se kreslí zvlášť z dat
      const fade = roadFade(this.roads);
      const width = sownWidthOf(this.village);
      for (const kind of ['worn', 'earth'] as const) {
        const mesh = this.ribbon(`paths-${kind}`, network.lines, kind, width, fade);
        if (mesh.getTotalIndices() > 0) this.meshes.push(mesh);
        else mesh.dispose();
      }
      // pod pěšinou dne obilí neroste – pás v šířce prošlapané trávy (přes osetý díl úzká stopa);
      // síla po čtvrtinách, ať drobné změny provozu bloky polí nepřestavují každý den
      this.track = ribbonTrack(
        network.lines.map((line) => ({
          ...line,
          strength: line.strength.map((v) => (v > 0 ? Math.ceil(v * 4) / 4 : 0)),
        })),
        PATH_WORN_LAYER,
        width,
        fade,
      );
    }
    for (const mesh of this.meshes) mesh.setEnabled(this.visible);
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

  private ribbon(
    name: string,
    lines: readonly PathLine[],
    kind: 'worn' | 'earth',
    widthAt: (x: number, z: number) => number,
    alphaAt?: (x: number, z: number) => number,
    layer: RibbonLayer = kind === 'worn' ? PATH_WORN_LAYER : PATH_EARTH_LAYER,
    color?: [number, number, number],
  ): Mesh {
    const grid = pathRibbons(lines, layer, widthAt, alphaAt);
    const mesh = createDecalMesh(this.scene, name, grid, {
      height: this.env.decalHeight,
      smoothHeight: this.env.groundHeight,
      lift: kind === 'worn' ? LIFT.worn : LIFT.earth,
      // prošlapaná tráva do hněda, holá udusaná hlína tmavší a teplejší (jako u vchodu obydlí)
      color: color ?? (kind === 'worn' ? [0.92, 0.84, 0.7] : [0.9, 0.74, 0.58]),
      uv: kind === 'worn' ? 20 : 14,
    });
    mesh.material = this.decalMaterial('paths', kind);
    // nad obtisky polí a vsi (alphaIndex 1–2) – pěšina přes úhor zůstane vidět
    mesh.alphaIndex = ALPHA_INDEX[kind];
    return mesh;
  }

  /** Materiál obtisku pěšin dne (`paths`) nebo pevných cest (`roads`) – liší se sněhem. */
  private decalMaterial(group: 'paths' | 'roads', kind: 'worn' | 'earth'): Material {
    const name = `${group}-${kind}`;
    let material = this.materials.get(name);
    if (!material) {
      const decal = createDecalMaterial(this.scene, name, {
        texture: kind === 'worn' ? 'grass-dirt' : 'mud',
        zOffset: Z_OFFSET[kind],
      });
      applyPitCut(decal, this.env.pitCuts);
      // tráva usychá jako terén, v zimě pěšinu zasype sníh – ušlapaná stopa prosvítá
      applySeasonGround(decal, SNOW[group]);
      const texture = decal.diffuseTexture;
      if (texture instanceof Texture && !texture.isReady()) {
        texture.onLoadObservable.addOnce(() => this.env.requestRender());
      }
      material = decal;
      this.materials.set(name, material);
    }
    return material;
  }

  /** Stromy u pevných cest – modely se načtou s prvním stromem daného modelu. */
  private updateTrees(): void {
    for (const model of ROADSIDE_MODELS) {
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
        // nehybné instance – ořez podle záběru (scenery-culling.ts) je kreslí jen v záběru
        setStaticInstances(m, matrices);
        m.setEnabled(this.visible);
        this.env.refreshShadows();
      });
    }
  }

  private loadTree(model: RoadsideModel): Promise<Mesh | null> {
    const promise = loadMergedModel(
      this.scene,
      roadsideModelUrl(model),
      `pathside-${model}`,
      (material) =>
        isPathTreeModel(model)
          ? prepareTreeMaterial(model, material)
          : isRoadAppleModel(model)
            ? prepareAppleMaterial(material, model)
            : prepareDecorMaterial(model satisfies DecorModel, material),
    ).then(
      (mesh) => {
        if (!mesh) return null;
        mesh.isPickable = false;
        mesh.setEnabled(false);
        this.env.addShadowCaster(mesh);
        return mesh;
      },
      (error: unknown) => {
        console.warn(`Strom u cesty (${model}) se nepodařilo načíst.`, error);
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

const EMPTY_CHANGES: ObstacleChanges = { removed: [], stumps: [], saplings: [] };

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
