import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { HEIGHT_SCALE } from './constants';
import { DECOR_MODELS, type DecorModel, type DecorPlacement } from './decor-placement';
import { applyGammaFog } from './gamma-fog';
import { addInstancedModel } from './instanced-model';
import type { DecorGroup } from './premium-sites-layout';
import { applySeasonModel } from './season-materials';

/** Lekníny kousek nad hladinou, ať se s ní neperou o hloubku (m ve scéně). */
const FLOAT_ABOVE_WATER = 0.15;
/** Kameny jsou zčásti zabořené do země (m ve scéně při měřítku 1). */
const STONE_SINK = 0.25;
/**
 * Skály se naklopí podle svahu (podíl sklonu terénu) – vystupují z něj jako výchoz; padlé
 * stromy leží celou délkou na zemi.
 */
const ROCK_TILT = 0.8;
const FALLEN_TILT = 1;
/** Kmen v potoce je napůl ponořený (m ve scéně při měřítku 1). */
const LOG_SINK = 0.3;
/** Krok (m) pro odhad sklonu terénu pod skálou. */
const TILT_STEP_M = 2;
/** Skalní věž vystupuje ze země – je zabořená hlouběji (m ve scéně při měřítku 1). */
const TOWER_SINK = 1.4;
/** Rozptýlené světlo – rostliny ani kameny ve stínu nezčernají; vrby jako stromy okraje lesa. */
const AMBIENT = new Color3(0.35, 0.37, 0.35);
const TREE_AMBIENT = new Color3(0.45, 0.48, 0.45);
const WILLOW_TINT = new Color3(0.8, 0.85, 0.75);
const SHRUB_TINT = new Color3(0.85, 1, 0.65);
/** Zvětralý blok skalní věže má v textuře bledě zelenavý kámen – dorovnání do šedé žuly. */
const TOWER_TINT = new Color3(0.78, 0.74, 0.7);
/**
 * Skály prémiových nalezišť (premium-sites-layout.ts): rudné výchozy žíly rezavě okrové (železný
 * klobouk nad rudou), vápenec lomu světlý a teplý.
 */
const DECOR_GROUPS: readonly DecorGroup[] = ['ore', 'limestone', 'site'];
const TINT_COLORS: Record<'ore' | 'limestone', Color3> = {
  ore: new Color3(1.15, 0.9, 0.66),
  limestone: new Color3(1.35, 1.3, 1.18),
};

/**
 * Dekorace krajiny (rákos, lekníny, vrby, keře, skály a kameny) z instancí modelů. Když se
 * model nenačte, dekorace chybí (zaloguje se varování), krajina se zobrazí dál. Vrátí meshe
 * dekorací (skrývání pod vsí – InstanceHider).
 */
export async function addDecorations(
  scene: Scene,
  placements: readonly DecorPlacement[],
  options: { baseUrl: string; groundHeight: (worldX: number, worldZ: number) => number },
): Promise<Mesh[]> {
  // prémiová krajina – skály nalezišť s odstínem a ozdoby prvků jako vlastní meshe
  // (`decor-<model>-<skupina>`), jen když v krajině jsou; průměrná krajina má meshe jako dřív
  const extra = DECOR_GROUPS.flatMap((group) =>
    DECOR_MODELS.filter((model) =>
      placements.some((p) => p.model === model && p.group === group),
    ).map((model) => ({ model, group })),
  );
  const groups: { model: DecorModel; group?: DecorGroup }[] = [
    ...DECOR_MODELS.map((model) => ({ model })),
    ...extra,
  ];
  const results = await Promise.allSettled(
    groups.map(({ model, group }) =>
      addInstancedModel(
        scene,
        `${options.baseUrl}${model}.glb`,
        group ? `decor-${model}-${group}` : `decor-${model}`,
        placements
          .filter((p) => p.model === model && p.group === group)
          .map((p) => ({
            x: p.worldX,
            y: baseHeight(model, p, options.groundHeight),
            z: p.worldZ,
            rotationY: p.rotationY,
            scale: p.scale,
            id: p.id,
            up: model.startsWith('rock')
              ? slopeUp(p, options.groundHeight, ROCK_TILT)
              : model.startsWith('fallen')
                ? slopeUp(p, options.groundHeight, FALLEN_TILT)
                : undefined,
          })),
        (material) => {
          prepareDecorMaterial(model, material);
          const tint = group === 'ore' || group === 'limestone' ? TINT_COLORS[group] : null;
          if (tint && material instanceof PBRMaterial) {
            material.albedoColor = material.albedoColor.multiply(tint);
          }
        },
      ),
    ),
  );
  const meshes: Mesh[] = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Dekoraci krajiny se nepodařilo načíst.', result.reason);
    } else if (result.value) {
      meshes.push(result.value);
    }
  }
  return meshes;
}

function baseHeight(
  model: DecorModel,
  p: DecorPlacement,
  groundHeight: (worldX: number, worldZ: number) => number,
): number {
  if (p.waterLevel !== undefined) {
    const water = p.waterLevel * HEIGHT_SCALE;
    return model === 'log-water' ? water - LOG_SINK * p.scale : water + FLOAT_ABOVE_WATER;
  }
  const ground = groundHeight(p.worldX, p.worldZ);
  if (model === 'rock-tower') return ground - (STONE_SINK + TOWER_SINK) * p.scale;
  if (model.startsWith('rock')) return ground - STONE_SINK * p.scale;
  const stone = model === 'boulder' || model === 'stone-1' || model === 'stone-2';
  return stone ? ground - STONE_SINK * p.scale : ground;
}

/** Směr „nahoru“ pro skálu nebo kmen na svahu – mezi svislicí a kolmicí k terénu (ve scéně). */
function slopeUp(
  p: DecorPlacement,
  groundHeight: (worldX: number, worldZ: number) => number,
  tilt: number,
): { x: number; y: number; z: number } {
  const dx =
    (groundHeight(p.worldX + TILT_STEP_M, p.worldZ) -
      groundHeight(p.worldX - TILT_STEP_M, p.worldZ)) /
    (2 * TILT_STEP_M);
  const dz =
    (groundHeight(p.worldX, p.worldZ + TILT_STEP_M) -
      groundHeight(p.worldX, p.worldZ - TILT_STEP_M)) /
    (2 * TILT_STEP_M);
  const x = -dx * tilt;
  const z = -dz * tilt;
  const length = Math.hypot(x, 1, z);
  return { x: x / length, y: 1 / length, z: z / length };
}

/** Materiál dekorace – světlo a tón podle druhu (rostliny jako stromy okraje, kameny tlumeně). */
export function prepareDecorMaterial(model: DecorModel, material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.alphaCutOff = 0.3;
  const plant =
    !model.startsWith('rock') && !['boulder', 'stone-1', 'stone-2', 'lilies'].includes(model);
  material.ambientColor = plant ? TREE_AMBIENT : AMBIENT;
  if (plant) {
    // Světlo jako u stromů okraje lesa (trees.ts) – rostliny se navzájem nestíní.
    material.directIntensity = 0.75;
  }
  // Textura vrby je světlejší, keřů modravější – dorovnání do tónu lesa.
  if (model === 'willow') material.albedoColor = WILLOW_TINT;
  if (model.startsWith('shrub') || model.startsWith('underbrush'))
    material.albedoColor = SHRUB_TINT;
  if (model === 'rock-tower') material.albedoColor = TOWER_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
  // Roční období: keře a vrby se barví a opadávají, rákos usychá, na kamenech a kmenech sníh.
  applySeasonModel(material, model);
}
