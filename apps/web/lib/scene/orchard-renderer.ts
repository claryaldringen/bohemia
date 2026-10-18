import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { OUTCROP_RADIUS_M, obstacleKind, obstaclesNear, type ObstacleLayer } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { cellsBoundary, cellsBounds, cellsContain } from './field-cells';
import { applyGammaFog } from './gamma-fog';
import { applySeasonModel } from './season-materials';
import { instanceMatrices, loadMergedModel, type ModelInstance } from './instanced-model';
import {
  APPLE_VARIANTS,
  SAPLING_GROWTH,
  hasStake,
  orchardRowLines,
  orchardTreeSpots,
  plantingProgress,
  type Outcrop,
} from './orchard-layout';
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { stripSegments, type HideShape, type Point } from './village-layout';
import { createStripMesh, type HeightFn } from './village-meshes';

type SceneOrchard = NonNullable<SceneVillage['orchards']>[number];
type SceneOrchardSquare = SceneOrchard['squares'][number];

const MODEL_BASE_URL = '/models/trees/';
/**
 * Kůl u mladého stromku: průřez a délka (m), kus je zatlučený v zemi; stojí kousek od kmene
 * (podél řady, −x).
 */
const STAKE_SIZE_M = 0.08;
const STAKE_LENGTH_M = 1.9;
const STAKE_SINK_M = 0.25;
const STAKE_OFFSET_M = 0.3;
/** Výška čáry vytyčení nad terénem (m) a kolik kolem čtverců se skryjí ozdoby krajiny. */
const LAYOUT_LIFT_M = 0.06;
const HIDE_MARGIN_M = 1;
/** Jak daleko za okrajem čtverce se hledají skalní výchozy (největší ≈ 5,4 m poloměr). */
const OUTCROP_SEARCH_M = OUTCROP_RADIUS_M * 2;
/** Listí jabloní jako 3D stromy okraje lesa (trees.ts) – tlumené světlo, bez odlesku. */
const FOLIAGE_TINT = new Color3(0.88, 0.92, 0.82);
const FOLIAGE_AMBIENT = new Color3(0.36, 0.38, 0.34);
const STAKE_AMBIENT = new Color3(0.42, 0.42, 0.4);

/**
 * Jabloňové sady ve scéně (orchard.md – Co hráč vidí): jabloně z 0 A.D. v pravidelných řadách
 * přes celý sad (orchard-layout.ts) – mladé stromky rostou do plné velikosti a první roky stojí
 * u kůlu, plodící sad má od srpna do sklizně na stromech jablka (model s plody). Výsadba po
 * fázích: světlé čáry vytyčení kolem sadu a podél řad, kůly, pak sazenice po řadách (překážky
 * z čtverce jádro odstraní, jakmile se na něm začne pracovat); na skalním výchozu z vrstvy
 * překážek strom chybí. Modely jsou v instancích
 * (jeden mesh na variantu a plody), načtou se až s prvním sadem.
 */
export class OrchardRenderer {
  private key = '';
  private orchards: readonly SceneOrchard[] = [];
  /** Čára vytyčení podle sadu – přestaví se, jen když se změní jeho čtverce. */
  private readonly layouts = new Map<
    number,
    { cells: string; meshes: Mesh[]; pegs: ModelInstance[] }
  >();
  /** Kolíky vytyčení všech sadů ve výsadbě (staking.ts). */
  private readonly pegs: StakingPegs;
  private stringMaterial: Material | null = null;
  private obstacles: ObstacleLayer | null = null;
  private shapes: HideShape[] = [];
  /** Modely jabloní: index varianta × 2 + (s plody ? 1 : 0); null = nenačtený. */
  private models: (Mesh | null)[] = [];
  private loading: Promise<void> | null = null;
  private stakeMesh: Mesh | null = null;
  private layoutMaterial: Material | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: {
      /** Hladký terén (s převýšením) – paty stromů a kůlů. */
      groundHeight: HeightFn;
      /** Přesná výška vykresleného terénu – čára vytyčení. */
      decalHeight: HeightFn;
      addShadowCaster(mesh: Mesh): void;
      /** Dočetly se modely – překreslit a obnovit stíny. */
      onAsyncChange(): void;
    },
  ) {
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
  }

  /** Překreslí sady, když se změnily; vrátí true, když se něco změnilo. */
  update(orchards: readonly SceneOrchard[]): boolean {
    const key = orchardsKey(orchards);
    if (key === this.key) return false;
    this.key = key;
    this.orchards = orchards;
    this.updateLayouts(orchards);
    this.shapes = orchards
      .filter((o) => o.squares.length > 0)
      .map((o) => ({
        bounds: cellsBounds(o.squares, HIDE_MARGIN_M),
        contains: cellsContain(o.squares, HIDE_MARGIN_M),
      }));
    if (orchards.some((o) => o.squares.some((s) => s.planting > 0))) void this.loadModels();
    this.updateInstances();
    return true;
  }

  /** Vrstva překážek krajiny – stromy sadu obejdou skalní výchozy. */
  setObstacles(layer: ObstacleLayer): boolean {
    if (this.obstacles === layer) return false;
    this.obstacles = layer;
    if (this.orchards.length === 0) return false;
    this.updateInstances();
    return true;
  }

  /** Oblasti, kde se mají skrýt ozdoby krajiny (čtverce sadů s okrajem). */
  hideShapes(): HideShape[] {
    return this.shapes;
  }

  dispose(): void {
    this.disposed = true;
    for (const layout of this.layouts.values()) for (const mesh of layout.meshes) mesh.dispose();
    this.layouts.clear();
    this.pegs.dispose();
    for (const model of this.models) model?.dispose();
    this.stakeMesh?.dispose();
  }

  /** Načte modely jabloní (jednou); po načtení se sady překreslí. */
  private loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    const names = Array.from({ length: APPLE_VARIANTS }, (_, i) => [
      `apple-${i + 1}`,
      `apple-fruit-${i + 1}`,
    ]).flat();
    const models = await Promise.all(
      names.map(async (name) => {
        try {
          const model = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${name}.glb`,
            `orchard-${name}`,
            (material) => prepareAppleMaterial(material, name),
          );
          if (!model) return null;
          model.setEnabled(false);
          model.receiveShadows = true;
          this.context.addShadowCaster(model);
          return model;
        } catch (error) {
          console.warn(`Model jabloně ${name} se nepodařilo načíst.`, error);
          return null;
        }
      }),
    );
    if (this.disposed) {
      for (const model of models) model?.dispose();
      return;
    }
    this.models = models;
    this.updateInstances();
    this.context.onAsyncChange();
  }

  /** Instance stromů a kůlů všech sadů podle stavu čtverců. */
  private updateInstances(): void {
    const trees: ModelInstance[][] = Array.from({ length: APPLE_VARIANTS * 2 }, () => []);
    const stakes: ModelInstance[] = [];
    const height = this.context.groundHeight;
    for (const orchard of this.orchards) {
      for (const square of orchard.squares) {
        const spots = orchardTreeSpots(square, this.outcropsNear(square));
        const planted = square.planting >= 1;
        const { stakes: staked, saplings } = planted
          ? { stakes: hasStake(square.growth) ? spots.length : 0, saplings: spots.length }
          : plantingProgress(square.planting, spots.length);
        const growth = planted ? square.growth : SAPLING_GROWTH;
        spots.forEach((spot, i) => {
          const y = height(spot.x, spot.z);
          if (i < saplings) {
            const fruit = planted && square.fruit ? 1 : 0;
            trees[spot.variant * 2 + fruit]!.push({
              x: spot.x,
              y,
              z: spot.z,
              rotationY: spot.rotationY,
              scale: spot.scale * growth,
            });
          }
          if (i < staked) {
            // kůl vždy na stejné straně stromu v řadě – kůly stojí v rovné čáře jako stromy
            const sx = spot.x - STAKE_OFFSET_M;
            const sz = spot.z;
            stakes.push({ x: sx, y: height(sx, sz) - STAKE_SINK_M, z: sz, rotationY: 0, scale: 1 });
          }
        });
      }
    }
    this.models.forEach((model, i) => {
      if (model) setInstances(model, trees[i] ?? []);
    });
    if (stakes.length > 0) this.stakeMesh ??= this.createStakeMesh();
    if (this.stakeMesh) setInstances(this.stakeMesh, stakes);
  }

  /**
   * Čáry vytyčení sadů, které se sázejí – stávající se nechají, nová se postaví jen pro sad se
   * změněnými čtverci (velikost stromů a jablka se mění častěji než čtverce).
   */
  private updateLayouts(orchards: readonly SceneOrchard[]): void {
    const keep = new Set<number>();
    for (const orchard of orchards) {
      if (orchard.squares.length === 0 || orchard.squares.every((s) => s.planting >= 1)) continue;
      keep.add(orchard.id);
      const cells = orchard.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(';');
      const current = this.layouts.get(orchard.id);
      if (current?.cells === cells) continue;
      for (const mesh of current?.meshes ?? []) mesh.dispose();
      this.layouts.set(orchard.id, { cells, ...this.layoutParts(orchard) });
    }
    for (const [id, layout] of this.layouts) {
      if (keep.has(id)) continue;
      for (const mesh of layout.meshes) mesh.dispose();
      this.layouts.delete(id);
    }
    this.pegs.set([...this.layouts.values()].flatMap((layout) => layout.pegs));
  }

  /** Skalní výchozy, které zasahují do čtverce (i z vedlejších políček); bez vrstvy žádné. */
  private outcropsNear(square: SceneOrchardSquare): Outcrop[] {
    const layer = this.obstacles;
    if (!layer) return [];
    const half = square.size / 2 + OUTCROP_SEARCH_M;
    return obstaclesNear(layer, square.x - half, square.z - half, square.x + half, square.z + half)
      .filter((i) => obstacleKind(layer, i) === 'outcrop')
      .map((i) => ({ x: layer.x[i]!, z: layer.z[i]!, radius: OUTCROP_RADIUS_M * layer.scale[i]! }));
  }

  /**
   * Světlé čáry vytyčení (provázek, naražená tráva) – po obrysu sadu a podél řad stromů, jen
   * během výsadby.
   */
  private layoutParts(orchard: SceneOrchard): { meshes: Mesh[]; pegs: ModelInstance[] } {
    const boundary = cellsBoundary(orchard.squares);
    const rows = orchardRowLines(orchard.squares);
    // kolíky po obvodu sadu a na koncích řad, provázek mezi nimi (vidět od zadání, tj. od 0 %)
    const pegs = [
      ...pegInstances(boundary, this.context.groundHeight),
      ...pegInstances(rows, this.context.groundHeight, Number.POSITIVE_INFINITY),
    ];
    this.stringMaterial ??= createStringMaterial(this.scene);
    const string = createStringMesh(
      this.scene,
      `village-orchard-string-${orchard.id}`,
      [...boundary, ...rows],
      this.context.groundHeight,
      this.stringMaterial,
    );
    return { meshes: [this.layoutMesh(boundary, rows, orchard.id), string], pegs };
  }

  private layoutMesh(boundary: Point[][], rows: Point[][], id: number): Mesh {
    const lines = [...boundary, ...rows];
    const mesh = createStripMesh(
      this.scene,
      `village-orchard-layout-${id}`,
      lines.flatMap((line) => stripSegments(line, false, 0.09, 0.5)),
      this.context.decalHeight,
      LAYOUT_LIFT_M,
    );
    this.layoutMaterial ??= (() => {
      const m = new StandardMaterial('village-orchard-layout', this.scene);
      m.diffuseColor = new Color3(0.8, 0.76, 0.64);
      m.specularColor = Color3.Black();
      m.zOffset = -4;
      m.backFaceCulling = false;
      return m;
    })();
    mesh.material = this.layoutMaterial;
    mesh.isPickable = false;
    return mesh;
  }

  /** Kůl: tenký hranol, pata v počátku. */
  private createStakeMesh(): Mesh {
    const h = STAKE_SIZE_M / 2;
    const top = STAKE_LENGTH_M;
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    const positions: number[] = [];
    const indices: number[] = [];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      const i = positions.length / 3;
      positions.push(ax, 0, az, bx, 0, bz, bx * 0.8, top, bz * 0.8, ax * 0.8, top, az * 0.8);
      indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    }
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    const mesh = new Mesh('orchard-stakes', this.scene);
    data.applyToMesh(mesh);
    const material = new StandardMaterial('village-orchard-stake', this.scene);
    material.diffuseColor = new Color3(0.62, 0.52, 0.38);
    material.ambientColor = STAKE_AMBIENT;
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }
}

/** Co z sadů rozhoduje o vzhledu – čtverce, výsadba, velikost stromů a jablka. */
function orchardsKey(orchards: readonly SceneOrchard[]): string {
  return orchards
    .map(
      (o) =>
        `${o.id}:` +
        o.squares
          .map(
            (s) =>
              `${s.cell.x},${s.cell.y},${Math.round(s.planting * 50)},${s.growth},${s.fruit ? 1 : 0}`,
          )
          .join(';'),
    )
    .join('|');
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

/**
 * Materiál jabloně – jako 3D stromy krajiny: tlumené světlo, bez odlesku, opar v gama prostoru
 * a roční období podle jména modelu (`apple*` – jarní květ, podzimní listí, v zimě holé).
 */
function prepareAppleMaterial(material: Material, model: string): void {
  if (!(material instanceof PBRMaterial)) return;
  material.albedoColor = FOLIAGE_TINT;
  material.roughness = 1;
  material.metallicF0Factor = 0;
  material.ambientColor = FOLIAGE_AMBIENT;
  material.directIntensity = 0.7;
  // nízký práh alfy – z dálky (mipmapy) koruny neprořídnou
  material.alphaCutOff = 0.2;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  applyGammaFog(material);
  applySeasonModel(material, model);
}
