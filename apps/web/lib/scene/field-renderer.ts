import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { dateOfDayIndex, type Landscape, type ObstacleLayer } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { buildingClearings, clearingMask, clearingsKey, clearingsNear } from './building-clearings';
import { cellsBounds, rowDirection, touchingSquares } from './field-cells';
import {
  CROP_KINDS,
  FIELD_TEXTURES,
  LOOK_STYLES,
  emptyCrops,
  fieldStaking,
  isWildStage,
  partViewsKey,
  patchNoise,
  raggedCoverage,
  type CropKind,
  type FieldPlants,
  type FieldTexture,
  type Peg,
  type PlantInstance,
} from './field-crops';
import {
  GRID_PER_CELL,
  fieldBlockContent,
  groupFieldBlocks,
  mergeFieldBlocks,
  type DecalLayer,
  type FieldBlockContent,
  type FieldContent,
} from './field-blocks';
import { fieldPartViews, villageCenter, workSteps } from './field-look';
import { applyGammaFog } from './gamma-fog';
import {
  SWATH_SPACING_M,
  chooseHayMeadows,
  hayMeadowFields,
  hayPhase,
  meadowHay,
  type HayMeadow,
  type HayPhase,
} from './hay-meadows';
import { loadMergedModel, loadModelParts } from './instanced-model';
import { applyPitCut, type PitCuts } from './pit-cut';
import { applySeasonGround, applySeasonModel, applySeasonSnow } from './season-materials';
import {
  decalGrid,
  fieldHideShape,
  stripSegments,
  type DecalGrid,
  type HideShape,
  type Point,
} from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';

type SceneField = SceneVillage['fields'][number];

const MODEL_URL = '/models/fields/';
/** Uzel hromádky vytrhaného hrachu v crops.glb. */
const HEAP_NODE = 'pea-heap';
const WEED_URLS = ['/models/dwellings/grass-tuft-1.glb', '/models/dwellings/grass-tuft-2.glb'];
/** Šířka měkkého okraje pole a louky na seno (m). */
const EDGE_SOFT_M = 1.6;
const MEADOW_EDGE_SOFT_M = 3;
/**
 * Měkký okraj pole u obydlí (m) – vyklízenou plochu obydlí na poli herní jádro z dílu odečte
 * (population.md – Obydlí na poli a v sadu), obtisk ani trsy pod ní nejsou.
 */
const CLEARING_SOFT_M = 1.2;
/** Sníh na obtiscích pole – část barvy zimou prosvítá (jako cesty a vyšlapaná hlína). */
const FIELD_SNOW = 0.85;
/** Výška obtisků nad terénem (m) – navzájem v pořadí, aby se nepraly o hloubku. */
const LIFT = { base: 0.03, patches: 0.04, swaths: 0.045, layout: 0.065 };
/** Provázek vytyčení: výška nad zemí a tloušťka (m); světlá čára naražené trávy pod ním. */
const STRING_HEIGHT_M = 0.5;
const STRING_THICKNESS_M = 0.035;
const LAYOUT_LINE_M = 0.1;
/**
 * Kolík: průřez a výška nad zemí (m), kus zatlučený v zemi, světlý zářez nahoře – stylizovaně
 * větší, jako postavy (FIGURE_SCALE), ať je z kamery vidět.
 */
const PEG = { size: 0.1, height: 1.15, sink: 0.25, top: 0.2 };
/**
 * Trsy obilí řídnou s odstupem kamery (m `radius`): do NEAR plné, k FAR ubývají na pětinu,
 * od HIDE se nekreslí – pole pak nese obtisk porostu shora.
 */
const CROP_RANGE_M = { near: 130, far: 360, hide: 620 };
const FAR_DENSITY = 0.2;
/**
 * Obilí se vlní ve větru (výchylka vrcholu v m na m² výšky – zralé obilí ≈ ± 0,1 m, nízké trsy
 * skoro nic); jen v záběru, při omezeném pohybu stojí.
 */
const SWAY_AMPLITUDE = 0.06;
const SWAY_RANGE_M = 420;
const WIND: [number, number] = [0.8, 0.6];
/** Při sněhové pokrývce nad touto hodnotou nízké trsy (vzcházející, strniště, plevel) zmizí. */
const SNOW_HIDE = 0.4;
/** Světlo trsů jako trsy trávy u obydlí (village-renderer.ts) a tón podle druhu. */
const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
const CROP_TINT: Record<CropKind, readonly [number, number, number]> = {
  green: [0.74, 0.84, 0.72],
  ripe: [0.96, 0.92, 0.82],
  sprout: [0.78, 0.92, 0.66],
  stubble: [0.92, 0.86, 0.72],
  'pea-green': [0.66, 0.78, 0.66],
  'pea-ripe': [0.86, 0.8, 0.7],
};
/** Hromádky vytrhaného hrachu (uzel pea-heap v crops.glb) – tón suchých lodyh. */
const HEAP_TINT: readonly [number, number, number] = [0.98, 0.92, 0.8];
/** Trsy, které se vlní ve větru (vysoké a husté). */
const SWAYING_KINDS: readonly CropKind[] = ['ripe', 'green', 'pea-green', 'pea-ripe'];
const PROP_AMBIENT = new Color3(0.4, 0.4, 0.38);
/** Panáky ze slámy (světlé, do zlata) a stohy sena (do zelena – seno je sušená tráva). */
const STRAW_TINT = new Color3(1, 0.94, 0.8);
const HAY_TINT = new Color3(0.74, 0.72, 0.52);
const TUFT_TINT = new Color3(0.6, 0.82, 0.42);

interface FieldView {
  key: string;
  meshes: Mesh[];
  shape: HideShape | null;
  plants: FieldPlants;
  pegs: Peg[];
  /** Klíč toho, co ovlivní všechny bloky (okraj pole, směr řádků, střed, den sena). */
  context: string;
  /** Obsah bloků dílů – přestaví se jen bloky, které se změnily (field-blocks.ts). */
  blocks: Map<string, { key: string; content: FieldBlockContent }>;
}

interface MeadowView {
  key: string;
  meshes: Mesh[];
  hay: PlantInstance[];
}

export interface FieldContext {
  /** Hladký terén (s převýšením) – paty trsů, panáků, kolíků. */
  groundHeight: HeightFn;
  /** Přesná výška vykresleného terénu – obtisky. */
  decalHeight: HeightFn;
  addShadowCaster(mesh: Mesh): void;
  /** Dočetly se modely – překreslit a obnovit stíny. */
  onAsyncChange(): void;
  /** Dočetla se textura obtisku – překreslit. */
  requestRender(): void;
  pitCuts: PitCuts;
}

/** Instance jednoho druhu (mesh, seřazené podle pořadí pro řídnutí). */
interface PlantMesh {
  mesh: Mesh | null;
  instances: PlantInstance[];
  /** Kolik instancí je v bufferu – řídnutí z dálky jen zkrátí počet kreslených. */
  count: number;
  thin: boolean;
  /** Výška paty pod terénem (m). */
  sink: number;
}

/**
 * Pole ve scéně podle 0 A.D. (fields.md – Co hráč vidí): díly jako obtisky na terénu (zem
 * s měkkými brázdami, osetá zem, porost shora, strniště, úhor, pastvina) s měkkým nepravidelným
 * okrajem bez meze (sousední pole na sebe navazují bez švu), obilí jako 3D trsy v řádcích (thin
 * instances – jeden mesh na druh,
 * z dálky řídnou), panáky snopů na žni, plevel v úhoru, kolíky a provázek kolem vytyčeného pole
 * a louky na seno kolem vsi (posečené řádky, kupky, stohy). Vzhled dílů je z field-look.ts,
 * rozmístění z field-crops.ts a hay-meadows.ts. `update` přestaví jen pole, která se změnila.
 */
export class FieldRenderer {
  private readonly fields = new Map<number, FieldView>();
  private readonly meadowViews = new Map<number, MeadowView>();
  private village: SceneVillage = { dwellings: [], fields: [] };
  private dayOfYear = 196;
  private landscape: Landscape | null = null;
  private obstacles: ObstacleLayer | null = null;
  private explicitMeadows: HayMeadow[] | null = null;
  private meadowsKey = '';
  private meadows: HayMeadow[] = [];
  private readonly materials = new Map<string, Material>();
  private readonly crops = new Map<CropKind, PlantMesh>();
  private readonly stooks: PlantMesh = {
    mesh: null,
    instances: [],
    count: 0,
    thin: true,
    sink: 0.05,
  };
  private readonly heaps: PlantMesh = {
    mesh: null,
    instances: [],
    count: 0,
    thin: true,
    sink: 0.04,
  };
  private readonly haystacks: PlantMesh = {
    mesh: null,
    instances: [],
    count: 0,
    thin: false,
    sink: 0.1,
  };
  private readonly weeds: PlantMesh[] = WEED_URLS.map(() => ({
    mesh: null,
    instances: [],
    count: 0,
    thin: true,
    sink: 0.04,
  }));
  private pegMesh: Mesh | null = null;
  private pegs: Peg[] = [];
  private loading: Promise<void> | null = null;
  private radius = 120;
  private density = 1;
  private snow = 0;
  private swayPlugins: CropSwayPlugin[] = [];
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: FieldContext,
  ) {
    for (const kind of CROP_KINDS) {
      this.crops.set(kind, { mesh: null, instances: [], count: 0, thin: true, sink: 0.03 });
    }
  }

  /** Překreslí pole a louky na seno podle vsi; vrátí true, když se něco změnilo. */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    this.village = village;
    return this.rebuild();
  }

  /** Den v roce podle scény (roční období) – bez rozdělení práce podle něj odhad vzhledu a seno. */
  setDay(dayOfYear: number): boolean {
    const day = Math.floor(dayOfYear);
    if (day === this.dayOfYear) return false;
    this.dayOfYear = day;
    return this.rebuild();
  }

  /** Krajina a vrstva překážek – louky na seno se vybírají na louce bez stromů a kamenů. */
  setLandscape(landscape: Landscape | null, obstacles: ObstacleLayer | null): boolean {
    if (this.landscape === landscape && this.obstacles === obstacles) return false;
    this.landscape = landscape;
    this.obstacles = obstacles;
    this.meadowsKey = '';
    return this.rebuild();
  }

  /** Vývojový náhled: louky na seno dané přímo (bez krajiny); null = podle krajiny. */
  setHayMeadows(meadows: HayMeadow[] | null): boolean {
    this.explicitMeadows = meadows;
    this.meadowsKey = '';
    return this.rebuild();
  }

  /** Vzdálenost kamery – trsy obilí z dálky řídnou. Vrátí true, když je co překreslit. */
  setView(radius: number): boolean {
    this.radius = radius;
    const density = cropDensity(radius);
    const crossesZero = (density === 0) !== (this.density === 0);
    if (!crossesZero && Math.abs(density - this.density) < 0.04) return false;
    this.density = density;
    return this.applyCounts();
  }

  /** Sněhová pokrývka 0–1 – pod sněhem nízké trsy zmizí. */
  setSnow(snow: number): boolean {
    const hidden = snow > SNOW_HIDE;
    const was = this.snow > SNOW_HIDE;
    this.snow = snow;
    if (hidden === was) return false;
    return this.applyCounts();
  }

  /** Obilí ve větru – jen zralé a zelené v záběru; vrátí true, když se v záběru něco hnulo. */
  animate(nowMs: number, camera: Camera | null): boolean {
    if (this.swayPlugins.length === 0 || this.radius > SWAY_RANGE_M) return false;
    const visible = SWAYING_KINDS.some((kind) => {
      const mesh = this.crops.get(kind)?.mesh;
      if (!mesh || !mesh.isEnabled() || mesh.thinInstanceCount === 0) return false;
      return camera ? camera.isInFrustum(mesh) : true;
    });
    if (!visible) return false;
    const time = (nowMs / 1000) % 3600;
    for (const plugin of this.swayPlugins) plugin.time = time;
    return true;
  }

  hideShapes(): HideShape[] {
    const shapes: HideShape[] = [];
    for (const view of this.fields.values()) if (view.shape) shapes.push(view.shape);
    return shapes;
  }

  /** Louky na seno (pro postavy a testy). */
  hayMeadows(): readonly HayMeadow[] {
    return this.meadows;
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.fields.values()) for (const mesh of view.meshes) mesh.dispose();
    for (const view of this.meadowViews.values()) for (const mesh of view.meshes) mesh.dispose();
    this.fields.clear();
    this.meadowViews.clear();
    for (const plant of [
      ...this.crops.values(),
      this.stooks,
      this.heaps,
      this.haystacks,
      ...this.weeds,
    ]) {
      plant.mesh?.dispose();
    }
    this.pegMesh?.dispose();
  }

  /** Den pro odhad vzhledu: herní den rozdělení práce (postavy ho mají taky), jinak scéna. */
  private lookDay(): number {
    const labor = this.village.labor;
    return labor ? dateOfDayIndex(labor.day).dayOfYear : this.dayOfYear;
  }

  private rebuild(): boolean {
    const fields = this.updateFields();
    const meadows = this.updateMeadows();
    if (!fields && !meadows) return false;
    this.updatePlants();
    return true;
  }

  private updateFields(): boolean {
    const day = this.lookDay();
    let changed = false;
    const seen = new Set<number>();
    const clearings = buildingClearings(this.village.dwellings);
    // přirozené louky letošní seče (oxen.md – Seno) se kreslí jako díly pole se vzhledem od
    // jádra – se zápornými id, bez skrývání překážek (stromy a kameny na louce zůstanou)
    const meadows = hayMeadowFields(this.village.hayMeadows ?? []);
    for (const field of [...this.village.fields, ...meadows]) {
      seen.add(field.id);
      // obydlí na poli – pod jeho vyklízenou plochou pole není
      const built = clearingsNear(clearings, cellsBounds(field.parts), CLEARING_SOFT_M);
      const views = fieldPartViews(field, { dayOfYear: day, village: this.village });
      // čtverce sousedních polí – kde pole navazují, okraj se netlumí (bez švu mezi poli); louky
      // jen k polím, pole jen k polím; zarůstající díly obtisk nemají – okraj k nim se tlumí
      // jako k louce
      const neighbours = touchingSquares(
        field.parts,
        this.village.fields.flatMap((f) =>
          f.id === field.id ? [] : f.parts.filter((p) => !isWildStage(p.stage)),
        ),
      );
      const drawn = field.parts.filter((p) => !isWildStage(p.stage));
      // louka na seno se mění po dnech (řádky, kupky, stohy, které přes zimu mizí)
      const hay = views.some((v) => v.look && LOOK_STYLES[v.look].hay);
      const center = villageCenter(this.village, field.parts);
      // Co ovlivní každý blok: krytí okraje (vykreslené díly, sousední pole, obydlí na poli),
      // směr řádků a střed (podle všech dílů), den sena. Bloky dílů (field-blocks.ts) mají
      // vlastní klíč – při postupu práce se přestaví jen ty, kde se něco změnilo.
      const context = JSON.stringify([
        field.parts.map((p) => [p.x, p.z, p.size]),
        drawn.map((p) => [p.cell.x, p.cell.y]),
        center,
        hay ? day : null,
        neighbours.map((p) => [p.cell.x, p.cell.y]),
        clearingsKey(built),
      ]);
      const grouped = groupFieldBlocks(views);
      const blockKeys = new Map(
        [...grouped].map(([block, blockViews]) => [
          block,
          JSON.stringify(partViewsKey(blockViews)),
        ]),
      );
      const key = `${context}|${[...blockKeys].map(([block, k]) => `${block}:${k}`).join('|')}`;
      const current = this.fields.get(field.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      const rows = rowDirection(field.parts);
      let coverage: ((x: number, z: number) => number) | null = null;
      const coverageOf = (): ((x: number, z: number) => number) => {
        if (coverage) return coverage;
        const ragged = raggedCoverage([...drawn, ...neighbours], EDGE_SOFT_M);
        const mask = clearingMask(built, CLEARING_SOFT_M);
        coverage =
          built.length > 0 ? (x: number, z: number): number => ragged(x, z) * mask(x, z) : ragged;
        return coverage;
      };
      const reuse = current?.context === context ? current.blocks : null;
      const blocks = new Map<string, { key: string; content: FieldBlockContent }>();
      for (const [block, blockViews] of grouped) {
        const blockKey = blockKeys.get(block)!;
        const cached = reuse?.get(block);
        blocks.set(
          block,
          cached?.key === blockKey
            ? cached
            : {
                key: blockKey,
                content: fieldBlockContent(blockViews, rows, center, coverageOf(), day),
              },
        );
      }
      const content = mergeFieldBlocks(
        views,
        [...blocks.values()].map((b) => b.content),
      );
      const staking = fieldStaking(views);
      this.fields.set(field.id, {
        key,
        meshes: this.fieldMeshes(field, content, rows, staking.lines),
        shape: field.id < 0 ? null : fieldHideShape(field),
        plants: content.plants,
        pegs: staking.pegs,
        context,
        blocks,
      });
    }
    for (const [id, view] of this.fields) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.fields.delete(id);
      changed = true;
    }
    return changed;
  }

  /** Louky na seno – výběr podle krajiny a vsi, vzhled podle dne. */
  private updateMeadows(): boolean {
    const choiceKey = this.explicitMeadows
      ? 'explicit'
      : JSON.stringify([
          this.landscape ? this.landscape.size : 0,
          this.village.dwellings.map((d) => [
            d.id,
            d.built,
            d.inhabited,
            d.position.x,
            d.position.z,
          ]),
          this.village.fields.map((f) => f.parts.map((p) => [p.cell.x, p.cell.y])),
          (this.village.orchards ?? []).map((o) => o.squares.length),
          (this.village.cemeteries ?? []).map((c) => c.squares.length),
          this.village.obstacles?.removed.length ?? 0,
        ]);
    if (choiceKey !== this.meadowsKey) {
      this.meadowsKey = choiceKey;
      this.meadows =
        this.explicitMeadows ??
        (this.landscape ? chooseHayMeadows(this.landscape, this.obstacles, this.village) : []);
    }
    const day = this.lookDay();
    const phase = hayPhase(day);
    let changed = false;
    const seen = new Set<number>();
    for (const meadow of this.meadows) {
      seen.add(meadow.id);
      const key = JSON.stringify([
        meadow.squares.map((s) => [s.x, s.z]),
        phase ? [workSteps(phase.mown), phase.hay, Math.round(phase.regrowth * 10), day] : null,
      ]);
      const current = this.meadowViews.get(meadow.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.meadowViews.set(meadow.id, {
        key,
        meshes: this.meadowMeshes(meadow, phase),
        hay: meadowHay(meadow, phase, day),
      });
    }
    for (const [id, view] of this.meadowViews) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.meadowViews.delete(id);
      changed = true;
    }
    return changed;
  }

  /**
   * Obtisky pole: kusy dílů podle vzhledu (jeden mesh na texturu a vrstvu – podklad a skvrny)
   * s měkkým nepravidelným okrajem do louky (bez meze – Martin: „Pole mají nějakou divnou
   * hranici. Můžeš ji zrušit?“) a u vytyčeného pole provázek s čarou naražené trávy.
   */
  private fieldMeshes(
    field: SceneField,
    content: FieldContent,
    rows: [number, number],
    stakingLines: Point[][],
  ): Mesh[] {
    if (field.parts.length === 0) return [];
    const layers = content.layers;
    const meshes: Mesh[] = [];
    const [dx, dz] = rows;
    for (const entry of layers.values()) {
      const texture = FIELD_TEXTURES[entry.texture];
      const uv = texture.rows
        ? (x: number, z: number): [number, number] => [
            (-x * dz + z * dx) / texture.repeatM,
            (x * dx + z * dz) / texture.repeatM,
          ]
        : texture.repeatM;
      const mesh = this.mergedDecal(
        `village-field-${field.id}-${entry.texture}${entry.patches ? '-patches' : ''}`,
        entry,
        entry.patches ? LIFT.patches : LIFT.base,
        uv,
      );
      mesh.material = this.decalMaterial(entry.texture, entry.patches ? -3 : -2);
      mesh.alphaIndex = entry.patches ? 2 : 1;
      meshes.push(mesh);
    }
    // posečená louka na seno: řádky sena na posečené části (v době sušení)
    if (content.swaths.length > 0) {
      meshes.push(this.swathMesh(`field-${field.id}`, content.swaths, rows));
    }
    if (stakingLines.length > 0) {
      const line = createStripMesh(
        this.scene,
        `village-field-layout-${field.id}`,
        stakingLines.flatMap((l) => stripSegments(l, false, LAYOUT_LINE_M, 0.5)),
        this.context.decalHeight,
        LIFT.layout,
      );
      line.material = this.flatMaterial('layout', new Color3(0.8, 0.76, 0.64), -5);
      meshes.push(line, this.stringMesh(field.id, stakingLines));
    }
    return meshes;
  }

  /** Provázek mezi kolíky – tenký svislý pás ve výšce STRING_HEIGHT_M nad terénem. */
  private stringMesh(id: number, lines: readonly Point[][]): Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const h = this.context.groundHeight;
    for (const line of lines) {
      const [a, b] = [line[0]!, line[line.length - 1]!];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(length / 1.5));
      const base = positions.length / 3;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        // provázek se mezi kolíky trochu prověsí
        const sag = Math.sin((Math.PI * ((t * length) % 15)) / 15) * 0.05;
        const y = h(x, z) + STRING_HEIGHT_M - sag;
        positions.push(x, y - STRING_THICKNESS_M / 2, z, x, y + STRING_THICKNESS_M / 2, z);
        normals.push(0, 1, 0, 0, 1, 0);
      }
      for (let s = 0; s < steps; s++) {
        const i = base + s * 2;
        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.indices = indices;
    const mesh = new Mesh(`village-field-string-${id}`, this.scene);
    data.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.material = this.flatMaterial('string', new Color3(0.9, 0.86, 0.74), 0, true);
    return mesh;
  }

  /** Louka na seno: posečená část (kratší světlejší tráva) a na ní řádky sena. */
  private meadowMeshes(meadow: HayMeadow, phase: HayPhase | null): Mesh[] {
    if (!phase || phase.mown <= 0 || phase.regrowth >= 1) return [];
    const coverage = raggedCoverage(meadow.squares, MEADOW_EDGE_SOFT_M);
    const mown = workSteps(phase.mown);
    // seče se od jednoho kraje louky napříč řádky
    const [dx, dz] = meadow.rows;
    const across: [number, number] = [-dz, dx];
    const values = meadow.squares.map((s) => s.x * across[0] + s.z * across[1]);
    const half = meadow.squares[0]!.size / 2;
    const from = Math.min(...values) - half;
    const to = Math.max(...values) + half;
    const limit = from + (to - from) * mown;
    const mownAt = (x: number, z: number): number =>
      smooth01((limit - (x * across[0] + z * across[1])) / 1.2);
    const grids: DecalGrid[] = meadow.squares.map((s) =>
      decalGrid(
        { minX: s.x - half, maxX: s.x + half, minZ: s.z - half, maxZ: s.z + half },
        s.size / GRID_PER_CELL,
        (x, z) => coverage(x, z) * mownAt(x, z),
      ),
    );
    const fade = 1 - phase.regrowth;
    const meshes: Mesh[] = [];
    const entry: DecalLayer = {
      texture: 'grass',
      patches: false,
      grids,
      colors: grids.map(() => [1.2, 1.12, 0.74] as const),
      alphas: grids.map(() => 0.92 * fade),
    };
    const mesh = this.mergedDecal(`village-meadow-${meadow.id}`, entry, LIFT.base, 18);
    mesh.material = this.decalMaterial('grass', -2);
    mesh.alphaIndex = 1;
    meshes.push(mesh);
    if (phase.hay === 'swaths') {
      // řádky sena: jemnější síť, krytí ve skvrnách (řádek není všude stejně hustý)
      const swathGrids = meadow.squares.map((s) =>
        decalGrid(
          { minX: s.x - half, maxX: s.x + half, minZ: s.z - half, maxZ: s.z + half },
          s.size / GRID_PER_CELL / 2,
          (x, z) => coverage(x, z) * mownAt(x, z) * (0.55 + 0.45 * patchNoise(x * 1.7, z * 1.7)),
        ),
      );
      meshes.push(this.swathMesh(`meadow-${meadow.id}`, swathGrids, meadow.rows));
    }
    return meshes;
  }

  /** Řádky posečeného sena – trochu zvlněné (kosa nejde po pravítku), napříč `rows`. */
  private swathMesh(name: string, grids: DecalGrid[], rows: readonly [number, number]): Mesh {
    const [dx, dz] = rows;
    const swaths: DecalLayer = {
      texture: 'grass',
      patches: false,
      grids,
      colors: grids.map(() => [0.8, 0.78, 0.5] as const),
      alphas: grids.map(() => 0.95),
    };
    const mesh = this.mergedDecal(`village-swaths-${name}`, swaths, LIFT.swaths, (x, z) => {
      const along = x * dx + z * dz;
      const across = -x * dz + z * dx;
      return [
        along / 4,
        (across + 0.5 * Math.sin(along / 7.3) + 0.25 * Math.sin(along / 2.9)) / SWATH_SPACING_M,
      ];
    });
    mesh.material = this.swathMaterial();
    mesh.alphaIndex = 2;
    return mesh;
  }

  /** Instance trsů, panáků, plevele, kolíků a stohů ze všech polí a luk. */
  private updatePlants(): void {
    const crops = emptyCrops();
    const stooks: PlantInstance[] = [];
    const heaps: PlantInstance[] = [];
    const weeds: PlantInstance[] = [];
    const pegs: Peg[] = [];
    for (const view of this.fields.values()) {
      for (const kind of CROP_KINDS) crops[kind].push(...view.plants.crops[kind]);
      stooks.push(...view.plants.stooks);
      heaps.push(...view.plants.heaps);
      weeds.push(...view.plants.weeds);
      pegs.push(...view.pegs);
    }
    const hay = [
      ...[...this.fields.values()].flatMap((v) => v.plants.hay),
      ...[...this.meadowViews.values()].flatMap((v) => v.hay),
    ];
    const needed =
      CROP_KINDS.some((k) => crops[k].length > 0) ||
      stooks.length > 0 ||
      heaps.length > 0 ||
      weeds.length > 0 ||
      hay.length > 0;
    if (needed) void this.loadModels();
    for (const kind of CROP_KINDS) {
      this.setPlants(this.crops.get(kind)!, crops[kind], CROP_TINT[kind]);
    }
    this.setPlants(this.stooks, stooks);
    this.setPlants(this.heaps, heaps, HEAP_TINT);
    this.setPlants(this.haystacks, hay);
    // plevel napůl do obou trsů trávy
    this.weeds.forEach((plant, i) =>
      this.setPlants(
        plant,
        weeds.filter((_, k) => k % this.weeds.length === i),
      ),
    );
    this.pegs = pegs;
    this.writePegs();
    this.applyCounts();
  }

  private setPlants(
    plant: PlantMesh,
    instances: PlantInstance[],
    tint: readonly [number, number, number] = [1, 1, 1],
  ): void {
    plant.instances = plant.thin ? [...instances].sort((a, b) => a.rank - b.rank) : instances;
    const mesh = plant.mesh;
    if (!mesh) return;
    plant.count = plant.instances.length;
    if (plant.count === 0) {
      mesh.setEnabled(false);
      return;
    }
    const { matrices, colors } = plantBuffers(
      plant.instances,
      this.context.groundHeight,
      plant.sink,
      tint,
    );
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceSetBuffer('color', colors, 4, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.setEnabled(true);
  }

  /** Počty kreslených instancí podle odstupu kamery a sněhu; vrátí true, když se něco změnilo. */
  private applyCounts(): boolean {
    let changed = false;
    const snowy = this.snow > SNOW_HIDE;
    const apply = (plant: PlantMesh, hideInSnow: boolean): void => {
      const mesh = plant.mesh;
      if (!mesh || plant.count === 0) return;
      const density = plant.thin ? this.density : 1;
      const count = hideInSnow && snowy ? 0 : Math.round(plant.count * density);
      if (mesh.thinInstanceCount !== count) {
        mesh.thinInstanceCount = count;
        changed = true;
      }
      const enabled = count > 0;
      if (mesh.isEnabled() !== enabled) {
        mesh.setEnabled(enabled);
        changed = true;
      }
    };
    for (const kind of CROP_KINDS)
      apply(this.crops.get(kind)!, kind === 'sprout' || kind === 'stubble');
    for (const weed of this.weeds) apply(weed, true);
    apply(this.stooks, false);
    apply(this.heaps, false);
    apply(this.haystacks, false);
    return changed;
  }

  private writePegs(): void {
    if (this.pegs.length === 0) {
      this.pegMesh?.setEnabled(false);
      return;
    }
    this.pegMesh ??= this.createPegMesh();
    const instances: PlantInstance[] = this.pegs.map((p) => ({
      x: p.x,
      z: p.z,
      rotation: (p.x * 7.1 + p.z * 3.3) % Math.PI,
      width: 1,
      height: p.scale,
      shade: 1,
      rank: 0,
    }));
    const { matrices } = plantBuffers(instances, this.context.groundHeight, PEG.sink);
    this.pegMesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    this.pegMesh.thinInstanceRefreshBoundingInfo(false);
    this.pegMesh.setEnabled(true);
  }

  /** Načte modely trsů, panáku, stohu a plevele (jednou); po načtení se instance nastaví. */
  private loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    await Promise.all([
      (async () => {
        try {
          const parts = await loadModelParts(this.scene, `${MODEL_URL}crops.glb`, 'field-', (m) =>
            this.prepareCropMaterial(m),
          );
          if (!parts) return;
          for (const kind of CROP_KINDS) {
            const mesh = parts.get(`crop-${kind}`);
            if (!mesh) continue;
            mesh.setEnabled(false);
            mesh.receiveShadows = true;
            this.crops.get(kind)!.mesh = mesh;
          }
          // hromádky vytrhaného hrachu – rekvizita jako panák (vrhá stín)
          const heap = parts.get(HEAP_NODE);
          if (heap) {
            heap.setEnabled(false);
            heap.receiveShadows = true;
            this.context.addShadowCaster(heap);
            this.heaps.mesh = heap;
          }
          for (const [name, mesh] of parts) {
            if (!name.startsWith('crop-') && name !== HEAP_NODE) mesh.dispose();
          }
        } catch (error) {
          console.warn('Trsy obilí se nepodařilo načíst.', error);
        }
      })(),
      this.loadProp(`${MODEL_URL}stook.glb`, 'field-stooks', this.stooks),
      this.loadProp(`${MODEL_URL}haystack.glb`, 'field-haystacks', this.haystacks, HAY_TINT),
      ...WEED_URLS.map(async (url, i) => {
        try {
          const mesh = await loadMergedModel(
            this.scene,
            url,
            `field-weeds-${i}`,
            prepareWeedMaterial,
          );
          if (!mesh) return;
          mesh.setEnabled(false);
          mesh.receiveShadows = true;
          this.weeds[i]!.mesh = mesh;
        } catch (error) {
          console.warn('Plevel úhoru se nepodařilo načíst.', error);
        }
      }),
    ]);
    if (this.disposed) return;
    this.updatePlants();
    this.context.onAsyncChange();
  }

  private async loadProp(
    url: string,
    name: string,
    plant: PlantMesh,
    tint: Color3 = STRAW_TINT,
  ): Promise<void> {
    try {
      const mesh = await loadMergedModel(this.scene, url, name, (m) =>
        preparePropMaterial(m, tint),
      );
      if (!mesh) return;
      mesh.setEnabled(false);
      mesh.receiveShadows = true;
      this.context.addShadowCaster(mesh);
      plant.mesh = mesh;
    } catch (error) {
      console.warn(`Model ${url} se nepodařilo načíst.`, error);
    }
  }

  /**
   * Materiál trsů (sdílí ho všechny druhy – tón druhu nese barva instance): jako trsy trávy
   * u obydlí, s větrem ve vertex shaderu – vlní se hlavně vysoké obilí (výchylka roste se
   * čtvercem výšky).
   */
  private prepareCropMaterial(material: Material): void {
    if (!(material instanceof PBRMaterial)) return;
    this.swayPlugins.push(new CropSwayPlugin(material, SWAY_AMPLITUDE));
    applyGammaFog(material);
    material.roughness = 1;
    material.metallic = 0;
    material.alphaCutOff = 0.35;
    material.ambientColor = PLANT_AMBIENT;
    material.directIntensity = 0.8;
    if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  }

  /** Kolík: hranol s patou v počátku, nahoře světlý zářez (čerstvě přitesané dřevo). */
  private createPegMesh(): Mesh {
    const h = PEG.size / 2;
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const wood = [0.55, 0.45, 0.32, 1];
    const fresh = [0.93, 0.88, 0.74, 1];
    const bands: [number, number, number[]][] = [
      [0, PEG.height + PEG.sink - PEG.top, wood],
      [PEG.height + PEG.sink - PEG.top, PEG.height + PEG.sink, fresh],
    ];
    for (const [y0, y1, color] of bands) {
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k]!;
        const [bx, bz] = corners[(k + 1) % 4]!;
        const i = positions.length / 3;
        positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
        for (let c = 0; c < 4; c++) colors.push(...color);
        indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
      }
    }
    // špička nahoře
    const top = PEG.height + PEG.sink;
    const i = positions.length / 3;
    positions.push(-h, top, -h, h, top, -h, h, top, h, -h, top, h);
    for (let c = 0; c < 4; c++) colors.push(...fresh);
    indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.colors = colors;
    data.indices = indices;
    const mesh = new Mesh('field-pegs', this.scene);
    data.applyToMesh(mesh);
    const material = new StandardMaterial('field-peg', this.scene);
    material.specularColor = Color3.Black();
    material.ambientColor = PROP_AMBIENT;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /** Spojí sítě kusů do jednoho obtisku – každý kus s vlastní barvou a krytím. */
  private mergedDecal(
    name: string,
    layer: Pick<DecalLayer, 'grids' | 'colors' | 'alphas'>,
    lift: number,
    uv: number | ((x: number, z: number) => [number, number]),
  ): Mesh {
    const total = layer.grids.reduce((sum, g) => sum + g.alphas.length, 0);
    const totalIndices = layer.grids.reduce((sum, g) => sum + g.indices.length, 0);
    const positions = new Float32Array(total * 2);
    const alphas = new Float32Array(total);
    const indices = new Uint32Array(totalIndices);
    const colorOf: (readonly [number, number, number])[] = new Array(total);
    let v = 0;
    let k = 0;
    layer.grids.forEach((grid, g) => {
      const count = grid.alphas.length;
      positions.set(grid.positions, v * 2);
      for (let i = 0; i < count; i++) {
        alphas[v + i] = grid.alphas[i]! * layer.alphas[g]!;
        colorOf[v + i] = layer.colors[g]!;
      }
      for (let i = 0; i < grid.indices.length; i++) indices[k + i] = grid.indices[i]! + v;
      v += count;
      k += grid.indices.length;
    });
    return createDecalMesh(
      this.scene,
      name,
      { positions, alphas, indices },
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift,
        // kolísání barvy ve skvrnách (≈ 40 m a 15 m) – pole nevypadá jako natřené jednou barvou
        // a z dálky nejsou vidět opakující se dlaždice textury
        color: (x, z, i) => {
          const [r, g, b] = colorOf[i]!;
          const n = 0.9 + 0.2 * patchNoise(x / 6 + 11.3, z / 6 - 3.7);
          return [r * n, g * n, b * n];
        },
        uv,
      },
    );
  }

  private decalMaterial(texture: FieldTexture, zOffset: number): Material {
    const key = `decal-${texture}-${zOffset}`;
    let material = this.materials.get(key);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `village-field-${key}`, {
        texturePath: FIELD_TEXTURES[texture].url,
        zOffset,
      });
      applyPitCut(decal, this.context.pitCuts);
      // tráva v obtisku usychá jako na terénu, v zimě ho zasype sníh
      applySeasonGround(decal, FIELD_SNOW);
      const loaded = decal.diffuseTexture;
      if (loaded instanceof Texture && !loaded.isReady()) {
        loaded.onLoadObservable.addOnce(() => this.context.requestRender());
      }
      material = decal;
      this.materials.set(key, material);
    }
    return material;
  }

  /** Řádky posečeného sena – pruhy v textuře (krytí), barvu dodají vrcholy. */
  private swathMaterial(): Material {
    let material = this.materials.get('swaths');
    if (!material) {
      const standard = createDecalMaterial(this.scene, 'village-meadow-swaths', { zOffset: -3 });
      const height = 64;
      const data = new Uint8Array(4 * height * 4);
      for (let y = 0; y < height; y++) {
        // řádek sena zabírá asi pětinu rozteče, kraje měkké a roztřepené
        const t = Math.abs(y / height - 0.5) * 2;
        const alpha = Math.round(255 * (1 - Math.min(1, Math.max(0, (t - 0.12) / 0.14))));
        for (let x = 0; x < 4; x++) {
          const fray = (x * 37 + y * 11) % 7 === 0 ? 0.7 : 1;
          data.set([255, 255, 255, Math.round(alpha * fray)], (y * 4 + x) * 4);
        }
      }
      const texture = RawTexture.CreateRGBATexture(
        data,
        4,
        height,
        this.scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.name = 'village-meadow-swaths-texture';
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.hasAlpha = true;
      standard.diffuseTexture = texture;
      standard.useAlphaFromDiffuseTexture = true;
      applySeasonGround(standard, FIELD_SNOW);
      material = standard;
      this.materials.set('swaths', material);
    }
    return material;
  }

  /** Jednobarevný materiál (mez, čára vytyčení, provázek). */
  private flatMaterial(name: string, color: Color3, zOffset: number, emissive = false): Material {
    const key = `flat-${name}`;
    let material = this.materials.get(key);
    if (!material) {
      const standard = new StandardMaterial(`village-field-${name}`, this.scene);
      standard.diffuseColor = color;
      standard.specularColor = Color3.Black();
      standard.zOffset = zOffset;
      standard.backFaceCulling = false;
      // provázek: světlá barva bez stínování, ať je z výšky vidět
      if (emissive) standard.emissiveColor = color.scale(0.55);
      material = standard;
      this.materials.set(key, material);
    }
    return material;
  }
}

/** Hustota trsů podle odstupu kamery (1 blízko, FAR_DENSITY daleko, 0 od HIDE). */
export function cropDensity(radius: number): number {
  if (radius >= CROP_RANGE_M.hide) return 0;
  if (radius <= CROP_RANGE_M.near) return 1;
  if (radius >= CROP_RANGE_M.far) return FAR_DENSITY;
  const t = (radius - CROP_RANGE_M.near) / (CROP_RANGE_M.far - CROP_RANGE_M.near);
  return 1 - (1 - FAR_DENSITY) * t;
}

function smooth01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * Matice instancí (natočení kolem svislé osy, šířka v x a z, výška v y – trs je 1 m vysoký
 * model) a barvy (odstín) – pata na terénu, o `sink` zapuštěná.
 */
function plantBuffers(
  instances: readonly PlantInstance[],
  height: HeightFn,
  sink: number,
  tint: readonly [number, number, number] = [1, 1, 1],
): { matrices: Float32Array; colors: Float32Array } {
  const matrices = new Float32Array(instances.length * 16);
  const colors = new Float32Array(instances.length * 4);
  instances.forEach((p, i) => {
    const c = Math.cos(p.rotation);
    const s = Math.sin(p.rotation);
    const o = i * 16;
    // sloupce matice Babylonu (řádkový zápis: x, y, z osy a posun)
    matrices[o] = c * p.width;
    matrices[o + 2] = -s * p.width;
    matrices[o + 5] = p.height;
    matrices[o + 8] = s * p.width;
    matrices[o + 10] = c * p.width;
    matrices[o + 12] = p.x;
    matrices[o + 13] = height(p.x, p.z) - sink;
    matrices[o + 14] = p.z;
    matrices[o + 15] = 1;
    colors[i * 4] = p.shade * tint[0];
    colors[i * 4 + 1] = p.shade * tint[1];
    colors[i * 4 + 2] = p.shade * tint[2];
    colors[i * 4 + 3] = 1;
  });
  return { matrices, colors };
}

function preparePropMaterial(material: Material, tint: Color3): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = PROP_AMBIENT;
  material.albedoColor = tint;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // v zimě by na panácích a stozích ležel sníh (stohy zůstávají přes zimu)
  applySeasonSnow(material);
}

function prepareWeedMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.alphaCutOff = 0.3;
  material.ambientColor = PLANT_AMBIENT;
  material.directIntensity = 0.75;
  material.albedoColor = TUFT_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  applySeasonModel(material, 'grass-tuft');
}

/**
 * Vítr v obilí (GLSL i WGSL): vrchol trsu se posune po větru úměrně čtverci výšky nad patou
 * instance – klasy se vlní, pata stojí. Vlna běží přes pole podle polohy trsu.
 */
class CropSwayPlugin extends MaterialPluginBase {
  time = 0;

  constructor(
    material: PBRMaterial,
    private readonly amplitude: number,
  ) {
    super(material, 'CropSway', 210, { CROP_SWAY: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['CROP_SWAY'] = true;
  }

  override getClassName(): string {
    return 'CropSwayPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL;
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[];
    vertex: string;
  } {
    return {
      ubo: [{ name: 'cropSway', size: 4, type: 'vec4' }],
      vertex:
        shaderLanguage === ShaderLanguage.WGSL
          ? `#ifdef CROP_SWAY
uniform cropSway: vec4f;
#endif`
          : `#ifdef CROP_SWAY
uniform vec4 cropSway;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4('cropSway', this.time, this.amplitude, WIND[0], WIND[1]);
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (shaderType !== 'vertex') return null;
    return shaderLanguage === ShaderLanguage.WGSL
      ? {
          CUSTOM_VERTEX_UPDATE_WORLDPOS: `#ifdef CROP_SWAY
{
  let cropH = max(0.0, worldPos.y - finalWorld[3].y);
  let cropP = finalWorld[3].xz;
  let cropW = sin(uniforms.cropSway.x * 1.7 + dot(cropP, vec2f(0.31, 0.23))) + 0.45 * sin(uniforms.cropSway.x * 2.9 + dot(cropP, vec2f(-0.57, 0.83)));
  let cropD = cropW * uniforms.cropSway.y * cropH * cropH;
  worldPos = vec4f(worldPos.x + uniforms.cropSway.z * cropD, worldPos.y, worldPos.z + uniforms.cropSway.w * cropD, worldPos.w);
}
#endif`,
        }
      : {
          CUSTOM_VERTEX_UPDATE_WORLDPOS: `#ifdef CROP_SWAY
{
  float cropH = max(0.0, worldPos.y - finalWorld[3].y);
  vec2 cropP = finalWorld[3].xz;
  float cropW = sin(cropSway.x * 1.7 + dot(cropP, vec2(0.31, 0.23))) + 0.45 * sin(cropSway.x * 2.9 + dot(cropP, vec2(-0.57, 0.83)));
  worldPos.xz += cropSway.zw * (cropW * cropSway.y * cropH * cropH);
}
#endif`,
        };
  }
}
