// Společné konstanty, typy a pomocné funkce vykreslení vsi (village-renderer*.ts).
import { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PLAIN_FRAME, rotationCosSin, type DwellingType, type Landscape } from '@bohemia/game';
import type { SceneKiln, SceneKilnState } from '../village-view';
import { DECAY_LOOKS, dwellingDecayStage, type DecayStage } from './dwelling-decay';
import { type TuftModel } from './dwelling-decor';
import { type PitCut } from './dwelling-pit';
import { applyGammaFog } from './gamma-fog';
import { type PlotView } from './homestead';
import { instanceMatrices, type ModelInstance } from './instanced-model';
import { makeShapeable, setShapeFrames } from './shaped-model';
import { type CartSelectedState } from './cart-renderer';
import type { TeamActivity } from './draft-state';
import { type PitCuts } from './pit-cut';
import {
  CONSTRUCTION_BASE,
  PLOT_BUILT,
  constructionState,
  type ConstructionKind as SiteKind,
  type SiteProp,
} from './village-construction';
import {
  clearanceRect,
  houseArea,
  localToWorld,
  pointInPolygon,
  polygonBounds,
  type HideShape,
  type Point,
} from './village-layout';
import { type HeightFn } from './village-meshes';
import { applySeasonModel, applySeasonSnow } from './season-materials';
import type { SceneDwelling, SceneRuin } from './village-types';
import { CRAFT_MODEL, forestKilnAnchor, hasPorch, type WorkshopModel } from './workshop-layout';

export const MODEL_BASE_URL = '/models/dwellings/';
/** Modely a díly staveniště řemeslných dílen a milíře (tools/blender/crafts.py). */
export const CRAFT_MODEL_BASE_URL = '/models/crafts/';
export const CRAFT_SITE_FILES = ['construction.glb', 'construction-moss.glb'] as const;
export const SMOKE_TEXTURE_URL = '/textures/particles/smoke.png';
export const DWELLING_TYPES: readonly DwellingType[] = ['zemnice', 'polozemnice'];
/** Dvorec vojvody (trade.md – tools/blender/dwellings.py „dvorec“): model a díly staveniště. */
export const MANOR_MODEL_URL = `${MODEL_BASE_URL}dvorec.glb`;
export const MANOR_SITE_URL = `${MODEL_BASE_URL}dvorec-construction.glb`;
/** Hotový model ve vsi: obydlí, řemeslná dílna (crafts.md), nebo milíř uhlíře. */
export type ModelKey = DwellingType | WorkshopModel | 'milir';
export const CRAFT_MODEL_KEYS: readonly (WorkshopModel | 'milir')[] = [
  'hrncir',
  'kovar',
  'tesar',
  'uhlir',
  'milir',
];
/** Přístřešek hrnčíře a kováře sahá o tolik dál před obydlí (m) – ušlapaná tráva i před ním. */
export const PORCH_EXTRA_M = 2.6;
/** Rozvrh dýmu pece, výhně a milíře se liší od dýmníku obydlí (seed = id obydlí × 4 + druh). */
export const CRAFT_SMOKE_SEED = 1_000_000;
/** Rozvrh dýmu z pálení paseky (seed = id dílu) – mimo dýmníky a dílny. */
export const SLASH_SMOKE_SEED = 3_000_000;
/** Semínka dýmu hořících domů (požár) – id obydlí nad tímto základem. */
export const HOUSE_FIRE_SMOKE_SEED = 4_000_000;
/** Semínka dýmu vápenné pece staveniště kostela (id stavby nad tímto základem). */
export const CHURCH_KILN_SMOKE_SEED = 5_000_000;
export const TUFT_MODELS: readonly TuftModel[] = ['grass-tuft-1', 'grass-tuft-2'];
export const AMBIENT = new Color3(0.38, 0.38, 0.36);
/** Rostliny jako dekorace krajiny (decorations.ts) – trsy u okapu jsou sytější a zelenější. */
export const PLANT_AMBIENT = new Color3(0.45, 0.48, 0.45);
export const TUFT_TINT = new Color3(0.56, 0.86, 0.4);
/** Obydlí je o kousek zapuštěné – na mírném svahu tak žádný roh nevisí nad terénem (m). */
export const DWELLING_SINK_M = 0.05;
/** Sníh na obtiscích vsi (cesty, vyšlapaná hlína) – část jejich barvy zimou prosvítá. */
export const VILLAGE_SNOW = 0.85;
/** Výška obtisků nad terénem (m) – navzájem v pořadí, aby se nepraly o hloubku. */
export const LIFT = { outline: 0.06, worn: 0.03, earth: 0.04, turf: 0.045 };
/** Sejmutý drn přesahuje jámu o tolik (m) – po vykopání zůstane kolem okraje tmavá hlína. */
export const TURF_MARGIN_M = 0.35;
/** Ušlapaná tráva kolem staveniště: o kolik menší než místo pro stavbu a jak měkký okraj (m). */
export const TRAMPLED_INSET_M = 0.6;
export const TRAMPLED_SOFT_M = 2.2;
/** Krytí vyšlapané hlíny u opuštěného obydlí – zarůstá trávou (vymřelá ves, prázdné obydlí). */
export const ABANDONED_EARTH_ALPHA = 0.4;
/** Hromada hlíny z jámy v plné velikosti (m) – většina hlíny jde nakonec na valy. */
export const SPOIL_HEAP_M = { rx: 1.7, rz: 1.2, height: 0.72 };
/** Díly rozpadu obydlí, zbytku jámy a kopřivy (tools/blender/dwellings.py – rozpad obydlí). */
export const DECAY_MODEL_URL = `${MODEL_BASE_URL}decay.glb`;
/** Kopřivy usychají a přes zimu stojí jako trsy trávy (season-foliage.ts). */
export const NETTLE_MATERIAL = 'decay-nettle';

export interface DwellingView {
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

/** Zbytek jámy po zaniklém obydlí: zarostlá prohlubeň (síť) a řez terénu. */
export interface RuinView {
  key: string;
  ruin: SceneRuin;
  meshes: Mesh[];
  cut: PitCut;
  shape: HideShape;
}

export interface VillageContext {
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
  /** Je bod na souši (ne ve vodě, ne neprůjezdný)? Obratiště vozů se do vody nekladou. Bez ní vše. */
  walkable?: (x: number, z: number) => boolean;
  /**
   * Smí se scéna hýbat (bez omezeného pohybu)? Orba za herní den (ladicí) jen s animací – při
   * omezeném pohybu pole ukáže stav na konci dne a spřežení stojí na čele. Bez údaje ano.
   */
  animated?(): boolean;
  /**
   * Vybrané spřežení nebo vůz (`selectDraft` – villagers.md, Výběr postavy): co dělá; volá se jen
   * při změně (null – nic vybraného, nebo spřežení / vůz ve scéně není).
   */
  onDraftState?(state: DraftRenderState | null): void;
}

/** Vybrané spřežení nebo vůz ve scéně (stav pro panel výběru). */
export type DraftRenderState =
  { kind: 'team'; team: number; activity: TeamActivity } | ({ kind: 'cart' } & CartSelectedState);

/** Id meshů milíře v lese – mimo id obydlí a staveb (jména meshů a dým). */
export const FOREST_KILN_MESH_ID = 3_000_000;
/** Milířiště (crafts.md – Milíř u skácených buků): poloměr černé země, krytí a barva (tón bahna). */
export const KILN_REMNANT_RADIUS_M = 3.4;
export const KILN_REMNANT_ALPHA = 0.75;
/** Zástupná mlatová plocha humna – udusaná světlá hlína (model přinese scéna humna). */
// Udusaná světlá hlína s ostrým okrajem (Martin 21. 10. 2026: humno nebylo vidět) – světlejší než
// louka i hlína obydlí (barva přes 1 zesvětlí texturu bahna), nad poli a hlínou vsi (alphaIndex 2,2)
export const THRESHING_FLOOR_ALPHA = 1;
export const THRESHING_FLOOR_COLOR: [number, number, number] = [1.45, 1.22, 0.92];
export const THRESHING_FLOOR_SOFT_M = 0.3;
export const THRESHING_FLOOR_ALPHA_INDEX = 2.2;
export const THRESHING_FLOOR_Z_OFFSET = -3;
export const KILN_REMNANT_COLOR: [number, number, number] = [0.5, 0.42, 0.35];

/** Rekvizity u rozebíraného milíře – koše na uhlí a rýč (hrabice). */
export const KILN_DRAW_PROPS: readonly SiteProp[] = ['basket', 'spade'];

/** Klíč fáze milíře – přestaví se při změně fáze, průběhu nebo uhlí (po 2 %). */
export function kilnPhaseKey(kiln: SceneKilnState | undefined): string {
  return kiln ? [kiln.stage, kiln.progress, kiln.charcoal ?? ''].join('|') : '';
}

/** Klíč milíře v lese – přestaví se při změně místa, fáze, průběhu nebo uhlí. */
export function kilnKey(kiln: SceneKiln): string {
  return [kiln.id, kiln.x, kiln.z, kilnPhaseKey(kiln)].join('|');
}

/** Milíř v lese jako „dílna uhlíře“ s polohou kotvy – funkce milíře u dílny ho kreslí stejně. */
export function kilnDwelling(kiln: SceneKiln): SceneDwelling {
  return {
    id: FOREST_KILN_MESH_ID + kiln.id,
    type: 'zemnice',
    position: forestKilnAnchor(kiln),
    built: true,
    progress: 1,
    craft: 'burner',
  };
}

/** Pozemky obydlí pro scénu: hotové celé, staveniště podle fáze plotu a záhonů. */
export function plotViews(dwellings: readonly SceneDwelling[]): PlotView[] {
  return dwellings.flatMap((d) => {
    if (!d.plot) return [];
    const progress = d.built ? PLOT_BUILT : constructionState(d.type, d.progress).plot;
    // pozemek rozpadajícího se obydlí: plot padá, záhony zarůstají (dwelling-decay.ts)
    const look = DECAY_LOOKS[d.built ? dwellingDecay(d) : 0];
    const decay =
      look.fence > 0 || look.beds > 0
        ? { decay: { fence: look.fence, beds: look.beds, seed: d.id } }
        : {};
    return [
      {
        id: d.id,
        square: d.plot,
        variant: d.plot.variant,
        progress,
        house: d.position,
        ...decay,
        ...(d.plainShape ? { plainShape: true } : {}),
      },
    ];
  });
}

/** Stupeň rozpadu hotového obydlí – jen prázdné se rozpadá (dwelling-decay.ts). */
export function dwellingDecay(
  d: Pick<SceneDwelling, 'condition' | 'craft' | 'inhabited' | 'type'>,
): DecayStage {
  return dwellingDecayStage(d);
}

/** Zbytek jámy ve scéně: id zaniklého obydlí a den zániku (obydlí se může přestěhovat znovu). */
export function ruinId(r: SceneRuin): string {
  return `${r.id}@${r.since}`;
}

/** Klíč vzhledu zbytku jámy – mění se jen po krocích zarůstání (RUIN_LOOK_STEPS). */
export function ruinKey(r: SceneRuin): string {
  const p = r.position;
  const shape = `${r.plot?.variant ?? ''}${r.plainShape ? '/plain' : ''}`;
  const look = `${Math.round(r.overgrowth * 20)}${r.charred ? '/charred' : ''}`;
  return [ruinId(r), r.type, p.x, p.z, p.rotation, look, shape].join('|');
}

/** Místo domu zbytku jámy (bez pozemku – zbytek pozemek nemá) podle varianty rozměrů. */
export function houseHideShape(r: SceneRuin): HideShape {
  const corners = houseArea(r);
  return { bounds: polygonBounds(corners), contains: (x, z) => pointInPolygon(corners, x, z) };
}

/** Druh staveniště (fáze, díly): obydlí, nebo model řemeslné dílny. */
export function siteKind(d: Pick<SceneDwelling, 'type' | 'craft'>): SiteKind {
  return d.craft ? CRAFT_MODEL[d.craft] : d.type;
}

/**
 * Díl modelu obydlí nebo dílny (hotový model, staveniště „<druh>-…“, rozpad „<typ>-…“) dostane
 * kosti oblastí variant rozměrů (population.md – Varianty rozměrů, shaped-model.ts); dvorec,
 * milíř, modla, svatyně a rekvizity („site-…“, kopřivy) variantu nemají.
 */
export function shapeableAs(mesh: Mesh, name: string): void {
  const kind = name.split('-')[0]!;
  const base = (CONSTRUCTION_BASE as Partial<Record<string, DwellingType | null>>)[kind];
  if (base && base !== 'dvorec') makeShapeable(mesh, base);
}

/** Je model dílnou nebo milířem (public/models/crafts)? */
export function isCraftModel(key: ModelKey): key is WorkshopModel | 'milir' {
  return (CRAFT_MODEL_KEYS as readonly string[]).includes(key);
}

/** Ušlapaná tráva staveniště: pozemek, nebo místo kolem modelu (bez kusu před vchodem). */
export function trampledArea(d: SceneDwelling): Point[] {
  const inset = TRAMPLED_INSET_M + TRAMPLED_SOFT_M / 2;
  if (d.plot) {
    const h = d.plot.size / 2 - inset;
    const { x, z } = d.plot;
    // natočený pozemek (fields.md – Natočené stavby) – rohy v jeho osách
    const [c, s] = d.plot.rotation !== undefined ? rotationCosSin(d.plot.rotation) : [1, 0];
    return (
      [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ] as const
    ).map(([lx, lz]): Point => [x + lx * c + lz * s, z - lx * s + lz * c]);
  }
  // staveniště podle varianty rozměrů domu (population.md)
  const c = clearanceRect(d);
  // dílny s přístřeškem (hrnčíř, kovář, tesař): ušlapáno i pod ním před domem
  const porch = d.craft && hasPorch(CRAFT_MODEL[d.craft]) ? PORCH_EXTRA_M : 0;
  return [
    localToWorld(d.position, c.minX + inset, c.minZ + inset),
    localToWorld(d.position, c.maxX - inset, c.minZ + inset),
    localToWorld(d.position, c.maxX - inset, c.maxZ - inset - 2 + porch),
    localToWorld(d.position, c.minX + inset, c.maxZ - inset - 2 + porch),
  ];
}

export function dwellingKey(d: SceneDwelling): string {
  const p = d.position;
  // Průběh stavby po 2 % – sloupy nerostou plynule, ale ani se nepřestavují při každém dotazu.
  // Hotové obydlí se přestaví, když se vylidní nebo zase zabydlí (hlína u vchodu zarůstá).
  // Rozpad po stupních (dwelling-decay.ts) – dům se přestaví jen při změně stupně.
  const look = d.built
    ? `${d.inhabited === false ? 'empty' : ''}${dwellingDecay(d)}`
    : Math.round(d.progress * 50);
  // tvar (varianta rozměrů) je čistá funkce polohy, varianty pozemku a příznaku dnešního tvaru
  const shape = `${d.plot?.variant ?? ''}${d.plainShape ? '/plain' : ''}`;
  return [d.type, d.craft ?? '', p.x, p.z, p.rotation, d.built, look, shape].join('|');
}

/** Nastaví instance meshe; bez instancí ho vypne (jinak by se vykreslil samotný model v počátku). */
export function setInstances(mesh: Mesh, instances: readonly ModelInstance[]): void {
  if (instances.length === 0) {
    mesh.setEnabled(false);
    return;
  }
  mesh.thinInstanceSetBuffer('matrix', instanceMatrices(instances), 16, true);
  // varianty rozměrů domů (shaped-model.ts) – mesh bez kostí oblastí to nechá být
  setShapeFrames(
    mesh,
    instances.map((instance) => instance.shape ?? PLAIN_FRAME),
  );
  mesh.setEnabled(true);
}

export function prepareDwellingMaterial(material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = AMBIENT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // v zimě sníh na střechách (plochy obrácené nahoru)
  applySeasonSnow(material);
}

/** Materiály decay.glb: obydlí (sníh na střechách), kopřivy jako trsy trávy (usychají). */
export function prepareDecayMaterial(material: Material): void {
  if (material.name !== NETTLE_MATERIAL) {
    prepareDwellingMaterial(material);
    return;
  }
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.metallic = 0;
  material.ambientColor = PLANT_AMBIENT;
  material.directIntensity = 0.8;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  applySeasonModel(material, 'nettle');
}

export function prepareTuftMaterial(material: Material): void {
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
