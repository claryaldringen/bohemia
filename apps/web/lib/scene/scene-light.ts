import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import type { Scene } from '@babylonjs/core/scene';
import type { DayLight } from './day-light';
import type { SeasonLook } from './season-look';
import { SHADOW_DARKNESS, shadowDarkness, type SunShadows } from './sun-shadows';

/** Kontrast obrazu jako v 0 A.D. (temperate 1,05) – v suchu vyšší (`DayLight.contrast`). */
export const BASE_CONTRAST = 1.1;
/** Stíny v zimě – holé listnáče propouštějí světlo (jen uniforma, mapa se nepřekresluje). */
const WINTER_SHADOW_DARKNESS = 0.6;
/** Slabší hlavní světlo (× síla stínu) stín nevrhá – stínová mapa se kvůli němu neobnovuje. */
const SHADOW_VISIBLE = 0.03;

/**
 * Světla a obraz scény ze světla dne (day-light.ts): slunce (v noci měsíc) a jeho směr, obloha,
 * okolní světlo, filtr obrazu soumraku, barva oblohy, opar, tma stínů a kontrast. Bez stínové
 * mapy se slunce jen natočí.
 */
export function applySceneLight(
  scene: Scene,
  look: SeasonLook,
  day: DayLight,
  shadows: SunShadows | null,
): void {
  const { light } = day;
  const sun = scene.getLightByName('sun');
  if (sun instanceof DirectionalLight) {
    sun.intensity = light.sunIntensity;
    sun.diffuse.set(...light.sunColor);
    sun.specular.set(...day.specular);
    const { x, y, z } = day.direction;
    if (shadows) {
      shadows.aim(day.direction, light.sunIntensity * day.shadowStrength > SHADOW_VISIBLE);
    } else if (sun.direction.x !== x || sun.direction.y !== y || sun.direction.z !== z) {
      sun.direction.set(x, y, z);
    }
  }
  const sky = scene.getLightByName('sky');
  if (sky instanceof HemisphericLight) {
    sky.intensity = light.skyIntensity;
    sky.diffuse.set(...light.skyColor);
    sky.groundColor.set(...light.groundColor);
  }
  scene.ambientColor.set(...day.ambient);
  const curves = scene.imageProcessingConfiguration.colorCurves;
  if (scene.imageProcessingConfiguration.colorCurvesEnabled && curves) {
    curves.globalHue = day.grade.hue;
    curves.globalDensity = day.grade.density;
    curves.globalSaturation = day.grade.saturation;
  }
  scene.clearColor.set(...light.clearColor, 1);
  scene.fogColor.set(...light.fogColor);
  scene.fogDensity = light.fogDensity;
  // v zimě holé listnáče propouštějí světlo; nízké slunce a měsíc vrhají slabší stín
  const darkness = SHADOW_DARKNESS + (WINTER_SHADOW_DARKNESS - SHADOW_DARKNESS) * (1 - look.leaves);
  shadows?.setDarkness(shadowDarkness(darkness, day.shadowStrength));
  scene.imageProcessingConfiguration.contrast = BASE_CONTRAST * day.contrast;
}
