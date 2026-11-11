import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { churchCoverage } from '../church-life';
import { christianShare, conversionDay } from '../conversion';
import { isChristian } from '../faith';
import { advanceVillage } from '../../core/simulate';
import type { Person, VillageState } from '../../types';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Obrácení vesničanů (christianity.md – Víra vesničanů; plán 2026-11-10 – K5).

const NEW_YEAR = dayIndexOf({ year: 700, month: 1, day: 1 });

function crowd(count: number, christians = 0): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    bornDay: NEW_YEAR - 30 * 366,
    dwellingId: 1,
    sex: i % 2 === 0 ? ('male' as const) : ('female' as const),
    ...(i < christians ? { faith: 'christian' as const } : {}),
  }));
}

function villageOf(people: Person[], baptized: boolean): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: NEW_YEAR - 1, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.people = people;
  if (baptized) s.faith = { rodBaptizedDay: NEW_YEAR - 100 };
  return s;
}

describe('obrácení vesničanů', () => {
  it('bez křtu rodu se nikdo neobrátí', () => {
    const s = villageOf(crowd(1000), false);
    expect(conversionDay(s, NEW_YEAR)).toEqual([]);
    expect(s.people.some(isChristian)).toBe(false);
  });

  it('1 000 pohanů bez kostela: za rok kolem 5 (1–10), kronika s počtem', () => {
    expect(churchCoverage(villageOf([], true)).coverage).toBe(0);
    const s = villageOf(crowd(1000), true);
    const events = conversionDay(s, NEW_YEAR);
    const n = s.people.filter(isChristian).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(10);
    expect(events).toEqual([{ day: NEW_YEAR, kind: 'converted', count: n }]);
  });

  it('jen 1. 1.; jiný den nic', () => {
    const s = villageOf(crowd(1000), true);
    expect(conversionDay(s, NEW_YEAR + 1)).toEqual([]);
    expect(s.people.some(isChristian)).toBe(false);
  });

  it('děti se neobracejí a podíl křesťanů šanci zvyšuje', () => {
    const kids = crowd(1000).map((p) => ({ ...p, bornDay: NEW_YEAR - 5 * 366 }));
    const s = villageOf(kids, true);
    expect(conversionDay(s, NEW_YEAR)).toEqual([]);
    const none = villageOf(crowd(4000), true);
    const half = villageOf(crowd(4000, 2000), true);
    conversionDay(none, NEW_YEAR);
    conversionDay(half, NEW_YEAR);
    const gainNone = none.people.filter(isChristian).length / 4000;
    const gainHalf = (half.people.filter(isChristian).length - 2000) / 2000;
    expect(gainHalf).toBeGreaterThan(gainNone);
    expect(christianShare(half)).toBeGreaterThan(0.5);
  });

  it('los nezávisí na pořadí lidí', () => {
    const a = villageOf(crowd(500), true);
    const b = villageOf(crowd(500).reverse(), true);
    conversionDay(a, NEW_YEAR);
    conversionDay(b, NEW_YEAR);
    const ids = (s: VillageState): number[] =>
      s.people
        .filter(isChristian)
        .map((p) => p.id)
        .sort((x, y) => x - y);
    expect(ids(a)).toEqual(ids(b));
  });

  it('vcelku = po kouscích', () => {
    const start = villageOf(crowd(300), true);
    start.lastDay = NEW_YEAR - 3;
    const end = NEW_YEAR + 5;
    const whole = advanceVillage(structuredClone(start), end, null);
    let chunked = structuredClone(start);
    for (let d = NEW_YEAR - 2; d <= end; d += 2)
      chunked = advanceVillage(chunked, Math.min(d, end), null);
    chunked = advanceVillage(chunked, end, null);
    expect(chunked.people.filter(isChristian).map((p) => p.id)).toEqual(
      whole.people.filter(isChristian).map((p) => p.id),
    );
  });
});
