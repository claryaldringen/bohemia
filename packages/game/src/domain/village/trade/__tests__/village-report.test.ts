import { describe, expect, it } from 'vitest';
import { newWorkshop } from '../../crafts/crafts';
import { MARKET } from '../../rules';
import type { Craft, MarketArrivalNote, Person, VillageState } from '../../types';
import { START, horseVillage } from '../../__tests__/horse-fixtures';
import { roughCount, villageReport } from '../village-report';

// Zpráva na pivo (markets.md – Pravidla 8, Rozhodnutí plánu 2, bod 7).

const day = START;

/** Pracující dílna `craft` v novém obydlí s řemeslníkem. */
function withWorkshop(s: VillageState, craft: Craft, id: number): void {
  s.dwellings.push({
    id,
    type: 'polozemnice',
    builtDay: day - 400,
    condition: 1,
    position: { x: 60 + id, z: 0, rotation: 0 },
    workshop: { ...newWorkshop(craft), activity: 'producing' },
  });
  s.people.push({ id: 900 + id, bornDay: day - 9000, dwellingId: id, sex: 'male' } as Person);
}

describe('zpráva na pivo (villageReport)', () => {
  it('lidé a domy se hlásí na násobek pěti, nejméně pět', () => {
    expect([23, 2, 0, 7, 12].map(roughCount)).toEqual([25, 5, 0, 5, 10]);
    const s = horseVillage([]);
    const report = villageReport(s, day);
    expect(report.people).toBe(roughCount(s.people.length));
    expect(report.houses).toBe(roughCount(s.dwellings.length));
    expect(report.day).toBe(day);
  });

  it('řemesla jen s pracujícím řemeslníkem v pevném pořadí', () => {
    const s = horseVillage([]);
    expect(villageReport(s, day).crafts).toEqual([]);
    withWorkshop(s, 'smith', 70);
    withWorkshop(s, 'potter', 71);
    withWorkshop(s, 'carpenter', 72);
    s.dwellings.find((d) => d.id === 72)!.workshop!.activity = 'no-wood';
    expect(villageReport(s, day).crafts).toEqual(['potter', 'smith']);
  });

  it('obchodníci od nejnovějšího, nejvýš MARKET.report.traders', () => {
    const s = horseVillage([]);
    expect(villageReport(s, day).traders).toEqual([]);
    const arrivals: MarketArrivalNote[] = Array.from({ length: 12 }, (_, i) => ({
      name: `Ves ${i}`,
      day: day - 11 + i,
      goods: ['grain'],
    }));
    s.market = { arrivals };
    const r = villageReport(s, day);
    expect(MARKET.report.traders).toBe(10);
    expect(r.traders.map((t) => t.day)).toEqual(Array.from({ length: 10 }, (_, i) => day - i));
    expect(r.traders[0]!.name).toBe('Ves 11');
  });

  it('stav nemění', () => {
    const s = horseVillage([]);
    s.market = { arrivals: [{ name: 'A', day, goods: [] }] };
    const before = structuredClone(s);
    villageReport(s, day);
    expect(s).toEqual(before);
  });
});
