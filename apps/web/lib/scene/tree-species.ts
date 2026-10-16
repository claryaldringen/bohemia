import { createNoise2D } from 'simplex-noise';
import type { TreeModel } from './tree-placement';

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
 * a jehličnany ve skupinách, výš jich přibývá.
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

const clusters = createNoise2D(seededRandom(0x0f17));

/**
 * Podíly druhů v bodě lesa – jedna funkce pro okraj (3D stromy) i vnitřek (impostory), takže
 * mezi nimi nevznikne pás jiné barvy.
 * @param distanceM vzdálenost od hranice lesa (m, kladná v lese)
 * @param heightFraction výška terénu vůči nejvyššímu místu krajiny (0–1)
 */
export function speciesWeights(
  distanceM: number,
  heightFraction: number,
  worldX: number,
  worldZ: number,
): SpeciesWeights {
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
}

/** Model stromu podle vah: `kind` vybírá druh, `variant` jednu ze dvou podob (obojí 0–1). */
export function pickModel(kind: number, weights: SpeciesWeights, variant: number): TreeModel {
  const v = variant < 0.5 ? 1 : 2;
  let edge = weights.conifer;
  if (kind < edge) return `spruce-${v}`;
  edge += weights.oak;
  if (kind < edge) return `oak-${v}`;
  edge += weights.beech;
  if (kind < edge) return `beech-${v}`;
  return `birch-${v}`;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
