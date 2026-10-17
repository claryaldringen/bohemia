import { createNoise2D } from 'simplex-noise';
import { detCos, detSin, length2, noiseRandom, smoothstep } from '../det-math';
import { tileCenterWorld } from '../world';
import { hashFor, onLandAwayFromVillage, seedFor, type ScatterContext } from './context';
import { obstacleId, type DecorObstacleLook, type ObstaclePlacement, type TreeLook } from './types';

/** Borovice: rozteč kandidátních míst (m), od jaké „skalnatosti“ rostou na skalách. */
const PINE_SPACING_M = 16;
const PINE_MIN_ROCKINESS = 0.35;
/** Nejmenší rozestup kmenů borovic od sebe a od stromů v loukách (m). */
const PINE_GAP_M = 6;
/** Mladé stromky: rozteč kandidátních míst skupinek (m) a pásmo před lesem (m od hranice). */
const YOUNG_SPACING_M = 12;
const YOUNG_BAND = { from: -16, to: -2 };
/** Souše a padlé stromy: rozteč kandidátních míst (m). */
const DEADWOOD_SPACING_M = 22;
/** Pařezy po kácení: rozteč (m) a jak daleko od vesnice se kácelo (m). */
const STUMP_SPACING_M = 9;
const STUMP_REACH_M = 320;

/**
 * Borovice na skalách a suchých hřbetech – jako reliktní bory na skalkách: kde je půda tenká,
 * listnáče neprosperují. V lese ne (vnitřek tvoří impostory bez borovic), mimo stromy v loukách.
 */
export function pinePlacements(
  ctx: ScatterContext,
  existing: readonly ObstaclePlacement[],
): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { field, stream, relief } = ctx;
  const hash = hashFor(ctx, 'pines');
  const placements: ObstaclePlacement[] = [];
  const suits = (x: number, z: number): boolean =>
    relief.rockinessAt(x, z) >= PINE_MIN_ROCKINESS ||
    (relief.convexityAt(x, z) > 0.5 && relief.sunwardAt(x, z) > 0.02);
  const free = (x: number, z: number): boolean =>
    existing.every((t) => length2(t.x - x, t.z - z) >= PINE_GAP_M) &&
    placements.every((t) => length2(t.x - x, t.z - z) >= PINE_GAP_M);
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / PINE_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = -half + (gx + hash(gx, gz, 201)) * PINE_SPACING_M;
      const cz = -half + (gz + hash(gx, gz, 202)) * PINE_SPACING_M;
      const rockiness = relief.rockinessAt(cx, cz);
      const chance = rockiness >= PINE_MIN_ROCKINESS ? 0.3 * rockiness : suits(cx, cz) ? 0.06 : 0;
      if (hash(gx, gz, 203) >= chance) continue;
      const k = gz * cells + gx;
      const count = 1 + Math.floor(hash(gx, gz, 204) * 3);
      for (let i = 0; i < count; i++) {
        const angle = hash(k, i, 205) * Math.PI * 2;
        const radius = i === 0 ? 0 : 6 + hash(k, i, 206) * 4;
        const x = cx + detCos(angle) * radius;
        const z = cz + detSin(angle) * radius;
        if (!suits(x, z) || field.distanceAt(x, z) >= 10 || !onLandAwayFromVillage(l, x, z)) {
          continue;
        }
        if (stream.nearest(x, z).bankDistance <= 4 || !free(x, z)) continue;
        placements.push({
          id: obstacleId('pine', k, i),
          kind: 'tree',
          look: `pine-${1 + Math.floor(hash(k, i, 207) * 3)}` as TreeLook,
          x,
          z,
          rotation: hash(k, i, 208) * Math.PI * 2,
          scale: 0.75 + hash(k, i, 209) * 0.4,
        });
      }
    }
  }
  return placements;
}

/** Mladé stromky před lesem: pionýrské břízy a duby, mladé jedle, trochu buku. */
const YOUNG_SPECIES: readonly { share: number; looks: readonly TreeLook[] }[] = [
  { share: 0.35, looks: ['birch-1', 'birch-2'] },
  { share: 0.25, looks: ['oak-1', 'oak-2'] },
  { share: 0.3, looks: ['fir-young-1', 'fir-young-2'] },
  { share: 0.1, looks: ['beech-1', 'beech-2'] },
];

/**
 * Mladé stromky ve skupinkách před okrajem lesa – louka, kterou se nikdo nepase ani neseče,
 * zarůstá od lesa (sukcese). Skupinky s mezerami podle šumu, ne souvislý pás.
 */
export function youngTreePlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { field, stream } = ctx;
  const hash = hashFor(ctx, 'young-trees');
  const placements: ObstaclePlacement[] = [];
  const thickets = createNoise2D(noiseRandom(seedFor(ctx, 'young-thickets')));
  const half = (l.size * l.cellSizeM) / 2;
  const cells = Math.floor((l.size * l.cellSizeM) / YOUNG_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = -half + (gx + hash(gx, gz, 301)) * YOUNG_SPACING_M;
      const cz = -half + (gz + hash(gx, gz, 302)) * YOUNG_SPACING_M;
      const d = field.distanceAt(cx, cz);
      if (d < YOUNG_BAND.from || d >= YOUNG_BAND.to) continue;
      if (thickets(cx / 80, cz / 80) < 0.1 || hash(gx, gz, 303) >= 0.35) continue;
      const k = gz * cells + gx;
      const count = 2 + Math.floor(hash(gx, gz, 304) * 4);
      for (let i = 0; i < count; i++) {
        const angle = hash(k, i, 305) * Math.PI * 2;
        const radius = i === 0 ? 0 : 2 + hash(k, i, 306) * 4;
        const x = cx + detCos(angle) * radius;
        const z = cz + detSin(angle) * radius;
        const here = field.distanceAt(x, z);
        if (here < YOUNG_BAND.from || here >= YOUNG_BAND.to || !onLandAwayFromVillage(l, x, z)) {
          continue;
        }
        if (stream.nearest(x, z).bankDistance <= 3) continue;
        if (placements.some((t) => length2(t.x - x, t.z - z) < 2.5)) continue;
        const look = pickYoung(hash(k, i, 307), hash(k, i, 308));
        placements.push({
          id: obstacleId('youngTree', k, i),
          kind: 'youngTree',
          look,
          x,
          z,
          rotation: hash(k, i, 309) * Math.PI * 2,
          // Mladé jedle mají model v plné velikosti, listnáče okraje se zmenší na pár metrů.
          scale: look.startsWith('fir-young')
            ? 0.8 + hash(k, i, 310) * 0.5
            : 0.3 + hash(k, i, 310) * 0.15,
        });
      }
    }
  }
  return placements;
}

function pickYoung(kind: number, variant: number): TreeLook {
  let edge = 0;
  for (const species of YOUNG_SPECIES) {
    edge += species.share;
    if (kind < edge) return species.looks[variant < 0.5 ? 0 : 1]!;
  }
  return YOUNG_SPECIES[0]!.looks[0]!;
}

const SNAGS: readonly DecorObstacleLook[] = ['snag-1', 'snag-2', 'snag-3', 'snag-oak'];
const FALLEN: readonly DecorObstacleLook[] = ['fallen-1', 'fallen-2', 'fallen-3'];

/**
 * Mrtvé dřevo: souše a padlé stromy na okraji lesa (les nikdo nečistí), ojediněle souš v louce
 * a pařezy po kácení u lesa nedaleko vesnice. (Kmeny spadlé do potoka jsou jen ozdoba scény.)
 */
export function deadwoodPlacements(ctx: ScatterContext): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { field, stream } = ctx;
  const snagHash = hashFor(ctx, 'snags');
  const fallenHash = hashFor(ctx, 'fallen-trees');
  const stumpHash = hashFor(ctx, 'stumps');
  const placements: ObstaclePlacement[] = [];
  const half = (l.size * l.cellSizeM) / 2;
  const extent = l.size * l.cellSizeM;
  const dryLand = (x: number, z: number, bankM: number): boolean =>
    onLandAwayFromVillage(l, x, z) && stream.nearest(x, z).bankDistance > bankM;

  const cells = Math.floor(extent / DEADWOOD_SPACING_M);
  const snags: ObstaclePlacement[] = [];
  const fallen: ObstaclePlacement[] = [];
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const cell = gz * cells + gx;
      // Souše: na okraji lesa, v louce jen výjimečně.
      const sx = -half + (gx + snagHash(gx, gz, 401)) * DEADWOOD_SPACING_M;
      const sz = -half + (gz + snagHash(gx, gz, 402)) * DEADWOOD_SPACING_M;
      const sd = field.distanceAt(sx, sz);
      const snagChance = sd >= -4 && sd < 14 ? 0.04 : sd < -20 && sd >= -60 ? 0.003 : 0;
      if (snagHash(gx, gz, 403) < snagChance && dryLand(sx, sz, 3)) {
        snags.push({
          id: obstacleId('snag', cell),
          kind: 'snag',
          look: SNAGS[Math.floor(snagHash(gx, gz, 404) * SNAGS.length)]!,
          x: sx,
          z: sz,
          rotation: snagHash(gx, gz, 405) * Math.PI * 2,
          scale: 0.85 + snagHash(gx, gz, 406) * 0.3,
        });
      }
      // Padlé stromy: na okraji lesa a těsně před ním.
      const fx = -half + (gx + fallenHash(gx, gz, 411)) * DEADWOOD_SPACING_M;
      const fz = -half + (gz + fallenHash(gx, gz, 412)) * DEADWOOD_SPACING_M;
      const fd = field.distanceAt(fx, fz);
      if (fd >= -8 && fd < 12 && fallenHash(gx, gz, 413) < 0.035 && dryLand(fx, fz, 4)) {
        fallen.push({
          id: obstacleId('fallenTree', cell),
          kind: 'fallenTree',
          look: FALLEN[Math.floor(fallenHash(gx, gz, 414) * FALLEN.length)]!,
          x: fx,
          z: fz,
          rotation: fallenHash(gx, gz, 415) * Math.PI * 2,
          scale: 0.85 + fallenHash(gx, gz, 416) * 0.3,
        });
      }
    }
  }
  placements.push(...snags, ...fallen);

  // Pařezy: vesničané kácejí nejblíž u vesnice, dál od ní pařezů ubývá.
  const site = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
  const stumpCells = Math.floor(extent / STUMP_SPACING_M);
  for (let gz = 0; gz < stumpCells; gz++) {
    for (let gx = 0; gx < stumpCells; gx++) {
      const x = -half + (gx + stumpHash(gx, gz, 421)) * STUMP_SPACING_M;
      const z = -half + (gz + stumpHash(gx, gz, 422)) * STUMP_SPACING_M;
      const fromVillage = length2(x - site.x, z - site.z);
      if (fromVillage >= STUMP_REACH_M) continue;
      const d = field.distanceAt(x, z);
      if (d >= 0 || d <= -40) continue;
      // Nejvíc těsně před lesem (−d = vzdálenost od lesa do louky), dál do louky ubývají.
      const chance = 0.12 * (1 - fromVillage / STUMP_REACH_M) * (1 - smoothstep(5, 40, -d));
      if (stumpHash(gx, gz, 423) >= chance || !dryLand(x, z, 2)) continue;
      placements.push({
        id: obstacleId('stump', gz * stumpCells + gx),
        kind: 'stump',
        look: 'stump',
        x,
        z,
        rotation: stumpHash(gx, gz, 424) * Math.PI * 2,
        scale: 0.8 + stumpHash(gx, gz, 425) * 0.5,
      });
    }
  }
  return placements;
}
