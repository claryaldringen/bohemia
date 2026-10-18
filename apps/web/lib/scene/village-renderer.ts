import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Material } from '@babylonjs/core/Materials/material';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import {
  DWELLING_FOOTPRINT_M,
  type DwellingType,
  type Landscape,
  type ObstacleLayer,
  type SacredBuildingKind,
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
import { FieldRenderer } from './field-renderer';
import type { HayMeadow } from './hay-meadows';
import { applyGammaFog } from './gamma-fog';
import { HomesteadRenderer, type PlotView } from './homestead';
import { plotInward, plotStakingLine } from './homestead-layout';
import {
  instanceMatrices,
  loadMergedModel,
  loadModelParts,
  type ModelInstance,
} from './instanced-model';
import { OrchardRenderer } from './orchard-renderer';
import { PenAnimals } from './pen-animals';
import { penAnimalsFor } from './pen-layout';
import { PenRenderer } from './pen-renderer';
import { ploughPath } from './plough-team';
import { PloughTeams } from './plough-team-renderer';
import { penHerds, ploughFields, scenePenViews } from './village-pens';
import { SACRED_SITE_KIND, sacredBuildingKey } from './sacred-layout';
import { SacredRenderer } from './sacred-renderer';
import { applyPitCut, type PitCuts } from './pit-cut';
import {
  PLOT_BUILT,
  ROUND_SITE_M,
  constructionState,
  sitePropPlace,
  type ConstructionKind as SiteKind,
  type ConstructionState,
} from './village-construction';
import {
  DWELLING_CLEARANCE_M,
  decalGrid,
  dwellingHideShape,
  footprintCorners,
  localToWorld,
  polygonBounds,
  smoothstep,
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
import { StakingPegs, createStringMaterial, createStringMesh, pegInstances } from './staking';
import { closedLine } from './staking-layout';
import { applySeasonGround, applySeasonModel, applySeasonSnow } from './season-materials';
import { VillageSmoke, type SmokeSource } from './village-smoke';
import type { SceneDwelling } from './village-types';
import {
  CRAFT_MODEL,
  milirCircle,
  milirFootPoints,
  milirHideShape,
  milirPlace,
  workshopVents,
  type WorkshopModel,
} from './workshop-layout';
import { WovenFenceRenderer } from './woven-fence-renderer';

const MODEL_BASE_URL = '/models/dwellings/';
/** Modely a díly staveniště řemeslných dílen a milíře (tools/blender/crafts.py). */
const CRAFT_MODEL_BASE_URL = '/models/crafts/';
const CRAFT_SITE_FILES = ['construction.glb', 'construction-moss.glb'] as const;
const SMOKE_TEXTURE_URL = '/textures/particles/smoke.png';
const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
/** Hotový model ve vsi: obydlí, řemeslná dílna (crafts.md), nebo milíř uhlíře. */
type ModelKey = DwellingType | WorkshopModel | 'milir';
const CRAFT_MODEL_KEYS: readonly (WorkshopModel | 'milir')[] = [
  'hrncir',
  'kovar',
  'uhlir',
  'milir',
];
/** Přístřešek hrnčíře a kováře sahá o tolik dál před obydlí (m) – ušlapaná tráva i před ním. */
const PORCH_EXTRA_M = 2.6;
/** Rozvrh dýmu pece, výhně a milíře se liší od dýmníku obydlí (seed = id obydlí × 4 + druh). */
const CRAFT_SMOKE_SEED = 1_000_000;
const TUFT_MODELS: readonly TuftModel[] = ['grass-tuft-1', 'grass-tuft-2'];
const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Rostliny jako dekorace krajiny (decorations.ts) – trsy u okapu jsou sytější a zelenější. */
const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
const TUFT_TINT = new Color3(0.56, 0.86, 0.4);
/** Obydlí je o kousek zapuštěné – na mírném svahu tak žádný roh nevisí nad terénem (m). */
const DWELLING_SINK_M = 0.05;
/** Sníh na obtiscích vsi (cesty, vyšlapaná hlína) – část jejich barvy zimou prosvítá. */
const VILLAGE_SNOW = 0.85;
/** Výška obtisků nad terénem (m) – navzájem v pořadí, aby se nepraly o hloubku. */
const LIFT = { outline: 0.06, worn: 0.03, earth: 0.04, turf: 0.045 };
/** Sejmutý drn přesahuje jámu o tolik (m) – po vykopání zůstane kolem okraje tmavá hlína. */
const TURF_MARGIN_M = 0.35;
/** Ušlapaná tráva kolem staveniště: o kolik menší než místo pro stavbu a jak měkký okraj (m). */
const TRAMPLED_INSET_M = 0.6;
const TRAMPLED_SOFT_M = 2.2;
/** Krytí vyšlapané hlíny u opuštěného obydlí – zarůstá trávou (vymřelá ves, prázdné obydlí). */
const ABANDONED_EARTH_ALPHA = 0.4;
/** Hromada hlíny z jámy v plné velikosti (m) – většina hlíny jde nakonec na valy. */
const SPOIL_HEAP_M = { rx: 1.7, rz: 1.2, height: 0.72 };

interface DwellingView {
  key: string;
  dwelling: SceneDwelling;
  meshes: Mesh[];
  /** Kde se skryjí stromy a kameny krajiny – obydlí, u uhlíře i kruh milíře. */
  shapes: HideShape[];
  /** Vyhloubená jáma (terén se v ní prořízne), nebo null, dokud se nekope. */
  cut: PitCut | null;
  /** Kolíky vytyčení (staking.ts), dokud se nezačne kopat. */
  pegs: ModelInstance[];
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
  /** Krajina sídla – louky na seno se vybírají na louce (bez ní žádné). */
  landscape?: Landscape;
}

/**
 * Ves ve scéně: hotová obydlí jako modely (thin instances, jeden mesh na typ) nad vyhloubenou
 * jámou se schody, kolem nich vyšlapaná hlína a trsy trávy u okapu, z dýmníku občas dým;
 * staveniště po fázích (village-construction.ts) z dílů modelu a rekvizit v instancích, jáma
 * se prohlubuje s průběhem; pole a louky na seno (field-renderer.ts);
 * pohřebiště s plotem a mohylkami (cemetery-renderer.ts); jabloňové sady (orchard-renderer.ts).
 * `update` mění jen to, co se změnilo.
 */
export class VillageRenderer {
  private readonly dwellings = new Map<number, DwellingView>();
  private readonly models = new Map<ModelKey, Mesh | null>();
  private readonly ghosts = new Map<ModelKey, Mesh>();
  /** Modely dílen a milíře se načítají, až jsou potřeba (dílna ve vsi, duch při umisťování). */
  private craftLoading: Promise<void> | null = null;
  private craftSiteLoading: Promise<void> | null = null;
  private readonly tufts = new Map<TuftModel, Mesh | null>();
  /** Pozemky polozemnic – plot, záhony a cestička (homestead.ts). */
  private readonly plots: HomesteadRenderer;
  /** Pletené ploty pozemků a hřbitovů (woven-fence-renderer.ts). */
  private readonly fences: WovenFenceRenderer;
  private readonly materials = new Map<string, Material>();
  private loading: Promise<void> | null = null;
  private builtKey = '';
  /** Díly staveniště a rekvizity z construction.glb podle jména uzlu (zemnice-thatch-1, site-spoil…). */
  private readonly siteParts = new Map<string, Mesh>();
  private siteLoading: Promise<void> | null = null;
  private siteKey = '';
  private readonly smoke: VillageSmoke;
  private readonly cemeteries: CemeteryRenderer;
  private readonly pegs: StakingPegs;
  private readonly orchards: OrchardRenderer;
  private readonly sacred: SacredRenderer;
  private readonly fields: FieldRenderer;
  /** Ohrady s přístřeškem, zvířata v nich a spřežení na poli (oxen.md – village-pens.ts). */
  private readonly pens: PenRenderer;
  private readonly penAnimals: PenAnimals;
  private readonly teams: PloughTeams;
  private teamsKey = '';
  private village: SceneVillage = { dwellings: [], fields: [] };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly context: VillageContext,
  ) {
    this.smoke = new VillageSmoke(scene, SMOKE_TEXTURE_URL);
    this.pegs = new StakingPegs(scene, (mesh) => context.addShadowCaster(mesh));
    this.fences = new WovenFenceRenderer(scene, {
      height: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
    });
    this.cemeteries = new CemeteryRenderer(scene, {
      decalHeight: context.decalHeight,
      groundHeight: context.groundHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      requestRender: () => context.requestRender(),
      fences: this.fences,
    });
    this.orchards = new OrchardRenderer(scene, context);
    this.plots = new HomesteadRenderer(scene, {
      groundHeight: context.groundHeight,
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      pathMaterial: () => this.decalMaterial('grass-dirt'),
      prepareMaterial: prepareDwellingMaterial,
      fences: this.fences,
    });
    this.sacred = new SacredRenderer(scene, context);
    this.fields = new FieldRenderer(scene, context);
    if (context.landscape) this.fields.setLandscape(context.landscape, null);
    // ozdobné louky na seno vypnuté – seč úhoru i přirozených luk posílá herní jádro po dílech
    // a políčkách (`SceneVillage.hayMeadows` – oxen.md, Seno)
    this.fields.setHayMeadows([]);
    this.pens = new PenRenderer(scene, {
      groundHeight: context.groundHeight,
      decalHeight: context.decalHeight,
      addShadowCaster: (mesh) => context.addShadowCaster(mesh),
      onAsyncChange: () => context.onAsyncChange(),
      prepareMaterial: prepareDwellingMaterial,
      mudMaterial: () => this.decalMaterial('mud'),
      fences: this.fences,
    });
    this.penAnimals = new PenAnimals(scene, {
      groundHeight: context.groundHeight,
      onLoaded: () => context.requestRender(),
    });
    this.teams = new PloughTeams(scene, {
      baseUrl: '/models/plough/',
      groundHeight: context.groundHeight,
      prepareMaterial: prepareDwellingMaterial,
      onLoaded: () => context.requestRender(),
    });
  }

  /** Vrátí true, když se ve scéně něco změnilo (je co překreslit). */
  update(village: SceneVillage): boolean {
    if (this.disposed) return false;
    this.village = village;
    const dwellings = this.updateDwellings(village.dwellings);
    const fields = this.fields.update(village);
    const cemeteries = this.cemeteries.update(village.cemeteries ?? [], village.dwellings);
    const orchards = this.orchards.update(village.orchards ?? []);
    const plots = this.plots.update(plotViews(village.dwellings));
    const sacred = this.sacred.update(village.sacred);
    const pens = this.updatePens(village);
    const models = this.updateModels();
    const sites = this.updateConstruction();
    const smoke = this.updateSmokeSources();
    return (
      dwellings ||
      fields ||
      cemeteries ||
      orchards ||
      plots ||
      sacred ||
      pens ||
      models ||
      sites ||
      smoke
    );
  }

  /**
   * Ohrady (stavba po fázích), zvířata v nich a spřežení na čele orby (oxen.md). Vrátí true, když
   * se něco změnilo.
   */
  private updatePens(village: SceneVillage): boolean {
    const pens = this.pens.update(scenePenViews(village));
    const herds = penHerds(village);
    const animals = this.penAnimals.set(
      this.pens.builtPens().flatMap(({ id, layout }) => {
        const herd = herds.get(id);
        return herd ? penAnimalsFor(layout, herd) : [];
      }),
    );
    const fields = ploughFields(village);
    const key = fields.map((f) => `${f.x},${f.z},${f.size},${f.dirX},${f.dirZ}`).join(';');
    let teams = false;
    if (key !== this.teamsKey) {
      this.teamsKey = key;
      this.teams.setPaths(fields.map((f) => ploughPath(f)));
      // stálá póza hned – při omezeném pohybu zůstane, jinak ji hned přepíše animace
      this.teams.animate(0, null, true);
      teams = true;
    }
    return pens || animals || teams;
  }

  /**
   * Posune zvířata v ohradách a spřežení na poli na okamžik `nowMs` (jen v záběru kamery; bez
   * kamery všechno). Vrátí true, když je co překreslit.
   */
  animateOxen(nowMs: number, camera: Camera | null): boolean {
    const animals = this.penAnimals.animate(nowMs, camera);
    const teams = this.teams.animate(nowMs, camera);
    return animals || teams;
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

  /**
   * Vrstva překážek krajiny (skalní výchozy pro stromy sadu, louky na seno bez stromů); vrátí
   * true, když je co překreslit.
   */
  setObstacles(layer: ObstacleLayer): boolean {
    const orchards = this.orchards.setObstacles(layer);
    const meadows = this.fields.setLandscape(this.context.landscape ?? null, layer);
    return orchards || meadows;
  }

  /**
   * Den v roce (roční období scény) a sněhová pokrývka – podle dne se odhaduje vzhled polí (dokud
   * ho server neposílá) a seče louky, pod sněhem zmizí nízké trsy. Vrátí true, když je co
   * překreslit.
   */
  setSeason(dayOfYear: number, snow: number): boolean {
    const day = this.fields.setDay(dayOfYear);
    const covered = this.fields.setSnow(snow);
    return day || covered;
  }

  /** Vzdálenost kamery – obilí z dálky řídne. Vrátí true, když je co překreslit. */
  setView(radius: number): boolean {
    return this.fields.setView(radius);
  }

  /** Obilí ve větru (jen v záběru); vrátí true, když je co překreslit. */
  animateFields(nowMs: number, camera: Camera | null): boolean {
    return this.fields.animate(nowMs, camera);
  }

  /** Vývojový náhled: louky na seno dané přímo (bez krajiny). */
  setHayMeadows(meadows: HayMeadow[] | null): boolean {
    return this.fields.setHayMeadows(meadows);
  }

  /** Svět, podle jehož herního dne se v obydlích topí (ráno a večer). */
  setWorldClock(world: WorldClock): void {
    this.smoke.setWorldClock(world);
  }

  /** Oblasti, kde se mají skrýt stromy a kameny krajiny. */
  hideShapes(): HideShape[] {
    const shapes: HideShape[] = [];
    for (const view of this.dwellings.values()) shapes.push(...view.shapes);
    shapes.push(...this.fields.hideShapes());
    shapes.push(...this.cemeteries.hideShapes());
    shapes.push(...this.orchards.hideShapes());
    shapes.push(...this.sacred.hideShapes());
    return shapes;
  }

  /**
   * Průhledný model obydlí, řemeslné dílny, milíře, modly nebo svatyně pro ducha při umisťování
   * (null, dokud se model nenačte).
   */
  ghostModel(type: ModelKey | SacredBuildingKind): Mesh | null {
    if (type === 'idol' || type === 'shrine') return this.sacred.ghostModel(type);
    if (isCraftModel(type)) void this.loadCraftModels();
    else void this.loadModels();
    return this.ghosts.get(type) ?? null;
  }

  /** Načte modely obydlí a trsů (jednou); po načtení se ves překreslí. */
  loadModels(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  /** Načte modely řemeslných dílen a milíře (jednou); po načtení se ves překreslí. */
  loadCraftModels(): Promise<void> {
    this.craftLoading ??= (async () => {
      await Promise.all(
        CRAFT_MODEL_KEYS.map((key) => this.loadModel(key, `${CRAFT_MODEL_BASE_URL}${key}.glb`)),
      );
      if (this.disposed) return;
      this.builtKey = '';
      this.updateModels();
      this.context.onAsyncChange();
    })();
    return this.craftLoading;
  }

  /**
   * Pata milíře: střed, nebo průměr bodů na okraji kupy, když je níž (svah), o kousek zapuštěná
   * jako obydlí.
   */
  milirBaseHeight(position: SceneDwelling['position']): number {
    const h = this.context.groundHeight;
    const [center, ...rim] = milirFootPoints(position);
    const mean = rim.reduce((sum, [x, z]) => sum + h(x, z), 0) / rim.length;
    return Math.min(h(center![0], center![1]), mean) - DWELLING_SINK_M;
  }

  /** Načte modely modly a svatyně (duch při umisťování). */
  loadSacredModels(): Promise<void> {
    return this.sacred.loadModels();
  }

  /** Pata modly nebo svatyně (duch při umisťování). */
  sacredBaseHeight(kind: SacredBuildingKind, position: SceneDwelling['position']): number {
    return this.sacred.baseHeight({ kind, position });
  }

  dispose(): void {
    this.disposed = true;
    this.smoke.dispose();
    this.cemeteries.dispose();
    this.plots.dispose();
    // ohrady uvolní své ploty – před sdílenými ploty
    this.pens.dispose();
    this.fences.dispose();
    this.orchards.dispose();
    this.sacred.dispose();
    this.penAnimals.dispose();
    this.teams.dispose();
    this.pegs.dispose();
    this.fields.dispose();
    for (const view of this.dwellings.values()) for (const mesh of view.meshes) mesh.dispose();
    this.dwellings.clear();
  }

  /** Načte jeden hotový model (obydlí, dílna, milíř) i s duchem pro umisťování. */
  private async loadModel(key: ModelKey, url: string): Promise<void> {
    try {
      const model = await loadMergedModel(
        this.scene,
        url,
        `village-${key}`,
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
      const ghost = model.clone(`village-ghost-${key}`);
      ghost.setEnabled(false);
      ghost.isPickable = false;
      this.ghosts.set(key, ghost);
      model.setEnabled(false);
      this.models.set(key, model);
      this.context.addShadowCaster(model);
    } catch (error) {
      console.warn(`Model ${key} se nepodařilo načíst.`, error);
      this.models.set(key, null);
    }
  }

  private async load(): Promise<void> {
    await Promise.all([
      ...DWELLING_TYPES.map((type) => this.loadModel(type, `${MODEL_BASE_URL}${type}.glb`)),
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
      const state = dwelling.built
        ? null
        : constructionState(siteKind(dwelling), dwelling.progress);
      const dug = !state || state.pitDepth > 0;
      // milíř uhlíře se staví spolu se zemnicí (stejný průběh) a stojí kus od ní
      const burner = dwelling.craft === 'burner';
      const milir = burner && state ? constructionState('milir', dwelling.progress) : null;
      const meshes = state ? this.constructionSite(dwelling, state) : this.dwellingGround(dwelling);
      if (milir) meshes.push(...this.milirSite(dwelling, milir));
      else if (burner) meshes.push(this.milirGround(dwelling));
      const lines: Point[][] = [];
      if (state && state.outline > 0) lines.push(this.stakingLine(dwelling));
      if (milir && milir.outline > 0) {
        lines.push(closedLine(milirCircle(dwelling.position, ROUND_SITE_M.milir.outline)));
      }
      this.dwellings.set(dwelling.id, {
        key,
        dwelling,
        meshes,
        shapes: [
          dwellingHideShape(dwelling),
          ...(burner ? [milirHideShape(dwelling.position)] : []),
        ],
        cut: dug ? { position: dwelling.position, shape: PIT_SHAPES[dwelling.type] } : null,
        pegs: lines.length > 0 ? pegInstances(lines, this.context.groundHeight) : [],
      });
    }
    for (const [id, view] of this.dwellings) {
      if (seen.has(id)) continue;
      for (const mesh of view.meshes) mesh.dispose();
      this.dwellings.delete(id);
      changed = true;
    }
    if (changed) {
      this.pegs.set([...this.dwellings.values()].flatMap((view) => view.pegs));
      const cuts: PitCut[] = [];
      for (const view of this.dwellings.values()) if (view.cut) cuts.push(view.cut);
      this.context.pitCuts.set(cuts);
    }
    return changed;
  }

  /** Dýmníky hotových obývaných obydlí, pece, výhně a milíře pracujících dílen pro dým. */
  private updateSmokeSources(): boolean {
    const sources: SmokeSource[] = this.village.dwellings
      .filter((d) => d.built && d.inhabited !== false)
      .map((d) => {
        const vent = SMOKE_VENT[d.type];
        const [x, z] = localToWorld(d.position, 0, vent.z);
        return { seed: d.id, x, y: this.baseHeight(d) + vent.y, z };
      });
    // dílna, která dnes vyrábí – pec, výheň, nebo milíř (u uhlíře jen při pálení – crafts.md)
    for (const d of this.village.dwellings) {
      if (!d.built || !d.craft || !d.working) continue;
      for (const vent of workshopVents(d.craft, d.position)) {
        const milir = vent.kind === 'milir';
        sources.push({
          seed: CRAFT_SMOKE_SEED + d.id * 4 + (milir ? 2 : 1),
          x: vent.x,
          y: (milir ? this.milirBaseHeight(d.position) : this.baseHeight(d)) + vent.y,
          z: vent.z,
          kind: vent.kind,
        });
      }
    }
    // ohniště hotových svatyní – občas dým jako z obydlí (happiness.md)
    sources.push(...this.sacred.smokeSources());
    return this.smoke.setSources(sources);
  }

  /**
   * Díly staveniště (z construction.glb) a rekvizity v instancích – přepočítají se, jen když
   * se změnilo některé staveniště.
   */
  private updateConstruction(): boolean {
    const sites = this.village.dwellings.filter((d) => !d.built);
    // rekvizity stavenišť modly a svatyně (rýč, koš, drny) jsou díly téhož GLB; hromádka
    // kamenů (site-stones) je jen v construction.glb řemesel, který ves nenačítá – nekreslí se
    const sacredSites = (this.village.sacred?.buildings ?? []).filter((b) => !b.built);
    const key = [...sites.map(dwellingKey), ...sacredSites.map(sacredBuildingKey)].join(';');
    if (key === this.siteKey) return false;
    if (sites.length > 0 || sacredSites.length > 0) void this.loadConstruction();
    if (sites.some((d) => d.craft)) void this.loadCraftConstruction();
    if (!this.siteLoading) return false;
    this.siteKey = key;
    const instances = new Map<string, ModelInstance[]>();
    const push = (name: string, instance: ModelInstance): void => {
      const list = instances.get(name);
      if (list) list.push(instance);
      else instances.set(name, [instance]);
    };
    for (const d of sites) {
      const kind = siteKind(d);
      const state = constructionState(kind, d.progress);
      const base = this.baseHeight(d);
      const rotationY = d.position.rotation;
      const house = { x: d.position.x, y: base, z: d.position.z, rotationY, scale: 1 };
      for (const part of state.parts) push(`${kind}-${part}`, house);
      const inward = d.plot ? plotInward(d.plot.variant) : undefined;
      for (const { prop, scale } of state.props) {
        // hromada hlíny je vlastní síť staveniště (leží na terénu, barvy jako jáma)
        if (prop === 'spoil') continue;
        const place = sitePropPlace(kind, prop, inward);
        const [x, z] = localToWorld(d.position, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: rotationY + place.rotation,
          scale,
        });
      }
      if (d.craft !== 'burner') continue;
      // milíř uhlíře – kruhové staveniště kus od zemnice, stejný průběh
      const milir = milirPlace(d.position);
      const milirState = constructionState('milir', d.progress);
      const heap = {
        x: milir.x,
        y: this.milirBaseHeight(d.position),
        z: milir.z,
        rotationY: milir.rotation,
        scale: 1,
      };
      for (const part of milirState.parts) push(`milir-${part}`, heap);
      for (const { prop, scale } of milirState.props) {
        const place = sitePropPlace('milir', prop);
        const [x, z] = localToWorld(milir, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: milir.rotation + place.rotation,
          scale,
        });
      }
    }
    for (const b of sacredSites) {
      const kind = SACRED_SITE_KIND[b.kind];
      for (const { prop, scale } of constructionState(kind, b.progress).props) {
        const place = sitePropPlace(kind, prop);
        const [x, z] = localToWorld(b.position, place.x, place.z);
        push(`site-${prop}`, {
          x,
          y: this.context.groundHeight(x, z) - 0.02,
          z,
          rotationY: b.position.rotation + place.rotation,
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

  /**
   * Díly staveniště řemeslných dílen a milíře (construction.glb a construction-moss.glb
   * řemesel – jednou); po načtení se staveniště překreslí.
   */
  private loadCraftConstruction(): Promise<void> {
    this.craftSiteLoading ??= (async () => {
      await Promise.all(
        CRAFT_SITE_FILES.map(async (file) => {
          try {
            const parts = await loadModelParts(
              this.scene,
              `${CRAFT_MODEL_BASE_URL}${file}`,
              'village-site-',
              prepareDwellingMaterial,
            );
            for (const [name, mesh] of parts ?? []) {
              // díly mají v GLB řemesel jiná jména než u obydlí – kdyby se přesto opakovaly,
              // kreslí se jen první
              if (this.siteParts.has(name)) {
                mesh.dispose();
                continue;
              }
              mesh.setEnabled(false);
              this.context.addShadowCaster(mesh);
              this.siteParts.set(name, mesh);
            }
          } catch (error) {
            console.warn(`Díly staveniště dílny ${file} se nepodařilo načíst.`, error);
          }
        }),
      );
      if (this.disposed) return;
      this.siteKey = '';
      this.updateConstruction();
      this.context.onAsyncChange();
    })();
    return this.craftSiteLoading;
  }

  /**
   * Modely hotových obydlí, řemeslných dílen (u uhlíře i milíř) a trsy u okapu – přepočítají se,
   * jen když se změnila hotová obydlí.
   */
  private updateModels(): boolean {
    const built = this.village.dwellings.filter((d) => d.built);
    const key = built.map(dwellingKey).join(';');
    if (key === this.builtKey) return false;
    if (built.length > 0) void this.loadModels();
    if (built.some((d) => d.craft)) void this.loadCraftModels();
    if (!this.loading) return false;
    this.builtKey = key;
    const instances = new Map<ModelKey, ModelInstance[]>();
    const push = (model: ModelKey, instance: ModelInstance): void => {
      const list = instances.get(model);
      if (list) list.push(instance);
      else instances.set(model, [instance]);
    };
    for (const d of built) {
      push(d.craft ? CRAFT_MODEL[d.craft] : d.type, {
        x: d.position.x,
        y: this.baseHeight(d),
        z: d.position.z,
        rotationY: d.position.rotation,
        scale: 1,
      });
      if (d.craft !== 'burner') continue;
      const milir = milirPlace(d.position);
      push('milir', {
        x: milir.x,
        y: this.milirBaseHeight(d.position),
        z: milir.z,
        rotationY: milir.rotation,
        scale: 1,
      });
    }
    for (const [model, mesh] of this.models) {
      if (mesh) setInstances(mesh, instances.get(model) ?? []);
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
    // opuštěné obydlí (nikdo v něm nebydlí – vymřelá ves, prázdné obydlí) zarůstá trávou:
    // vyšlapaná a udusaná hlína se nikdo neobnovuje
    const alpha = d.inhabited === false ? ABANDONED_EARTH_ALPHA : 1;
    const worn = createDecalMesh(
      this.scene,
      `village-worn-${d.id}`,
      earthPatch(d.type, d.position, d.id, EARTH_LAYERS.worn),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.worn,
        color: [1, 0.96, 0.88],
        alpha,
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
        alpha,
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

  /**
   * Čára vytyčení s kolíky a provázkem: kolem celého pozemku (po budoucím plotu), u volného
   * obydlí kolem jámy se šíjí.
   */
  private stakingLine(d: SceneDwelling): Point[] {
    return d.plot ? plotStakingLine(d.plot) : closedLine(this.pitOutlineWorld(d, 0));
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
      const area = trampledArea(d);
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
      // kolíky v rozích a po obvodu a mezi nimi napnutý provázek – vidět hned po zadání stavby
      let string = this.materials.get('string');
      if (!string) {
        string = createStringMaterial(this.scene);
        this.materials.set('string', string);
      }
      meshes.push(
        createStringMesh(
          this.scene,
          `village-string-${d.id}`,
          [this.stakingLine(d)],
          this.context.groundHeight,
          string,
        ),
      );
    }
    if (state.pitDepth > 0) meshes.push(this.pitMesh(d, state.pitDepth, state.roofCover, true));
    const spoil = state.props.find((p) => p.prop === 'spoil');
    if (spoil) meshes.push(this.spoilHeap(d, spoil.scale));
    return meshes;
  }

  /** Hromada vykopané hlíny vedle jámy – roste s kopáním, ubývá na valy. */
  private spoilHeap(d: SceneDwelling, scale: number): Mesh {
    const place = sitePropPlace(d.type, 'spoil', d.plot ? plotInward(d.plot.variant) : undefined);
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

  /**
   * Staveniště milíře (kruhové, bez jámy – village-construction.ts): ušlapaná tráva kolem
   * a světlá čára vytyčeného kruhu, dokud se neskládá věnec polen. Díly a rekvizity kreslí
   * `updateConstruction` v instancích.
   */
  private milirSite(d: SceneDwelling, state: ConstructionState): Mesh[] {
    const meshes: Mesh[] = [];
    const site = ROUND_SITE_M.milir;
    if (state.trampled > 0) {
      meshes.push(this.milirTrampled(d, site.trampled - TRAMPLED_SOFT_M / 2, state.trampled));
    }
    if (state.outline > 0) {
      const line = createStripMesh(
        this.scene,
        `village-milir-layout-${d.id}`,
        stripSegments(milirCircle(d.position, site.outline), true, 0.09, 0.5),
        this.context.decalHeight,
        LIFT.outline,
      );
      line.material = this.layoutMaterial();
      meshes.push(line);
    }
    return meshes;
  }

  /** Hotový milíř: kolem vyšlapaná zem (uhlíř u něj pracuje), u opuštěného zarůstá. */
  private milirGround(d: SceneDwelling): Mesh {
    const alpha = d.inhabited === false ? ABANDONED_EARTH_ALPHA : 0.85;
    return this.milirTrampled(d, ROUND_SITE_M.milir.trampled - TRAMPLED_SOFT_M / 2, alpha);
  }

  /** Ušlapaná tráva v kruhu kolem milíře (poloměr `radius`, měkký okraj). */
  private milirTrampled(d: SceneDwelling, radius: number, alpha: number): Mesh {
    const area = milirCircle(d.position, radius);
    const b = polygonBounds(area);
    const pad = TRAMPLED_SOFT_M;
    const mesh = createDecalMesh(
      this.scene,
      `village-milir-trampled-${d.id}`,
      decalGrid(
        { minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad },
        0.6,
        softCoverage(area, TRAMPLED_SOFT_M),
      ),
      {
        height: this.context.decalHeight,
        smoothHeight: this.context.groundHeight,
        lift: LIFT.worn,
        color: [0.95, 0.88, 0.78],
        alpha,
        uv: 20,
      },
    );
    mesh.material = this.decalMaterial('grass-dirt');
    mesh.alphaIndex = 1;
    return mesh;
  }

  private decalMaterial(texture: 'grass-dirt' | 'mud', zOffset = -2): Material {
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

/** Pozemky obydlí pro scénu: hotové celé, staveniště podle fáze plotu a záhonů. */
function plotViews(dwellings: readonly SceneDwelling[]): PlotView[] {
  return dwellings.flatMap((d) => {
    if (!d.plot) return [];
    const progress = d.built ? PLOT_BUILT : constructionState(d.type, d.progress).plot;
    return [{ id: d.id, square: d.plot, variant: d.plot.variant, progress, house: d.position }];
  });
}

/** Druh staveniště (fáze, díly): obydlí, nebo model řemeslné dílny. */
function siteKind(d: Pick<SceneDwelling, 'type' | 'craft'>): SiteKind {
  return d.craft ? CRAFT_MODEL[d.craft] : d.type;
}

/** Je model dílnou nebo milířem (public/models/crafts)? */
function isCraftModel(key: ModelKey): key is WorkshopModel | 'milir' {
  return (CRAFT_MODEL_KEYS as readonly string[]).includes(key);
}

/** Ušlapaná tráva staveniště: pozemek, nebo místo kolem modelu (bez kusu před vchodem). */
function trampledArea(d: SceneDwelling): Point[] {
  const inset = TRAMPLED_INSET_M + TRAMPLED_SOFT_M / 2;
  if (d.plot) {
    const h = d.plot.size / 2 - inset;
    const { x, z } = d.plot;
    return [
      [x - h, z - h],
      [x + h, z - h],
      [x + h, z + h],
      [x - h, z + h],
    ];
  }
  const c = DWELLING_CLEARANCE_M[d.type];
  // hrnčíř a kovář: ušlapáno i pod přístřeškem před domem
  const porch = d.craft === 'potter' || d.craft === 'smith' ? PORCH_EXTRA_M : 0;
  return [
    localToWorld(d.position, c.minX + inset, c.minZ + inset),
    localToWorld(d.position, c.maxX - inset, c.minZ + inset),
    localToWorld(d.position, c.maxX - inset, c.maxZ - inset - 2 + porch),
    localToWorld(d.position, c.minX + inset, c.maxZ - inset - 2 + porch),
  ];
}

function dwellingKey(d: SceneDwelling): string {
  const p = d.position;
  // Průběh stavby po 2 % – sloupy nerostou plynule, ale ani se nepřestavují při každém dotazu.
  // Hotové obydlí se přestaví, když se vylidní nebo zase zabydlí (hlína u vchodu zarůstá).
  const look = d.built ? (d.inhabited === false ? 'empty' : '') : Math.round(d.progress * 50);
  return [d.type, d.craft ?? '', p.x, p.z, p.rotation, d.built, look].join('|');
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
