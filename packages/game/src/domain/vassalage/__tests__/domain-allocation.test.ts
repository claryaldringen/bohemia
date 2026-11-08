import { describe, expect, it } from 'vitest';
import { allocateDomainFood } from '../domain-allocation';

const none = { cows: 0, youngOxen: 0, trainedOxen: 0 };

describe('allocateDomainFood', () => {
  it('(a) dost obilí – každá ves dostane, co jí chybí, dobytek nejde', () => {
    const out = allocateDomainFood(
      { grainKg: 1000, cattle: { ...none, cows: 2 } },
      [
        { villageId: 'a', needKg: 300 },
        { villageId: 'b', needKg: 100 },
      ],
      240,
    );
    expect(out).toEqual([
      { toVillageId: 'a', grainKg: 300, cattle: none },
      { toVillageId: 'b', grainKg: 100, cattle: none },
    ]);
  });

  it('(b) nedostatek – stejný podíl toho, co chybí', () => {
    const out = allocateDomainFood(
      { grainKg: 200, cattle: none },
      [
        { villageId: 'a', needKg: 300 },
        { villageId: 'b', needKg: 100 },
      ],
      240,
    );
    expect(out.map((d) => d.grainKg)).toEqual([150, 50]);
  });

  it('(c) jen dobytek – kusy podle největšího zbytku', () => {
    const out = allocateDomainFood(
      { grainKg: 0, cattle: { ...none, cows: 3 } },
      [
        { villageId: 'a', needKg: 500 },
        { villageId: 'b', needKg: 200 },
      ],
      240,
    );
    expect(out).toEqual([
      { toVillageId: 'a', grainKg: 0, cattle: { ...none, cows: 2 } },
      { toVillageId: 'b', grainKg: 0, cattle: { ...none, cows: 1 } },
    ]);
  });

  it('(d) bez příjemců nebo bez potřeby nic', () => {
    const offer = { grainKg: 500, cattle: { ...none, cows: 1 } };
    expect(allocateDomainFood(offer, [], 240)).toEqual([]);
    expect(allocateDomainFood(offer, [{ villageId: 'a', needKg: 0 }], 240)).toEqual([]);
  });

  it('(e) pořadí příjemců na výsledku nezáleží', () => {
    const offer = { grainKg: 130, cattle: { ...none, cows: 2 } };
    const r = [
      { villageId: 'c', needKg: 220 },
      { villageId: 'a', needKg: 410 },
      { villageId: 'b', needKg: 90 },
    ];
    expect(allocateDomainFood(offer, [...r].reverse(), 72)).toEqual(
      allocateDomainFood(offer, r, 72),
    );
  });

  it('(f) nerozdá víc, než je nabídka', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const offer = {
        grainKg: seed * 37,
        cattle: { cows: seed % 4, youngOxen: seed % 3, trainedOxen: seed % 2 },
      };
      const rs = [1, 2, 3, 4].map((k) => ({
        villageId: `v${k}`,
        needKg: ((seed * k * 53) % 400) + 10,
      }));
      const out = allocateDomainFood(offer, rs, 72);
      const g = out.reduce((s, d) => s + d.grainKg, 0);
      expect(g).toBeLessThanOrEqual(offer.grainKg);
      for (const good of ['cows', 'youngOxen', 'trainedOxen'] as const) {
        expect(out.reduce((s, d) => s + d.cattle[good], 0)).toBeLessThanOrEqual(offer.cattle[good]);
      }
    }
  });
});
