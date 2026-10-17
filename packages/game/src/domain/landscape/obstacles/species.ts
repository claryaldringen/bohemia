import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { noiseRandom, smoothstep } from '../det-math';
import type { TreeLook } from './types';

/** Podíly druhů stromů (součet 1). „conifer“ = jedle (modely `spruce-*` jsou 0 A.D. fir_tree). */
export interface SpeciesWeights {
  conifer: number;
  oak: number;
  beech: number;
  birch: number;
}

/**
 * Okraj lesa (první řady a lem) je světlomilný: dub, bříza, buk, jehličnanů jen pár. Vnitřek
 * odpovídá středověkému lesu pahorkatiny (dubohabřiny a bučiny): buk, dub, trochu břízy
 * a jehličnany ve skupinách, výš jich přibývá (landscape.md – Martin).
 */
const EDGE: SpeciesWeights = { conifer: 0.05, oak: 0.45, beech: 0.25, birch: 0.25 };
const INTERIOR_BROADLEAF = { oak: 0.3, beech: 0.35, birch: 0.1 };
const INTERIOR_CONIFER_LOW = 0.1;
const INTERIOR_CONIFER_HIGH = 0.25;
/** Okraj přechází ve vnitřek plynule mezi těmito vzdálenostmi od hranice lesa (m). */
const TRANSITION_FROM_M = 10;
const TRANSITION_TO_M = 30;
/** Skupiny jehličnanů: násobek podílu podle šumu s velikostí shluků ~ stovek metrů. */
const CLUSTER_SCALE_M = 140;
const CLUSTER_MAX = 3;

/** Skladba lesa v bodě – jedna funkce pro okraj (3D stromy) i vnitřek (impostory). */
export type ForestSpecies = (
  distanceM: number,
  heightFraction: number,
  worldX: number,
  worldZ: number,
) => SpeciesWeights;

/**
 * Podíly druhů v bodě lesa – jedna funkce pro okraj i vnitřek, takže mezi nimi nevznikne pás
 * jiné barvy. Skupiny jehličnanů určuje šum ze seedu.
 * - distanceM: vzdálenost od hranice lesa (m, kladná v lese)
 * - heightFraction: výška terénu vůči nejvyššímu místu krajiny (0–1)
 */
export function forestSpecies(seed: number): ForestSpecies {
  const clusters: NoiseFunction2D = createNoise2D(noiseRandom(seed));
  return (distanceM, heightFraction, worldX, worldZ) => {
    const t = smoothstep(TRANSITION_FROM_M, TRANSITION_TO_M, distanceM);
    const cluster = Math.min(
      CLUSTER_MAX,
      Math.max(0, 1 + 2.2 * clusters(worldX / CLUSTER_SCALE_M, worldZ / CLUSTER_SCALE_M)),
    );
    const interiorConifer =
      INTERIOR_CONIFER_LOW + (INTERIOR_CONIFER_HIGH - INTERIOR_CONIFER_LOW) * heightFraction;
    const coniferBase = EDGE.conifer + (interiorConifer - EDGE.conifer) * t;
    const conifer = Math.min(0.9, coniferBase * cluster);

    // Listnáče: poměr mezi nimi se mění od okraje dovnitř, dohromady doplní zbytek do 1.
    const broadleafTotal =
      INTERIOR_BROADLEAF.oak + INTERIOR_BROADLEAF.beech + INTERIOR_BROADLEAF.birch;
    const edgeBroadleafTotal = EDGE.oak + EDGE.beech + EDGE.birch;
    const mix = (edge: number, interior: number): number =>
      (edge / edgeBroadleafTotal) * (1 - t) + (interior / broadleafTotal) * t;
    const rest = 1 - conifer;
    return {
      conifer,
      oak: rest * mix(EDGE.oak, INTERIOR_BROADLEAF.oak),
      beech: rest * mix(EDGE.beech, INTERIOR_BROADLEAF.beech),
      birch: rest * mix(EDGE.birch, INTERIOR_BROADLEAF.birch),
    };
  };
}

/** Model stromu podle vah: `kind` vybírá druh, `variant` jednu ze dvou podob (obojí 0–1). */
export function pickForestLook(kind: number, weights: SpeciesWeights, variant: number): TreeLook {
  const v = variant < 0.5 ? 1 : 2;
  let edge = weights.conifer;
  if (kind < edge) return `spruce-${v}`;
  edge += weights.oak;
  if (kind < edge) return `oak-${v}`;
  edge += weights.beech;
  if (kind < edge) return `beech-${v}`;
  return `birch-${v}`;
}
