import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DwellingType } from '@bohemia/game';
import { describe, expect, it } from 'vitest';

/** Všechny typy obydlí – záznam hlídá úplnost (nový typ bez řádku se nepřeloží). */
const DWELLING_TYPES: Record<DwellingType, true> = {
  zemnice: true,
  polozemnice: true,
  srub: true,
  dvorec: true,
  'dvorec-srub': true,
};

describe('ikony obydlí', () => {
  it.each(Object.keys(DWELLING_TYPES))('typ %s má ikonu v public/icons/build', (type) => {
    expect(existsSync(join(process.cwd(), 'public/icons/build', `${type}.png`))).toBe(true);
  });
});
