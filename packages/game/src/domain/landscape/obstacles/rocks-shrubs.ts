import { createNoise2D } from 'simplex-noise';
import { detCos, detSin, length2, noiseRandom } from '../det-math';
import { streamStations, type StreamSample, type StreamStation } from '../stream-geometry';
import { hashFor, onLandAwayFromVillage, seedFor, type ScatterContext } from './context';
import {
  obstacleId,
  type DecorObstacleLook,
  type ObstacleKind,
  type ObstaclePlacement,
} from './types';

/** Krok podél osy potoka (m) pro balvany na nárazovém břehu. */
const BANK_BOULDER_STEP_M = 25;
/** Krok pro vrby na břehu (m) a jejich vzdálenost od okraje vody (m). */
const WILLOW_STEP_M = 13;
const WILLOW_BANK_M = { from: 3.5, to: 10 };
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
/** Mřížka (m), podle které dostanou keře kolem stromů stabilní id. */
const TREE_SHRUB_CELL_M = 4;

/** Keře v loukách (hloh, trnka, šípek) – jiné tvary než keřový lem lesa. */
const MEADOW_SHRUBS: readonly DecorObstacleLook[] = ['shrub-4', 'shrub-5', 'shrub-6', 'shrub-7'];

/** Druh překážky podle modelu kamene. */
function stoneKind(look: DecorObstacleLook): ObstacleKind {
  if (look === 'stone-1' || look === 'stone-2') return 'stone';
  if (look === 'rock-boulder' || look === 'rock-ridge' || look === 'rock-tower') return 'outcrop';
  return 'boulder';
}

/**
 * Kameny, skály, keře a vrby jako v generátoru 0 A.D.: skupiny vrb a balvany na břehu, keřový
 * lem před lesem, keře kolem osamělých stromů a v ostrůvcích, skalní výchozy na prudkých
 * svazích a hřbetech a skupinky kamenů v loukách a na okraji lesa – deterministicky.
 * `trees` = stromy mimo les (louky, břehy, borovice) – keře kolem nich, skály mimo kmeny.
 */
export function rockAndShrubPlacements(
  ctx: ScatterContext,
  trees: readonly ObstaclePlacement[],
): ObstaclePlacement[] {
  const l = ctx.landscape;
  const { field, stream, relief } = ctx;
  const onLand = (x: number, z: number): boolean => onLandAwayFromVillage(l, x, z);
  const half = (l.size * l.cellSizeM) / 2;
  // Stav potoka u břehu na dané straně stanice: šířka, proud, tůň, strana oblouku.
  const bank = (station: StreamStation, side: number): StreamSample =>
    stream.nearest(station.x + station.nx * side * 0.5, station.z + station.nz * side * 0.5);

  const bySource: Record<
    'shrubBelt' | 'treeShrub' | 'shrubIsland' | 'outcrop' | 'bankBoulder' | 'stone' | 'willow',
    ObstaclePlacement[]
  > = {
    shrubBelt: [],
    treeShrub: [],
    shrubIsland: [],
    outcrop: [],
    bankBoulder: [],
    stone: [],
    willow: [],
  };

  const stoneHash = hashFor(ctx, 'stones');
  /** Kámen nebo balvan na souši mimo koryto a mimo hluboký les. */
  const stone = (
    list: ObstaclePlacement[],
    id: number,
    look: DecorObstacleLook,
    x: number,
    z: number,
    k: number,
    j: number,
  ): void => {
    if (!onLand(x, z)) return;
    if (stream.nearest(x, z).bankDistance <= 1) return;
    if (field.distanceAt(x, z) >= 8) return;
    list.push({
      id,
      kind: stoneKind(look),
      look,
      x,
      z,
      rotation: stoneHash(k, j, 31) * Math.PI * 2,
      scale: 0.7 + stoneHash(k, j + 1, 31) * 0.6,
    });
  };

  // Balvany na nárazovém (vnějším) břehu v rychlém proudu – proud tam odnesl hlínu.
  const boulderHash = hashFor(ctx, 'bank-boulders');
  for (const station of streamStations(stream, BANK_BOULDER_STEP_M)) {
    const k = station.index;
    const side = boulderHash(k, 2, 41) < 0.5 ? -1 : 1;
    const here = bank(station, side);
    const chance = 0.06 + 0.5 * here.speed * Math.max(0, -here.innerBend + 0.3);
    if (boulderHash(k, 1, 41) >= chance) continue;
    const offset = here.halfWidth + 2 + boulderHash(k, 3, 41) * 3;
    stone(
      bySource.bankBoulder,
      obstacleId('bankBoulder', k),
      'boulder',
      station.x + station.nx * side * offset,
      station.z + station.nz * side * offset,
      k,
      4,
    );
  }

  // Vrby: skupiny s mezerami (šum podél toku) u tůní a klidné vody, jen mimo les.
  const willowHash = hashFor(ctx, 'willows');
  const willowGroups = createNoise2D(noiseRandom(seedFor(ctx, 'willow-groups')));
  for (const station of streamStations(stream, WILLOW_STEP_M)) {
    for (const side of [-1, 1]) {
      const k = station.index * 2 + (side > 0 ? 1 : 0);
      const here = bank(station, side);
      const liking = 0.15 + 0.45 * (1 - here.speed) + 0.4 * here.pool;
      if (willowGroups(station.s / 70, side * 7) < 0.2 || willowHash(k, 1, 61) >= 0.5 * liking) {
        continue;
      }
      const offset =
        here.halfWidth +
        WILLOW_BANK_M.from +
        willowHash(k, 2, 61) * (WILLOW_BANK_M.to - WILLOW_BANK_M.from);
      // Posun podél toku – stromy nestojí v pravidelné řadě.
      const along = (willowHash(k, 5, 61) - 0.5) * 10;
      const x = station.x + station.nx * side * offset - station.nz * along;
      const z = station.z + station.nz * side * offset + station.nx * along;
      const d = stream.nearest(x, z).bankDistance;
      if (d < 3 || d > 10) continue;
      if (!onLand(x, z) || field.distanceAt(x, z) >= -2) continue;
      bySource.willow.push({
        id: obstacleId('willow', k),
        kind: 'tree',
        look: 'willow',
        x,
        z,
        rotation: willowHash(k, 3, 61) * Math.PI * 2,
        scale: 0.6 + willowHash(k, 4, 61) * 0.5,
      });
    }
  }

  // Keřový lem: shluky s mezerami podle šumu, ne souvislá zeď.
  const beltHash = hashFor(ctx, 'shrub-belt');
  const shrubGaps = createNoise2D(noiseRandom(seedFor(ctx, 'shrub-gaps')));
  const shrubCells = Math.floor((l.size * l.cellSizeM) / SHRUB_SPACING_M);
  for (let gz = 0; gz < shrubCells; gz++) {
    for (let gx = 0; gx < shrubCells; gx++) {
      const x = -half + (gx + beltHash(gx, gz, 71)) * SHRUB_SPACING_M;
      const z = -half + (gz + beltHash(gx, gz, 72)) * SHRUB_SPACING_M;
      const d = field.distanceAt(x, z);
      const band = SHRUB_BANDS.find((b) => d >= b.from && d < b.to);
      if (!band) continue;
      const gaps =
        d < -12 ? 1 : Math.min(1.3, Math.max(0.15, 0.65 + 0.7 * shrubGaps(x / 50, z / 50)));
      if (beltHash(gx, gz, 73) >= band.chance * gaps) continue;
      if (!onLand(x, z) || stream.nearest(x, z).bankDistance <= 2) continue;
      bySource.shrubBelt.push({
        id: obstacleId('shrubBelt', gz * shrubCells + gx),
        kind: 'shrub',
        look: beltShrubLook(band.big, beltHash(gx, gz, 74)),
        x,
        z,
        rotation: beltHash(gx, gz, 75) * Math.PI * 2,
        scale: 0.75 + beltHash(gx, gz, 76) * 0.5,
      });
    }
  }

  // Skalní výchozy: kde se půda na prudkém svahu nebo ostrém hřbetu neudrží (jako útesy 0 A.D.),
  // vystupuje velká skála a kolem ní leží mechem porostlé balvany – mimo kmeny stromů (borovice).
  const outcropHash = hashFor(ctx, 'outcrops');
  const clearOfTrees = (x: number, z: number, gapM: number): boolean =>
    trees.every((t) => length2(t.x - x, t.z - z) >= gapM);
  const outcropCells = Math.floor((l.size * l.cellSizeM) / OUTCROP_SPACING_M);
  for (let gz = 0; gz < outcropCells; gz++) {
    for (let gx = 0; gx < outcropCells; gx++) {
      const x = -half + (gx + outcropHash(gx, gz, 111)) * OUTCROP_SPACING_M;
      const z = -half + (gz + outcropHash(gx, gz, 112)) * OUTCROP_SPACING_M;
      const rockiness = relief.rockinessAt(x, z);
      if (rockiness < OUTCROP_MIN_ROCKINESS || outcropHash(gx, gz, 113) >= 0.4 * rockiness) {
        continue;
      }
      if (!onLand(x, z) || stream.nearest(x, z).bankDistance <= 4) continue;
      if (field.distanceAt(x, z) >= 6 || !clearOfTrees(x, z, 5)) continue;
      const cell = gz * outcropCells + gx;
      const pick = outcropHash(gx, gz, 114);
      const look: DecorObstacleLook =
        rockiness > 0.85 && pick < 0.2 ? 'rock-tower' : pick < 0.6 ? 'rock-boulder' : 'rock-ridge';
      bySource.outcrop.push({
        id: obstacleId('outcrop', cell, 0),
        kind: 'outcrop',
        look,
        x,
        z,
        rotation: outcropHash(gx, gz, 115) * Math.PI * 2,
        scale: 1 + outcropHash(gx, gz, 116) * 0.8,
      });
      const satellites = 1 + Math.floor(outcropHash(gx, gz, 117) * 2);
      for (let i = 0; i < satellites; i++) {
        const angle = outcropHash(cell, i, 118) * Math.PI * 2;
        const radius = 5 + outcropHash(cell, i, 119) * 4;
        const sx = x + detCos(angle) * radius;
        const sz = z + detSin(angle) * radius;
        if (!onLand(sx, sz) || stream.nearest(sx, sz).bankDistance <= 3) continue;
        if (!clearOfTrees(sx, sz, 3)) continue;
        bySource.outcrop.push({
          id: obstacleId('outcrop', cell, 1 + i),
          kind: 'boulder',
          look: outcropHash(cell, i, 120) < 0.5 ? 'rock-moss-1' : 'rock-moss-2',
          x: sx,
          z: sz,
          rotation: outcropHash(cell, i, 121) * Math.PI * 2,
          scale: 0.8 + outcropHash(cell, i, 122) * 0.6,
        });
      }
    }
  }

  // Keře v loukách: kolem části osamělých stromů (pastevní duby obrůstá hloh a trnka) a ostrůvky
  // keřů – víc na kamenitých stráních, které se nesečou.
  const shrubHash = hashFor(ctx, 'meadow-shrubs');
  const shrubFits = (x: number, z: number): boolean =>
    onLand(x, z) &&
    stream.nearest(x, z).bankDistance > 2.5 &&
    field.distanceAt(x, z) < -6 &&
    trees.every((t) => length2(t.x - x, t.z - z) >= 3);
  const meadowShrub = (
    id: number,
    x: number,
    z: number,
    k: number,
    j: number,
  ): ObstaclePlacement => ({
    id,
    kind: 'shrub',
    look: MEADOW_SHRUBS[Math.floor(shrubHash(k, j, 131) * MEADOW_SHRUBS.length)]!,
    x,
    z,
    rotation: shrubHash(k, j, 132) * Math.PI * 2,
    scale: 0.9 + shrubHash(k, j, 133) * 0.6,
  });
  // Keře kolem stromů mají id podle místa (mřížka TREE_SHRUB_CELL_M) – ne podle pořadí stromu,
  // které by se změnilo, kdyby kdekoli přibyl nebo ubyl strom.
  const treeShrubCells = Math.floor((l.size * l.cellSizeM) / TREE_SHRUB_CELL_M);
  const toShrubCell = (v: number): number =>
    Math.min(treeShrubCells - 1, Math.max(0, Math.floor((v + half) / TREE_SHRUB_CELL_M)));
  const shrubsInCell = new Map<number, number>();
  trees.forEach((tree, k) => {
    if (shrubHash(k, 0, 134) >= TREE_SHRUB_CHANCE) return;
    const count = 1 + Math.floor(shrubHash(k, 1, 134) * 3);
    let angle = shrubHash(k, 2, 134) * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      angle += 0.6 + shrubHash(k, 10 + i, 134) * 0.9;
      // Na okraji koruny – pod ní by keř nebyl vidět.
      const radius = 6.5 + shrubHash(k, 20 + i, 134) * 4;
      const x = tree.x + detCos(angle) * radius;
      const z = tree.z + detSin(angle) * radius;
      if (!shrubFits(x, z)) continue;
      const cell = toShrubCell(z) * treeShrubCells + toShrubCell(x);
      const member = shrubsInCell.get(cell) ?? 0;
      if (member >= 8) continue;
      shrubsInCell.set(cell, member + 1);
      bySource.treeShrub.push(meadowShrub(obstacleId('treeShrub', cell, member), x, z, k, 30 + i));
    }
  });
  bySource.treeShrub.sort((a, b) => a.id - b.id);
  const islandHash = hashFor(ctx, 'shrub-islands');
  const islandCells = Math.floor((l.size * l.cellSizeM) / SHRUB_ISLAND_SPACING_M);
  for (let gz = 0; gz < islandCells; gz++) {
    for (let gx = 0; gx < islandCells; gx++) {
      const cx = -half + (gx + islandHash(gx, gz, 141)) * SHRUB_ISLAND_SPACING_M;
      const cz = -half + (gz + islandHash(gx, gz, 142)) * SHRUB_ISLAND_SPACING_M;
      const chance = SHRUB_ISLAND_CHANCE * (0.7 + 2 * relief.rockinessAt(cx, cz));
      if (islandHash(gx, gz, 143) >= chance) continue;
      const cell = gz * islandCells + gx;
      const k = 100000 + cell;
      const count = 3 + Math.floor(islandHash(gx, gz, 144) * 5);
      for (let i = 0; i < count; i++) {
        const angle = islandHash(k, i, 145) * Math.PI * 2;
        const radius = i === 0 ? 0 : 1.5 + islandHash(k, i, 146) * 4.5;
        const x = cx + detCos(angle) * radius;
        const z = cz + detSin(angle) * radius;
        if (shrubFits(x, z)) {
          bySource.shrubIsland.push(
            meadowShrub(obstacleId('shrubIsland', cell, i), x, z, k, 50 + i),
          );
        }
      }
    }
  }

  const cells = Math.floor((l.size * l.cellSizeM) / STONE_SPACING_M);
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      const k = gz * cells + gx;
      if (stoneHash(gx, gz, 51) >= 0.12) continue;
      const cx = -half + (gx + stoneHash(gx, gz, 52)) * STONE_SPACING_M;
      const cz = -half + (gz + stoneHash(gx, gz, 53)) * STONE_SPACING_M;
      const main = stoneHash(gx, gz, 54) < 0.3 ? 'boulder' : 'stone-1';
      stone(bySource.stone, obstacleId('stone', k, 0), main, cx, cz, k, 0);
      const small = 1 + Math.floor(stoneHash(gx, gz, 55) * 3);
      for (let i = 0; i < small; i++) {
        const angle = stoneHash(k, 60 + i, 56) * Math.PI * 2;
        const radius = 1.5 + stoneHash(k, 70 + i, 56) * 2.5;
        stone(
          bySource.stone,
          obstacleId('stone', k, 1 + i),
          'stone-2',
          cx + detCos(angle) * radius,
          cz + detSin(angle) * radius,
          k,
          80 + i * 2,
        );
      }
    }
  }
  return [
    ...bySource.shrubBelt,
    ...bySource.treeShrub,
    ...bySource.shrubIsland,
    ...bySource.outcrop,
    ...bySource.bankBoulder,
    ...bySource.stone,
    ...bySource.willow,
  ];
}

/** U lesa velké podrostové keře (buk, dub), dál do louky menší keře. */
function beltShrubLook(big: boolean, pick: number): DecorObstacleLook {
  if (big) return pick < 0.5 ? 'underbrush-1' : pick < 0.85 ? 'underbrush-2' : 'shrub-1';
  return pick < 0.4 ? 'shrub-1' : pick < 0.7 ? 'shrub-2' : 'shrub-3';
}
