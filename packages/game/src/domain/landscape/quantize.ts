import type { Landscape, StreamPoint } from './types';

/**
 * Krajina s přesností, jakou dostane prohlížeč (výšky na centimetry ve Float32, osa potoka ve
 * Float32 i s výškami stěn u potoka – viz `apps/web/lib/landscape-transfer.ts`; osa řeky
 * prémiových krajin i osy řek kostry stejně, výřez kostry beze změny). Vrstvy, které počítá
 * server i prohlížeč (překážky, prvky prémiových typů, stezka kostry), vycházejí z ní – oba tak
 * počítají ze stejných čísel. Opakované použití nic nemění.
 */
export function transferPrecision(l: Landscape): Landscape {
  return {
    ...l,
    heights: transferHeights(l.heights),
    stream: transferLine(l.stream),
    ...(l.river ? { river: transferLine(l.river) } : {}),
    ...(l.rivers ? { rivers: l.rivers.map(transferLine) } : {}),
  };
}

/** Osa toku (potok, řeka) ve Float32 – i s výškami stěn u toku, když je má. */
function transferLine(line: readonly StreamPoint[]): StreamPoint[] {
  return line.map((p): StreamPoint => {
    const point = {
      x: Math.fround(p.x),
      y: Math.fround(p.y),
      halfWidthLeft: Math.fround(p.halfWidthLeft),
      halfWidthRight: Math.fround(p.halfWidthRight),
      level: Math.fround(p.level),
      shallow: p.shallow,
    };
    // Výšky stěn u potoka (terén 2) jdou také ve Float32.
    return p.bankLeft === undefined
      ? point
      : {
          ...point,
          bankLeft: Math.fround(p.bankLeft),
          bankRight: Math.fround(p.bankRight ?? 0),
        };
  });
}

/** Výšky s přesností prohlížeče – na centimetry ve Float32 (`transferPrecision`). */
export function transferHeights(heights: Float32Array): Float32Array {
  const rounded = new Float32Array(heights.length);
  for (let i = 0; i < rounded.length; i++) rounded[i] = Math.round(heights[i]! * 100) / 100;
  return rounded;
}
