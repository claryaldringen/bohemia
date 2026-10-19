import { describe, expect, it } from 'vitest';
import { planLivestock, squareLookup, type LivestockVillage } from '../livestock-placement';
import { GROUND, VILLAGE } from './livestock-fixtures';

/** Otisk FNV-1a 32 bitů z JSON rozmístění – pozná i nejmenší změnu čísla. */
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

describe('planLivestock – zlatý otisk', () => {
  // Zrychlení (přihrádky čtverců, sousední pastviny) nesmí rozmístění změnit – otisk je z doby
  // před ním (18. 10. 2026). Spadne-li po záměrné změně pravidel rozmístění, vědomě se přepíše.
  it('velké pole s úhorem i osetými díly, hřbitov, sad, ohrada a skutečné počty stád', () => {
    const parts = Array.from({ length: 16 * 10 }, (_, k) => {
      const i = k % 16;
      const j = Math.floor(k / 16);
      const fallow = (i * 5 + j * 3) % 7 < 3;
      return {
        x: -217.5 + i * 15,
        z: -127.5 + j * 15,
        size: 15,
        stage: fallow ? ('young-fallow' as const) : ('sown' as const),
      };
    });
    const village: LivestockVillage = {
      ...VILLAGE,
      fields: [...VILLAGE.fields, { parts }],
      orchards: [
        {
          squares: [
            { x: 22.5, z: -52.5, size: 15 },
            { x: 37.5, z: -52.5, size: 15 },
          ],
        },
      ],
      pens: [{ x: -22.5, z: 37.5, size: 15 }],
      labor: { day: 2330 },
      livestock: { sheep: 46, goat: 12, pig: 21, cow: 13 },
    };
    const plan = planLivestock(village, GROUND, 1234);
    expect(plan.herds.length).toBeGreaterThan(4);
    // bez údaje o pasácích (starší data) jdou na pastvu všechna stáda – rozmístění je stejné jako
    // před pasáky (19. 10. 2026 přibylo jen pole `tended`)
    expect(plan.herds.every((h) => h.tended)).toBe(true);
    const herds = plan.herds.map((herd) => {
      const copy: Partial<typeof herd> = { ...herd };
      delete copy.tended;
      return copy;
    });
    expect(fingerprint({ ...plan, herds })).toBe('51108:1f0e38af');
  });
});

describe('squareLookup', () => {
  it('stejná odpověď jako průchod všemi čtverci – různé velikosti, okraje i body na hranách', () => {
    let seed = 99;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const squares = Array.from({ length: 400 }, () => ({
      x: Math.round(random() * 600 - 300) / 2,
      z: Math.round(random() * 600 - 300) / 2,
      size: [15, 15, 10, 4][Math.floor(random() * 4)]!,
    }));
    const lookup = squareLookup(squares);
    const scan = (x: number, z: number, margin: number): boolean =>
      squares.some(
        (s) => Math.abs(x - s.x) < s.size / 2 + margin && Math.abs(z - s.z) < s.size / 2 + margin,
      );
    for (let k = 0; k < 20_000; k++) {
      const x = Math.round(random() * 800 - 400) / 4;
      const z = Math.round(random() * 800 - 400) / 4;
      const margin = [0, 0.5, 1, 1.5, -1][k % 5]!;
      expect(lookup(x, z, margin)).toBe(scan(x, z, margin));
    }
  });
});
