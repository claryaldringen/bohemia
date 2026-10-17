import { SURFACE_CODES, type Landscape } from '@bohemia/game';
import { createNoise2D } from 'simplex-noise';
import type { ForestField } from './forest-field';
import {
  streamStations,
  type StreamCenterline,
  type StreamSample,
  type StreamStation,
} from './stream-geometry';
import type { Relief } from './terrain-relief';
import { tileAt } from './tile-at';
import type { TreePlacement } from './tree-placement';

/** Drobné modely krajiny bez herní funkce (jen vzhled). */
export type DecorModel =
  | 'reeds'
  | 'cattails'
  | 'lilies'
  | 'boulder'
  | 'stone-1'
  | 'stone-2'
  | 'willow'
  | 'underbrush-1'
  | 'underbrush-2'
  | 'shrub-1'
  | 'shrub-2'
  | 'shrub-3'
  | 'shrub-4'
  | 'shrub-5'
  | 'shrub-6'
  | 'shrub-7'
  | 'rock-boulder'
  | 'rock-ridge'
  | 'rock-tower'
  | 'rock-moss-1'
  | 'rock-moss-2'
  | 'snag-1'
  | 'snag-2'
  | 'snag-3'
  | 'snag-oak'
  | 'stump'
  | 'fallen-1'
  | 'fallen-2'
  | 'fallen-3'
  | 'log-water';
export const DECOR_MODELS: readonly DecorModel[] = [
  'reeds',
  'cattails',
  'lilies',
  'boulder',
  'stone-1',
  'stone-2',
  'willow',
  'underbrush-1',
  'underbrush-2',
  'shrub-1',
  'shrub-2',
  'shrub-3',
  'shrub-4',
  'shrub-5',
  'shrub-6',
  'shrub-7',
  'rock-boulder',
  'rock-ridge',
  'rock-tower',
  'rock-moss-1',
  'rock-moss-2',
  'snag-1',
  'snag-2',
  'snag-3',
  'snag-oak',
  'stump',
  'fallen-1',
  'fallen-2',
  'fallen-3',
  'log-water',
];

export interface DecorPlacement {
  model: DecorModel;
  worldX: number;
  worldZ: number;
  rotationY: number;
  scale: number;
  /** Hladina (m, bez převýšení) pro to, co plave na vodě; jinak stojí na terénu. */
  waterLevel?: number;
}

/** Krok podél osy potoka (m) pro shluky rákosí, leknínů a balvanů na břehu. */
const REED_STEP_M = 2.5;
const LILY_STEP_M = 6;
const BANK_BOULDER_STEP_M = 25;
/** Krok pro vrby na břehu (m) a jejich vzdálenost od okraje vody (m). */
const WILLOW_STEP_M = 13;
const WILLOW_BANK_M = { from: 3.5, to: 10 };
/** Pod touto rychlostí proudu je voda „klidná“ – lekníny, hustý rákos a orobinec. */
const CALM_SPEED = 0.35;
/** Rozteč kandidátních míst pro keře lesního lemu (m). */
const SHRUB_SPACING_M = 5;
/**
 * Keřový lem lesa (lesní plášť) podle vzdálenosti od hranice lesa (m, kladná v lese): husté
 * podrostové keře těsně před lesem a pod krajními stromy, menší keře před nimi a ojedinělé keře
 * v louce.
 */
const SHRUB_BANDS: readonly { from: number; to: number; chance: number; big: boolean }[] = [
  { from: -6, to: 8, chance: 0.8, big: true },
  { from: -12, to: -6, chance: 0.22, big: false },
  { from: -35, to: -12, chance: 0.006, big: false },
];
/** Rozteč kandidátních míst pro kameny v krajině (m). */
const STONE_SPACING_M = 40;
/** Skalní výchozy: rozteč kandidátních míst (m) a nejmenší „skalnatost“ (`Relief.rockinessAt`). */
const OUTCROP_SPACING_M = 14;
const OUTCROP_MIN_ROCKINESS = 0.45;
/** Keře v loukách: podíl osamělých stromů obrostlých keři; ostrůvky keřů (rozteč v m, šance). */
const TREE_SHRUB_CHANCE = 0.45;
const SHRUB_ISLAND_SPACING_M = 30;
const SHRUB_ISLAND_CHANCE = 0.035;
/** Bez dekorací mimo vodu do této vzdálenosti (políčka) od místa pro vesnici. */
const VILLAGE_CLEARING_TILES = 2;

/** Hash celočíselných souřadnic a pořadí → číslo v [0, 1). */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Co dalšího dekorace potřebují znát: tvar terénu a stromy v loukách. */
export interface DecorScenery {
  relief: Relief;
  /** Stromy mimo les (louky, břehy, borovice na skalách) – keře kolem nich, skály mimo kmeny. */
  trees: readonly TreePlacement[];
}

/**
 * Dekorace jako v generátoru 0 A.D.: rákos a orobinec ve shlucích na kraji koryta, lekníny
 * na hladině, skupiny vrb a balvany na břehu, keřový lem před lesem, keře kolem osamělých
 * stromů a v ostrůvcích, skalní výchozy na prudkých svazích a hřbetech a skupinky kamenů
 * v loukách a na okraji lesa – deterministicky.
 */
export function decorPlacements(
  l: Landscape,
  stream: StreamCenterline,
  field: ForestField,
  scenery: DecorScenery,
): DecorPlacement[] {
  const placements: DecorPlacement[] = [];
  const reedClumps = createNoise2D(seededRandom(0xdec0));
  const site = l.villageSite;
  const onLand = (x: number, z: number): boolean => {
    const tile = tileAt(l, x, z);
    if (!tile || l.surface[tile.y * l.size + tile.x] === SURFACE_CODES.water) return false;
    const nearVillage =
      Math.max(Math.abs(tile.x - site.x), Math.abs(tile.y - site.y)) <= VILLAGE_CLEARING_TILES;
    return !nearVillage;
  };
  const inMap = (x: number, z: number): boolean => tileAt(l, x, z) !== null;

  // Stav potoka u břehu na dané straně stanice: šířka, proud, tůň, strana oblouku.
  const bank = (station: StreamStation, side: number): StreamSample =>
    stream.nearest(station.x + station.nx * side * 0.5, station.z + station.nz * side * 0.5);

  // Rákos a orobinec: shluky na kraji vody. V klidné vodě, v tůních a na vnitřních obloucích
  // hustě (orobinec hlavně ve stojaté vodě), v rychlém proudu nad štěrkem řídce.
  for (const station of streamStations(stream, REED_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      const here = bank(station, side);
      const calm = 1 - here.speed;
      const shelter = calm * calm + 0.5 * here.pool + 0.3 * Math.max(0, here.innerBend) * calm;
      const density =
        (0.5 + 0.5 * reedClumps(station.s / 60, side * 10)) * Math.min(1.2, 0.08 + shelter);
      if (hash(k, 1, 11) >= 0.85 * density) continue;
      const offset = here.halfWidth + (hash(k, 2, 11) - 0.5) * 3;
      const cx = station.x + station.nx * side * offset;
      const cz = station.z + station.nz * side * offset;
      const count = 5 + Math.floor(hash(k, 3, 11) * 5);
      const cattailShare = 0.1 + 0.5 * calm * calm + 0.3 * here.pool;
      for (let i = 0; i < count; i++) {
        const angle = hash(k, 10 + i, 12) * Math.PI * 2;
        const radius = Math.sqrt(hash(k, 20 + i, 12)) * 2.4;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const d = stream.nearest(x, z).bankDistance;
        if (!inMap(x, z) || d < -2.5 || d > 3) continue;
        placements.push({
          model: hash(k, 30 + i, 12) < cattailShare ? 'cattails' : 'reeds',
          worldX: x,
          worldZ: z,
          rotationY: hash(k, 40 + i, 12) * Math.PI * 2,
          scale: 1 + hash(k, 50 + i, 12) * 0.6,
        });
      }
    }
  }

  // Lekníny jen v klidné vodě – hlavně v tůních, kde jich je víc.
  for (const station of streamStations(stream, LILY_STEP_M)) {
    const k = station.index;
    const side = hash(k, 2, 21) < 0.5 ? -1 : 1;
    const here = bank(station, side);
    if (here.speed >= CALM_SPEED) continue;
    if (hash(k, 1, 21) >= 0.12 + 0.6 * here.pool) continue;
    const count = 1 + Math.floor(hash(k, 4, 21) * (2 + 3 * here.pool));
    for (let i = 0; i < count; i++) {
      // Spíš ke břehu než doprostřed proudu.
      const offset = here.halfWidth * (0.35 + 0.5 * hash(k, 3 + i * 7, 21));
      const x = station.x + station.nx * side * offset + (hash(k, 10 + i, 22) - 0.5) * 3;
      const z = station.z + station.nz * side * offset + (hash(k, 20 + i, 22) - 0.5) * 3;
      const near = stream.nearest(x, z);
      if (!inMap(x, z) || near.bankDistance >= -1.5 || near.speed >= CALM_SPEED) continue;
      placements.push({
        model: 'lilies',
        worldX: x,
        worldZ: z,
        rotationY: hash(k, 30 + i, 22) * Math.PI * 2,
        scale: 0.8 + hash(k, 40 + i, 22) * 0.6,
        waterLevel: near.level,
      });
    }
  }

  const stone = (model: DecorModel, x: number, z: number, k: number, j: number): void => {
    if (!onLand(x, z)) return;
    if (stream.nearest(x, z).bankDistance <= 1) return;
    if (field.distanceAt(x, z) >= 8) return;
    placements.push({
      model,
      worldX: x,
      worldZ: z,
      rotationY: hash(k, j, 31) * Math.PI * 2,
      scale: 0.7 + hash(k, j + 1, 31) * 0.6,
    });
  };

  // Balvany na nárazovém (vnějším) břehu v rychlém proudu – proud tam odnesl hlínu.
  for (const station of streamStations(stream, BANK_BOULDER_STEP_M)) {
    const k = station.index;
    const side = hash(k, 2, 41) < 0.5 ? -1 : 1;
    const here = bank(station, side);
    const chance = 0.06 + 0.5 * here.speed * Math.max(0, -here.innerBend + 0.3);
    if (hash(k, 1, 41) >= chance) continue;
    const offset = here.halfWidth + 2 + hash(k, 3, 41) * 3;
    stone(
      'boulder',
      station.x + station.nx * side * offset,
      station.z + station.nz * side * offset,
      k,
      4,
    );
  }

  // Vrby: skupiny s mezerami (šum podél toku) u tůní a klidné vody, jen mimo les.
  const willowGroups = createNoise2D(seededRandom(0x5a11));
  for (const station of streamStations(stream, WILLOW_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      const here = bank(station, side);
      const liking = 0.15 + 0.45 * (1 - here.speed) + 0.4 * here.pool;
      if (willowGroups(station.s / 70, side * 7) < 0.2 || hash(k, 1, 61) >= 0.5 * liking) continue;
      const offset =
        here.halfWidth +
        WILLOW_BANK_M.from +
        hash(k, 2, 61) * (WILLOW_BANK_M.to - WILLOW_BANK_M.from);
      // Posun podél toku – stromy nestojí v pravidelné řadě.
      const along = (hash(k, 5, 61) - 0.5) * 10;
      const x = station.x + station.nx * side * offset - station.nz * along;
      const z = station.z + station.nz * side * offset + station.nx * along;
      const d = stream.nearest(x, z).bankDistance;
      if (d < 3 || d > 10) continue;
      if (!onLand(x, z) || field.distanceAt(x, z) >= -2) continue;
      placements.push({
        model: 'willow',
        worldX: x,
        worldZ: z,
        rotationY: hash(k, 3, 61) * Math.PI * 2,
        scale: 0.6 + hash(k, 4, 61) * 0.5,
      });
    }
  }

  const half = (l.size * l.cellSizeM) / 2;

  // Keřový lem: shluky s mezerami podle šumu, ne souvislá zeď.
  const shrubGaps = createNoise2D(seededRandom(0x5b0b));
  const shrubCells = Math.floor((l.size * l.cellSizeM) / SHRUB_SPACING_M);
  for (let gz = 0; gz < shrubCells; gz++) {
    for (let gx = 0; gx < shrubCells; gx++) {
      const x = -half + (gx + hash(gx, gz, 71)) * SHRUB_SPACING_M;
      const z = -half + (gz + hash(gx, gz, 72)) * SHRUB_SPACING_M;
      const d = field.distanceAt(x, z);
      const band = SHRUB_BANDS.find((b) => d >= b.from && d < b.to);
      if (!band) continue;
      const gaps =
        d < -12 ? 1 : Math.min(1.3, Math.max(0.15, 0.65 + 0.7 * shrubGaps(x / 50, z / 50)));
      if (hash(gx, gz, 73) >= band.chance * gaps) continue;
      if (!onLand(x, z) || stream.nearest(x, z).bankDistance <= 2) continue;
      placements.push({
        model: shrubModel(band.big, hash(gx, gz, 74)),
        worldX: x,
        worldZ: z,
        rotationY: hash(gx, gz, 75) * Math.PI * 2,
        scale: 0.75 + hash(gx, gz, 76) * 0.5,
      });
    }
  }

  // Skalní výchozy: kde se půda na prudkém svahu nebo ostrém hřbetu neudrží (jako útesy 0 A.D.),
  // vystupuje velká skála a kolem ní leží mechem porostlé balvany – mimo kmeny stromů (borovice).
  const clearOfTrees = (x: number, z: number, gapM: number): boolean =>
    scenery.trees.every((t) => Math.hypot(t.worldX - x, t.worldZ - z) >= gapM);
  const outcropCells = Math.floor((l.size * l.cellSizeM) / OUTCROP_SPACING_M);
  for (let gz = 0; gz < outcropCells; gz++) {
    for (let gx = 0; gx < outcropCells; gx++) {
      const x = -half + (gx + hash(gx, gz, 111)) * OUTCROP_SPACING_M;
      const z = -half + (gz + hash(gx, gz, 112)) * OUTCROP_SPACING_M;
      const rockiness = scenery.relief.rockinessAt(x, z);
      if (rockiness < OUTCROP_MIN_ROCKINESS || hash(gx, gz, 113) >= 0.4 * rockiness) continue;
      if (!onLand(x, z) || stream.nearest(x, z).bankDistance <= 4) continue;
      if (field.distanceAt(x, z) >= 6 || !clearOfTrees(x, z, 5)) continue;
      const pick = hash(gx, gz, 114);
      placements.push({
        model:
          rockiness > 0.85 && pick < 0.2
            ? 'rock-tower'
            : pick < 0.6
              ? 'rock-boulder'
              : 'rock-ridge',
        worldX: x,
        worldZ: z,
        rotationY: hash(gx, gz, 115) * Math.PI * 2,
        scale: 1 + hash(gx, gz, 116) * 0.8,
      });
      const k = gz * outcropCells + gx;
      const satellites = 1 + Math.floor(hash(gx, gz, 117) * 2);
      for (let i = 0; i < satellites; i++) {
        const angle = hash(k, i, 118) * Math.PI * 2;
        const radius = 5 + hash(k, i, 119) * 4;
        const sx = x + Math.cos(angle) * radius;
        const sz = z + Math.sin(angle) * radius;
        if (!onLand(sx, sz) || stream.nearest(sx, sz).bankDistance <= 3) continue;
        if (!clearOfTrees(sx, sz, 3)) continue;
        placements.push({
          model: hash(k, i, 120) < 0.5 ? 'rock-moss-1' : 'rock-moss-2',
          worldX: sx,
          worldZ: sz,
          rotationY: hash(k, i, 121) * Math.PI * 2,
          scale: 0.8 + hash(k, i, 122) * 0.6,
        });
      }
    }
  }

  // Keře v loukách: kolem části osamělých stromů (pastevní duby obrůstá hloh a trnka) a ostrůvky
  // keřů – víc na kamenitých stráních, které se nesečou.
  const meadowShrub = (x: number, z: number, k: number, j: number): void => {
    if (!onLand(x, z) || stream.nearest(x, z).bankDistance <= 2.5) return;
    if (field.distanceAt(x, z) >= -6) return;
    if (scenery.trees.some((t) => Math.hypot(t.worldX - x, t.worldZ - z) < 3)) return;
    placements.push({
      model: MEADOW_SHRUBS[Math.floor(hash(k, j, 131) * MEADOW_SHRUBS.length)]!,
      worldX: x,
      worldZ: z,
      rotationY: hash(k, j, 132) * Math.PI * 2,
      scale: 0.9 + hash(k, j, 133) * 0.6,
    });
  };
  scenery.trees.forEach((tree, k) => {
    if (hash(k, 0, 134) >= TREE_SHRUB_CHANCE) return;
    const count = 1 + Math.floor(hash(k, 1, 134) * 3);
    let angle = hash(k, 2, 134) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      angle += 0.6 + hash(k, 10 + i, 134) * 0.9;
      // Na okraji koruny – pod ní by keř nebyl vidět.
      const radius = 6.5 + hash(k, 20 + i, 134) * 4;
      meadowShrub(
        tree.worldX + Math.cos(angle) * radius,
        tree.worldZ + Math.sin(angle) * radius,
        k,
        30 + i,
      );
    }
  });
  const islandCells = Math.floor((l.size * l.cellSizeM) / SHRUB_ISLAND_SPACING_M);
  for (let gz = 0; gz < islandCells; gz++) {
    for (let gx = 0; gx < islandCells; gx++) {
      const cx = -half + (gx + hash(gx, gz, 141)) * SHRUB_ISLAND_SPACING_M;
      const cz = -half + (gz + hash(gx, gz, 142)) * SHRUB_ISLAND_SPACING_M;
      const chance = SHRUB_ISLAND_CHANCE * (0.7 + 2 * scenery.relief.rockinessAt(cx, cz));
      if (hash(gx, gz, 143) >= chance) continue;
      const k = 100000 + gz * islandCells + gx;
      const count = 3 + Math.floor(hash(gx, gz, 144) * 5);
      for (let i = 0; i < count; i++) {
        const angle = hash(k, i, 145) * Math.PI * 2;
        const radius = i === 0 ? 0 : 1.5 + hash(k, i, 146) * 4.5;
        meadowShrub(cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius, k, 50 + i);
      }
    }
  }

  const cells = Math.floor((l.size * l.cellSizeM) / STONE_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const k = gz * cells + gx;
      if (hash(gx, gz, 51) >= 0.12) continue;
      const cx = -half + (gx + hash(gx, gz, 52)) * STONE_SPACING_M;
      const cz = -half + (gz + hash(gx, gz, 53)) * STONE_SPACING_M;
      stone(hash(gx, gz, 54) < 0.3 ? 'boulder' : 'stone-1', cx, cz, k, 0);
      const small = 1 + Math.floor(hash(gx, gz, 55) * 3);
      for (let i = 0; i < small; i++) {
        const angle = hash(k, 60 + i, 56) * Math.PI * 2;
        const radius = 1.5 + hash(k, 70 + i, 56) * 2.5;
        stone(
          'stone-2',
          cx + Math.cos(angle) * radius,
          cz + Math.sin(angle) * radius,
          k,
          80 + i * 2,
        );
      }
    }
  }
  return placements;
}

/** Keře v loukách (hloh, trnka, šípek) – jiné tvary než keřový lem lesa. */
const MEADOW_SHRUBS: readonly DecorModel[] = ['shrub-4', 'shrub-5', 'shrub-6', 'shrub-7'];

/** U lesa velké podrostové keře (buk, dub), dál do louky menší keře. */
function shrubModel(big: boolean, pick: number): DecorModel {
  if (big) return pick < 0.5 ? 'underbrush-1' : pick < 0.85 ? 'underbrush-2' : 'shrub-1';
  return pick < 0.4 ? 'shrub-1' : pick < 0.7 ? 'shrub-2' : 'shrub-3';
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return state / 4294967296;
  };
}
