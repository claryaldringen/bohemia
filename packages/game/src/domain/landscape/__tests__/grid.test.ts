import { describe, it, expect } from 'vitest';
import { distanceToMask } from '../grid';
import { createRandom } from '../random';

/** Referenční výpočet hrubou silou – vzdálenost ke každému políčku masky. */
function bruteForce(mask: Uint8Array, size: number): Float32Array {
  const distance = new Float32Array(size * size).fill(Infinity);
  for (let i = 0; i < mask.length; i++) {
    for (let j = 0; j < mask.length; j++) {
      if (!mask[j]) continue;
      const dx = (i % size) - (j % size);
      const dy = Math.floor(i / size) - Math.floor(j / size);
      distance[i] = Math.min(distance[i]!, Math.sqrt(dx * dx + dy * dy));
    }
  }
  return distance;
}

describe('distanceToMask', () => {
  it('dává přesnou euklidovskou vzdálenost k nejbližšímu políčku masky', () => {
    const random = createRandom(7);
    for (const density of [0.002, 0.02, 0.2]) {
      const size = 40;
      const mask = new Uint8Array(size * size).map(() => (random.next() < density ? 1 : 0));
      mask[0] = 1;
      expect(distanceToMask(mask, size)).toEqual(bruteForce(mask, size));
    }
  });

  it('bez políček masky je vzdálenost všude nekonečná', () => {
    expect([...distanceToMask(new Uint8Array(16), 4)].every((d) => d === Infinity)).toBe(true);
  });

  it('mapa 128 × 128 s potokem se spočítá rychle', () => {
    const size = 128;
    const mask = new Uint8Array(size * size);
    for (let x = 0; x < size; x++) for (let w = 0; w < 3; w++) mask[(60 + w) * size + x] = 1;
    for (let k = 0; k < 3; k++) distanceToMask(mask, size); // zahřátí JIT
    const started = performance.now();
    for (let k = 0; k < 20; k++) distanceToMask(mask, size);
    // Hrubá síla trvala ~27 ms; lineární algoritmus ~1 ms – rezerva na souběžně běžící testy.
    expect((performance.now() - started) / 20).toBeLessThan(8);
  });
});
