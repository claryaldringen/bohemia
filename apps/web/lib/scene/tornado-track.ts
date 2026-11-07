// Smršť ve scéně (disasters.md – Smršť, Ve scéně): čisté funkce bez Babylonu (testy) – kudy jde
// trychtýř kolem vsi, polehlé obilí a rozmetané stohy ve stopě, padlé kmeny vývratů. Trychtýř
// kreslí tornado-funnel.ts, kmeny felled-trees.ts.
import {
  TORNADO,
  inTornadoTrack,
  type TornadoStrength,
  type TornadoStrengthRule,
  type TornadoTrack,
} from '@bohemia/game';
import type { PlantInstance } from './field-crops';

/** Trychtýř jde kolem vsi po stopě ± tolik m (za ≈ 10 s – `FUNNEL_PASS`), ne celých 10 km. */
export const FUNNEL_PATH_HALF_M = 450;
/** Na začátku a konci průchodu trychtýř roste a slábne (podíl průchodu). */
const FUNNEL_FADE = 0.15;

/** Pravidlo síly smrště z jádra (podíly škod). */
export function strengthRule(strength: TornadoStrength): TornadoStrengthRule {
  return TORNADO.strengths.find((s) => s.strength === strength) ?? TORNADO.strengths[0]!;
}

/**
 * Poloha trychtýře v průchodu `progress` 0–1: po ose stopy kolem bodu nejblíž vsi (`home`, bez
 * něj střed stopy), nejvýš po konec stopy.
 */
export function funnelPoint(
  track: TornadoTrack,
  home: { x: number; z: number } | null,
  progress: number,
): { x: number; z: number } {
  const c = Math.cos(track.angle);
  const s = Math.sin(track.angle);
  const half = track.lengthM / 2;
  const clampAlong = (v: number): number => Math.min(half, Math.max(-half, v));
  const center = home ? clampAlong((home.x - track.x) * c + (home.z - track.z) * s) : 0;
  const along = clampAlong(center + (progress * 2 - 1) * FUNNEL_PATH_HALF_M);
  return { x: track.x + c * along, z: track.z + s * along };
}

/** Velikost trychtýře 0–1 v průchodu – roste ze země a na konci se rozplyne. */
export function funnelGrowth(progress: number): number {
  const v = Math.min(progress, 1 - progress) / FUNNEL_FADE;
  return Math.min(1, Math.max(0, v));
}

/** Hash dvou čísel → [0, 1) (rozházené kupky a kmeny – jen vzhled). */
function hash01(a: number, b: number): number {
  let h = Math.imul(Math.round(a * 10) ^ Math.imul(Math.round(b * 10), 0x27d4eb2d), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Stoh (ne kupka) – kupky sena jsou ≈ 0,3, stohy ≈ 0,85–1,05 modelu. */
const STACK_MIN_WIDTH = 0.6;
/** Rozmetaný stoh: kolik kupek, jak daleko po větru (m) a jak velké. */
const SCATTER = { heaps: 5, reachM: 14, spreadM: 5, width: 0.32, height: 0.16 } as const;

/** Rozmetá smršť stoh v bodě? Ve stopě podíl stohů `hay` z jádra (F0 polovina, jinak všechny). */
export function stackScattered(
  tornado: { strength: TornadoStrength; track: TornadoTrack },
  x: number,
  z: number,
): boolean {
  return inTornadoTrack(tornado.track, x, z) && hash01(x, z) < strengthRule(tornado.strength).hay;
}

/**
 * Rozmetané stohy (disasters.md – Smršť): stoh ve stopě smrště rozfouká vítr na pár nízkých
 * kupek po směru stopy (u F0 jen polovina stohů – podíl `hay` z jádra). Platí jen pro stohy, které
 * už v den smrště stály (`stacksStood`) – nové stohy po ní stojí celé.
 */
export function scatterStacks(
  plants: readonly PlantInstance[],
  tornado: { strength: TornadoStrength; track: TornadoTrack } | null | undefined,
  stacksStood: boolean,
): PlantInstance[] {
  if (!tornado || !stacksStood) return [...plants];
  const { track } = tornado;
  const c = Math.cos(track.angle);
  const s = Math.sin(track.angle);
  const out: PlantInstance[] = [];
  for (const plant of plants) {
    if (plant.width < STACK_MIN_WIDTH || !stackScattered(tornado, plant.x, plant.z)) {
      out.push(plant);
      continue;
    }
    for (let i = 0; i < SCATTER.heaps; i++) {
      const along = hash01(plant.x + i, plant.z) * SCATTER.reachM;
      const across = (hash01(plant.z, plant.x + i) - 0.5) * SCATTER.spreadM;
      out.push({
        x: plant.x + c * along - s * across,
        z: plant.z + s * along + c * across,
        rotation: hash01(i, plant.x) * Math.PI * 2,
        width: SCATTER.width * (0.7 + 0.6 * hash01(plant.z + i, i)),
        height: SCATTER.height,
        shade: plant.shade,
        rank: plant.rank,
        ...(plant.tint ? { tint: plant.tint } : {}),
      });
    }
  }
  return out;
}

/**
 * Váha polehlé úrody v bodě: ve stopě podíl ztráty úrody podle síly (`crop` z jádra – F0 0,2 …
 * F3 1), mimo ni 0.
 */
export function tornadoCropWeight(
  tornado: { strength: TornadoStrength; track: TornadoTrack } | null | undefined,
  x: number,
  z: number,
): number {
  if (!tornado || !inTornadoTrack(tornado.track, x, z)) return 0;
  return strengthRule(tornado.strength).crop;
}

/** Kmen vývratu leží od pařezu po větru – střed modelu padlého stromu (≈ 14 m) tolik m od paty. */
const TRUNK_OFFSET_M = 5;
/** Rozptyl směru pádu kolem směru stopy (rad) – vývraty se sbíhají, ne leží rovnoběžně. */
const TRUNK_SPREAD = 0.9;

/**
 * Padlý kmen na místě vyvráceného stromu: střed a natočení modelu (osa +x modelu míří po větru,
 * Babylon otáčí po směru hodinových ručiček – úhel −směr) a model 0 / 1 podle id.
 */
export function fallenTrunk(
  id: number,
  stump: { x: number; z: number },
  angle: number,
): { x: number; z: number; rotationY: number; variant: 0 | 1 } {
  const fall = angle + (hash01(id, 1) - 0.5) * TRUNK_SPREAD;
  return {
    x: stump.x + Math.cos(fall) * TRUNK_OFFSET_M,
    z: stump.z + Math.sin(fall) * TRUNK_OFFSET_M,
    rotationY: -fall,
    variant: hash01(id, 2) < 0.5 ? 0 : 1,
  };
}

/** Vývraty smrště pro padlé kmeny (`FelledTrees.update`) – id stromů a směr stopy; jinak null. */
export function tornadoTrunks(
  tornado: { track: TornadoTrack; trunks?: readonly number[] } | undefined,
): { ids: readonly number[]; angle: number } | null {
  if (!tornado?.trunks?.length) return null;
  return { ids: tornado.trunks, angle: tornado.track.angle };
}
