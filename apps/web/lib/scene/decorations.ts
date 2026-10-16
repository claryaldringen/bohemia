import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { HEIGHT_SCALE } from './constants';
import { DECOR_MODELS, type DecorModel, type DecorPlacement } from './decor-placement';
import { applyGammaFog } from './gamma-fog';
import { addInstancedModel } from './instanced-model';

/** Lekníny kousek nad hladinou, ať se s ní neperou o hloubku (m ve scéně). */
const FLOAT_ABOVE_WATER = 0.15;
/** Kameny jsou zčásti zabořené do země (m ve scéně při měřítku 1). */
const STONE_SINK = 0.25;
/** Rozptýlené světlo – rostliny ani kameny ve stínu nezčernají; vrby jako stromy okraje lesa. */
const AMBIENT = new Color3(0.35, 0.37, 0.35);
const TREE_AMBIENT = new Color3(0.45, 0.48, 0.45);
const WILLOW_TINT = new Color3(0.8, 0.85, 0.75);
const SHRUB_TINT = new Color3(0.85, 1, 0.65);

/**
 * Dekorace krajiny (rákos, lekníny, vrby, keřový lem lesa, květiny a tráva na loukách, kameny)
 * z instancí modelů. Když se model nenačte,
 * dekorace chybí (zaloguje se varování), krajina se zobrazí dál.
 */
export async function addDecorations(
  scene: Scene,
  placements: readonly DecorPlacement[],
  options: { baseUrl: string; groundHeight: (worldX: number, worldZ: number) => number },
): Promise<void> {
  const results = await Promise.allSettled(
    DECOR_MODELS.map((model) =>
      addInstancedModel(
        scene,
        `${options.baseUrl}${model}.glb`,
        `decor-${model}`,
        placements
          .filter((p) => p.model === model)
          .map((p) => ({
            x: p.worldX,
            y: baseHeight(model, p, options.groundHeight),
            z: p.worldZ,
            rotationY: p.rotationY,
            scale: p.scale,
          })),
        (material) => prepareMaterial(model, material),
      ),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Dekoraci krajiny se nepodařilo načíst.', result.reason);
    }
  }
}

function baseHeight(
  model: DecorModel,
  p: DecorPlacement,
  groundHeight: (worldX: number, worldZ: number) => number,
): number {
  if (p.waterLevel !== undefined) return p.waterLevel * HEIGHT_SCALE + FLOAT_ABOVE_WATER;
  const ground = groundHeight(p.worldX, p.worldZ);
  const stone = model === 'boulder' || model === 'stone-1' || model === 'stone-2';
  return stone ? ground - STONE_SINK * p.scale : ground;
}

function prepareMaterial(model: DecorModel, material: Material): void {
  if (!(material instanceof PBRMaterial)) return;
  applyGammaFog(material);
  material.roughness = 1;
  material.alphaCutOff = 0.3;
  const plant = !['boulder', 'stone-1', 'stone-2', 'lilies'].includes(model);
  material.ambientColor = plant ? TREE_AMBIENT : AMBIENT;
  if (plant) {
    // Světlo jako u stromů okraje lesa (trees.ts) – rostliny se navzájem nestíní.
    material.directIntensity = 0.75;
  }
  // Textura vrby je světlejší, keřů modravější – dorovnání do tónu lesa.
  if (model === 'willow') material.albedoColor = WILLOW_TINT;
  if (model.startsWith('shrub') || model.startsWith('underbrush'))
    material.albedoColor = SHRUB_TINT;
  if (material.albedoTexture) material.albedoTexture.anisotropicFilteringLevel = 8;
}
