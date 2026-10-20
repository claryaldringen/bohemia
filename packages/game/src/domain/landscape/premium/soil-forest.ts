import { createNoise2D } from 'simplex-noise';
import { length2, noiseRandom } from '../det-math';
import { heightAboveStream } from '../floodplain';
import { distanceToMask, maxStep } from '../grid';
import { patches, removeSmallForestPatches, removeSmallMeadowPatches } from '../patches';
import { transferHeights } from '../quantize';
import { deriveSeed } from '../random';
import { buildRelief, type Relief } from '../relief';
import type { Terrain } from '../terrain';
import { CELL_SIZE_M, SURFACE_CODES, type Landscape } from '../types';
import { tileCenterWorld, type TileGrid } from '../world';
import type { PremiumPass } from './generate';
import {
  cellsOutline,
  circleOutline,
  streamPointWorld,
  tileDistance,
  type WorldPoint,
} from './geometry';
import { beeTreeSpots, OAK_BEECH } from './trees';
import type { PremiumSite } from './types';

// Prémiové typy půdy a lesa (premium-landscapes.md – Typy krajin): velmi úrodná krajina,
// doubravy a bučiny, rozsáhlé nivní louky, teplé jižní svahy, hojná zvěř a kožešiny, brtě.
// Hodnoty jsou návrh Clauda – doladí je kalibrace (krok 4 návrhu). Doubravy a brtě mění jen
// vrstvu překážek (`premium/trees.ts` – čtou ji rozmisťovače), ostatní vegetaci nebo úrodnost.

const { water: WATER, forest: FOREST, meadow: MEADOW } = SURFACE_CODES;

/**
 * Okolí vsi, kde hospodaří – 600 m (40 políček) od místa pro vesnici, stejné jako
 * `NEAR_SITE_RADIUS_CELLS` v pásmu (hlídá test – import z `band.ts` by udělal cyklus).
 */
export const NEAR_CELLS = 40;
/** Louky vsi se rozbíhají kousek za 600 m – jako ve vegetaci 2 (`NEAR_MEADOW_REACH_CELLS`). */
const NEAR_REACH_CELLS = 52;
const M2_PER_CELL = CELL_SIZE_M * CELL_SIZE_M;

/** Velmi úrodná krajina: +15 bodů přirozené úrodnosti do 600 m, za ní plynule do 750 m. */
export const FERTILE = { bonus: 15, fullCells: NEAR_CELLS, fadeCells: 50 } as const;

/**
 * Rozsáhlé nivní louky: louka v pásu ±60 m od vody podél celého potoka a louky do 600 m od vsi
 * o 30 % víc než v průměrné krajině – nejnižší políčka nad potokem (široká niva). O kolik lesa
 * niva ubere, o tolik zarostou suché louky na vršcích daleko od vsi.
 */
export const FLOODPLAIN = {
  bandCells: 4,
  nearGain: 1.3,
  /** Zvlnění okraje nivy (m výšky nad potokem). */
  raggedM: 1.5,
} as const;

/**
 * Teplé jižní svahy: louka na svahu 5–15 % ke slunci (±45° od směru ke slunci – `SUN_RAYS`) do
 * 500 m od vsi, aspoň 2 ha souvisle. Les ze slunného svahu ustoupí, o tolik lesa přibude na
 * odvrácených svazích do 600 m – louk u vsi je stejně jako v průměrné krajině.
 */
export const SOUTH_SLOPES = {
  slope: [0.05, 0.15],
  /** cos 45° – svah míří ke slunci, když odchylka jeho spádu od směru ke slunci je do 45°. */
  facing: Math.SQRT1_2,
  radiusM: 500,
  minAreaM2: 20_000,
  /** Odvrácené svahy, kam les ustoupí, až za rovinou kolem vsi (políčka). */
  shadeFromCells: 20,
} as const;

/**
 * Hojná zvěř a kožešiny: honitba je souvislý les ≥ 60 ha za dosahem polí (dál než 600 m od vsi)
 * u potoka, s mokřadem – úsek potoka podél honitby, kde je rovina u vody loukou (rákosí).
 * Menší paseky uvnitř honitby zarostou.
 */
export const GAME_FURS = {
  minAreaM2: 600_000,
  /** Honitba sahá k potoku – její les je do tolika políček od vody. */
  waterReachCells: 5,
  /** Paseka uvnitř honitby, která zaroste (políčka – ≈ 1 ha). */
  clearingMaxCells: 45,
  /** Mokřad: nízká rovina u vody podél honitby (políčka od vody, m nad potokem, krok terénu). */
  wetlandCells: 3,
  wetlandAboveM: 1,
  wetlandStepM: 0.6,
  /** Úsek potoka podél honitby, aby byl mokřad (m). */
  minWetlandM: 200,
} as const;

/** Brtí musí být ve vrstvě překážek aspoň tolik (rozmisťovač jich dá `BEE_TREES.count`). */
export const MIN_BEE_TREES = 12;

function villageWorld(l: Landscape): { x: number; z: number } {
  return tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
}

/** Políčka ve vzdálenosti od místa pro vesnici (políčka). */
function siteDistances(size: number, site: { x: number; y: number }): Float64Array {
  const d = new Float64Array(size * size);
  for (let i = 0; i < d.length; i++) d[i] = tileDistance(i % size, Math.floor(i / size), site);
  return d;
}

function largest(groups: readonly number[][]): number[] | null {
  let best: number[] | null = null;
  for (const group of groups) if (!best || group.length > best.length) best = group;
  return best;
}

function countCode(surface: Uint8Array, code: number): number {
  let n = 0;
  for (const v of surface) if (v === code) n++;
  return n;
}

// ── Velmi úrodná krajina ──────────────────────────────────────────────────────────────────────

const fertile = {
  fertility(fertility: Uint8Array, terrain: Terrain, surface: Uint8Array): Uint8Array {
    const { size, villageSite } = terrain;
    const out = fertility.slice();
    for (let i = 0; i < out.length; i++) {
      if (surface[i] === WATER) continue;
      const d = tileDistance(i % size, Math.floor(i / size), villageSite);
      const share =
        d <= FERTILE.fullCells
          ? 1
          : d >= FERTILE.fadeCells
            ? 0
            : (FERTILE.fadeCells - d) / (FERTILE.fadeCells - FERTILE.fullCells);
      if (share === 0) continue;
      out[i] = Math.min(100, Math.round(out[i]! + FERTILE.bonus * share));
    }
    return out;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] {
    const c = villageWorld(landscape);
    const outline = circleOutline(landscape, c.x, c.z, NEAR_CELLS * landscape.cellSizeM);
    return [{ kind: 'meadow', x: c.x, z: c.z, outline }];
  },
} satisfies PremiumPass;

// ── Doubravy a bučiny ─────────────────────────────────────────────────────────────────────────

const oakBeech = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] {
    const c = villageWorld(landscape);
    const outline = circleOutline(landscape, c.x, c.z, OAK_BEECH.radiusM);
    return [{ kind: 'woodland', x: c.x, z: c.z, outline }];
  },
} satisfies PremiumPass;

// ── Rozsáhlé nivní louky ──────────────────────────────────────────────────────────────────────

const floodplain = {
  vegetation(surface: Uint8Array, terrain: Terrain, ctx: { readonly seed: number }): Uint8Array {
    const { size, water, heights, villageSite } = terrain;
    const out = surface.slice();
    const waterDistance = distanceToMask(water, size);
    const above = heightAboveStream(water, heights, size);
    const site = siteDistances(size, villageSite);
    const forestBefore = countCode(out, FOREST);
    const nearMeadow = (): number => {
      let n = 0;
      for (let i = 0; i < out.length; i++) if (out[i] === MEADOW && site[i]! <= NEAR_CELLS) n++;
      return n;
    };
    const target = Math.ceil(nearMeadow() * FLOODPLAIN.nearGain);

    // Niva podél celého potoka.
    for (let i = 0; i < out.length; i++) {
      if (out[i] === FOREST && waterDistance[i]! <= FLOODPLAIN.bandCells) out[i] = MEADOW;
    }

    // Louky vsi: nejnižší políčka nad potokem (se zvlněným okrajem), dokud jich do 600 m není
    // o 30 % víc. Stejná mez výšky platí kousek za 600 m – niva se neutne v kruhu.
    let near = nearMeadow();
    if (near < target) {
      const noise = createNoise2D(noiseRandom(deriveSeed(ctx.seed, 'floodplain')));
      const score = new Float32Array(size * size);
      const candidates: number[] = [];
      for (let i = 0; i < out.length; i++) {
        if (out[i] !== FOREST || site[i]! > NEAR_REACH_CELLS) continue;
        score[i] =
          above[i]! + FLOODPLAIN.raggedM * noise((i % size) / 12, Math.floor(i / size) / 12);
        candidates.push(i);
      }
      candidates.sort((a, b) => score[a]! - score[b]! || a - b);
      let threshold = -Infinity;
      for (const i of candidates) {
        if (near >= target) break;
        if (site[i]! > NEAR_CELLS) continue;
        threshold = score[i]!;
        near++;
      }
      for (const i of candidates) if (score[i]! <= threshold) out[i] = MEADOW;
    }

    // Vyrovnání lesa: suché louky daleko od vsi zarostou – nejvzdálenější celky první.
    let deficit = forestBefore - countCode(out, FOREST);
    if (deficit > 0) {
      const upland = new Uint8Array(size * size);
      for (let i = 0; i < out.length; i++) {
        upland[i] =
          out[i] === MEADOW &&
          site[i]! > NEAR_REACH_CELLS &&
          waterDistance[i]! > FLOODPLAIN.bandCells
            ? 1
            : 0;
      }
      const farthest = (patch: readonly number[]): number => {
        let d = Infinity;
        for (const i of patch) d = Math.min(d, site[i]!);
        return d;
      };
      const meadows = patches(upland, size, 1)
        .map((patch) => ({ patch, distance: farthest(patch) }))
        .sort((a, b) => b.distance - a.distance || a.patch[0]! - b.patch[0]!);
      for (const { patch } of meadows) {
        if (deficit <= 0) break;
        // Celý celek, nebo jeho vzdálenější část (zbytek pod MIN_MEADOW_PATCH uklidí úklid).
        const cells =
          patch.length <= deficit
            ? patch
            : [...patch].sort((a, b) => site[b]! - site[a]! || a - b).slice(0, deficit);
        for (const i of cells) out[i] = FOREST;
        deficit -= cells.length;
      }
    }

    removeSmallMeadowPatches(out, size);
    removeSmallForestPatches(out, size);
    return out;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] {
    const line = landscape.stream.map((p) => streamPointWorld(landscape, p));
    const c = villageWorld(landscape);
    let nearest = line[0]!;
    for (const p of line) {
      if (length2(p[0] - c.x, p[1] - c.z) < length2(nearest[0] - c.x, nearest[1] - c.z)) {
        nearest = p;
      }
    }
    return [{ kind: 'meadow', x: nearest[0], z: nearest[1], line }];
  },
} satisfies PremiumPass;

// ── Teplé jižní svahy ─────────────────────────────────────────────────────────────────────────

/** Políčka do 500 m od vsi na svahu 5–15 % ke slunci (bez vody). */
function sunSlopeMask(
  relief: Relief,
  grid: TileGrid & Pick<Landscape, 'villageSite'>,
  surface: Uint8Array,
): Uint8Array {
  const { size, villageSite } = grid;
  const half = (size * grid.cellSizeM) / 2;
  const reachCells = SOUTH_SLOPES.radiusM / grid.cellSizeM;
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (surface[i] === WATER || tileDistance(x, y, villageSite) > reachCells) continue;
      const wx = -half + (x + 0.5) * grid.cellSizeM;
      const wz = -half + (y + 0.5) * grid.cellSizeM;
      const slope = relief.slopeAt(wx, wz);
      if (slope < SOUTH_SLOPES.slope[0] || slope > SOUTH_SLOPES.slope[1]) continue;
      if (relief.sunwardAt(wx, wz) >= slope * SOUTH_SLOPES.facing) mask[i] = 1;
    }
  }
  return mask;
}

/** Tvar terénu z výšek s přesností prohlížeče – při generování stejný jako ze hotové krajiny. */
function terrainRelief(terrain: Terrain): Relief {
  return buildRelief({
    size: terrain.size,
    cellSizeM: CELL_SIZE_M,
    heights: transferHeights(terrain.heights),
  });
}

const southSlopes = {
  vegetation(surface: Uint8Array, terrain: Terrain): Uint8Array {
    const { size, villageSite } = terrain;
    const grid = { size, cellSizeM: CELL_SIZE_M, villageSite };
    const relief = terrainRelief(terrain);
    const sun = sunSlopeMask(relief, grid, surface);
    const slope = largest(patches(sun, size, 1));
    if (!slope) return surface;
    const out = surface.slice();
    let opened = 0;
    for (const i of slope) {
      if (out[i] !== FOREST) continue;
      out[i] = MEADOW;
      opened++;
    }
    // Les ustoupí na odvrácené svahy do 600 m – nejstinnější louky první.
    const half = (size * CELL_SIZE_M) / 2;
    const shaded: { cell: number; sunward: number }[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (out[i] !== MEADOW || sun[i]) continue;
        const d = tileDistance(x, y, villageSite);
        if (d > NEAR_CELLS || d <= SOUTH_SLOPES.shadeFromCells) continue;
        const wx = -half + (x + 0.5) * CELL_SIZE_M;
        const wz = -half + (y + 0.5) * CELL_SIZE_M;
        const sunward = relief.sunwardAt(wx, wz);
        if (sunward >= 0 || relief.slopeAt(wx, wz) < SOUTH_SLOPES.slope[0]) continue;
        shaded.push({ cell: i, sunward });
      }
    }
    shaded.sort((a, b) => a.sunward - b.sunward || a.cell - b.cell);
    for (const { cell } of shaded.slice(0, opened)) out[cell] = FOREST;
    removeSmallMeadowPatches(out, size);
    removeSmallForestPatches(out, size);
    return out;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const sun = sunSlopeMask(buildRelief(landscape), landscape, landscape.surface);
    for (let i = 0; i < sun.length; i++) if (landscape.surface[i] !== MEADOW) sun[i] = 0;
    const slope = largest(patches(sun, landscape.size, 1));
    if (!slope || slope.length * M2_PER_CELL < SOUTH_SLOPES.minAreaM2) return null;
    const outline = cellsOutline(slope, landscape);
    const [x, z] = centralCell(slope, landscape);
    return [{ kind: 'slope', x, z, outline }];
  },
} satisfies PremiumPass;

/** Střed políčka celku nejblíž jeho těžišti – leží v celku i u nekonvexního tvaru. */
function centralCell(cells: readonly number[], l: Landscape): WorldPoint {
  let sx = 0;
  let sy = 0;
  for (const i of cells) {
    sx += i % l.size;
    sy += Math.floor(i / l.size);
  }
  const cx = sx / cells.length;
  const cy = sy / cells.length;
  let best = cells[0]!;
  for (const i of cells) {
    const d = length2((i % l.size) - cx, Math.floor(i / l.size) - cy);
    if (d < length2((best % l.size) - cx, Math.floor(best / l.size) - cy)) best = i;
  }
  const c = tileCenterWorld(l, best % l.size, Math.floor(best / l.size));
  return [c.x, c.z];
}

// ── Hojná zvěř a kožešiny ─────────────────────────────────────────────────────────────────────

/** Honitba: největší celek lesa dál než 600 m od vsi, který sahá k potoku. */
function huntingGround(
  surface: Uint8Array,
  size: number,
  villageSite: { x: number; y: number },
  waterDistance: Float32Array,
): number[] | null {
  const far = new Uint8Array(size * size);
  for (let i = 0; i < far.length; i++) {
    far[i] =
      surface[i] === FOREST &&
      tileDistance(i % size, Math.floor(i / size), villageSite) > NEAR_CELLS
        ? 1
        : 0;
  }
  return largest(
    patches(far, size, 1).filter((patch) =>
      patch.some((i) => waterDistance[i]! <= GAME_FURS.waterReachCells),
    ),
  );
}

function waterDistanceOf(surface: Uint8Array, size: number): Float32Array {
  return distanceToMask(
    surface.map((v) => (v === WATER ? 1 : 0)),
    size,
  );
}

const gameFurs = {
  vegetation(surface: Uint8Array, terrain: Terrain): Uint8Array {
    const { size, villageSite, water, heights } = terrain;
    const waterDistance = waterDistanceOf(surface, size);
    const hunt = huntingGround(surface, size, villageSite, waterDistance);
    if (!hunt) return surface;
    const out = surface.slice();
    const inHunt = new Uint8Array(size * size);
    for (const i of hunt) inHunt[i] = 1;

    // Paseky uvnitř honitby (celky, kam se od okraje mapy nejde jinudy než přes honitbu).
    const outside = new Uint8Array(size * size);
    const queue: number[] = [];
    for (let i = 0; i < out.length; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      if ((x === 0 || y === 0 || x === size - 1 || y === size - 1) && !inHunt[i]) {
        outside[i] = 1;
        queue.push(i);
      }
    }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k]!;
      const x = i % size;
      const y = Math.floor(i / size);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!inHunt[n] && !outside[n]) {
          outside[n] = 1;
          queue.push(n);
        }
      }
    }
    const enclosed = new Uint8Array(size * size);
    for (let i = 0; i < out.length; i++) enclosed[i] = !inHunt[i] && !outside[i] ? 1 : 0;
    for (const clearing of patches(enclosed, size, 1)) {
      if (clearing.length > GAME_FURS.clearingMaxCells) continue;
      if (clearing.some((i) => out[i] !== MEADOW)) continue;
      for (const i of clearing) out[i] = FOREST;
    }

    // Mokřad: nízká rovina u vody podél honitby je louka (rákosí, ostřice).
    const above = heightAboveStream(water, heights, size);
    const nearHunt = distanceToMask(inHunt, size);
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== FOREST || waterDistance[i]! > GAME_FURS.wetlandCells) continue;
      if (nearHunt[i]! > 1 || above[i]! > GAME_FURS.wetlandAboveM) continue;
      if (maxStep(heights, size, i % size, Math.floor(i / size)) > GAME_FURS.wetlandStepM) continue;
      out[i] = MEADOW;
    }
    removeSmallMeadowPatches(out, size);
    removeSmallForestPatches(out, size);
    return out;
  },
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const { size, surface, villageSite } = landscape;
    const waterDistance = waterDistanceOf(surface, size);
    const hunt = huntingGround(surface, size, villageSite, waterDistance);
    if (!hunt || hunt.length * M2_PER_CELL < GAME_FURS.minAreaM2) return null;
    const line = wetlandLine(landscape, hunt);
    if (!line) return null;
    const middle = line[Math.floor(line.length / 2)]!;
    return [
      {
        kind: 'hunting-ground',
        x: middle[0],
        z: middle[1],
        outline: cellsOutline(hunt, landscape),
        line,
      },
    ];
  },
} satisfies PremiumPass;

/**
 * Mokřad honitby: nejdelší souvislý úsek osy potoka, u kterého je les honitby do
 * GAME_FURS.waterReachCells políček – ve světě. Kratší než GAME_FURS.minWetlandM = žádný.
 */
function wetlandLine(l: Landscape, hunt: readonly number[]): WorldPoint[] | null {
  const { size } = l;
  const inHunt = new Uint8Array(size * size);
  for (const i of hunt) inHunt[i] = 1;
  const nearHunt = distanceToMask(inHunt, size);
  let best: WorldPoint[] = [];
  let bestLength = 0;
  let run: WorldPoint[] = [];
  let runLength = 0;
  for (const p of l.stream) {
    const x = Math.min(size - 1, Math.max(0, Math.round(p.x)));
    const y = Math.min(size - 1, Math.max(0, Math.round(p.y)));
    if (nearHunt[y * size + x]! > GAME_FURS.waterReachCells) {
      run = [];
      runLength = 0;
      continue;
    }
    const point = streamPointWorld(l, p);
    const previous = run[run.length - 1];
    if (previous) runLength += length2(point[0] - previous[0], point[1] - previous[1]);
    run.push(point);
    if (runLength > bestLength) {
      best = run;
      bestLength = runLength;
    }
  }
  return bestLength >= GAME_FURS.minWetlandM ? [...best] : null;
}

// ── Brtě a lesní včely ────────────────────────────────────────────────────────────────────────

const wildBees = {
  sites({ landscape }: { landscape: Landscape }): readonly PremiumSite[] | null {
    const spots = beeTreeSpots(landscape);
    if (spots.length < MIN_BEE_TREES) return null;
    return spots.map((spot): PremiumSite => ({ kind: 'bee-trees', x: spot.x, z: spot.z }));
  },
} satisfies PremiumPass;

/** Průchody typů půdy a lesa (registr `PREMIUM_PASSES` v `generate.ts`). */
export const SOIL_FOREST_PASSES = {
  fertile,
  'oak-beech': oakBeech,
  floodplain,
  'south-slopes': southSlopes,
  'game-furs': gameFurs,
  'wild-bees': wildBees,
};
