import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { DecorModel, DecorPlacement } from './decor-placement';
import type { ForestField } from './forest-field';
import { streamStations, type StreamCenterline } from './stream-geometry';
import type { Relief } from './terrain-relief';
import { tileAt, tileCenter } from './tile-at';
import type { TreeModel, TreePlacement } from './tree-placement';

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
/** Kmeny v potoce: krok podél osy (m). */
const LOG_STEP_M = 35;
/** Bez stromů a dřeva do této vzdálenosti (políčka) od místa pro vesnici. */
const VILLAGE_CLEARING_TILES = 2;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). Stejná krajina = stejné rozmístění. */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Na souši (ne ve vodě) a mimo místo pro vesnici. */
function onLand(l: Landscape, x: number, z: number): boolean {
  const tile = tileAt(l, x, z);
  if (!tile || l.surface[tile.y * l.size + tile.x] === SURFACE_CODES.water) return false;
  const site = l.villageSite;
  return Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) > VILLAGE_CLEARING_TILES;
}

/**
 * Borovice na skalách a suchých hřbetech – jako reliktní bory na skalkách: kde je půda tenká,
 * listnáče neprosperují. V lese ne (vnitřek tvoří impostory bez borovic), mimo stromy v loukách.
 */
export function pinePlacements(
  l: Landscape,
  field: ForestField,
  stream: StreamCenterline,
  relief: Relief,
  existing: readonly TreePlacement[],
): TreePlacement[] {
  const placements: TreePlacement[] = [];
  const suits = (x: number, z: number): boolean =>
    relief.rockinessAt(x, z) >= PINE_MIN_ROCKINESS ||
    (relief.convexityAt(x, z) > 0.5 && relief.sunwardAt(x, z) > 0.02);
  const free = (x: number, z: number): boolean =>
    [...existing, ...placements].every((t) => Math.hypot(t.worldX - x, t.worldZ - z) >= PINE_GAP_M);
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
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        if (!suits(x, z) || field.distanceAt(x, z) >= 10 || !onLand(l, x, z)) continue;
        if (stream.nearest(x, z).bankDistance <= 4 || !free(x, z)) continue;
        placements.push({
          model: `pine-${1 + Math.floor(hash(k, i, 207) * 3)}` as TreeModel,
          worldX: x,
          worldZ: z,
          rotationY: hash(k, i, 208) * Math.PI * 2,
          scale: 0.75 + hash(k, i, 209) * 0.4,
        });
      }
    }
  }
  return placements;
}

/** Mladé stromky před lesem: pionýrské břízy a duby, mladé jedle, trochu buku. */
const YOUNG_SPECIES: readonly { share: number; models: readonly TreeModel[] }[] = [
  { share: 0.35, models: ['birch-1', 'birch-2'] },
  { share: 0.25, models: ['oak-1', 'oak-2'] },
  { share: 0.3, models: ['fir-young-1', 'fir-young-2'] },
  { share: 0.1, models: ['beech-1', 'beech-2'] },
];

/**
 * Mladé stromky ve skupinkách před okrajem lesa – louka, kterou se nikdo nepase ani neseče,
 * zarůstá od lesa (sukcese). Skupinky s mezerami podle šumu, ne souvislý pás.
 */
export function youngTreePlacements(
  l: Landscape,
  field: ForestField,
  stream: StreamCenterline,
): TreePlacement[] {
  const placements: TreePlacement[] = [];
  const thickets = createNoise2D(seededRandom(0x7041));
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
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const here = field.distanceAt(x, z);
        if (here < YOUNG_BAND.from || here >= YOUNG_BAND.to || !onLand(l, x, z)) continue;
        if (stream.nearest(x, z).bankDistance <= 3) continue;
        if (placements.some((t) => Math.hypot(t.worldX - x, t.worldZ - z) < 2.5)) continue;
        const model = pickYoung(hash(k, i, 307), hash(k, i, 308));
        placements.push({
          model,
          worldX: x,
          worldZ: z,
          rotationY: hash(k, i, 309) * Math.PI * 2,
          // Mladé jedle mají model v plné velikosti, listnáče okraje se zmenší na pár metrů.
          scale: model.startsWith('fir-young')
            ? 0.8 + hash(k, i, 310) * 0.5
            : 0.3 + hash(k, i, 310) * 0.15,
        });
      }
    }
  }
  return placements;
}

function pickYoung(kind: number, variant: number): TreeModel {
  let edge = 0;
  for (const species of YOUNG_SPECIES) {
    edge += species.share;
    if (kind < edge) return species.models[variant < 0.5 ? 0 : 1]!;
  }
  return YOUNG_SPECIES[0]!.models[0]!;
}

/**
 * Mrtvé dřevo: souše a padlé stromy na okraji lesa (les nikdo nečistí), ojediněle souš v louce,
 * pařezy po kácení u lesa nedaleko vesnice a kmeny spadlé do klidné vody potoka.
 */
export function deadwoodPlacements(
  l: Landscape,
  field: ForestField,
  stream: StreamCenterline,
): DecorPlacement[] {
  const placements: DecorPlacement[] = [];
  const half = (l.size * l.cellSizeM) / 2;
  const extent = l.size * l.cellSizeM;
  const dryLand = (x: number, z: number, bankM: number): boolean =>
    onLand(l, x, z) && stream.nearest(x, z).bankDistance > bankM;

  const cells = Math.floor(extent / DEADWOOD_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      // Souše: na okraji lesa, v louce jen výjimečně.
      const sx = -half + (gx + hash(gx, gz, 401)) * DEADWOOD_SPACING_M;
      const sz = -half + (gz + hash(gx, gz, 402)) * DEADWOOD_SPACING_M;
      const sd = field.distanceAt(sx, sz);
      const snagChance = sd >= -4 && sd < 14 ? 0.04 : sd < -20 && sd >= -60 ? 0.003 : 0;
      if (hash(gx, gz, 403) < snagChance && dryLand(sx, sz, 3)) {
        placements.push({
          model: SNAGS[Math.floor(hash(gx, gz, 404) * SNAGS.length)]!,
          worldX: sx,
          worldZ: sz,
          rotationY: hash(gx, gz, 405) * Math.PI * 2,
          scale: 0.85 + hash(gx, gz, 406) * 0.3,
        });
      }
      // Padlé stromy: na okraji lesa a těsně před ním.
      const fx = -half + (gx + hash(gx, gz, 411)) * DEADWOOD_SPACING_M;
      const fz = -half + (gz + hash(gx, gz, 412)) * DEADWOOD_SPACING_M;
      const fd = field.distanceAt(fx, fz);
      if (fd >= -8 && fd < 12 && hash(gx, gz, 413) < 0.035 && dryLand(fx, fz, 4)) {
        placements.push({
          model: FALLEN[Math.floor(hash(gx, gz, 414) * FALLEN.length)]!,
          worldX: fx,
          worldZ: fz,
          rotationY: hash(gx, gz, 415) * Math.PI * 2,
          scale: 0.85 + hash(gx, gz, 416) * 0.3,
        });
      }
    }
  }

  // Pařezy: vesničané kácejí nejblíž u vesnice, dál od ní pařezů ubývá.
  const site = tileCenter(l, l.villageSite.x, l.villageSite.y);
  const stumpCells = Math.floor(extent / STUMP_SPACING_M);
  for (let gz = 0; gz < stumpCells; gz++) {
    for (let gx = 0; gx < stumpCells; gx++) {
      const x = -half + (gx + hash(gx, gz, 421)) * STUMP_SPACING_M;
      const z = -half + (gz + hash(gx, gz, 422)) * STUMP_SPACING_M;
      const fromVillage = Math.hypot(x - site.worldX, z - site.worldZ);
      if (fromVillage >= STUMP_REACH_M) continue;
      const d = field.distanceAt(x, z);
      if (d >= 0 || d <= -40) continue;
      // Nejvíc těsně před lesem (−d = vzdálenost od lesa do louky), dál do louky ubývají.
      const chance = 0.12 * (1 - fromVillage / STUMP_REACH_M) * (1 - smoothstep(5, 40, -d));
      if (hash(gx, gz, 423) >= chance || !dryLand(x, z, 2)) continue;
      placements.push({
        model: 'stump',
        worldX: x,
        worldZ: z,
        rotationY: hash(gx, gz, 424) * Math.PI * 2,
        scale: 0.8 + hash(gx, gz, 425) * 0.5,
      });
    }
  }

  // Kmeny v potoce: v klidné vodě u břehu, v tůních častěji, natočené zhruba po proudu.
  for (const station of streamStations(stream, LOG_STEP_M)) {
    const k = station.index;
    const side = hash(k, 1, 431) < 0.5 ? -1 : 1;
    const bank = stream.nearest(
      station.x + station.nx * side * 0.5,
      station.z + station.nz * side * 0.5,
    );
    if (bank.speed >= 0.45 || hash(k, 2, 431) >= 0.2 + 0.4 * bank.pool) continue;
    const offset = Math.max(0, bank.halfWidth - 1.5 - hash(k, 3, 431));
    const x = station.x + station.nx * side * offset;
    const z = station.z + station.nz * side * offset;
    const near = stream.nearest(x, z);
    if (!tileAt(l, x, z) || near.bankDistance >= -0.5 || near.speed >= 0.5) continue;
    placements.push({
      model: 'log-water',
      worldX: x,
      worldZ: z,
      rotationY: Math.atan2(near.flowX, near.flowZ) + (hash(k, 4, 431) - 0.5) * 1.2,
      scale: 0.8 + hash(k, 5, 431) * 0.4,
      waterLevel: near.level,
    });
  }
  return placements;
}

const SNAGS: readonly DecorModel[] = ['snag-1', 'snag-2', 'snag-3', 'snag-oak'];
const FALLEN: readonly DecorModel[] = ['fallen-1', 'fallen-2', 'fallen-3'];

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
