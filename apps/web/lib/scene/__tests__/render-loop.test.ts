import { describe, expect, it } from 'vitest';
import { loopStep, nextTick, tickDue } from '../render-loop';

/** Kolik taktů za sekundu vyjde při snímcích displeje `hz` za sekundu. */
function ticksPerSecond(hz: number, fps: number): number {
  let last = -Infinity;
  let ticks = 0;
  for (let frame = 0; frame < hz; frame++) {
    const now = (frame * 1000) / hz;
    if (tickDue(now, last, fps)) {
      last = nextTick(now, last, fps);
      ticks++;
    }
  }
  return ticks;
}

describe('tickDue – takt animací nezávisle na displeji', () => {
  it('na displeji 60, 120 i 144 Hz drží 30 taktů za sekundu (± zaokrouhlení snímků)', () => {
    expect(ticksPerSecond(60, 30)).toBe(30);
    expect(ticksPerSecond(120, 30)).toBe(30);
    expect(ticksPerSecond(144, 30)).toBe(30);
  });

  it('nižší plynulost na pozadí', () => {
    expect(ticksPerSecond(120, 10)).toBe(10);
    expect(ticksPerSecond(120, 20)).toBe(20);
  });

  it('po pauze (skrytá záložka) takty nedohání – další až za interval', () => {
    expect(nextTick(5000, 1000, 30)).toBe(5000);
    expect(nextTick(1040, 1000, 30)).toBeCloseTo(1033.33);
  });

  it('při 0 fps (omezený pohyb) takt nepřijde', () => {
    expect(tickDue(1e9, 0, 0)).toBe(false);
  });
});

describe('loopStep – krok kamery mezi průchody smyčky', () => {
  it('první průchod 0, jinak rozdíl v sekundách, po pauze nejvýš 0,1 s', () => {
    expect(loopStep(1000, null)).toBe(0);
    expect(loopStep(1016, 1000)).toBeCloseTo(0.016);
    expect(loopStep(9000, 1000)).toBe(0.1);
  });
});
