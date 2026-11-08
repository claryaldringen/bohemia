import type { StreamSample } from '@bohemia/game';

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

/** Do jaké hloubky (m) je vodou dané průzračnosti vidět – shader hladiny počítá totéž. */
export function waterVisibilityM(clarity: number): number {
  const [murky, clear] = WATER_VISIBILITY_M;
  return murky + (clear - murky) * clarity;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
