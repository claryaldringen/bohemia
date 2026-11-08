import { detCos, detSin, length2, smoothstep } from '../det-math';
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
  type RiverLook,
  type WidthProfile,
} from '../premium/river';
import { createRandom, type Random } from '../random';
import { rasterize, smoothPolyline, type ChannelSample } from '../stream';
import type { Terrain } from '../terrain';
import { CELL_SIZE_M, type StreamPoint } from '../types';
import type { RiverCoursePlan } from './river-course';
import { SKELETON_MAP } from './rules-map';

// Koryta řek mapy z kostry (world-skeleton.md – Mapa z kostry, krok 2): tvar koryta, meandry,
// 1–2 brody, hloubka a niva jako řeka prémie (`premium/river.ts`), meandry výraznější a u užšího
// toku kratší, šířka plynule od šířky vtoku (u pramene od šířky potoka) k šířce výtoku, přítok
// ústí pod ostrým úhlem po proudu. Řeky vznikají dřív než potok a místo pro vesnici – údolí proto rovinu kolem
// vsi nešetří (ves se pak vybere aspoň `RIVER.villageMinCells` od os řek). Terén řek počítá
// jen server při generování (pomocné funkce osy ze `stream.ts` smí `Math.hypot`).

/** Vlna šířky i meandry utichnou do tolika políček od konců toku (jako v `shapeChannel`). */
const TAPER_CELLS = 8;

type Cell = { x: number; y: number };

/**
 * Šířka vody podél toku: lineárně `fromWidthM` → `toWidthM`, ± `widthWave`, na koncích přesně;
 * nejméně `RIVER.width.minM`, u pramene užší (od šířky potoka).
 */
function widthProfile(plan: RiverCoursePlan): WidthProfile {
  const minM = Math.min(RIVER.width.minM, plan.fromWidthM, plan.toWidthM);
  return (s, length, wave) => {
    const t = length > 0 ? s / length : 0;
    const base = plan.fromWidthM + (plan.toWidthM - plan.fromWidthM) * t;
    const taper = smoothstep(0, TAPER_CELLS, s) * smoothstep(0, TAPER_CELLS, length - s);
    const width = base * (1 + SKELETON_MAP.widthWave * wave * taper);
    return Math.min(RIVER.width.maxM, Math.max(minM, width));
  };
}

function range(random: Random, [min, max]: readonly [number, number]): number {
  return min + (max - min) * random.next();
}

/**
 * Vzhled toku kostry: jako řeka prémie (`riverLook`), ale s výraznějšími meandry
 * (`SKELETON_MAP.meanderAmplitude`) a s dlouhou vlnou úměrnou šířce toku (`meanderWaveScale`).
 */
function skeletonLook(random: Random, plan: RiverCoursePlan): RiverLook {
  const look = riverLook(random, []);
  const widthM = (plan.fromWidthM + plan.toWidthM) / 2;
  const [low, high] = SKELETON_MAP.meanderWaveScale;
  const scale = Math.min(high, Math.max(low, widthM / SKELETON_MAP.meanderWidthM));
  return {
    ...look,
    wave: look.wave * scale,
    amplitude: range(random, SKELETON_MAP.meanderAmplitude),
  };
}

/** Vzdálenost bodu od osy toku (políčka) – k nejbližšímu vzorku. */
function axisDistance(samples: readonly ChannelSample[], p: Cell): number {
  const q = samples[nearestSample(samples, p)]!;
  return length2(q.x - p.x, q.y - p.y);
}

/** Body úsečky po nejvýš políčku (bez prvního bodu, s posledním). */
function stepsTo(from: Cell, to: Cell): Cell[] {
  const n = Math.max(1, Math.ceil(length2(to.x - from.x, to.y - from.y)));
  return Array.from({ length: n }, (_, k) => ({
    x: from.x + ((to.x - from.x) * (k + 1)) / n,
    y: from.y + ((to.y - from.y) * (k + 1)) / n,
  }));
}

/**
 * Soutok pod ostrým úhlem po proudu (návrh Clauda – přirozený soutok): přítok ústí do osy hlavního
 * toku zhruba o průmět přiblížení níž po proudu, než k ní dovedla trasa (ne blíž okraji mapy, než
 * je `junctionEdgeCells`), a posledních `junctionApproachCells` vede rovně pod úhlem
 * `junctionAngleDeg` k ose hlavního toku v soutoku. Soutok se vybere tak, aby začátek přiblížení
 * nebyl blízko hlavního toku (ten meandruje). Trasa přítoku blíž k hlavnímu toku, než začíná
 * přiblížení, se zahodí (rovný úsek u okraje zůstane). Vrací body osy přítoku a vzorek hlavního
 * toku v soutoku.
 */
function confluence(
  main: readonly ChannelSample[],
  cells: readonly Cell[],
  size: number,
  random: Random,
): { cells: Cell[]; junction: number } {
  const first = nearestSample(main, cells.at(-1)!);
  const reach = main[first]!;
  const angle = (range(random, SKELETON_MAP.junctionAngleDeg) * Math.PI) / 180;
  const approach = SKELETON_MAP.junctionApproachCells;
  const along = approach * detCos(angle);
  const across = approach * detSin(angle);
  const edge = (p: Cell): number => Math.min(p.x, p.y, size - 1 - p.x, size - 1 - p.y);
  const floor = Math.min(SKELETON_MAP.junctionEdgeCells, edge(reach));
  // Strana přítoku: kde leží jeho trasa kus před koncem.
  const back = cells[Math.max(0, cells.length - 1 - Math.ceil(across))]!;
  const side = reach.tx * (back.y - reach.y) - reach.ty * (back.x - reach.x) >= 0 ? 1 : -1;
  const startOf = (p: ChannelSample): Cell => ({
    x: p.x - p.tx * along - p.ty * side * across,
    y: p.y - p.ty * along + p.tx * side * across,
  });
  // Kandidáti soutoku po proudu: nejblíž průmětu přiblížení, se začátkem přiblížení dost daleko
  // od hlavního toku a v mapě; když takový není, ten s nejvzdálenějším začátkem.
  let junction = first;
  let best = -Infinity;
  for (let j = first; j < main.length && main[j]!.s - reach.s <= 2 * along; j++) {
    if (edge(main[j]!) < floor) break;
    const start = startOf(main[j]!);
    const clear = edge(start) >= 1 ? Math.min(axisDistance(main, start), 0.8 * across) : -1;
    const score = clear * 100 - Math.abs(main[j]!.s - reach.s - along);
    if (score > best) {
      best = score;
      junction = j;
    }
  }
  const end = main[junction]!;
  const start = startOf(end);
  start.x = Math.min(size - 1, Math.max(0, start.x));
  start.y = Math.min(size - 1, Math.max(0, start.y));
  const reachAt = Math.min(across, axisDistance(main, start));
  let keep = cells.length;
  const lead = SKELETON_MAP.portLeadCells + 1;
  for (let k = lead; k < cells.length; k++) {
    if (axisDistance(main, cells[k]!) < reachAt) {
      keep = k;
      break;
    }
  }
  const kept = cells.slice(0, Math.max(lead, keep));
  return {
    cells: [...kept, ...stepsTo(kept.at(-1)!, start), ...stepsTo(start, end)],
    junction,
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
 * `singleFord` – každý tok jen s jedním brodem (vyvýšenina nad brodem, prémie na kostře).
 */
export function carveRiverCourses(
  terrain: Terrain,
  plans: readonly RiverCoursePlan[],
  seed: number,
  options: { readonly floodplainCells: number; readonly singleFord?: boolean },
): Terrain {
  if (plans.length === 0) return terrain;
  const { size } = terrain;
  const random = createRandom(seed);
  // Soutoky podle tras – brod hlavního toku se jim vyhne i s přiblížením přítoku po proudu.
  const junctions = plans.flatMap((p) => (p.joins === null ? [] : [p.cells.at(-1)!]));
  const junctionGap = SKELETON_MAP.fordJunctionCells + SKELETON_MAP.junctionApproachCells;
  const shaped: ShapedCourse[] = [];
  plans.forEach((plan, k) => {
    if (plan.joins !== null && !(plan.joins >= 0 && plan.joins < k)) {
      throw new RangeError(`Přítok ${k} ústí do toku ${plan.joins}, který před ním není.`);
    }
    const look = skeletonLook(random, plan);
    const main = plan.joins === null ? null : shaped[plan.joins]!;
    let cells: readonly Cell[] = plan.cells;
    let junction = -1;
    if (main) {
      // Přítok končí přesně na ose hlavního toku (ta je oproti trase vyhlazená a meandruje).
      ({ cells, junction } = confluence(main.samples, plan.cells, size, random));
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
    for (const share of SKELETON_MAP.meanderFallback) {
      if (!selfTouching(samples)) break;
      samples = shapeChannel(
        base,
        { ...look, amplitude: look.amplitude * share },
        size,
        room,
        0,
        profile,
      );
    }
    const ends = plan.joins === null ? junctions : [cells.at(-1)!];
    const gap = plan.joins === null ? junctionGap : SKELETON_MAP.fordJunctionCells;
    const fords = chooseFords(
      samples,
      random,
      (j) => ends.every((c) => length2(samples[j]!.x - c.x, samples[j]!.y - c.y) >= gap),
      null,
      options.singleFord === true ? 1 : 2,
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
