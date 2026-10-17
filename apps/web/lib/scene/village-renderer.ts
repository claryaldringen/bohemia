import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import {
  DWELLING_FOOTPRINT_M,
  type DwellingType,
  type ObstacleLayer,
  type WorldClock,
} from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import { CemeteryRenderer } from './cemetery-renderer';
import { EARTH_LAYERS, SMOKE_VENT, earthPatch, eaveTufts, type TuftModel } from './dwelling-decor';
import {
  PIT_SHAPES,
  pitMeshData,
  pitOutline,
  spoilHeapData,
  worldToLocal,
  type PitCut,
} from './dwelling-pit';
import { cellsBoundary, cellsCoverage, rowDirection } from './field-cells';
import { applyGammaFog } from './gamma-fog';
import {
  instanceMatrices,
  loadMergedModel,
  loadModelParts,
  type ModelInstance,
} from './instanced-model';
import { OrchardRenderer } from './orchard-renderer';
import { applyPitCut, type PitCuts } from './pit-cut';
import {
  SITE_PROP_PLACES,
  constructionState,
  type ConstructionState,
} from './village-construction';
import {
  DWELLING_CLEARANCE_M,
  decalGrid,
  dwellingHideShape,
  fieldHideShape,
  footprintCorners,
  localToWorld,
  partLook,
  polygonBounds,
  smoothstep,
  softCoverage,
  stripSegments,
  type DecalGrid,
  type FieldTexture,
  type HideShape,
  type Point,
} from './village-layout';
import {
  createDecalMaterial,
  createDecalMesh,
  createStripMesh,
  type HeightFn,
} from './village-meshes';
import { applySeasonGround, applySeasonModel, applySeasonSnow } from './season-materials';
import { VillageSmoke, type SmokeSource } from './village-smoke';
import type { SceneDwelling, SceneField } from './village-types';

const MODEL_BASE_URL = '/models/dwellings/';
const SMOKE_TEXTURE_URL = '/textures/particles/smoke.png';
const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
const TUFT_MODELS: readonly TuftModel[] = ['grass-tuft-1', 'grass-tuft-2'];
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Rostliny jako dekorace krajiny (decorations.ts) – trsy u okapu jsou sytější a zelenější. */
const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
const TUFT_TINT = new Color3(0.56, 0.86, 0.4);
/** Obydlí je o kousek zapuštěné – na mírném svahu tak žádný roh nevisí nad terénem (m). */
const DWELLING_SINK_M = 0.05;
/**
 * Kolik bodů sítě obtisku pole připadá na stranu čtverce – 8 na 15 m sedí na síť terénu
 * (4 body na políčko), obtisk pak leží přesně na něm. Šířka měkkého okraje pole (m).
 */
const FIELD_GRID_PER_CELL = 8;
const FIELD_EDGE_SOFT_M = 1.2;
/** Sníh na obtiscích vsi (pole, řádky, cesty) – část jejich barvy zimou prosvítá, mez zůstane. */
const VILLAGE_SNOW = 0.85;
/** Mez kolem pole – tenký pás podél hranice čtverců (m). */
const OUTLINE_WIDTH_M = 0.3;
/** Rozteč řádků obilí / brázd (m) a délka opakování textury podél nich. */
const ROW_SPACING_M = 0.75;
const ROW_REPEAT_M = 4;
/** Výška obtisků nad terénem (m) – navzájem v pořadí, aby se nepraly o hloubku. */
const LIFT = { field: 0.03, rows: 0.045, outline: 0.06, worn: 0.03, earth: 0.04, turf: 0.045 };
/** Sejmutý drn přesahuje jámu o tolik (m) – po vykopání zůstane kolem okraje tmavá hlína. */
const TURF_MARGIN_M = 0.35;
/** Ušlapaná tráva kolem staveniště: o kolik menší než místo pro stavbu a jak měkký okraj (m). */
const TRAMPLED_INSET_M = 0.6;
const TRAMPLED_SOFT_M = 2.2;
/** Hromada hlíny z jámy v plné velikosti (m) – většina hlíny jde nakonec na valy. */
const SPOIL_HEAP_M = { rx: 1.7, rz: 1.2, height: 0.72 };

interface DwellingView {
  key: string;
  dwelling: SceneDwelling;
  meshes: Mesh[];
  shape: HideShape;
  /** Vyhloubená jáma (terén se v ní prořízne), nebo null, dokud se nekope. */
  cut: PitCut | null;
}

interface FieldView {
  key: string;
  meshes: Mesh[];
  shape: HideShape | null;
}

interface VillageContext {
  /** Hladký terén (bilineárně, s převýšením) – paty modelů, trsů a sloupů. */
  groundHeight: HeightFn;
  /** Přesná výška vykresleného terénu – obtisky. */
  decalHeight: HeightFn;
  /** Nový mesh, který má vrhat stín od slunce. */
  addShadowCaster(mesh: Mesh): void;
  /** Ve vsi se něco změnilo až později (dočtený model) – překreslit a obnovit stíny. */
  onAsyncChange(): void;
  /** Dočetla se textura obtisku – překreslit. */
  requestRender(): void;
  /** Jámy prořezávané do terénu a obtisků (sdílí je materiál terénu). */
  pitCuts: PitCuts;
  /** Směr slunečních paprsků – stín okraje jámy. */
  sunDirection: { x: number; y: number; z: number };
}

/**
 * Ves ve scéně: hotová obydlí jako modely (thin instances, jeden mesh na typ) nad vyhloubenou
 * jámou se schody, kolem nich vyšlapaná hlína a trsy trávy u okapu, z dýmníku občas dým;
 * staveniště po fázích (village-construction.ts) z dílů modelu a rekvizit v instancích, jáma
 * se prohlubuje s průběhem; pole jako obtisky na terénu podle stavu dílů s mezí podél obrysu;
 * pohřebiště s plotem a mohylkami (cemetery-renderer.ts); jabloňové sady (orchard-renderer.ts).
 * `update` mění jen to, co se změnilo.
 */
export class VillageRenderer {
  private readonly dwellings = new Map<number, DwellingView>();
  private readonly fields = new Map<number, FieldView>();
  private readonly models = new Map<DwellingType, Mesh | null>();
  private readonly ghosts = new Map<DwellingType, Mesh>();
  private readonly tufts = new Map<TuftModel, Mesh | null>();
  private readonly materials = new Map<string, Material>();
  private loading: Promise<void> | null = null;
  private builtKey = '';
  /** Díly staveniště a rekvizity z construction.glb podle jména uzlu (zemnice-thatch-1, site-spoil…). */
  private readonly siteParts = new Map<string, Mesh>();
  private siteLoading: Promise<void> | null = null;
  private siteKey = '';
  private readonly smoke: VillageSmoke;
  private readonly cemeteries: CemeteryRenderer;
  private readonly orchards: OrchardRenderer;
  private village: SceneVillage = { dwellings: [], fields: [] };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: VillageContext,
  ) {
    this.smoke = new VillageSmoke(scene, SMOKE_TEXTURE_URL);
    this.cemeteries = new CemeteryRenderer(scene, context);
    this.orchards = new OrchardRenderer(scene, context);
  }

  /** Vrátí true, když se ve scéně něco změnilo (je co překreslit). */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    this.village = village;
    const dwellings = this.updateDwellings(village.dwellings);
    const fields = this.updateFields(village.fields);
    const cemeteries = this.cemeteries.update(village.cemeteries ?? [], village.dwellings);
    const orchards = this.orchards.update(village.orchards ?? []);
    const models = this.updateModels();
    const sites = this.updateConstruction();
    const smoke = this.updateSmokeSources();
    return dwellings || fields || cemeteries || orchards || models || sites || smoke;
  }

  /**
   * Posune dým z obydlí na okamžik `nowMs` (jen dým v záběru kamery; bez kamery všechen).
   * Vrátí true, když je co překreslit.
   */
  animateSmoke(nowMs: number, camera: Camera | null): boolean {
    return this.smoke.animate(nowMs, camera);
  }

  /** Vývojová volba: dým ze všech hotových obydlí pořád. */
  setSmokeAlways(enabled: boolean): void {
    this.smoke.setAlways(enabled);
  }

  /** Vrstva překážek krajiny (skalní výchozy pro stromy sadu); vrátí true, když je co překreslit. */
  setObstacles(layer: ObstacleLayer): boolean {
    return this.orchards.setObstacles(layer);
  }

  /** Svět, podle jehož herního dne se v obydlích topí (ráno a večer). */
  setWorldClock(world: WorldClock): void {
    this.smoke.setWorldClock(world);
  }

  /** Oblasti, kde se mají skrýt stromy a kameny krajiny. */
  hideShapes(): HideShape[] {
    const shapes: HideShape[] = [];
    for (const view of this.dwellings.values()) shapes.push(view.shape);
    for (const view of this.fields.values()) if (view.shape) shapes.push(view.shape);
    shapes.push(...this.cemeteries.hideShapes());
    shapes.push(...this.orchards.hideShapes());
    return shapes;
  }

  /** Průhledný model obydlí pro ducha při umisťování (null, dokud se model nenačte). */
  ghostModel(type: DwellingType): Mesh | null {
    void this.loadModels();
    return this.ghosts.get(type) ?? null;
  }

  /** Načte modely obydlí a trsů (jednou); po načtení se ves překreslí. */
  loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  dispose(): void {
    this.disposed = true;
    this.smoke.dispose();
    this.cemeteries.dispose();
    this.orchards.dispose();
    for (const view of this.dwellings.values()) for (const mesh of view.meshes) mesh.dispose();
    for (const view of this.fields.values()) for (const mesh of view.meshes) mesh.dispose();
    this.dwellings.clear();
    this.fields.clear();
  }

  private async load(): Promise<void> {
    await Promise.all([
      ...DWELLING_TYPES.map(async (type) => {
        try {
          const model = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${type}.glb`,
            `village-${type}`,
            prepareDwellingMaterial,
          );
          if (!model) return;
          // Víc materiálů v GLB → po spojení meshů je ořez stěn opačně než u jednomateriálových
          // modelů (instanced-model.ts nastavuje CCW) – otočit zpět. Atlas = jeden materiál.
          const material = model.material;
          if (material instanceof MultiMaterial && material.subMaterials.length > 1) {
            for (const m of material.subMaterials)
              if (m) m.sideOrientation = Material.ClockWiseSideOrientation;
          }
          // Duch dřív, než mesh dostane instance – klon by je jinak nesl s sebou.
          const ghost = model.clone(`village-ghost-${type}`);
          ghost.setEnabled(false);
          ghost.isPickable = false;
          this.ghosts.set(type, ghost);
          model.setEnabled(false);
          this.models.set(type, model);
          this.context.addShadowCaster(model);
        } catch (error) {
          console.warn(`Model obydlí ${type} se nepodařilo načíst.`, error);
          this.models.set(type, null);
        }
      }),
      ...TUFT_MODELS.map(async (name) => {
        try {
          const tuft = await loadMergedModel(
            this.scene,
            `${MODEL_BASE_URL}${name}.glb`,
            `village-${name}`,
            prepareTuftMaterial,
          );
          if (tuft) {
            tuft.setEnabled(false);
            this.context.addShadowCaster(tuft);
          }
          this.tufts.set(name, tuft);
        } catch (error) {
          console.warn('Trsy trávy u obydlí se nepodařilo načíst.', error);
          this.tufts.set(name, null);
        }
      }),
    ]);
    if (this.disposed) return;
    this.builtKey = '';
    this.updateModels();
    this.context.onAsyncChange();
  }

  private updateDwellings(dwellings: readonly SceneDwelling[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const dwelling of dwellings) {
      seen.add(dwelling.id);
      const key = dwellingKey(dwelling);
      const current = this.dwellings.get(dwelling.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      const state = dwelling.built ? null : constructionState(dwelling.type, dwelling.progress);
      const dug = !state || state.pitDepth > 0;
      this.dwellings.set(dwelling.id, {
        key,
        dwelling,
        meshes: state ? this.constructionSite(dwelling, state) : this.dwellingGround(dwelling),
        shape: dwellingHideShape(dwelling.type, dwelling.position),
        cut: dug ? { position: dwelling.position, shape: PIT_SHAPES[dwelling.type] } : null,
      });
    }
    for (const [id, view] of this.dwellings) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.dwellings.delete(id);
      changed = true;
    }
    if (changed) {
      const cuts: PitCut[] = [];
      for (const view of this.dwellings.values()) if (view.cut) cuts.push(view.cut);
      this.context.pitCuts.set(cuts);
    }
    return changed;
  }

  /** Dýmníky hotových obývaných obydlí pro dým. */
  private updateSmokeSources(): boolean {
    const sources: SmokeSource[] = this.village.dwellings
      .filter((d) => d.built && d.inhabited !== false)
      .map((d) => {
        const vent = SMOKE_VENT[d.type];
        const [x, z] = localToWorld(d.position, 0, vent.z);
        return { seed: d.id, x, y: this.baseHeight(d) + vent.y, z };
      });
    return this.smoke.setSources(sources);
  }

  /**
   * Díly staveniště (z construction.glb) a rekvizity v instancích – přepočítají se, jen když
   * se změnilo některé staveniště.
   */
  private updateConstruction(): boolean {
    const sites = this.village.dwellings.filter((d) => !d.built);
    const key = sites.map(dwellingKey).join(';');
    if (key === this.siteKey) return false;
    if (sites.length > 0) void this.loadConstruction();
    if (!this.siteLoading) return false;
    this.siteKey = key;
    const instances = new Map<string, ModelInstance[]>();
    const push = (name: string, instance: ModelInstance): void => {
      const list = instances.get(name);
      if (list) list.push(instance);
      else instances.set(name, [instance]);
    };
    for (const d of sites) {
      const state = constructionState(d.type, d.progress);
      const base = this.baseHeight(d);
      const rotationY = d.position.rotation;
      for (const part of state.parts) {
        push(`${d.type}-${part}`, {
          x: d.position.x,
          y: base,
          z: d.position.z,
          rotationY,
          scale: 1,
        });
      }
      for (const { prop, scale } of state.props) {
        // hromada hlíny je vlastní síť staveniště (leží na terénu, barvy jako jáma)
        if (prop === 'spoil') continue;
        const place = SITE_PROP_PLACES[d.type][prop];
        const [x, z] = localToWorld(d.position, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: rotationY + place.rotation,
          scale,
        });
      }
    }
    for (const [name, mesh] of this.siteParts) setInstances(mesh, instances.get(name) ?? []);
    return true;
  }

  /** Načte díly staveniště (jednou); po načtení se staveniště překreslí. */
  private loadConstruction(): Promise<void> {
    this.siteLoading ??= (async () => {
      try {
        const parts = await loadModelParts(
          this.scene,
          `${MODEL_BASE_URL}construction.glb`,
          'village-site-',
          prepareDwellingMaterial,
        );
        if (!parts) return;
        for (const [name, mesh] of parts) {
          mesh.setEnabled(false);
          this.context.addShadowCaster(mesh);
          this.siteParts.set(name, mesh);
        }
      } catch (error) {
        console.warn('Díly staveniště se nepodařilo načíst.', error);
      }
      if (this.disposed) return;
      this.siteKey = '';
      this.updateConstruction();
      this.context.onAsyncChange();
    })();
    return this.siteLoading;
  }

  /** Modely hotových obydlí a trsy u okapu – přepočítají se, jen když se změnila hotová obydlí. */
  private updateModels(): boolean {
    const built = this.village.dwellings.filter((d) => d.built);
    const key = built.map(dwellingKey).join(';');
    if (key === this.builtKey) return false;
    if (built.length > 0) void this.loadModels();
    if (!this.loading) return false;
    this.builtKey = key;
    for (const type of DWELLING_TYPES) {
      const model = this.models.get(type);
      if (!model) continue;
      const instances: ModelInstance[] = built
        .filter((d) => d.type === type)
        .map((d) => ({
          x: d.position.x,
          y: this.baseHeight(d),
          z: d.position.z,
          rotationY: d.position.rotation,
          scale: 1,
        }));
      setInstances(model, instances);
    }
    const tufts = built.flatMap((d) => eaveTufts(d.type, d.position, d.id));
    for (const name of TUFT_MODELS) {
      const mesh = this.tufts.get(name);
      if (!mesh) continue;
      setInstances(
        mesh,
        tufts
          .filter((t) => t.model === name)
          .map((t) => ({
            x: t.x,
            y: this.context.groundHeight(t.x, t.z) - 0.04,
            z: t.z,
            rotationY: t.rotationY,
            scale: t.scale,
          })),
      );
    }
    return true;
  }

  /** Výška vykresleného terénu (obtisky ducha při umisťování). */
  decalHeight(x: number, z: number): number {
    return this.context.decalHeight(x, z);
  }

  /** Pata modelu: střed, nebo průměr rohů půdorysu, když je níž (svah), o kousek zapuštěná. */
  baseHeight(d: Pick<SceneDwelling, 'type' | 'position'>): number {
    const { width, depth } = DWELLING_FOOTPRINT_M[d.type];
    const h = this.context.groundHeight;
    const corners = footprintCorners(d.position, width, depth);
    const mean = corners.reduce((sum, [x, z]) => sum + h(x, z), 0) / corners.length;
    return Math.min(h(d.position.x, d.position.z), mean) - DWELLING_SINK_M;
  }

  /** Vyšlapaná hlína před vchodem: širší prošlapaná tráva, uvnitř holá udusaná hlína. */
  private dwellingGround(d: SceneDwelling): Mesh[] {
    const worn = createDecalMesh(
      this.scene,
      `village-worn-${d.id}`,
      earthPatch(d.type, d.position, d.id, EARTH_LAYERS.worn),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.worn,
        color: [1, 0.96, 0.88],
        uv: 20,
      },
    );
    worn.material = this.decalMaterial('grass-dirt');
    worn.alphaIndex = 1;
    const earth = createDecalMesh(
      this.scene,
      `village-earth-${d.id}`,
      earthPatch(d.type, d.position, d.id, EARTH_LAYERS.earth),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.earth,
        // šedavá hlína z terénu do teplejší hnědé (udusaná hlína u dveří)
        color: [1.05, 0.9, 0.74],
        uv: 14,
      },
    );
    earth.material = this.decalMaterial('mud', -3);
    earth.alphaIndex = 2;
    const { depth } = PIT_SHAPES[d.type];
    return [worn, earth, this.pitMesh(d, depth, 1, false)];
  }

  /** Jáma se šíjí a schody (stěny po okraj terénu, dno, stupně) – terén v ní prořízne pit-cut. */
  private pitMesh(d: SceneDwelling, depth: number, roofCover: number, fresh: boolean): Mesh {
    const data = pitMeshData(PIT_SHAPES[d.type], d.position, {
      depth,
      base: this.baseHeight(d),
      rim: this.context.decalHeight,
      roofCover,
      fresh,
      sun: this.context.sunDirection,
    });
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.normals = data.normals;
    vertexData.uvs = data.uvs;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    const mesh = new Mesh(`village-pit-${d.id}`, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = this.pitMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  }

  /** Obvod jámy se šíjí ve světě (rozšířený o `margin`). */
  private pitOutlineWorld(d: SceneDwelling, margin: number): Point[] {
    return pitOutline(PIT_SHAPES[d.type], margin).map(([x, z]) => localToWorld(d.position, x, z));
  }

  /**
   * Staveniště podle fáze (village-construction.ts): ušlapaná tráva kolem, světlá čára
   * vytyčení, sejmutý drn (tmavá hlína od zadní stěny k šíji), od kopání jáma, která se
   * prohlubuje. Díly konstrukce a rekvizity kreslí `updateConstruction` v instancích.
   */
  private constructionSite(d: SceneDwelling, state: ConstructionState): Mesh[] {
    const meshes: Mesh[] = [];
    if (state.trampled > 0) {
      const c = DWELLING_CLEARANCE_M[d.type];
      const inset = TRAMPLED_INSET_M + TRAMPLED_SOFT_M / 2;
      const area: Point[] = [
        localToWorld(d.position, c.minX + inset, c.minZ + inset),
        localToWorld(d.position, c.maxX - inset, c.minZ + inset),
        localToWorld(d.position, c.maxX - inset, c.maxZ - inset - 2),
        localToWorld(d.position, c.minX + inset, c.maxZ - inset - 2),
      ];
      const b = polygonBounds(area);
      const pad = TRAMPLED_SOFT_M;
      const trampled = createDecalMesh(
        this.scene,
        `village-trampled-${d.id}`,
        decalGrid(
          { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
          0.6,
          softCoverage(area, TRAMPLED_SOFT_M),
        ),
        {
          height: this.context.decalHeight,
          smoothHeight: this.context.groundHeight,
          lift: LIFT.worn,
          color: [1, 0.95, 0.86],
          alpha: state.trampled,
          uv: 20,
        },
      );
      trampled.material = this.decalMaterial('grass-dirt');
      trampled.alphaIndex = 1;
      meshes.push(trampled);
    }
    if (state.turf > 0) {
      // drn se snímá od zadní stěny (−z) k šíji
      const shape = PIT_SHAPES[d.type];
      const outline = this.pitOutlineWorld(d, TURF_MARGIN_M);
      const b = polygonBounds(outline);
      const coverage = softCoverage(outline, 0.35);
      const start = -shape.halfZ - TURF_MARGIN_M;
      const front = start + state.turf * (shape.rampEndZ + TURF_MARGIN_M - start + 0.3);
      const turf = createDecalMesh(
        this.scene,
        `village-turf-${d.id}`,
        decalGrid(
          { minX: b.minX - 0.5, maxX: b.maxX + 0.5, minZ: b.minZ - 0.5, maxZ: b.maxZ + 0.5 },
          0.3,
          (x, z) =>
            coverage(x, z) *
            (1 - smoothstep(front - 0.4, front, worldToLocal(d.position, x, z)[1])),
        ),
        {
          height: this.context.decalHeight,
          smoothHeight: this.context.groundHeight,
          lift: LIFT.turf,
          color: [0.72, 0.58, 0.46],
          uv: 10,
        },
      );
      turf.material = this.decalMaterial('mud', -3);
      turf.alphaIndex = 2;
      meshes.push(turf);
    }
    if (state.outline > 0) {
      const line = createStripMesh(
        this.scene,
        `village-layout-${d.id}`,
        stripSegments(this.pitOutlineWorld(d, 0), true, 0.09, 0.5),
        this.context.decalHeight,
        LIFT.outline,
      );
      line.material = this.layoutMaterial();
      meshes.push(line);
    }
    if (state.pitDepth > 0) meshes.push(this.pitMesh(d, state.pitDepth, state.roofCover, true));
    const spoil = state.props.find((p) => p.prop === 'spoil');
    if (spoil) meshes.push(this.spoilHeap(d, spoil.scale));
    return meshes;
  }

  /** Hromada vykopané hlíny vedle jámy – roste s kopáním, ubývá na valy. */
  private spoilHeap(d: SceneDwelling, scale: number): Mesh {
    const place = SITE_PROP_PLACES[d.type].spoil;
    const [x, z] = localToWorld(d.position, place.x, place.z);
    const data = spoilHeapData({
      seed: d.id,
      x,
      z,
      rotation: d.position.rotation + place.rotation,
      rx: SPOIL_HEAP_M.rx * Math.sqrt(scale),
      rz: SPOIL_HEAP_M.rz * Math.sqrt(scale),
      height: SPOIL_HEAP_M.height * scale,
      ground: this.context.decalHeight,
    });
    const vertexData = new VertexData();
    vertexData.positions = data.positions;
    vertexData.uvs = data.uvs;
    vertexData.colors = data.colors;
    vertexData.indices = data.indices;
    const normals = new Float32Array(data.positions.length);
    VertexData.ComputeNormals(data.positions, data.indices, normals);
    vertexData.normals = normals;
    const mesh = new Mesh(`village-spoil-${d.id}`, this.scene);
    vertexData.applyToMesh(mesh);
    mesh.material = this.pitMaterial();
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.context.addShadowCaster(mesh);
    return mesh;
  }

  private updateFields(fields: readonly SceneField[]): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const field of fields) {
      seen.add(field.id);
      const key = JSON.stringify(field.parts);
      const current = this.fields.get(field.id);
      if (current?.key === key) continue;
      changed = true;
      if (current) for (const mesh of current.meshes) mesh.dispose();
      this.fields.set(field.id, {
        key,
        meshes: this.fieldMeshes(field),
        shape: fieldHideShape(field),
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

  /**
   * Pole: díly (čtverce políček) s měkkým okrajem na hranici pole, obarvené podle stavu –
   * jeden mesh na texturu, řádky obilí / brázdy navrch a tenká mez kolem čtverců.
   */
  private fieldMeshes(field: SceneField): Mesh[] {
    if (field.parts.length === 0) return [];
    const coverage = cellsCoverage(field.parts, FIELD_EDGE_SOFT_M);
    const groups = new Map<
      FieldTexture,
      { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] }
    >();
    const rows: { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] } = {
      grids: [],
      colors: [],
      alphas: [],
    };
    for (const part of field.parts) {
      const half = part.size / 2;
      const grid = decalGrid(
        { minX: part.x - half, maxX: part.x + half, minZ: part.z - half, maxZ: part.z + half },
        part.size / FIELD_GRID_PER_CELL,
        coverage,
      );
      if (grid.indices.length === 0) continue;
      const look = partLook(part.stage);
      const group = groups.get(look.texture) ?? { grids: [], colors: [], alphas: [] };
      group.grids.push(grid);
      group.colors.push(look.tint);
      group.alphas.push(look.alpha);
      groups.set(look.texture, group);
      if (look.rows) {
        rows.grids.push(grid);
        rows.colors.push(look.rows.color);
        rows.alphas.push(look.rows.alpha);
      }
    }
    const meshes: Mesh[] = [];
    const [dx, dz] = rowDirection(field.parts);
    for (const [texture, group] of groups) {
      const mesh = this.mergedDecal(`village-field-${field.id}-${texture}`, group, LIFT.field, 18);
      mesh.material = this.decalMaterial(texture);
      mesh.alphaIndex = 1;
      meshes.push(mesh);
    }
    if (rows.grids.length > 0) {
      const mesh = this.mergedDecal(`village-rows-${field.id}`, rows, LIFT.rows, (x, z) => [
        (x * dx + z * dz) / ROW_REPEAT_M,
        (-x * dz + z * dx) / ROW_SPACING_M,
      ]);
      mesh.material = this.rowsMaterial();
      mesh.alphaIndex = 2;
      meshes.push(mesh);
    }
    const outline = createStripMesh(
      this.scene,
      `village-outline-${field.id}`,
      cellsBoundary(field.parts).flatMap((line) =>
        stripSegments(line, false, OUTLINE_WIDTH_M, 1.5),
      ),
      this.context.decalHeight,
      LIFT.outline,
    );
    outline.material = this.outlineMaterial();
    meshes.push(outline);
    return meshes;
  }

  /** Spojí sítě dílů do jednoho obtisku – každý díl s vlastní barvou a krytím. */
  private mergedDecal(
    name: string,
    group: { grids: DecalGrid[]; colors: [number, number, number][]; alphas: number[] },
    lift: number,
    uv: number | ((x: number, z: number) => [number, number]),
  ): Mesh {
    const total = group.grids.reduce((sum, g) => sum + g.alphas.length, 0);
    const totalIndices = group.grids.reduce((sum, g) => sum + g.indices.length, 0);
    const positions = new Float32Array(total * 2);
    const alphas = new Float32Array(total);
    const indices = new Uint32Array(totalIndices);
    const colorOf: [number, number, number][] = new Array<[number, number, number]>(total);
    let v = 0;
    let k = 0;
    group.grids.forEach((grid, g) => {
      const count = grid.alphas.length;
      positions.set(grid.positions, v * 2);
      for (let i = 0; i < count; i++) {
        alphas[v + i] = grid.alphas[i]! * group.alphas[g]!;
        colorOf[v + i] = group.colors[g]!;
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
        // Drobné kolísání barvy – díl nevypadá jako natřený jednou barvou.
        color: (x, z, i) => {
          const [r, g, b] = colorOf[i]!;
          const n = 0.94 + 0.06 * Math.sin(x * 0.37 + z * 0.21) * Math.sin(z * 0.43 - x * 0.17);
          return [r * n, g * n, b * n];
        },
        uv,
      },
    );
  }

  private decalMaterial(texture: FieldTexture, zOffset = -2): Material {
    const key = `decal-${texture}-${zOffset}`;
    let material = this.materials.get(key);
    if (!material) {
      const decal = createDecalMaterial(this.scene, `village-${key}`, { texture, zOffset });
      // obtisky (vyšlapaná hlína, sejmutý drn) nesmí viset nad jámou
      applyPitCut(decal, this.context.pitCuts);
      // tráva v nich usychá jako na terénu, v zimě je zasype sníh – pole a cesty jen prosvítají
      applySeasonGround(decal, VILLAGE_SNOW);
      const loaded = decal.diffuseTexture;
      if (loaded instanceof Texture && !loaded.isReady()) {
        loaded.onLoadObservable.addOnce(() => this.context.requestRender());
      }
      material = decal;
      this.materials.set(key, material);
    }
    return material;
  }

  /** Řádky přes pole – pruhy v textuře (krytí), barvu dodají vrcholy. */
  private rowsMaterial(): Material {
    let material = this.materials.get('rows');
    if (!material) {
      const standard = createDecalMaterial(this.scene, 'village-rows', { zOffset: -3 });
      const height = 32;
      const data = new Uint8Array(4 * height * 4);
      for (let y = 0; y < height; y++) {
        // úzký hřbet řádku s měkkými kraji
        const t = Math.abs(y / height - 0.5) * 2;
        const alpha = Math.round(255 * (1 - Math.min(1, Math.max(0, (t - 0.15) / 0.3))));
        for (let x = 0; x < 4; x++) data.set([255, 255, 255, alpha], (y * 4 + x) * 4);
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
      texture.name = 'village-rows-texture';
      // RawTexture se jinak neopakuje (CLAMP) – řádky jdou přes celé pole.
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.hasAlpha = true;
      standard.diffuseTexture = texture;
      standard.useAlphaFromDiffuseTexture = true;
      applySeasonGround(standard, VILLAGE_SNOW);
      material = standard;
      this.materials.set('rows', material);
    }
    return material;
  }

  private outlineMaterial(): Material {
    let material = this.materials.get('outline');
    if (!material) {
      const standard = new StandardMaterial('village-outline', this.scene);
      standard.diffuseColor = new Color3(0.5, 0.42, 0.28);
      standard.specularColor = Color3.Black();
      standard.zOffset = -4;
      standard.backFaceCulling = false;
      material = standard;
      this.materials.set('outline', material);
    }
    return material;
  }

  /** Hlína jámy: textura bahna z terénu, barvy (ornice, podloží, stín) nesou vrcholy. */
  private pitMaterial(): Material {
    let material = this.materials.get('pit');
    if (!material) {
      const standard = new StandardMaterial('village-pit', this.scene);
      standard.specularColor = Color3.Black();
      // stěnu vidět zevnitř i tam, kde na svahu okraj klesne pod dno
      standard.backFaceCulling = false;
      standard.twoSidedLighting = true;
      const texture = new Texture('/textures/terrain/mud.jpg', this.scene);
      texture.anisotropicFilteringLevel = 8;
      if (!texture.isReady()) texture.onLoadObservable.addOnce(() => this.context.requestRender());
      standard.diffuseTexture = texture;
      material = standard;
      this.materials.set('pit', material);
    }
    return material;
  }

  /** Světlá čára vytyčení (vápno / naražená tráva po provázku). */
  private layoutMaterial(): Material {
    let material = this.materials.get('layout');
    if (!material) {
      const standard = new StandardMaterial('village-layout', this.scene);
      standard.diffuseColor = new Color3(0.8, 0.76, 0.64);
      standard.specularColor = Color3.Black();
      standard.zOffset = -4;
      standard.backFaceCulling = false;
      material = standard;
      this.materials.set('layout', material);
    }
    return material;
  }
}

function dwellingKey(d: SceneDwelling): string {
  const p = d.position;
  // Průběh stavby po 2 % – sloupy nerostou plynule, ale ani se nepřestavují při každém dotazu.
  return [d.type, p.x, p.z, p.rotation, d.built, d.built ? '' : Math.round(d.progress * 50)].join(
    '|',
  );
}

/** Nastaví instance meshe; bez instancí ho vypne (jinak by se vykreslil samotný model v počátku). */
function setInstances(mesh: Mesh, instances: readonly ModelInstance[]): void {
  if (instances.length === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
  mesh.setEnabled(true);
}

function prepareDwellingMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // v zimě sníh na střechách (plochy obrácené nahoru)
  applySeasonSnow(material);
}

function prepareTuftMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.alphaCutOff = 0.3;
  material.ambientColor = PLANT_AMBIENT;
  material.directIntensity = 0.75;
  material.albedoColor = TUFT_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // trsy na podzim usychají a přes zimu stojí suché
  applySeasonModel(material, 'grass-tuft');
}
