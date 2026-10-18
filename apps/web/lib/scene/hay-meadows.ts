// Louky na seno kolem vsi. Ve vsi je kreslí data – přirozené louky letošní seče
// (`SceneVillage.hayMeadows`, `hayMeadowFields` – jako díly pole se vzhledem od herního jádra);
// výběr podle krajiny (`chooseHayMeadows`) zůstal jen pro vývojovou ukázku. Bez Babylonu: které louky se sečou (deterministicky podle
// krajiny a vsi), kdy v roce a co na nich je – posečené řádky sena, kupky a stohy.
import {
  obstacleStatus,
  obstaclesNear,
  surfaceAt,
  type Landscape,
  type ObstacleLayer,
} from '@bohemia/game';
import type { SceneHayMeadow, SceneVillage } from '../village-view';
import type { SceneField } from './village-types';
import type { CellSquare } from './field-cells';
import type { PlantInstance } from './field-crops';
import { villageCenter } from './field-look';
import { hash01 } from './smoke-schedule';
import { tileCenter } from './tile-at';
import { seededRandom } from './village-layout';

/** Vzhled louky na seno: posečená (řádky sena schnou) a se stohy. */
export type MeadowLook = 'mown' | 'haystacks';

/** Louka na seno – čtverce políček v obdélníku a směr řádků sena. */
export interface HayMeadow {
  id: number;
  squares: CellSquare[];
  /** Směr řádků (seče) – podél delší strany louky. */
  rows: [number, number];
}

/**
 * Stav louky na seno v den roku: kolik je posečeno (0–1, seče se od kraje), co leží na posečené
 * části – řádky sena, kupky, nebo stohy (ty stojí přes podzim a zimu, každý zmizí jindy – seno
 * se zkrmí) – a jak moc už otava dorostla (0 = čerstvě posečeno, 1 = jako louka).
 */
export interface HayPhase {
  mown: number;
  hay: 'swaths' | 'heaps' | 'stacks';
  regrowth: number;
}

// Dny v roce (nepřestupný rok): seč v červnu, sušení a kupky do poloviny července, pak stohy;
// otava doroste do konce srpna, stohy se odvážejí (zkrmují) od října do poloviny března.
const MOW_FROM = 156; // 5. 6.
const MOW_TO = 177; // 26. 6.
const HEAPS_FROM = 180; // 29. 6.
const STACKS_FROM = 193; // 12. 7.
const REGROWN = 243; // 31. 8.
const FEED_FROM = 274; // 1. 10.
const SPRING = 74; // 15. 3. – od jara roste nová tráva, stohy už nejsou
/** Po seči se na otavě smí pást (Martin: ne dřív) – od srpna do konce listopadu. */
const AFTERMATH = { from: 213, to: 334 };

/** Kolik luk na seno má ves (na dvě domácnosti jedna, nejvýš 4) a v jaké vzdálenosti od vsi (m). */
const HOUSEHOLDS_PER_MEADOW = 2;
const MAX_MEADOWS = 4;
const REACH_M = { from: 35, to: 240 };
/** Louka je 3 × 2 čtverce, nebo aspoň 2 × 2. */
const SHAPES: readonly [number, number][] = [
  [3, 2],
  [2, 3],
  [2, 2],
];
/** Odstup louky od obydlí (m). */
const DWELLING_GAP_M = 14;

/** Den sezóny sena: od seče přes zimu dál (leden až březen se počítá za prosincem). */
function hayDay(dayOfYear: number): number {
  return dayOfYear < SPRING ? dayOfYear + 365 : dayOfYear;
}

/** Stav louk na seno v den roku 1–366; na jaře, než se seče, null (roste vysoká tráva). */
export function hayPhase(dayOfYear: number): HayPhase | null {
  const day = hayDay(dayOfYear);
  if (day < MOW_FROM) return null;
  if (day < HEAPS_FROM) {
    return {
      mown: Math.min(1, (day - MOW_FROM) / (MOW_TO - MOW_FROM)),
      hay: 'swaths',
      regrowth: 0,
    };
  }
  if (day < STACKS_FROM) return { mown: 1, hay: 'heaps', regrowth: 0.1 };
  const regrowth = Math.min(1, 0.1 + (0.9 * (day - STACKS_FROM)) / (REGROWN - STACKS_FROM));
  return { mown: 1, hay: 'stacks', regrowth };
}

/** Stoh stojí? Každý se odveze (zkrmí) v jiný den mezi říjnem a polovinou března. */
export function stackStands(seed: number, dayOfYear: number): boolean {
  const day = hayDay(dayOfYear);
  if (day < STACKS_FROM) return false;
  const removed = FEED_FROM + hash01(seed, 5, 98) * (SPRING + 365 - FEED_FROM);
  return day < removed;
}

/** Na posečené louce se smí pást (otava od srpna do konce listopadu). */
export function aftermathGrazing(dayOfYear: number): boolean {
  return dayOfYear >= AFTERMATH.from && dayOfYear <= AFTERMATH.to;
}

/** Vzhled louky pro vývojové stránky a popisky (null = vysoká tráva před sečí). */
export function meadowLook(phase: HayPhase | null): MeadowLook | null {
  if (!phase || phase.mown <= 0) return null;
  return phase.hay === 'stacks' ? 'haystacks' : 'mown';
}

/**
 * Louky na seno kolem vsi: čtverce louky bez stromů, keřů a kamenů, mimo pole, sady, hřbitovy
 * a kus od obydlí, do pár set metrů od vsi. Kolik luk, podle domácností; výběr deterministicky
 * podle krajiny (blíž vsi s přednostní, ale ne vždy nejbližší). Bez obydlené vsi žádné.
 */
export function chooseHayMeadows(
  landscape: Landscape,
  layer: ObstacleLayer | null,
  village: SceneVillage,
): HayMeadow[] {
  const households = village.dwellings.filter((d) => d.built && d.inhabited !== false).length;
  if (households === 0) return [];
  const count = Math.min(MAX_MEADOWS, Math.ceil(households / HOUSEHOLDS_PER_MEADOW));
  const center = villageCenter(village);
  const size = landscape.cellSizeM;
  const taken = new Set<string>();
  const mark = (x: number, y: number): void => {
    taken.add(`${x},${y}`);
  };
  for (const f of village.fields) for (const p of f.parts) mark(p.cell.x, p.cell.y);
  for (const o of village.orchards ?? []) for (const s of o.squares) mark(s.cell.x, s.cell.y);
  for (const c of village.cemeteries ?? []) for (const s of c.squares) mark(s.cell.x, s.cell.y);
  const status = obstacleStatus(village.obstacles);
  const free = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= landscape.size || y >= landscape.size) return false;
    if (taken.has(`${x},${y}`) || surfaceAt(landscape, x, y) !== 'meadow') return false;
    const { worldX, worldZ } = tileCenter(landscape, x, y);
    const distance = Math.hypot(worldX - center.x, worldZ - center.z);
    if (distance < REACH_M.from || distance > REACH_M.to) return false;
    if (
      village.dwellings.some(
        (d) =>
          Math.abs(d.position.x - worldX) < size / 2 + DWELLING_GAP_M &&
          Math.abs(d.position.z - worldZ) < size / 2 + DWELLING_GAP_M,
      )
    ) {
      return false;
    }
    if (!layer) return true;
    const h = size / 2 - 0.5;
    return obstaclesNear(layer, worldX - h, worldZ - h, worldX + h, worldZ + h).every(
      (i) => status.kindOf(layer, i) === null,
    );
  };
  const cx = Math.floor((center.x + (landscape.size * size) / 2) / size);
  const cy = Math.floor((center.z + (landscape.size * size) / 2) / size);
  const reach = Math.ceil(REACH_M.to / size);
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (!free(x, y)) continue;
      const { worldX, worldZ } = tileCenter(landscape, x, y);
      const distance = Math.hypot(worldX - center.x, worldZ - center.z);
      candidates.push({ x, y, score: distance / REACH_M.to + hash01(x, y, 97) * 0.6 });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  const meadows: HayMeadow[] = [];
  const used = new Set<string>();
  for (const c of candidates) {
    if (meadows.length >= count) break;
    for (const [w, h] of SHAPES) {
      const cells: { x: number; y: number }[] = [];
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) cells.push({ x: c.x + dx, y: c.y + dy });
      // louky se nedotýkají (mezi nimi aspoň čtverec neposečené louky)
      const clear = cells.every((cell) => {
        if (!free(cell.x, cell.y)) return false;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++)
            if (used.has(`${cell.x + ox},${cell.y + oy}`)) return false;
        return true;
      });
      if (!clear) continue;
      for (const cell of cells) used.add(`${cell.x},${cell.y}`);
      meadows.push({
        id: meadows.length + 1,
        squares: cells.map((cell) => {
          const { worldX, worldZ } = tileCenter(landscape, cell.x, cell.y);
          return { cell, x: worldX, z: worldZ, size };
        }),
        rows: w >= h ? [1, 0] : [0, 1],
      });
      break;
    }
  }
  return meadows;
}

/** Rozestup řádků sena (m) a šířka řádku. */
export const SWATH_SPACING_M = 4.5;

/**
 * Kupky a stohy na posečených čtvercích: v době kupek drobné kupky v řadách (asi po 9 m), od
 * poloviny července stoh na každém čtverci (u větší louky jeden na dva) – stojí, dokud se seno
 * nezkrmí (`stackStands`). Velikost ve `width` (násobek modelu stohu). Deterministicky podle
 * políčka.
 */
export function hayOnSquares(
  squares: readonly CellSquare[],
  phase: HayPhase | null,
  dayOfYear: number,
): PlantInstance[] {
  if (!phase || phase.hay === 'swaths') return [];
  const out: PlantInstance[] = [];
  for (const square of squares) {
    const seed = Math.imul(square.cell.x, 7919) ^ Math.imul(square.cell.y, 104729);
    const random = seededRandom(seed >>> 0);
    const half = square.size / 2;
    if (phase.hay === 'heaps') {
      const step = 7.5;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const s = 0.3 + random() * 0.08;
          out.push({
            x: square.x - half + step * (i + 0.5) + (random() - 0.5) * 3,
            z: square.z - half + step * (j + 0.5) + (random() - 0.5) * 3,
            rotation: random() * Math.PI * 2,
            width: s,
            height: s,
            shade: 1,
            rank: random(),
          });
        }
      }
      continue;
    }
    // stohy: na každém druhém čtverci šachovnice (velký stoh na ≈ 450 m² posečené louky)
    if ((square.cell.x + square.cell.y) % 2 !== 0) continue;
    if (!stackStands(seed, dayOfYear)) continue;
    const s = 0.85 + random() * 0.2;
    out.push({
      x: square.x + (random() - 0.5) * 5,
      z: square.z + (random() - 0.5) * 5,
      rotation: random() * Math.PI * 2,
      width: s,
      height: s,
      shade: 1,
      rank: random(),
    });
  }
  return out;
}

/** Kupky a stohy na louce na seno v den roku (viz `hayOnSquares`). */
export function meadowHay(
  meadow: HayMeadow,
  phase: HayPhase | null,
  dayOfYear: number,
): PlantInstance[] {
  return hayOnSquares(meadow.squares, phase, dayOfYear);
}

/**
 * Přirozené louky letošní seče (`SceneVillage.hayMeadows`) jako „pole“ pro kreslení – po
 * souvislých skupinách políček (sousedí stranou), se záporným id (−1, −2…, od skupiny
 * s nejmenším políčkem), díly ve stadiu louky se vzhledem od herního jádra. Nejsou to pole:
 * nepatří do `SceneVillage.fields` (umisťování, zvířata, postavy o nich nevědí).
 */
export function hayMeadowFields(meadows: readonly SceneHayMeadow[]): SceneField[] {
  const key = (x: number, y: number): string => `${x},${y}`;
  const byCell = new Map(meadows.map((m) => [key(m.cell.x, m.cell.y), m]));
  const seen = new Set<string>();
  const ordered = [...meadows].sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  const fields: SceneField[] = [];
  for (const start of ordered) {
    const startKey = key(start.cell.x, start.cell.y);
    if (seen.has(startKey)) continue;
    seen.add(startKey);
    const group: SceneHayMeadow[] = [];
    const queue = [start];
    while (queue.length > 0) {
      const m = queue.shift()!;
      group.push(m);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const k = key(m.cell.x + dx, m.cell.y + dy);
        const next = byCell.get(k);
        if (!next || seen.has(k)) continue;
        seen.add(k);
        queue.push(next);
      }
    }
    group.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    fields.push({
      id: -(fields.length + 1),
      parts: group.map((m) => ({
        cell: { x: m.cell.x, y: m.cell.y },
        x: m.x,
        z: m.z,
        size: m.size,
        stage: 'meadow' as const,
        look: m.look,
        ...(m.work === undefined ? {} : { work: m.work }),
        ...(m.before === undefined ? {} : { before: m.before }),
      })),
    });
  }
  return fields;
}
