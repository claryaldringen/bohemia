import { length2, smoothstep } from '../det-math';
import { distanceToMask } from '../grid';
import {
  carveRiver,
  chooseFords,
  placeFords,
  reliefOf,
  RIVER,
  riverLook,
  selfTouching,
  shapeChannel,
  type WidthProfile,
} from '../premium/river';
import { createRandom } from '../random';
import { rasterize, smoothPolyline, type ChannelSample } from '../stream';
import type { Terrain } from '../terrain';
import { CELL_SIZE_M, type StreamPoint } from '../types';
import type { RiverCoursePlan } from './river-course';
import { SKELETON_MAP } from './rules-map';

// Koryta řek mapy z kostry (world-skeleton.md – Mapa z kostry, krok 2): tvar koryta, meandry,
// 1–2 brody, hloubka a niva jako řeka prémie (`premium/river.ts`), šířka plynule od šířky vtoku
// k šířce výtoku. Řeky vznikají dřív než potok a místo pro vesnici – údolí proto rovinu kolem
// vsi nešetří (ves se pak vybere aspoň `RIVER.villageMinCells` od os řek). Terén řek počítá
// jen server při generování (pomocné funkce osy ze `stream.ts` smí `Math.hypot`).

/** Vlna šířky i meandry utichnou do tolika políček od konců toku (jako v `shapeChannel`). */
const TAPER_CELLS = 8;

type Cell = { x: number; y: number };

/** Šířka vody podél toku: lineárně `fromWidthM` → `toWidthM`, ± `widthWave`, na koncích přesně. */
function widthProfile(plan: RiverCoursePlan): WidthProfile {
  return (s, length, wave) => {
    const t = length > 0 ? s / length : 0;
    const base = plan.fromWidthM + (plan.toWidthM - plan.fromWidthM) * t;
    const taper = smoothstep(0, TAPER_CELLS, s) * smoothstep(0, TAPER_CELLS, length - s);
    const width = base * (1 + SKELETON_MAP.widthWave * wave * taper);
    return Math.min(RIVER.width.maxM, Math.max(RIVER.width.minM, width));
  };
}

function nearestSample(samples: readonly ChannelSample[], p: Cell): number {
  let best = 0;
  let bestDistance = Infinity;
  samples.forEach((q, k) => {
    const d = length2(q.x - p.x, q.y - p.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = k;
    }
  });
  return best;
}

const tileOf = (p: Cell, size: number): number => Math.round(p.y) * size + Math.round(p.x);

interface ShapedCourse {
  readonly samples: ChannelSample[];
  readonly levels: number[];
}

/**
 * Koryta řek podle tras `planRiverCourses` (hlavní tok první, přítoky za ním): osa s meandry
 * a brody, vodní políčka, dno klesající po proudu a údolí s nivou `floodplainCells`. Přítok ústí
 * přesně do osy hlavního toku a jeho dno nekončí pod dnem hlavního toku v soutoku. Mění terén na
 * místě (výšky, voda) a vrací ho s osami řek (`rivers`); výšky znovu od nejnižšího políčka.
 */
export function carveRiverCourses(
  terrain: Terrain,
  plans: readonly RiverCoursePlan[],
  seed: number,
  options: { readonly floodplainCells: number },
): Terrain {
  if (plans.length === 0) return terrain;
  const { size } = terrain;
  const random = createRandom(seed);
  const junctions = plans.flatMap((p) => (p.joins === null ? [] : [p.cells.at(-1)!]));
  const shaped: ShapedCourse[] = [];
  plans.forEach((plan, k) => {
    if (plan.joins !== null && !(plan.joins >= 0 && plan.joins < k)) {
      throw new RangeError(`Přítok ${k} ústí do toku ${plan.joins}, který před ním není.`);
    }
    const look = riverLook(random, []);
    const main = plan.joins === null ? null : shaped[plan.joins]!;
    let cells: readonly Cell[] = plan.cells;
    let junction = -1;
    if (main) {
      // Přítok končí přesně na ose hlavního toku (ta je oproti trase vyhlazená a meandruje).
      junction = nearestSample(main.samples, plan.cells.at(-1)!);
      const end = main.samples[junction]!;
      cells = [...plan.cells, { x: end.x, y: end.y }];
    }
    const base = smoothPolyline(cells, size);
    // Meandr nevyvede vodu za okraj mapy ani do jiného toku.
    const otherWater = distanceToMask(terrain.water, size);
    const half =
      (Math.max(plan.fromWidthM, plan.toWidthM) * (1 + SKELETON_MAP.widthWave)) / 2 / CELL_SIZE_M;
    const room = (p: Cell): number => {
      const edge = Math.min(p.x, p.y, size - 1 - p.x, size - 1 - p.y) - half;
      const other = otherWater[tileOf(p, size)]! - half - 2;
      return Math.min(edge, other);
    };
    const profile = widthProfile(plan);
    let samples = shapeChannel(base, look, size, room, 0, profile);
    if (selfTouching(samples)) {
      samples = shapeChannel(base, { ...look, amplitude: 0 }, size, room, 0, profile);
    }
    const ends = plan.joins === null ? junctions : [plan.cells.at(-1)!];
    const fords = chooseFords(samples, random, (j) =>
      ends.every(
        (c) => length2(samples[j]!.x - c.x, samples[j]!.y - c.y) >= SKELETON_MAP.fordJunctionCells,
      ),
    );
    placeFords(samples, fords);
    // Vlastní voda toku – voda hlavního toku (a co už je vodou) zůstane, jak je.
    const water = rasterize(samples, terrain.heights, size);
    for (let i = 0; i < water.length; i++) if (terrain.water[i]) water[i] = 0;
    const levels = carveRiver({
      terrain,
      samples,
      water,
      valleyFrom: water,
      fixedBed: () => null,
      bedFloor: main ? main.levels[junction]! - RIVER.depthM : -Infinity,
      floodplainCells: options.floodplainCells,
      source: tileOf(samples[0]!, size),
      ignoreVillage: true,
    });
    for (let i = 0; i < water.length; i++) if (water[i]) terrain.water[i] = 1;
    shaped.push({ samples, levels });
  });

  const { heights } = terrain;
  const shift = Math.min(0, reliefOf(heights).min);
  if (shift !== 0) {
    for (let i = 0; i < heights.length; i++) heights[i] = heights[i]! - shift;
    terrain.stream = terrain.stream.map((p) => ({ ...p, level: p.level - shift }));
  }
  terrain.rivers = shaped.map(({ samples, levels }) =>
    samples.map((p, k): StreamPoint => ({
      x: p.x,
      y: p.y,
      halfWidthLeft: p.left,
      halfWidthRight: p.right,
      level: levels[k]! - shift,
      shallow: p.shallow,
      bankLeft: 0,
      bankRight: 0,
    })),
  );
  return terrain;
}

/** Všechny řeky mapy – řeky kostry (`rivers`) i řeka prémie (`river`); bez řeky []. */
export function riversOf(l: {
  readonly river?: readonly StreamPoint[];
  readonly rivers?: readonly (readonly StreamPoint[])[];
}): readonly (readonly StreamPoint[])[] {
  const all: (readonly StreamPoint[])[] = [...(l.rivers ?? [])];
  if (l.river) all.push(l.river);
  return all;
}
