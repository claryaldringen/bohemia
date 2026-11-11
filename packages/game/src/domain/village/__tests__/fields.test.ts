import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import type { FallowStage, FieldPart } from '../types';
import {
  distanceFactor,
  effectiveFertility,
  endOfSeason,
  fallowStage,
  fallowYears,
  forestBonus,
  grossYieldPerHa,
  isOvergrown,
  isWeedFree,
  overgrowthStage,
  partFoundingCost,
  reclaimCostPerHa,
  sowingOrder,
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

  it('po fázi osevu jde díl do přílohu bez bonusu', () => {
    const p = part({ state: 'sown', fertilityShare: 0.76, sownYears: 2, bonusUntilDay: sept(601) });
    endOfSeason(p, sept(600));
    expect(p.state).toBe('fallow');
    expect(p.bonusUntilDay).toBeNull();
  });
});

describe('náklady', () => {
  it('vrácení přílohu podle stadia: mladý příloh nic, louka drn, křoviny a mladý les jejich založení', () => {
    const cost = (stage: FallowStage): number => reclaimCostPerHa(stage, NO_CRAFTS.tools);
    expect(cost('young-fallow')).toBe(0);
    expect(cost('meadow')).toBe(100);
    expect(cost('shrubs')).toBe(100);
    expect(cost('young-forest')).toBe(250);
  });
  it('s plným pokrytím nástroji nejlepší meze – louka 90, křoviny 60, mladý les 150', () => {
    expect(reclaimCostPerHa('meadow', 1)).toBe(90);
    expect(reclaimCostPerHa('meadow', 0.5)).toBe(95);
    expect(reclaimCostPerHa('shrubs', 1)).toBe(60);
    expect(reclaimCostPerHa('young-forest', 1)).toBe(150);
  });
  it('stadium přílohu: mladý příloh 1–2 roky ladem, pak louka; zarůstání podle let bez pastvy a seče', () => {
    const since = sept(600);
    const fallow = (overgrowthYears?: number): FieldPart =>
      part({
        state: 'fallow',
        fallowSinceDay: since,
        ...(overgrowthYears ? { overgrowthYears } : {}),
      });
    expect(fallowStage(fallow(), sept(602))).toBe('young-fallow');
    expect(fallowStage(fallow(), sept(603))).toBe('meadow');
    expect(fallowStage(fallow(4), sept(640))).toBe('meadow');
    expect(fallowStage(fallow(5), sept(640))).toBe('shrubs');
    expect(fallowStage(fallow(14), sept(640))).toBe('shrubs');
    expect(fallowStage(fallow(15), sept(640))).toBe('young-forest');
    // les vypadne z pole při ročním kroku – do té doby mladý les
    expect(fallowStage(fallow(30), sept(640))).toBe('young-forest');
    expect(overgrowthStage(29)).toBe('young-forest');
    expect(overgrowthStage(30)).toBe('forest');
    expect(isOvergrown(fallow(4))).toBe(false);
    expect(isOvergrown(fallow(5))).toBe(true);
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

  it('z 0,64 dosáhne příloh 0,95 po 7 letech, po 6 ne (obnova 5 bodů ročně)', () => {
    const p = part({ state: 'fallow', fertilityShare: 0.64, fallowSinceDay: sept(600) });
    for (let i = 1; i <= 6; i++) endOfSeason(p, sept(600 + i));
    expect(p.fertilityShare).toBeLessThan(0.95);
    endOfSeason(p, sept(607));
    expect(p.fertilityShare).toBeGreaterThanOrEqual(0.95 - 1e-9);
  });

  it('oběh dílu: 3 roky osevu a 7 let přílohu (pole ≈ 3,3× osevu)', () => {
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
    expect(fallow).toBe(7);
    expect((sown + fallow) / sown).toBeGreaterThan(3);
    expect((sown + fallow) / sown).toBeLessThan(4);
  });

  it('úrodnost příloh nepřeroste 1 a ostatní stavy se nemění', () => {
    const p = part({ state: 'fallow', fertilityShare: 0.98, fallowSinceDay: sept(600) });
    endOfSeason(p, sept(601));
    expect(p.fertilityShare).toBe(1);
    const r = part({ state: 'ready' });
    endOfSeason(r, sept(601));
    expect(r).toEqual(part({ state: 'ready' }));
  });

  it('příloh zůstává pastvinou – ani po 20 letech nezaroste v les (Martin, 18. 10. 2026)', () => {
    const p = part({ id: 7, state: 'fallow', fertilityShare: 1, fallowSinceDay: sept(600) });
    for (let i = 1; i <= 20; i++) endOfSeason(p, sept(600 + i));
    expect(p).toMatchObject({ state: 'fallow', fallowSinceDay: sept(600), fertilityShare: 1 });
  });
});

describe('pořadí dílů k osevu', () => {
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
    const r = sowingOrder([fallowYoung, ready, sown]);
    expect(ids(r)).toEqual([1, 2, 4]);
  });
  it('mezi přílohy 0,95+ mladší dřív, při shodě bližší', () => {
    const r = sowingOrder([fallowOld, fallowYoungFar, fallowYoung]);
    expect(ids(r)).toEqual([4, 5, 3]);
  });
  it('přílohy pod 0,95 až po plných, nejvyšší úrodnost první', () => {
    const a = part({ id: 10, state: 'fallow', fertilityShare: 0.8, fallowSinceDay: day - 400 });
    const b = part({ id: 11, state: 'fallow', fertilityShare: 0.9, fallowSinceDay: day - 3000 });
    const r = sowingOrder([a, b, fallowOld]);
    expect(ids(r)).toEqual([3, 11, 10]);
  });
  it('díl s úrodností 0,65 nevybere', () => {
    const weak = part({ id: 20, state: 'fallow', fertilityShare: 0.65, fallowSinceDay: day - 400 });
    const weakSown = part({ id: 21, state: 'sown', fertilityShare: 0.65 });
    expect(sowingOrder([weak, weakSown])).toEqual([]);
  });
  it('nemění vstup', () => {
    const input = [sown, ready, fallowYoung];
    const copy = JSON.parse(JSON.stringify(input)) as FieldPart[];
    expect(ids(sowingOrder(input))).toEqual([1, 2, 4]);
    expect(input).toEqual(copy);
  });
});
