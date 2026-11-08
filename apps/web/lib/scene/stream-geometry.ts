import type { StreamCenterline, StreamSample } from '@bohemia/game';

// Osa potoka (a řek – kostry i prémiových krajin) ve světě je v herním jádru (podle ní stojí stromy
// a kameny vrstvy překážek); tady jen vzhled vody – průzračnost a viditelnost do hloubky.
export {
  BANK_REACH_M,
  nearestWaterPair,
  riverCenterline,
  riverCenterlines,
  streamCenterline,
  streamStations,
  watersCenterline,
  type StreamCenterline,
  type StreamCenterPoint as StreamPoint,
  type StreamSample,
  type StreamStation,
  type WaterPair,
} from '@bohemia/game';

/** Viditelnost do hloubky (m): kalná voda nad bahnem → průzračná nad štěrkem. */
export const WATER_VISIBILITY_M: readonly [number, number] = [0.3, 2.6];

/**
 * Průzračnost vody 0–1: rychlá voda nad štěrkem je průzračná, pomalá nad bahnem a v tůni
 * kalná. Podle ní se kreslí hladina (water.ts) i ryby pod ní (fauna-placement.ts).
 */
export function waterClarity(sample: Pick<StreamSample, 'speed' | 'pool'>): number {
  return smoothstep(0.2, 0.75, sample.speed) * (1 - 0.6 * sample.pool);
}

/**
 * Pás u břehu řeky (m), ve kterém se proud přítoku stáčí do proudu řeky, do které ústí (návrh
 * Clauda – v soutoku jinak hladina ukáže šev, kde se náhle mění směr proudu).
 */
export const CONFLUENCE_BLEND_M = 14;

/**
 * Místo vody pro hladinu (směr a rychlost proudu): nejbližší tok (`waters` – potok i řeky), ale
 * na mapě s víc řekami (soutok kostry) proud řek plynule: hlavní tok (první řeka) přebírá proud
 * ve své vodě, přítok ve své, v pásu `CONFLUENCE_BLEND_M` od jejich břehu se prolínají a zbytek
 * dostane bližší řeka (měkce). Voda potoka a mapa s jednou řekou beze změny.
 */
export function flowSampleAt(
  waters: StreamCenterline,
  rivers: readonly StreamCenterline[],
  x: number,
  z: number,
): StreamSample {
  const near = waters.nearest(x, z);
  if (rivers.length < 2) return near;
  const here = rivers.map((river) => river.nearest(x, z));
  if (!here.some((r) => r.bankDistance === near.bankDistance)) return near;
  const closest = Math.min(...here.map((r) => r.bankDistance));
  let fx = 0;
  let fz = 0;
  let speed = 0;
  let pool = 0;
  const add = (r: StreamSample, weight: number): void => {
    fx += r.flowX * weight;
    fz += r.flowZ * weight;
    speed += r.speed * weight;
    pool += r.pool * weight;
  };
  // Řeka v pořadí (hlavní tok první) přebere proud ve své vodě, do břehu plynule.
  let remaining = 1;
  for (const r of here) {
    if (!Number.isFinite(r.bankDistance)) continue;
    const weight = remaining * (1 - smoothstep(-CONFLUENCE_BLEND_M, 0, r.bankDistance));
    add(r, weight);
    remaining -= weight;
  }
  // Zbytek bližší řece – měkce, ať se proud nezlomí tam, kde se střídá nejbližší řeka.
  const soft = here.map((r) =>
    Number.isFinite(r.bankDistance)
      ? 1 - smoothstep(0, CONFLUENCE_BLEND_M, r.bankDistance - closest)
      : 0,
  );
  const softTotal = soft.reduce((a, b) => a + b, 0);
  here.forEach((r, k) => add(r, (remaining * soft[k]!) / softTotal));
  const length = Math.hypot(fx, fz);
  if (length < 1e-6) return near;
  return { ...near, flowX: fx / length, flowZ: fz / length, speed, pool };
}

/** Do jaké hloubky (m) je vodou dané průzračnosti vidět – shader hladiny počítá totéž. */
export function waterVisibilityM(clarity: number): number {
  const [murky, clear] = WATER_VISIBILITY_M;
  return murky + (clear - murky) * clarity;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
