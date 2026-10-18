import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Position, SacredBuildingKind } from '@bohemia/game';
import type { SceneSacred } from '../village-view';
import { applyGammaFog } from './gamma-fog';
import {
  instanceMatrices,
  loadMergedModelWithNodes,
  loadModelParts,
  type ModelInstance,
} from './instanced-model';
import { fallbackGeometry } from './sacred-fallback';
import {
  SACRED_MODELS,
  SACRED_MODEL_BASE_URL,
  SACRED_SITE_KIND,
  SHRINE_SMOKE_LIFT_M,
  groveStones,
  oakOfferingRotation,
  sacredBuildingKey,
  sacredFootprintCorners,
  shrineFiresWorld,
} from './sacred-layout';
import { applySeasonGround, applySeasonSnow } from './season-materials';
import { ROUND_SITE_M, constructionState, type ConstructionState } from './village-construction';
import type { SmokeSource } from './village-smoke';
import {
  decalGrid,
  localToWorld,
  pointInPolygon,
  polygonBounds,
  softCoverage,
  stripSegments,
  type HideShape,
  type Point,
} from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';

type SceneSacredBuilding = SceneSacred['buildings'][number];

/** Drobné modely v instancích – obětiny u dubu a kameny háje. */
type DecorKey = 'oak-offerings' | 'stone-a' | 'stone-b' | 'altar';
const DECOR_KEYS: readonly DecorKey[] = ['oak-offerings', 'stone-a', 'stone-b', 'altar'];
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Duch stavby je o kousek zapuštěný – žádný okraj nevisí nad terénem (m). */
const SINK_M = 0.04;
/**
 * Stavba položená na terén je o kousek nad ním – trojúhelníky modelu a terénu se mezi vrcholy
 * nekryjí přesně, udusaná hlína by jinak místy prosvítala trávou (m).
 */
const DRAPE_LIFT_M = 0.03;
/** Dým ohnišť svatyně – seed rozvrhu ohně (jiný než id obydlí). */
const SHRINE_SMOKE_SEED = 900_000;
/** Výška obtisků staveniště nad terénem (m) – čára vytyčení a ušlapaná tráva (jako u obydlí). */
const LIFT = { outline: 0.06, trampled: 0.03 };
/** Měkký okraj ušlapané trávy (m) – jako u obydlí a v náhledu staveb. */
const TRAMPLED_SOFT_M = 2.2;
/** Sníh na ušlapané trávě – jako na obtiscích vsi (village-renderer.ts). */
const TRAMPLED_SNOW = 0.85;

/** Co renderer potřebuje od vsi – terén, stíny a ohlášení dočtených modelů. */
export interface SacredContext {
  /** Hladký terén (s převýšením) – paty modelů. */
  groundHeight: HeightFn;
  /** Přesná výška vykresleného terénu – čára vytyčení a stavby položené na terén. */
  decalHeight: HeightFn;
  addShadowCaster(mesh: Mesh): void;
  /** Dočetly se modely – překreslit a obnovit stíny. */
  onAsyncChange(): void;
}

interface BuildingView {
  key: string;
  meshes: Mesh[];
}

/**
 * Posvátná místa ve scéně (happiness.md – Co hráč vidí): u kmene ušetřeného posvátného dubu
 * obětiny (kameny, stužky, miska), na okraji dubového háje kamenný kruh hraničních kamenů
 * a oltář ke vsi (obojí v instancích), modla a svatyně jako modely (z ohnišť svatyně občas
 * dým – `smokeSources`) a jejich staveniště po fázích (sacred-layout.ts) z dílů
 * {idol,shrine}-construction.glb – vytyčení kolíky a provázkem je vidět hned od zadání stavby.
 * Modla a svatyně (i díly staveniště) se kladou na terén: každý vrchol modelu se posune o výšku
 * terénu pod ním, takže plocha, příkop a val svatyně na mírném svahu nezapadnou ani nevisí.
 * Modely z public/models/sacred/ se načtou s prvním posvátným místem; když se načíst nedají,
 * kreslí se náhradní tvary (sacred-fallback.ts).
 */
export class SacredRenderer {
  private key = '';
  private sacred: SceneSacred | null = null;
  /** Předlohy modelů a dílů (vypnuté): 'idol', 'shrine', drobné modely, 'modla-…', 'svatyne-…'. */
  private readonly templates = new Map<string, Mesh>();
  private readonly fallbacks = new Map<string, Mesh | null>();
  private readonly ghosts = new Map<SacredBuildingKind, Mesh>();
  private readonly buildings = new Map<number, BuildingView>();
  private loading: Promise<void> | null = null;
  private loaded = false;
  private layoutMaterial: Material | null = null;
  private trampledMaterial: Material | null = null;
  /** Ohniště svatyně z uzlů fire-1…8 v shrine.glb (souřadnice modelu); bez nich spočítaná. */
  private fireSpots: Point[] | undefined;
  private fallbackMaterial: PBRMaterial | null = null;
  private shapes: HideShape[] = [];
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: SacredContext,
  ) {}

  /** Překreslí posvátná místa, když se změnila; vrátí true, když se něco změnilo. */
  update(sacred: SceneSacred | undefined): boolean {
    const next = sacred ?? null;
    const key = sacredKey(next);
    if (key === this.key) return false;
    this.key = key;
    this.sacred = next;
    this.shapes = (next?.buildings ?? []).map((b) => {
      const corners = sacredFootprintCorners(b.kind, b.position);
      return { bounds: polygonBounds(corners), contains: (x, z) => pointInPolygon(corners, x, z) };
    });
    if (next && hasContent(next)) void this.loadModels();
    this.updateDecor();
    this.updateBuildings();
    return true;
  }

  /** Oblasti, kde se mají skrýt ozdoby krajiny bez id (půdorysy modly a svatyně). */
  hideShapes(): HideShape[] {
    return this.shapes;
  }

  /** Ohniště hotových svatyní pro dým (jako dýmníky obydlí – rozvrh ohně podle herního dne). */
  smokeSources(): SmokeSource[] {
    const sources: SmokeSource[] = [];
    for (const b of this.sacred?.buildings ?? []) {
      if (!b.built || b.kind !== 'shrine') continue;
      shrineFiresWorld(b.position, this.fireSpots).forEach(([x, z], k) => {
        sources.push({
          seed: SHRINE_SMOKE_SEED + b.id * 8 + k,
          x,
          y: this.context.decalHeight(x, z) + SHRINE_SMOKE_LIFT_M,
          z,
        });
      });
    }
    return sources;
  }

  /** Průhledný model modly nebo svatyně pro ducha při umisťování (null, dokud se nenačte). */
  ghostModel(kind: SacredBuildingKind): Mesh | null {
    void this.loadModels();
    return this.ghosts.get(kind) ?? null;
  }

  /** Načte modely (jednou); po načtení se posvátná místa překreslí. */
  loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  /** Pata modelu (duch při umisťování): střed, nebo průměr rohů půdorysu, když je níž. */
  baseHeight(b: Pick<SceneSacredBuilding, 'kind' | 'position'>): number {
    const h = this.context.groundHeight;
    const corners = sacredFootprintCorners(b.kind, b.position);
    const mean = corners.reduce((sum, [x, z]) => sum + h(x, z), 0) / corners.length;
    return Math.min(h(b.position.x, b.position.z), mean) - SINK_M;
  }

  dispose(): void {
    this.disposed = true;
    for (const view of this.buildings.values()) for (const mesh of view.meshes) mesh.dispose();
    for (const mesh of this.templates.values()) mesh.dispose();
    for (const mesh of this.fallbacks.values()) mesh?.dispose();
    for (const mesh of this.ghosts.values()) mesh.dispose();
    this.buildings.clear();
    this.templates.clear();
    this.fallbacks.clear();
  }

  private async load(): Promise<void> {
    // modely s jedním meshem se spojí (i s prázdnými uzly ohnišť svatyně); GLB s víc meshi
    // (kameny háje, díly stavenišť) po dílech – spojení víc meshů pokazí ořez stěn
    const merged = async (key: string, file: string): Promise<void> => {
      try {
        const loaded = await loadMergedModelWithNodes(
          this.scene,
          `${SACRED_MODEL_BASE_URL}${file}`,
          `village-sacred-${key}`,
          prepareSacredMaterial,
        );
        if (!loaded) return;
        this.templates.set(key, this.prepareTemplate(loaded.model));
        if (key === 'shrine') this.fireSpots = fireSpotsOf(loaded.nodes);
      } catch (error) {
        console.warn(`Model posvátného místa ${file} se nepodařilo načíst – náhradní tvar.`, error);
      }
    };
    const parts = async (file: string): Promise<void> => {
      try {
        const loaded = await loadModelParts(
          this.scene,
          `${SACRED_MODEL_BASE_URL}${file}`,
          'village-sacred-',
          prepareSacredMaterial,
        );
        // kameny háje: stone-a, stone-b, altar; díly staveniště: modla-…, svatyne-…
        for (const [name, mesh] of loaded ?? [])
          this.templates.set(name, this.prepareTemplate(mesh));
      } catch (error) {
        console.warn(`Díly ${file} se nepodařilo načíst – náhradní tvary.`, error);
      }
    };
    await Promise.all([
      merged('idol', SACRED_MODELS.idol),
      merged('shrine', SACRED_MODELS.shrine),
      merged('oak-offerings', SACRED_MODELS.oakOfferings),
      parts(SACRED_MODELS.groveStones),
      parts(SACRED_MODELS.idolConstruction),
      parts(SACRED_MODELS.shrineConstruction),
    ]);
    if (this.disposed) return;
    this.loaded = true;
    for (const kind of ['idol', 'shrine'] as const) {
      const model = this.template(kind);
      if (!model) continue;
      const ghost = model.clone(`village-sacred-ghost-${kind}`);
      ghost.setEnabled(false);
      ghost.isPickable = false;
      this.ghosts.set(kind, ghost);
    }
    this.updateDecor();
    this.buildings.forEach((view) => (view.key = ''));
    this.updateBuildings();
    this.context.onAsyncChange();
  }

  private prepareTemplate(mesh: Mesh): Mesh {
    // víc materiálů v GLB → po spojení meshů je ořez stěn opačně (viz obydlí)
    const material = mesh.material;
    if (material instanceof MultiMaterial && material.subMaterials.length > 1) {
      for (const m of material.subMaterials)
        if (m) m.sideOrientation = Material.ClockWiseSideOrientation;
    }
    mesh.setEnabled(false);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /** Předloha modelu nebo dílu – načtená, jinak náhradní tvar (až po pokusu o načtení). */
  private template(key: string): Mesh | null {
    const model = this.templates.get(key);
    if (model) return model;
    return this.loaded ? this.fallback(key) : null;
  }

  private fallback(key: string): Mesh | null {
    if (this.fallbacks.has(key)) return this.fallbacks.get(key) ?? null;
    const geometry = fallbackGeometry(key);
    let mesh: Mesh | null = null;
    if (geometry) {
      const data = new VertexData();
      data.positions = geometry.positions;
      // barvy náhradních tvarů jsou v gama prostoru, PBR čte barvy vrcholů lineárně
      data.colors = geometry.colors.map((c, i) => (i % 4 === 3 ? c : c ** 2.2));
      data.indices = geometry.indices;
      const normals = new Float32Array(geometry.positions.length);
      VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
      data.normals = normals;
      mesh = new Mesh(`village-sacred-fallback-${key}`, this.scene);
      data.applyToMesh(mesh);
      mesh.material = this.fallbackMaterialOnce();
      this.prepareTemplate(mesh);
    }
    this.fallbacks.set(key, mesh);
    return mesh;
  }

  private fallbackMaterialOnce(): PBRMaterial {
    if (this.fallbackMaterial) return this.fallbackMaterial;
    const material = new PBRMaterial('village-sacred-fallback', this.scene);
    material.albedoColor = Color3.White();
    material.roughness = 1;
    material.metallic = 0;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    prepareSacredMaterial(material);
    this.fallbackMaterial = material;
    return material;
  }

  /** Obětiny u dubů a kameny hájů v instancích. */
  private updateDecor(): void {
    const sacred = this.sacred;
    const instances = new Map<DecorKey, ModelInstance[]>();
    const push = (key: DecorKey, instance: ModelInstance): void => {
      const list = instances.get(key);
      if (list) list.push(instance);
      else instances.set(key, [instance]);
    };
    const h = this.context.groundHeight;
    for (const oak of sacred?.oaks ?? []) {
      push('oak-offerings', {
        x: oak.x,
        y: h(oak.x, oak.z) - 0.03,
        z: oak.z,
        rotationY: oakOfferingRotation(oak.id),
        scale: 1,
      });
    }
    const toward = villageCenter(sacred);
    for (const grove of sacred?.groves ?? []) {
      for (const stone of groveStones(grove, toward)) {
        push(stone.model, {
          x: stone.x,
          y: h(stone.x, stone.z) - 0.02,
          z: stone.z,
          rotationY: stone.rotationY,
          scale: stone.scale,
        });
      }
    }
    for (const key of DECOR_KEYS) {
      const list = instances.get(key) ?? [];
      const mesh = list.length > 0 ? this.template(key) : (this.templates.get(key) ?? null);
      if (mesh) setInstances(mesh, list, (m) => this.context.addShadowCaster(m));
      // náhradní tvar se po dočtení modelu už nekreslí
      const fallback = this.fallbacks.get(key);
      if (fallback && fallback !== mesh) fallback.setEnabled(false);
    }
  }

  /**
   * Modly a svatyně (hotové i staveniště) – každá stavba vlastní sítě položené na terén;
   * přestaví se jen stavba, která se změnila (průběh po 2 %).
   */
  private updateBuildings(): void {
    const seen = new Set<number>();
    for (const b of this.sacred?.buildings ?? []) {
      seen.add(b.id);
      const key = sacredBuildingKey(b) + (this.loaded ? '' : '|loading');
      const current = this.buildings.get(b.id);
      if (current?.key === key) continue;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.buildings.set(b.id, { key, meshes: this.buildingMeshes(b) });
    }
    for (const [id, view] of this.buildings) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.buildings.delete(id);
    }
  }

  /**
   * Sítě jedné stavby: hotový model, nebo staveniště podle fáze (village-construction.ts –
   * díly, čára vytyčení a ušlapaná tráva; rekvizity kreslí ves s rekvizitami obydlí). Obtisky
   * staveniště jsou vidět hned, i než se dočtou modely – vytyčení od průběhu 0.
   */
  private buildingMeshes(b: SceneSacredBuilding): Mesh[] {
    const kind = SACRED_SITE_KIND[b.kind];
    const state = b.built ? null : constructionState(kind, b.progress);
    const meshes = state ? this.siteDecals(b, state) : [];
    if (!this.loaded) return meshes;
    const keys = state ? state.parts.map((part) => `${kind}-${part}`) : [b.kind];
    for (const key of keys) {
      const template = this.template(key);
      if (!template) continue;
      const mesh = this.draped(template, b.position, `village-sacred-${b.id}-${key}`);
      this.context.addShadowCaster(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Obtisky kruhového staveniště (ROUND_SITE_M): ušlapaná tráva uvnitř (u svatyně jen uvnitř
   * příkopu – jinak by překryla jeho dno) a světlá čára vytyčení po kruhu.
   */
  private siteDecals(b: SceneSacredBuilding, state: ConstructionState): Mesh[] {
    const site = ROUND_SITE_M[SACRED_SITE_KIND[b.kind]];
    const circle = (radius: number): Point[] => {
      const n = Math.max(24, Math.round(radius * 5));
      return Array.from({ length: n }, (_, i): Point => {
        const a = (2 * Math.PI * i) / n;
        return [b.position.x + radius * Math.cos(a), b.position.z + radius * Math.sin(a)];
      });
    };
    const meshes: Mesh[] = [];
    if (state.trampled > 0) {
      const area = circle(site.trampled - TRAMPLED_SOFT_M / 2);
      const bounds = polygonBounds(area);
      const pad = TRAMPLED_SOFT_M;
      const mesh = createDecalMesh(
        this.scene,
        `village-sacred-trampled-${b.id}`,
        decalGrid(
          {
            minX: bounds.minX - pad,
            maxX: bounds.maxX + pad,
            minZ: bounds.minZ - pad,
            maxZ: bounds.maxZ + pad,
          },
          0.6,
          softCoverage(area, TRAMPLED_SOFT_M),
        ),
        {
          height: this.context.decalHeight,
          smoothHeight: this.context.groundHeight,
          lift: LIFT.trampled,
          color: [1, 0.95, 0.86],
          alpha: state.trampled,
          uv: 20,
        },
      );
      mesh.material = this.trampledMaterialOnce();
      mesh.alphaIndex = 1;
      mesh.isPickable = false;
      meshes.push(mesh);
    }
    if (state.outline > 0) {
      const mesh = createStripMesh(
        this.scene,
        `village-sacred-layout-${b.id}`,
        stripSegments(circle(site.outline), true, 0.09, 0.5),
        this.context.decalHeight,
        LIFT.outline,
      );
      mesh.material = this.layoutMaterialOnce();
      mesh.isPickable = false;
      meshes.push(mesh);
    }
    return meshes;
  }

  /** Světlá čára vytyčení (vápno / naražená tráva po provázku) – jako u obydlí. */
  private layoutMaterialOnce(): Material {
    this.layoutMaterial ??= (() => {
      const m = new StandardMaterial('village-sacred-layout', this.scene);
      m.diffuseColor = new Color3(0.8, 0.76, 0.64);
      m.specularColor = Color3.Black();
      m.zOffset = -4;
      m.backFaceCulling = false;
      return m;
    })();
    return this.layoutMaterial;
  }

  /** Ušlapaná tráva – textura terénu jako vyšlapaná hlína u obydlí, s ročním obdobím. */
  private trampledMaterialOnce(): Material {
    this.trampledMaterial ??= (() => {
      const m = createDecalMaterial(this.scene, 'village-sacred-trampled', {
        texture: 'grass-dirt',
        zOffset: -2,
      });
      applySeasonGround(m, TRAMPLED_SNOW);
      return m;
    })();
    return this.trampledMaterial;
  }

  /**
   * Kopie předlohy na místě stavby položená na terén: vrchol (x, y, z modelu) jde na
   * natočené místo ve světě a jeho výška je terén pod ním + y (model stojí na zemi).
   */
  private draped(template: Mesh, position: Position, name: string): Mesh {
    const mesh = template.clone(name, null, true, false);
    mesh.sideOrientation = template.sideOrientation;
    mesh.makeGeometryUnique();
    const source = template.getVerticesData(VertexBuffer.PositionKind);
    if (source) {
      const positions = new Float32Array(source.length);
      const h = this.context.decalHeight;
      for (let i = 0; i < source.length; i += 3) {
        const [x, z] = localToWorld(position, source[i]!, source[i + 2]!);
        positions[i] = x;
        positions[i + 1] = h(x, z) + DRAPE_LIFT_M + source[i + 1]!;
        positions[i + 2] = z;
      }
      mesh.setVerticesData(VertexBuffer.PositionKind, positions, false);
      mesh.refreshBoundingInfo();
    }
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.setEnabled(true);
    return mesh;
  }
}

/**
 * Ohniště svatyně z prázdných uzlů fire-1…fire-8 modelu (souřadnice modelu ve scéně); když
 * některý chybí, undefined – použijí se spočítaná (`shrineFireSpots`).
 */
function fireSpotsOf(nodes: ReadonlyMap<string, { x: number; z: number }>): Point[] | undefined {
  const spots: Point[] = [];
  for (let k = 1; k <= 8; k++) {
    const node = nodes.get(`fire-${k}`);
    if (!node) return undefined;
    spots.push([node.x, node.z]);
  }
  return spots;
}

function hasContent(sacred: SceneSacred): boolean {
  return sacred.oaks.length > 0 || sacred.groves.length > 0 || sacred.buildings.length > 0;
}

/**
 * Střed vsi pro natočení oltáře háje – průměr modly a svatyně, jinak null (oltář pak k jihu).
 * Obydlí renderer posvátných míst nezná; oltář ke stavbám vsi stačí jako odhad.
 */
function villageCenter(sacred: SceneSacred | null): { x: number; z: number } | null {
  const buildings = sacred?.buildings ?? [];
  if (buildings.length === 0) return null;
  return {
    x: buildings.reduce((s, b) => s + b.position.x, 0) / buildings.length,
    z: buildings.reduce((s, b) => s + b.position.z, 0) / buildings.length,
  };
}

/** Co z posvátných míst rozhoduje o vzhledu. */
function sacredKey(sacred: SceneSacred | null): string {
  if (!sacred) return '';
  return [
    sacred.oaks.map((o) => `${o.id},${o.x},${o.z}`).join(';'),
    sacred.groves
      .map((g) => `${g.id}:${g.squares.map((s) => `${s.cell.x},${s.cell.y}`).join(',')}`)
      .join(';'),
    sacred.buildings.map((b) => `${b.id}:${sacredBuildingKey(b)}`).join(';'),
  ].join('|');
}

/** Meshe drobných modelů, které už vrhají stín (přidají se jednou). */
const casting = new WeakSet<Mesh>();

/**
 * Nastaví instance meshe; bez instancí ho vypne (jinak by se vykreslil samotný v počátku).
 * Mesh s instancemi poprvé přidá mezi vrhače stínu.
 */
function setInstances(
  mesh: Mesh,
  instances: readonly ModelInstance[],
  addShadowCaster: (mesh: Mesh) => void,
): void {
  if (instances.length === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
  mesh.setEnabled(true);
  if (!casting.has(mesh)) {
    casting.add(mesh);
    addShadowCaster(mesh);
  }
}

/** Materiál modelu jako obydlí: bez odlesku, opar v gama prostoru, v zimě sníh nahoře. */
function prepareSacredMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  applySeasonSnow(material);
}
