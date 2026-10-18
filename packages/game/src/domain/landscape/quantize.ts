import type { Landscape, StreamPoint } from './types';

/**
 * Krajina s přesností, jakou dostane prohlížeč (výšky na centimetry ve Float32, osa potoka ve
 * Float32 – viz `apps/web/lib/landscape-transfer.ts`). Vrstvy, které počítá server i prohlížeč
 * (překážky), vycházejí z ní – oba tak počítají ze stejných čísel. Opakované použití nic nemění.
 */
export function transferPrecision(l: Landscape): Landscape {
  const heights = new Float32Array(l.heights.length);
  for (let i = 0; i < heights.length; i++) heights[i] = Math.round(l.heights[i]! * 100) / 100;
  return {
    ...l,
    heights,
    stream: l.stream.map((p): StreamPoint => ({
      x: Math.fround(p.x),
      y: Math.fround(p.y),
      halfWidthLeft: Math.fround(p.halfWidthLeft),
      halfWidthRight: Math.fround(p.halfWidthRight),
      level: Math.fround(p.level),
      shallow: p.shallow,
    })),
  };
}
