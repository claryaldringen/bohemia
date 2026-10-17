import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { FieldPart } from '../types';
import {
  distanceFactor,
  effectiveFertility,
  endOfSeason,
  fallowYears,
  forestBonus,
  grossYieldPerHa,
  isWeedFree,
  partFoundingCost,
  reclaimCostPerHa,
  returnsFromForest,
  selectPartsToSow,
} from '../fields';
import { NO_CRAFTS } from '../productivity';
import { FERTILITY } from '../rules';

const sept = (year: number): number => dayIndexOf({ year, month: 9, day: 1 });

function part(over: Partial<FieldPart> = {}): FieldPart {
  return {
    id: 1,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 100,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    ...over,
  };
}

describe('úroda a vzdálenost', () => {
  it('hrubá úroda při úrodnosti 70 je 623,2 kg/ha', () => {
    expect(grossYieldPerHa(70)).toBeCloseTo(623.2, 6);
  });
  it('vzdálenost do 100 m nic nepřidává, 500 m dává 1,4', () => {
    expect(distanceFactor(100)).toBe(1);
    expect(distanceFactor(50)).toBe(1);
    expect(distanceFactor(500)).toBeCloseTo(1.4, 9);
  });
  it('efektivní úrodnost zahrnuje bonus po vymýcení lesa, nejvýš 100', () => {
    const p = part({ naturalFertility: 50, bonusUntilDay: 100 });
    expect(effectiveFertility(p, 100)).toBeCloseTo(90, 9);
    expect(effectiveFertility(p, 101)).toBeCloseTo(50, 9);
    expect(effectiveFertility(part({ bonusUntilDay: 5 }), 5)).toBe(100);
  });
});

describe('vymýcený les (Rösch a kol. 2017)', () => {
  const cleared = (sownYears: number): FieldPart =>
    part({ naturalFertility: 50, state: 'sown', sownYears, bonusUntilDay: 1000 });

  it('bonus podle sezóny osevu: první +40, druhá +20, třetí 0', () => {
    expect(forestBonus(cleared(0), 500)).toBe(40);
    expect(forestBonus(cleared(1), 500)).toBe(20);
    expect(forestBonus(cleared(2), 500)).toBe(0);
    expect(effectiveFertility(cleared(0), 500)).toBe(90);
    expect(effectiveFertility(cleared(1), 500)).toBe(70);
    expect(effectiveFertility(cleared(2), 500)).toBe(50);
  });

  it('po okně vymýcení bonus není', () => {
    expect(forestBonus(cleared(0), 1001)).toBe(0);
    expect(forestBonus(part({ bonusUntilDay: null }), 0)).toBe(0);
  });

  it('jen první sezóna po vymýcení je bez pletí', () => {
    expect(isWeedFree(cleared(0), 500)).toBe(true);
    expect(isWeedFree(cleared(1), 500)).toBe(false);
    expect(isWeedFree(cleared(0), 1001)).toBe(false);
    expect(isWeedFree(part(), 500)).toBe(false);
  });

  it('příloh starší 15 let se vrací z lesa, patnáctiletý ještě ne', () => {
    const since = sept(600);
    expect(returnsFromForest(part({ state: 'fallow', fallowSinceDay: since }), sept(616))).toBe(
      true,
    );
    expect(returnsFromForest(part({ state: 'fallow', fallowSinceDay: since }), sept(615))).toBe(
      false,
    );
    expect(returnsFromForest(part({ state: 'sown', fallowSinceDay: since }), sept(616))).toBe(
      false,
    );
  });

  it('po fázi osevu jde díl do přílohu bez bonusu', () => {
    const p = part({ state: 'sown', fertilityShare: 0.76, sownYears: 2, bonusUntilDay: sept(601) });
    endOfSeason(p, sept(600));
    expect(p.state).toBe('fallow');
    expect(p.bonusUntilDay).toBeNull();
  });
});

describe('náklady', () => {
  it('cena vrácení přílohu podle stáří zarůstání – bez řemesel horní mez', () => {
    const cost = (years: number): number => reclaimCostPerHa(years, NO_CRAFTS.tools);
    expect(cost(1)).toBe(0);
    expect(cost(4)).toBe(100);
    expect(cost(7)).toBe(100);
    expect(cost(13)).toBe(100);
    expect(cost(16)).toBe(250);
  });
  it('s plným pokrytím nástroji dolní mez: louka 90, nálet a křoviny 60, les 150', () => {
    expect(reclaimCostPerHa(4, 1)).toBe(90);
    expect(reclaimCostPerHa(7, 1)).toBe(60);
    expect(reclaimCostPerHa(13, 1)).toBe(60);
    expect(reclaimCostPerHa(16, 1)).toBe(150);
    expect(reclaimCostPerHa(16, 0.5)).toBe(200);
  });
  it('cena založení dílu = povrch × hektary + překážky', () => {
    expect(partFoundingCost('shrub', 5000, 12, NO_CRAFTS.tools)).toBeCloseTo(100 * 0.5 + 12, 9);
    expect(partFoundingCost('meadow', 10_000, 0, NO_CRAFTS.tools)).toBe(100);
    expect(partFoundingCost('forest', 10_000, 0, NO_CRAFTS.tools)).toBe(250);
    expect(partFoundingCost('forest', 10_000, 0, 1)).toBe(150);
  });
});

describe('přílohová soustava', () => {
  it('celé roky přílohu se počítají kalendářně', () => {
    const p = part({ state: 'fallow', fallowSinceDay: sept(510) });
    expect(fallowYears(p, sept(516))).toBe(6);
    expect(fallowYears(p, sept(516) - 1)).toBe(5);
    expect(fallowYears(part(), sept(516))).toBe(0);
  });

  it('po třech letech osevu klesne úrodnost na 0,64 a díl odpočívá', () => {
    const p = part({ state: 'sown' });
    endOfSeason(p, sept(600));
    expect(p.fertilityShare).toBeCloseTo(0.88, 9);
    expect(p.state).toBe('sown');
    endOfSeason(p, sept(601));
    expect(p.fertilityShare).toBeCloseTo(0.76, 9);
    expect(p.state).toBe('sown');
    endOfSeason(p, sept(602));
    expect(p.fertilityShare).toBeCloseTo(0.64, 9);
    expect(p.state).toBe('fallow');
    expect(p.fallowSinceDay).toBe(sept(602));
    expect(p.sownYears).toBe(0);
  });

  it('z 0,64 dosáhne příloh 0,95 po 13 letech, po 12 ne – ještě před lesem (15 let)', () => {
    const p = part({ state: 'fallow', fertilityShare: 0.64, fallowSinceDay: sept(600) });
    for (let i = 1; i <= 12; i++) endOfSeason(p, sept(600 + i));
    expect(p.fertilityShare).toBeLessThan(0.95);
    expect(endOfSeason(p, sept(613))).toBeNull();
    expect(p.fertilityShare).toBeGreaterThanOrEqual(0.95 - 1e-9);
  });

  it('oběh dílu: 3 roky osevu a 12–13 let přílohu (pole ≈ 5–6× osevu)', () => {
    const p = part({ state: 'sown' });
    let year = 600;
    let sown = 0;
    while (p.state === 'sown') {
      endOfSeason(p, sept(year++));
      sown++;
    }
    let fallow = 0;
    while (p.fertilityShare < FERTILITY.fallowReady - 1e-9) {
      endOfSeason(p, sept(year++));
      fallow++;
    }
    expect(sown).toBe(3);
    expect(fallow).toBeGreaterThanOrEqual(12);
    expect(fallow).toBeLessThanOrEqual(13);
    expect((sown + fallow) / sown).toBeGreaterThan(5);
    expect((sown + fallow) / sown).toBeLessThan(6);
  });

  it('úrodnost příloh nepřeroste 1 a ostatní stavy se nemění', () => {
    const p = part({ state: 'fallow', fertilityShare: 0.98, fallowSinceDay: sept(600) });
    endOfSeason(p, sept(601));
    expect(p.fertilityShare).toBe(1);
    const r = part({ state: 'ready' });
    expect(endOfSeason(r, sept(601))).toBeNull();
    expect(r.fertilityShare).toBe(1);
  });

  it('zalesnění se ohlásí právě jednou, v 16. roce příloh', () => {
    const p = part({ id: 7, state: 'fallow', fertilityShare: 1, fallowSinceDay: sept(600) });
    const events = [];
    for (let i = 1; i <= 20; i++) {
      const e = endOfSeason(p, sept(600 + i));
      if (e) events.push({ e, i });
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.i).toBe(16);
    expect(events[0]?.e).toEqual({ day: sept(616), kind: 'part-became-forest', partId: 7 });
  });
});

describe('výběr dílů k osevu', () => {
  const day = sept(600);
  const sown = part({ id: 1, state: 'sown', fertilityShare: 0.76 });
  const ready = part({ id: 2, state: 'ready' });
  const fallowOld = part({ id: 3, state: 'fallow', fallowSinceDay: day - 2000 });
  const fallowYoung = part({ id: 4, state: 'fallow', fallowSinceDay: day - 400 });
  const fallowYoungFar = part({
    id: 5,
    state: 'fallow',
    fallowSinceDay: day - 400,
    distanceM: 300,
  });
  const ids = (ps: FieldPart[]): number[] => ps.map((p) => p.id);

  it('osetý díl před ready, ready před příloh', () => {
    const r = selectPartsToSow([fallowYoung, ready, sown], 1e9, 100, day);
    expect(ids(r)).toEqual([1, 2, 4]);
  });
  it('mezi přílohy 0,95+ mladší dřív, při shodě bližší', () => {
    const r = selectPartsToSow([fallowOld, fallowYoungFar, fallowYoung], 1e9, 100, day);
    expect(ids(r)).toEqual([4, 5, 3]);
  });
  it('přílohy pod 0,95 až po plných, nejvyšší úrodnost první', () => {
    const a = part({ id: 10, state: 'fallow', fertilityShare: 0.8, fallowSinceDay: day - 400 });
    const b = part({ id: 11, state: 'fallow', fertilityShare: 0.9, fallowSinceDay: day - 3000 });
    const r = selectPartsToSow([a, b, fallowOld], 1e9, 100, day);
    expect(ids(r)).toEqual([3, 11, 10]);
  });
  it('díl s úrodností 0,65 nevybere', () => {
    const weak = part({ id: 20, state: 'fallow', fertilityShare: 0.65, fallowSinceDay: day - 400 });
    const weakSown = part({ id: 21, state: 'sown', fertilityShare: 0.65 });
    expect(selectPartsToSow([weak, weakSown], 1e9, 100, day)).toEqual([]);
  });
  it('přestane, jakmile je pokryt cíl', () => {
    // čistá úroda 1 ha při úrodnosti 70: 448,2 kg
    const r = selectPartsToSow([sown, ready, fallowYoung], 500, 100, day);
    expect(ids(r)).toEqual([1, 2]);
  });
  it('respektuje maxHa a nemění vstup', () => {
    const input = [sown, ready, fallowYoung];
    const copy = JSON.parse(JSON.stringify(input)) as FieldPart[];
    const r = selectPartsToSow(input, 1e9, 2.5, day);
    expect(ids(r)).toEqual([1, 2]);
    expect(input).toEqual(copy);
  });
});
