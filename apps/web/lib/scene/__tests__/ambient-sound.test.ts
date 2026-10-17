import { describe, it, expect } from 'vitest';
import { loopRegion, nextVariant, soundVariation } from '../ambient-sound';

describe('loopRegion', () => {
  it('dekodér zahodil úvodní vzorky Opusu – smyčka je celý buffer', () => {
    // Délka smyček z tools/audio/ambient.sh: N + 312 je násobek 960.
    const length = 960 * 1000 - 312;
    expect(loopRegion(length, 48_000)).toEqual({ start: 0, end: length / 48_000 });
  });

  it('dekodér nechal úvodních 312 vzorků – smyčka začíná až za nimi', () => {
    const length = 960 * 1000;
    expect(loopRegion(length, 48_000)).toEqual({ start: 312 / 48_000, end: length / 48_000 });
  });

  it('při jiném vzorkování (převzorkovaný buffer) se nic neořezává', () => {
    expect(loopRegion(44_100 * 20, 44_100)).toEqual({ start: 0, end: 20 });
  });
});

describe('nextVariant', () => {
  it('neopakuje hned stejný zvuk (náhodné pořadí jako SoundGroup v 0 A.D.)', () => {
    for (const random of [0, 0.3, 0.6, 0.999]) {
      for (let previous = 0; previous < 4; previous++) {
        const next = nextVariant(4, previous, () => random);
        expect(next).not.toBe(previous);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(4);
      }
    }
  });

  it('vybere každou jinou variantu a funguje i bez předchozí a s jedinou variantou', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) seen.add(nextVariant(4, 2, () => i / 30));
    expect([...seen].sort()).toEqual([0, 1, 3]);
    expect(nextVariant(4, -1, () => 0.999)).toBe(3);
    expect(nextVariant(1, 0, () => 0.5)).toBe(0);
  });
});

describe('soundVariation', () => {
  it('hlasitost 0,8–1 a výška 0,9–1,1 jako výchozí SoundGroup v 0 A.D.', () => {
    expect(soundVariation(() => 0)).toEqual({ gain: 0.8, rate: 0.9 });
    const top = soundVariation(() => 1);
    expect(top.gain).toBeCloseTo(1);
    expect(top.rate).toBeCloseTo(1.1);
  });
});
