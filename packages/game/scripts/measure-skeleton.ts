// Měření hustot kostry světa: npx tsx packages/game/scripts/measure-skeleton.ts [--size 200] [--seeds 1,2,3]
// (world-skeleton.md – Hustota a stejné podmínky). Vypíše podíl map s řekou, stezkou, brodem…
// a podíl středů, kolem kterých je v prstencích 3–4 aspoň jedno místo daného druhu.
import {
  createSkeletonCache,
  seatSlot,
  skeletonSlice,
  type SeatSlot,
} from '../src/domain/world/skeleton';
import type { SkeletonSlice } from '../src/domain/landscape/skeleton/types';
import type { GridCell } from '../src/domain/village/people/world-grid';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}
const size = Number(arg('size', '200'));
const seeds = arg('seeds', '1,2,3').split(',').map(Number);
const CENTERS = 1000;

const pct = (n: number, total: number): string => `${((100 * n) / total).toFixed(2)} %`;
const one = (n: number, total: number): string =>
  n > 0 ? `1 z ${Math.round(total / n)}` : 'nikdy';

/** Tvrdý, deterministický generátor středů (mulberry32) – měření je opakovatelné. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Counts {
  total: number;
  river: number;
  trail: number;
  both: number;
  ford: number;
  confluence: number;
  spring: number;
  junction: number;
  dry: number;
  ms: number;
}

const totals: Counts = {
  total: 0,
  river: 0,
  trail: 0,
  both: 0,
  ford: 0,
  confluence: 0,
  spring: 0,
  junction: 0,
  dry: 0,
  ms: 0,
};
const ringHits = { river: 0, trail: 0, ford: 0, centers: 0 };

for (const seed of seeds) {
  const cache = createSkeletonCache(seed);
  const slot = new Map<string, SeatSlot | null>();
  const slices = new Map<string, SkeletonSlice | null>();
  const sliceAt = (x: number, y: number): SkeletonSlice | null => {
    const key = `${x},${y}`;
    if (!slices.has(key)) slices.set(key, skeletonSlice(seed, { x, y }, cache));
    return slices.get(key) ?? null;
  };
  const half = Math.floor(size / 2);
  const t0 = performance.now();
  for (let y = -half; y < size - half; y++) {
    for (let x = -half; x < size - half; x++) {
      const s = sliceAt(x, y);
      totals.total++;
      const rivers = s?.rivers ?? [];
      const trails = s?.trails ?? [];
      if (rivers.length > 0) totals.river++;
      if (trails.length > 0) totals.trail++;
      if (rivers.length > 0 && trails.length > 0) totals.both++;
      if (rivers.filter((p) => p.flow === 'in').length >= 2) totals.confluence++;
      if (rivers.length === 1 && rivers[0]?.flow === 'out') totals.spring++;
      if (trails.length >= 3) totals.junction++;
      if (rivers.length === 0 && trails.length === 0) totals.dry++;
      const seat = seatSlot(s);
      slot.set(`${x},${y}`, seat);
      if (seat === 'ford') totals.ford++;
    }
  }
  totals.ms += performance.now() - t0;

  // Prstence 3–4 (Čebyševova vzdálenost) kolem náhodných středů uvnitř vzorku.
  const rnd = mulberry32(seed * 7919 + 1);
  const margin = 4;
  for (let i = 0; i < CENTERS; i++) {
    const c: GridCell = {
      x: -half + margin + Math.floor(rnd() * (size - 2 * margin)),
      y: -half + margin + Math.floor(rnd() * (size - 2 * margin)),
    };
    const found = { river: false, trail: false, ford: false };
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (ring < 3) continue;
        const seat = slot.get(`${c.x + dx},${c.y + dy}`);
        if (seat === 'river' || seat === 'trail' || seat === 'ford') found[seat] = true;
      }
    }
    ringHits.centers++;
    if (found.river) ringHits.river++;
    if (found.trail) ringHits.trail++;
    if (found.ford) ringHits.ford++;
  }
}

const t = totals.total;
console.log(
  `Kostra světa: ${seeds.length} seedů (${seeds.join(', ')}), ${size} × ${size} map, ${t} map`,
);
console.log(`řeka:            ${pct(totals.river, t)}  (${one(totals.river, t)})`);
console.log(`stezka:          ${pct(totals.trail, t)}  (${one(totals.trail, t)})`);
console.log(`řeka i stezka:   ${pct(totals.both, t)}  (${one(totals.both, t)})`);
console.log(`brod:            ${pct(totals.ford, t)}  (${one(totals.ford, t)})`);
console.log(`soutok řek:      ${pct(totals.confluence, t)}  (${one(totals.confluence, t)})`);
console.log(`pramen:          ${pct(totals.spring, t)}  (${one(totals.spring, t)})`);
console.log(`křižovatka:      ${pct(totals.junction, t)}  (${one(totals.junction, t)})`);
console.log(`suchá:           ${pct(totals.dry, t)}`);
console.log(`čas na výřez:    ${((totals.ms * 1000) / t).toFixed(1)} µs`);
console.log(`Prstence 3–4 kolem ${ringHits.centers} středů – aspoň jedno místo:`);
console.log(`  řeka:   ${pct(ringHits.river, ringHits.centers)}`);
console.log(`  stezka: ${pct(ringHits.trail, ringHits.centers)}`);
console.log(`  brod:   ${pct(ringHits.ford, ringHits.centers)}`);
